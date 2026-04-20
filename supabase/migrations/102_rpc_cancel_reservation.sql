-- ==========================================
-- SASTRERÍA PRATS — Migración 102
-- RPC rpc_cancel_reservation
-- ==========================================
-- Cancela una reserva y, si estaba activa, libera el stock bloqueado
-- (decrementa stock_levels.reserved + inserta stock_movements
-- tipo 'reservation_release').

CREATE OR REPLACE FUNCTION public.rpc_cancel_reservation(
  p_reservation_id UUID,
  p_reason         TEXT,
  p_user_id        UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_res       RECORD;
  v_stock_id       UUID;
  v_stock_quantity INTEGER;
  v_stock_reserved INTEGER;
  v_new_reserved   INTEGER;
BEGIN
  SELECT id, status, quantity, product_variant_id, warehouse_id, store_id, reservation_number
    INTO v_res
    FROM product_reservations
   WHERE id = p_reservation_id
   FOR UPDATE;

  IF v_res.id IS NULL THEN
    RAISE EXCEPTION 'Reserva no encontrada';
  END IF;
  IF v_res.status NOT IN ('active', 'pending_stock') THEN
    RAISE EXCEPTION 'No se puede cancelar una reserva en estado %', v_res.status;
  END IF;

  IF v_res.status = 'active' THEN
    SELECT id, quantity, reserved
      INTO v_stock_id, v_stock_quantity, v_stock_reserved
      FROM stock_levels
     WHERE product_variant_id = v_res.product_variant_id
       AND warehouse_id       = v_res.warehouse_id
     FOR UPDATE;

    IF v_stock_id IS NOT NULL THEN
      v_new_reserved := GREATEST(0, v_stock_reserved - v_res.quantity);
      UPDATE stock_levels
         SET reserved         = v_new_reserved,
             last_movement_at = NOW(),
             updated_at       = NOW()
       WHERE id = v_stock_id;

      INSERT INTO stock_movements (
        product_variant_id, warehouse_id, movement_type, quantity,
        stock_before, stock_after, reference_type, reference_id,
        reason, created_by, store_id
      ) VALUES (
        v_res.product_variant_id, v_res.warehouse_id, 'reservation_release', v_res.quantity,
        v_stock_quantity, v_stock_quantity,
        'product_reservation', v_res.id,
        'Cancelación reserva ' || v_res.reservation_number,
        p_user_id, v_res.store_id
      );
    END IF;
  END IF;

  UPDATE product_reservations
     SET status           = 'cancelled',
         cancelled_at     = NOW(),
         cancelled_reason = NULLIF(p_reason, ''),
         updated_at       = NOW()
   WHERE id = p_reservation_id;

  RETURN jsonb_build_object(
    'id',     v_res.id,
    'status', 'cancelled'
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.rpc_cancel_reservation(UUID, TEXT, UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public.rpc_cancel_reservation(UUID, TEXT, UUID) TO authenticated;
