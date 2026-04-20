-- ==========================================
-- SASTRERÍA PRATS — Migración 105
-- fn_activate_pending_reservations
-- ==========================================
-- Se invoca tras incrementar stock_levels.quantity (p.ej. al
-- recibir un albarán de proveedor). Convierte reservas
-- 'pending_stock' de esa variante+almacén en 'active' si el
-- stock disponible (quantity - reserved) cubre la cantidad.
-- Las reservas se activan en orden FIFO por created_at.
-- Devuelve una fila por cada reserva evaluada, indicando si se
-- activó o no, para que el caller pueda emitir notificaciones.

CREATE OR REPLACE FUNCTION public.fn_activate_pending_reservations(
  p_product_variant_id UUID,
  p_warehouse_id       UUID,
  p_user_id            UUID
)
RETURNS TABLE (
  reservation_id     UUID,
  reservation_number TEXT,
  client_id          UUID,
  quantity           INTEGER,
  activated          BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_stock_id       UUID;
  v_stock_quantity INTEGER;
  v_stock_reserved INTEGER;
  v_available      INTEGER;
  v_res            RECORD;
BEGIN
  SELECT id, quantity, reserved
    INTO v_stock_id, v_stock_quantity, v_stock_reserved
    FROM stock_levels
   WHERE product_variant_id = p_product_variant_id
     AND warehouse_id       = p_warehouse_id
   FOR UPDATE;

  IF v_stock_id IS NULL THEN
    RETURN;
  END IF;

  v_available := v_stock_quantity - v_stock_reserved;

  FOR v_res IN
    SELECT id, reservation_number AS r_num, client_id AS r_client, quantity AS r_qty, store_id AS r_store
      FROM product_reservations
     WHERE product_variant_id = p_product_variant_id
       AND warehouse_id       = p_warehouse_id
       AND status             = 'pending_stock'
     ORDER BY created_at ASC
     FOR UPDATE
  LOOP
    IF v_available >= v_res.r_qty THEN
      UPDATE stock_levels
         SET reserved         = reserved + v_res.r_qty,
             last_movement_at = NOW(),
             updated_at       = NOW()
       WHERE id = v_stock_id;

      INSERT INTO stock_movements (
        product_variant_id, warehouse_id, movement_type, quantity,
        stock_before, stock_after, reference_type, reference_id,
        reason, created_by, store_id
      ) VALUES (
        p_product_variant_id, p_warehouse_id, 'reservation', v_res.r_qty,
        v_stock_quantity, v_stock_quantity,
        'product_reservation', v_res.id,
        'Activación automática al recibir stock',
        p_user_id, v_res.r_store
      );

      UPDATE product_reservations
         SET status            = 'active',
             stock_reserved_at = NOW(),
             updated_at        = NOW()
       WHERE id = v_res.id;

      v_stock_reserved := v_stock_reserved + v_res.r_qty;
      v_available      := v_available - v_res.r_qty;

      reservation_id     := v_res.id;
      reservation_number := v_res.r_num;
      client_id          := v_res.r_client;
      quantity           := v_res.r_qty;
      activated          := TRUE;
      RETURN NEXT;
    ELSE
      reservation_id     := v_res.id;
      reservation_number := v_res.r_num;
      client_id          := v_res.r_client;
      quantity           := v_res.r_qty;
      activated          := FALSE;
      RETURN NEXT;
    END IF;
  END LOOP;
END;
$$;

GRANT EXECUTE ON FUNCTION public.fn_activate_pending_reservations(UUID, UUID, UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_activate_pending_reservations(UUID, UUID, UUID) TO authenticated;
