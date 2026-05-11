-- ============================================================
-- Migration 140: fix "column reference quantity is ambiguous"
-- en fn_activate_pending_reservations
--
-- Causa: la función declara un OUT param "quantity" en RETURNS TABLE,
-- y el SELECT inicial "SELECT id, quantity, reserved FROM stock_levels"
-- crea ambigüedad entre ese OUT param y la columna stock_levels.quantity.
-- Fix: calificar explícitamente las columnas con alias de la tabla.
-- Mantiene la misma signature y row type, por lo que CREATE OR REPLACE
-- es suficiente (no requiere DROP + RE-CREATE).
-- ============================================================

CREATE OR REPLACE FUNCTION public.fn_activate_pending_reservations(
  p_product_variant_id UUID,
  p_warehouse_id       UUID,
  p_user_id            UUID
)
RETURNS TABLE (
  reservation_id     UUID,
  reservation_line_id UUID,
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
  v_line           RECORD;
BEGIN
  SELECT sl.id, sl.quantity, sl.reserved
    INTO v_stock_id, v_stock_quantity, v_stock_reserved
    FROM stock_levels sl
   WHERE sl.product_variant_id = p_product_variant_id
     AND sl.warehouse_id       = p_warehouse_id
   FOR UPDATE;

  IF v_stock_id IS NULL THEN
    RETURN;
  END IF;

  v_available := v_stock_quantity - v_stock_reserved;

  FOR v_line IN
    SELECT l.id AS line_id, l.reservation_id AS res_id, l.quantity AS qty,
           r.reservation_number AS r_num, r.client_id AS r_client, r.store_id AS r_store
      FROM product_reservation_lines l
      JOIN product_reservations r ON r.id = l.reservation_id
     WHERE l.product_variant_id = p_product_variant_id
       AND l.warehouse_id       = p_warehouse_id
       AND l.status             = 'pending_stock'
     ORDER BY l.created_at ASC
     FOR UPDATE OF l
  LOOP
    IF v_available >= v_line.qty THEN
      UPDATE stock_levels sl
         SET reserved         = sl.reserved + v_line.qty,
             last_movement_at = NOW(),
             updated_at       = NOW()
       WHERE sl.id = v_stock_id;

      INSERT INTO stock_movements (
        product_variant_id, warehouse_id, movement_type, quantity,
        stock_before, stock_after, reference_type, reference_id,
        reason, created_by, store_id
      ) VALUES (
        p_product_variant_id, p_warehouse_id, 'reservation', v_line.qty,
        v_stock_quantity, v_stock_quantity,
        'product_reservation_line', v_line.line_id,
        'Activación automática al recibir stock',
        p_user_id, v_line.r_store
      );

      UPDATE product_reservation_lines
         SET status            = 'active',
             stock_reserved_at = NOW(),
             updated_at        = NOW()
       WHERE id = v_line.line_id;

      v_stock_reserved := v_stock_reserved + v_line.qty;
      v_available      := v_available - v_line.qty;

      reservation_id     := v_line.res_id;
      reservation_line_id := v_line.line_id;
      reservation_number := v_line.r_num;
      client_id          := v_line.r_client;
      quantity           := v_line.qty;
      activated          := TRUE;
      RETURN NEXT;
    ELSE
      reservation_id     := v_line.res_id;
      reservation_line_id := v_line.line_id;
      reservation_number := v_line.r_num;
      client_id          := v_line.r_client;
      quantity           := v_line.qty;
      activated          := FALSE;
      RETURN NEXT;
    END IF;
  END LOOP;
END;
$$;

GRANT EXECUTE ON FUNCTION public.fn_activate_pending_reservations(UUID, UUID, UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_activate_pending_reservations(UUID, UUID, UUID) TO authenticated;
