-- ============================================================
-- Migration 098: rpc_create_return — columnas correctas en stock_movements
-- La tabla stock_movements tiene (reference_type, reference_id) y exige
-- (stock_before, stock_after). La versión anterior insertaba "reference"
-- (columna inexistente) y omitía stock_before/stock_after.
-- ============================================================

CREATE OR REPLACE FUNCTION public.rpc_create_return(
  p_original_sale_id UUID,
  p_return_type      TEXT,
  p_line_ids         UUID[],
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
  v_matching_count  INTEGER;
BEGIN

  SELECT * INTO v_original_sale
  FROM sales
  WHERE id = p_original_sale_id;

  IF v_original_sale.id IS NULL THEN
    RAISE EXCEPTION 'Venta original no encontrada';
  END IF;

  SELECT COUNT(*) INTO v_matching_count
  FROM sale_lines
  WHERE id = ANY(p_line_ids)
    AND sale_id = p_original_sale_id
    AND COALESCE(quantity_returned, 0) < quantity;

  IF v_matching_count != array_length(p_line_ids, 1) THEN
    RAISE EXCEPTION 'Una o más líneas no pertenecen a la venta original o ya han sido devueltas';
  END IF;

  SELECT COALESCE(SUM(line_total), 0)
  INTO v_total_returned
  FROM sale_lines
  WHERE sale_id = p_original_sale_id
    AND id = ANY(p_line_ids);

  IF v_total_returned = 0 THEN
    RAISE EXCEPTION 'Las líneas seleccionadas no tienen importe';
  END IF;

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

  UPDATE sale_lines
  SET quantity_returned = quantity,
      returned_at = v_now,
      return_reason = p_reason
  WHERE id = ANY(p_line_ids);

  SELECT NOT EXISTS (
    SELECT 1 FROM sale_lines
    WHERE sale_id = p_original_sale_id
      AND COALESCE(quantity_returned, 0) < quantity
  ) INTO v_all_returned;

  UPDATE sales
  SET status = CASE WHEN v_all_returned THEN 'returned' ELSE 'partial_return' END
  WHERE id = p_original_sale_id;

  -- Reponer stock: una fila por línea devuelta
  SELECT id INTO v_warehouse_id
  FROM warehouses
  WHERE store_id = p_store_id
  LIMIT 1;

  IF v_warehouse_id IS NOT NULL THEN
    FOR v_line IN
      SELECT sl.product_variant_id, sl.quantity
      FROM sale_lines sl
      WHERE sl.id = ANY(p_line_ids) AND sl.product_variant_id IS NOT NULL
    LOOP
      SELECT * INTO v_stock_rec
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
          stock_before, stock_after,
          reference_type, reference_id,
          reason, notes,
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
          p_reason,
          'Devolución de venta ' || p_original_sale_id::TEXT,
          p_user_id,
          p_store_id
        );
      END IF;
    END LOOP;
  END IF;

  RETURN jsonb_build_object(
    'return_id',      v_return_id,
    'total_returned', v_total_returned,
    'voucher_id',     v_voucher_id,
    'voucher_code',   v_voucher_code,
    'all_returned',   v_all_returned
  );

END;
$$;

GRANT EXECUTE ON FUNCTION public.rpc_create_return(UUID, TEXT, UUID[], TEXT, UUID, UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public.rpc_create_return(UUID, TEXT, UUID[], TEXT, UUID, UUID) TO authenticated;
