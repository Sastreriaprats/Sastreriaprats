-- ============================================================
-- Migración 242 — Reactivar una reserva CANCELADA (recuperar por error)
--
-- Inversa de rpc_cancel_reservation: re-bloquea stock por cada línea cancelada
-- replicando EXACTAMENTE la lógica de bloqueo de rpc_create_reservation:
--   - Si hay disponible (quantity - reserved >= qty) -> línea 'active' + reserved += qty
--     + stock_movement 'reservation'.
--   - Si NO hay disponible o no existe stock_levels -> línea 'pending_stock' (se activará
--     sola cuando entre stock vía fn_activate_pending_reservations).
-- Limpia cancelled_at/cancelled_reason de líneas y cabecera. El trigger
-- fn_recalc_reservation_header recalcula el status agregado de la cabecera.
--
-- DINERO: la cancelación ya reembolsó los pagos (total_paid=0). La reactivación
-- NO restaura cobros: la reserva vuelve con total_paid=0 / payment_status='pending'.
-- Si había dinero cobrado, hay que volver a registrarlo manualmente.
-- ============================================================

CREATE OR REPLACE FUNCTION public.rpc_reactivate_reservation(p_reservation_id uuid, p_user_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_header      RECORD;
  v_line        RECORD;
  v_stock_id    UUID;
  v_stock_q     INTEGER;
  v_stock_r     INTEGER;
  v_available   INTEGER;
  v_line_status reservation_status;
BEGIN
  SELECT id, reservation_number, store_id, status
    INTO v_header
    FROM product_reservations
   WHERE id = p_reservation_id
   FOR UPDATE;

  IF v_header.id IS NULL THEN
    RAISE EXCEPTION 'Reserva no encontrada';
  END IF;
  IF v_header.status <> 'cancelled' THEN
    RAISE EXCEPTION 'Solo se puede reactivar una reserva cancelada (estado actual: %)', v_header.status;
  END IF;

  FOR v_line IN
    SELECT id, product_variant_id, warehouse_id, quantity
      FROM product_reservation_lines
     WHERE reservation_id = p_reservation_id
       AND status = 'cancelled'
     FOR UPDATE
  LOOP
    -- Re-intentar bloqueo de stock (idéntico a rpc_create_reservation)
    SELECT id, quantity, reserved
      INTO v_stock_id, v_stock_q, v_stock_r
      FROM stock_levels
     WHERE product_variant_id = v_line.product_variant_id
       AND warehouse_id       = v_line.warehouse_id
     FOR UPDATE;

    IF v_stock_id IS NULL THEN
      v_line_status := 'pending_stock';
    ELSE
      v_available := v_stock_q - v_stock_r;
      IF v_available >= v_line.quantity THEN
        v_line_status := 'active';
        UPDATE stock_levels
           SET reserved         = reserved + v_line.quantity,
               last_movement_at = NOW(),
               updated_at       = NOW()
         WHERE id = v_stock_id;

        INSERT INTO stock_movements (
          product_variant_id, warehouse_id, movement_type, quantity,
          stock_before, stock_after, reference_type, reference_id,
          reason, created_by, store_id
        ) VALUES (
          v_line.product_variant_id, v_line.warehouse_id, 'reservation', v_line.quantity,
          v_stock_q, v_stock_q,
          'product_reservation_line', v_line.id,
          'Reactivación reserva ' || v_header.reservation_number,
          p_user_id, v_header.store_id
        );
      ELSE
        v_line_status := 'pending_stock';
      END IF;
    END IF;

    UPDATE product_reservation_lines
       SET status            = v_line_status,
           stock_reserved_at = CASE WHEN v_line_status = 'active' THEN NOW() ELSE NULL END,
           cancelled_at      = NULL,
           cancelled_reason  = NULL,
           updated_at        = NOW()
     WHERE id = v_line.id;
  END LOOP;

  -- Limpiar marcas de cancelación de la cabecera (el trigger ya recalculó el status agregado)
  UPDATE product_reservations
     SET cancelled_at     = NULL,
         cancelled_reason = NULL,
         updated_at       = NOW()
   WHERE id = p_reservation_id;

  RETURN jsonb_build_object(
    'id', p_reservation_id,
    'status', (SELECT status FROM product_reservations WHERE id = p_reservation_id)
  );
END;
$function$;

GRANT EXECUTE ON FUNCTION public.rpc_reactivate_reservation(uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.rpc_reactivate_reservation(uuid, uuid) TO authenticated;
