-- ============================================================
-- Migration 063: RPC create_return
-- Consolida ~13 queries secuenciales en 1 transacción atómica
-- Ejecutar en Supabase SQL Editor
-- ============================================================

CREATE OR REPLACE FUNCTION public.rpc_create_return(
  p_original_sale_id UUID,
  p_return_type      TEXT,      -- 'exchange' | 'voucher'
  p_line_ids         UUID[],    -- array de sale_line IDs a devolver
  p_reason           TEXT,
  p_store_id         UUID,
  p_user_id          UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_original_sale   RECORD;
  v_total_returned  NUMERIC(12,2);
  v_voucher_id      UUID := NULL;
  v_voucher_code    TEXT := NULL;
  v_return_id       UUID;
  v_all_returned    BOOLEAN;
  v_warehouse_id    UUID;
  v_line            RECORD;
  v_stock_rec       RECORD;
  v_new_qty         INTEGER;
  v_now             TIMESTAMPTZ := NOW();
BEGIN

  -- 1. Fetch original sale (validate exists)
  SELECT * INTO v_original_sale
  FROM sales
  WHERE id = p_original_sale_id;

  IF v_original_sale.id IS NULL THEN
    RAISE EXCEPTION 'Venta original no encontrada';
  END IF;

  -- 2. Calculate total returned from selected lines
  SELECT COALESCE(SUM(line_total), 0)
  INTO v_total_returned
  FROM sale_lines
  WHERE sale_id = p_original_sale_id
    AND id = ANY(p_line_ids);

  -- 3. Create voucher if return_type = 'voucher'
  IF p_return_type = 'voucher' THEN
    v_voucher_code := 'DEV-' || UPPER(TO_HEX(EXTRACT(EPOCH FROM v_now)::BIGINT))
                      || '-' || UPPER(SUBSTR(MD5(RANDOM()::TEXT), 1, 4));

    INSERT INTO vouchers (
      code, voucher_type, original_amount, remaining_amount,
      origin_sale_id, client_id, issued_date, expiry_date,
      status, issued_by_store_id, issued_by
    ) VALUES (
      v_voucher_code,
      'fixed',
      v_total_returned,
      v_total_returned,
      p_original_sale_id,
      v_original_sale.client_id,
      CURRENT_DATE,
      CURRENT_DATE + INTERVAL '365 days',
      'active',
      p_store_id,
      p_user_id
    )
    RETURNING id INTO v_voucher_id;
  END IF;

  -- 4. Create return record
  INSERT INTO returns (
    original_sale_id, return_type, total_returned,
    voucher_id, reason, processed_by, store_id
  ) VALUES (
    p_original_sale_id,
    p_return_type,
    v_total_returned,
    v_voucher_id,
    p_reason,
    p_user_id,
    p_store_id
  )
  RETURNING id INTO v_return_id;

  -- 5. Mark returned lines (bulk UPDATE)
  UPDATE sale_lines
  SET quantity_returned = quantity,
      returned_at = v_now,
      return_reason = p_reason
  WHERE id = ANY(p_line_ids);

  -- 6. Check if all lines are returned and update sale status
  SELECT NOT EXISTS (
    SELECT 1 FROM sale_lines
    WHERE sale_id = p_original_sale_id
      AND id != ALL(p_line_ids)
      AND quantity_returned = 0
  ) INTO v_all_returned;

  UPDATE sales
  SET status = CASE WHEN v_all_returned THEN 'fully_returned'::sale_status ELSE 'partially_returned'::sale_status END
  WHERE id = p_original_sale_id;

  -- 7. Restore stock: find warehouse once, then loop
  SELECT id INTO v_warehouse_id
  FROM warehouses
  WHERE store_id = p_store_id
    AND is_main = TRUE
  LIMIT 1;

  IF v_warehouse_id IS NOT NULL THEN
    FOR v_line IN
      SELECT id AS line_id, product_variant_id, quantity
      FROM sale_lines
      WHERE id = ANY(p_line_ids)
        AND product_variant_id IS NOT NULL
    LOOP
      SELECT id, quantity
      INTO v_stock_rec
      FROM stock_levels
      WHERE product_variant_id = v_line.product_variant_id
        AND warehouse_id = v_warehouse_id;

      IF v_stock_rec.id IS NOT NULL THEN
        v_new_qty := v_stock_rec.quantity + v_line.quantity;

        UPDATE stock_levels
        SET quantity = v_new_qty,
            last_movement_at = v_now
        WHERE id = v_stock_rec.id;

        INSERT INTO stock_movements (
          product_variant_id, warehouse_id, movement_type, quantity,
          stock_before, stock_after, reference_type, reference_id,
          created_by, store_id
        ) VALUES (
          v_line.product_variant_id,
          v_warehouse_id,
          'return',
          v_line.quantity,
          v_stock_rec.quantity,
          v_new_qty,
          'return',
          v_return_id,
          p_user_id,
          p_store_id
        );
      END IF;
    END LOOP;
  END IF;

  -- 8. Return result
  RETURN jsonb_build_object(
    'id',             v_return_id,
    'original_sale_id', p_original_sale_id,
    'return_type',    p_return_type,
    'total_returned', v_total_returned,
    'voucher_id',     v_voucher_id,
    'voucher_code',   v_voucher_code,
    'reason',         p_reason,
    'processed_by',   p_user_id,
    'store_id',       p_store_id
  );

END;
$$;

GRANT EXECUTE ON FUNCTION public.rpc_create_return(UUID, TEXT, UUID[], TEXT, UUID, UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public.rpc_create_return(UUID, TEXT, UUID[], TEXT, UUID, UUID) TO authenticated;
