-- ==========================================
-- SASTRERÍA PRATS — Migración 103
-- RPC rpc_fulfill_reservation
-- ==========================================
-- Marca una reserva como cumplida, decrementando JUNTOS
-- stock_levels.quantity y stock_levels.reserved para que el
-- stock disponible no cambie (la reserva ya estaba descontada
-- del disponible).

CREATE OR REPLACE FUNCTION public.rpc_fulfill_reservation(
  p_reservation_id UUID,
  p_sale_id        UUID,
  p_user_id        UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_res            RECORD;
  v_stock_id       UUID;
  v_stock_quantity INTEGER;
  v_stock_reserved INTEGER;
  v_new_quantity   INTEGER;
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
  IF v_res.status <> 'active' THEN
    RAISE EXCEPTION 'Solo se puede cumplir una reserva activa (estado actual: %)', v_res.status;
  END IF;

  SELECT id, quantity, reserved
    INTO v_stock_id, v_stock_quantity, v_stock_reserved
    FROM stock_levels
   WHERE product_variant_id = v_res.product_variant_id
     AND warehouse_id       = v_res.warehouse_id
   FOR UPDATE;

  IF v_stock_id IS NOT NULL THEN
    v_new_quantity := GREATEST(0, v_stock_quantity - v_res.quantity);
    v_new_reserved := GREATEST(0, v_stock_reserved - v_res.quantity);
    UPDATE stock_levels
       SET quantity         = v_new_quantity,
           reserved         = v_new_reserved,
           last_sale_at     = NOW(),
           last_movement_at = NOW(),
           updated_at       = NOW()
     WHERE id = v_stock_id;

    INSERT INTO stock_movements (
      product_variant_id, warehouse_id, movement_type, quantity,
      stock_before, stock_after, reference_type, reference_id,
      reason, created_by, store_id
    ) VALUES (
      v_res.product_variant_id, v_res.warehouse_id, 'reservation_release',
      -v_res.quantity,
      v_stock_quantity, v_new_quantity,
      'sale', p_sale_id,
      'Cumplida reserva ' || v_res.reservation_number,
      p_user_id, v_res.store_id
    );
  END IF;

  UPDATE product_reservations
     SET status            = 'fulfilled',
         fulfilled_at      = NOW(),
         fulfilled_sale_id = p_sale_id,
         updated_at        = NOW()
   WHERE id = p_reservation_id;

  RETURN jsonb_build_object(
    'id',             v_res.id,
    'status',         'fulfilled',
    'quantity',       v_res.quantity,
    'stock_before',   v_stock_quantity,
    'stock_after',    v_new_quantity
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.rpc_fulfill_reservation(UUID, UUID, UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public.rpc_fulfill_reservation(UUID, UUID, UUID) TO authenticated;
