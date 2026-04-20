-- ==========================================
-- SASTRERÍA PRATS — Migración 101
-- RPC rpc_create_reservation
-- ==========================================
-- Crea una reserva de producto a nombre de un cliente.
-- Si hay stock disponible (quantity - reserved >= qty) bloquea el
-- stock incrementando stock_levels.reserved y deja status='active'.
-- Si no hay stock deja status='pending_stock' y no toca stock_levels.

CREATE OR REPLACE FUNCTION public.rpc_create_reservation(
  p_reservation JSONB,
  p_user_id     UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id               UUID;
  v_num              TEXT;
  v_qty              INTEGER := (p_reservation->>'quantity')::INTEGER;
  v_variant_id       UUID    := (p_reservation->>'product_variant_id')::UUID;
  v_warehouse_id     UUID    := (p_reservation->>'warehouse_id')::UUID;
  v_client_id        UUID    := (p_reservation->>'client_id')::UUID;
  v_store_id         UUID    := NULLIF(p_reservation->>'store_id', '')::UUID;
  v_stock_id         UUID;
  v_stock_quantity   INTEGER;
  v_stock_reserved   INTEGER;
  v_available        INTEGER;
  v_status           reservation_status;
BEGIN
  IF v_qty IS NULL OR v_qty <= 0 THEN
    RAISE EXCEPTION 'La cantidad debe ser mayor que 0';
  END IF;
  IF v_variant_id IS NULL OR v_warehouse_id IS NULL OR v_client_id IS NULL THEN
    RAISE EXCEPTION 'Faltan datos obligatorios (cliente, variante o almacén)';
  END IF;

  v_num := generate_reservation_number();

  -- Bloqueo de la fila de stock para evitar carreras
  SELECT id, quantity, reserved
    INTO v_stock_id, v_stock_quantity, v_stock_reserved
    FROM stock_levels
   WHERE product_variant_id = v_variant_id
     AND warehouse_id       = v_warehouse_id
   FOR UPDATE;

  IF v_stock_id IS NULL THEN
    v_status := 'pending_stock';
  ELSE
    v_available := v_stock_quantity - v_stock_reserved;
    IF v_available >= v_qty THEN
      v_status := 'active';
      UPDATE stock_levels
         SET reserved         = reserved + v_qty,
             last_movement_at = NOW(),
             updated_at       = NOW()
       WHERE id = v_stock_id;
    ELSE
      v_status := 'pending_stock';
    END IF;
  END IF;

  INSERT INTO product_reservations (
    reservation_number, client_id, product_variant_id, warehouse_id, store_id,
    quantity, status, notes, reason, expires_at,
    stock_reserved_at, created_by
  ) VALUES (
    v_num, v_client_id, v_variant_id, v_warehouse_id, v_store_id,
    v_qty, v_status,
    NULLIF(p_reservation->>'notes', ''),
    NULLIF(p_reservation->>'reason', ''),
    NULLIF(p_reservation->>'expires_at', '')::TIMESTAMPTZ,
    CASE WHEN v_status = 'active' THEN NOW() ELSE NULL END,
    p_user_id
  )
  RETURNING id INTO v_id;

  IF v_status = 'active' AND v_stock_id IS NOT NULL THEN
    INSERT INTO stock_movements (
      product_variant_id, warehouse_id, movement_type, quantity,
      stock_before, stock_after, reference_type, reference_id,
      reason, created_by, store_id
    ) VALUES (
      v_variant_id, v_warehouse_id, 'reservation', v_qty,
      v_stock_quantity, v_stock_quantity,
      'product_reservation', v_id,
      'Reserva ' || v_num,
      p_user_id, v_store_id
    );
  END IF;

  RETURN jsonb_build_object(
    'id',                 v_id,
    'reservation_number', v_num,
    'status',             v_status,
    'had_stock',          v_status = 'active'
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.rpc_create_reservation(JSONB, UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public.rpc_create_reservation(JSONB, UUID) TO authenticated;
