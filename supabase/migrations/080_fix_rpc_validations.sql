-- ============================================================
-- Migration 080: Añadir validaciones a RPCs de pagos y devoluciones
-- A) rpc_add_order_payment: validar amount > 0
-- B) rpc_create_return: validar que las líneas pertenecen a la venta
-- ============================================================

-- A) rpc_add_order_payment — añadir validación de importe positivo
CREATE OR REPLACE FUNCTION public.rpc_add_order_payment(
  p_tailoring_order_id UUID,
  p_payment_date       DATE,
  p_payment_method     TEXT,
  p_amount             NUMERIC(10,2),
  p_reference          TEXT DEFAULT NULL,
  p_notes              TEXT DEFAULT NULL,
  p_next_payment_date  DATE DEFAULT NULL,
  p_store_id           UUID DEFAULT NULL,
  p_user_id            UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_payment_id       UUID;
  v_payment_row      RECORD;
  v_nuevo_total_paid NUMERIC(10,2);
  v_order_number     TEXT;
  v_base_amount      NUMERIC(12,2);
  v_tax_amount       NUMERIC(12,2);
  v_session_id       UUID := NULL;
  v_method_field     TEXT;
BEGIN

  -- Validación: importe debe ser positivo
  IF p_amount <= 0 THEN
    RAISE EXCEPTION 'El importe debe ser mayor que 0';
  END IF;

  -- 1. Insert payment
  INSERT INTO tailoring_order_payments (
    tailoring_order_id, payment_date, payment_method,
    amount, reference, notes, next_payment_date, created_by
  ) VALUES (
    p_tailoring_order_id, p_payment_date, p_payment_method,
    p_amount, p_reference, p_notes, p_next_payment_date, p_user_id
  )
  RETURNING * INTO v_payment_row;

  v_payment_id := v_payment_row.id;

  -- 2. Recalculate total_paid from all payments
  SELECT COALESCE(SUM(amount), 0)
  INTO v_nuevo_total_paid
  FROM tailoring_order_payments
  WHERE tailoring_order_id = p_tailoring_order_id;

  -- 3. Update tailoring_orders.total_paid
  UPDATE tailoring_orders
  SET total_paid = v_nuevo_total_paid
  WHERE id = p_tailoring_order_id;

  -- 4. Get order_number for descriptions
  SELECT order_number INTO v_order_number
  FROM tailoring_orders
  WHERE id = p_tailoring_order_id;

  -- 5. Insert manual_transaction
  v_base_amount := p_amount / 1.21;
  v_tax_amount  := p_amount - v_base_amount;

  -- Find active cash session
  IF p_store_id IS NOT NULL THEN
    SELECT id INTO v_session_id
    FROM cash_sessions
    WHERE status = 'open' AND store_id = p_store_id
    LIMIT 1;
  ELSE
    SELECT id INTO v_session_id
    FROM cash_sessions
    WHERE status = 'open'
    LIMIT 1;
  END IF;

  INSERT INTO manual_transactions (
    type, date, description, category,
    amount, tax_rate, tax_amount, total,
    notes, created_by, cash_session_id
  ) VALUES (
    'income',
    p_payment_date,
    'Pago pedido - ' || COALESCE(v_order_number, ''),
    'sastreria',
    v_base_amount,
    21,
    v_tax_amount,
    p_amount,
    'Pedido ' || COALESCE(v_order_number, '') || ' - ' || p_payment_method,
    p_user_id,
    v_session_id
  );

  -- 6. Update cash session totals if active session exists
  IF v_session_id IS NOT NULL THEN
    v_method_field := CASE p_payment_method
      WHEN 'cash'     THEN 'total_cash_sales'
      WHEN 'card'     THEN 'total_card_sales'
      WHEN 'bizum'    THEN 'total_bizum_sales'
      WHEN 'transfer' THEN 'total_transfer_sales'
      WHEN 'check'    THEN 'total_transfer_sales'
      ELSE NULL
    END;

    IF v_method_field IS NOT NULL THEN
      -- Update total_sales
      UPDATE cash_sessions
      SET total_sales = COALESCE(total_sales, 0) + p_amount
      WHERE id = v_session_id;

      -- Update column by method
      IF v_method_field = 'total_cash_sales' THEN
        UPDATE cash_sessions SET total_cash_sales = COALESCE(total_cash_sales, 0) + p_amount WHERE id = v_session_id;
      ELSIF v_method_field = 'total_card_sales' THEN
        UPDATE cash_sessions SET total_card_sales = COALESCE(total_card_sales, 0) + p_amount WHERE id = v_session_id;
      ELSIF v_method_field = 'total_bizum_sales' THEN
        UPDATE cash_sessions SET total_bizum_sales = COALESCE(total_bizum_sales, 0) + p_amount WHERE id = v_session_id;
      ELSE
        UPDATE cash_sessions SET total_transfer_sales = COALESCE(total_transfer_sales, 0) + p_amount WHERE id = v_session_id;
      END IF;
    END IF;
  END IF;

  -- 7. Return result
  RETURN jsonb_build_object(
    'id',                  v_payment_id,
    'tailoring_order_id',  p_tailoring_order_id,
    'payment_date',        p_payment_date,
    'payment_method',      p_payment_method,
    'amount',              p_amount,
    'reference',           p_reference,
    'notes',               p_notes,
    'next_payment_date',   p_next_payment_date,
    'created_by',          p_user_id,
    'created_at',          v_payment_row.created_at,
    'order_number',        v_order_number,
    'nuevo_total_paid',    v_nuevo_total_paid
  );

END;
$$;

GRANT EXECUTE ON FUNCTION public.rpc_add_order_payment(UUID, DATE, TEXT, NUMERIC, TEXT, TEXT, DATE, UUID, UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public.rpc_add_order_payment(UUID, DATE, TEXT, NUMERIC, TEXT, TEXT, DATE, UUID, UUID) TO authenticated;


-- B) rpc_create_return — añadir validación de que las líneas pertenecen a la venta
-- Se lee la función existente de 063 y se añade la validación tras calcular v_total_returned

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

  -- Validación: las líneas seleccionadas deben pertenecer a esta venta y tener importe
  IF v_total_returned = 0 THEN
    RAISE EXCEPTION 'Las líneas seleccionadas no pertenecen a esta venta o no tienen importe';
  END IF;

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

  -- 5. Mark selected lines as returned
  UPDATE sale_lines
  SET is_returned = TRUE
  WHERE id = ANY(p_line_ids);

  -- 6. Check if all non-returned lines are now returned
  SELECT NOT EXISTS (
    SELECT 1 FROM sale_lines
    WHERE sale_id = p_original_sale_id
      AND is_returned = FALSE
  ) INTO v_all_returned;

  -- 7. Update original sale status
  UPDATE sales
  SET status = CASE WHEN v_all_returned THEN 'returned' ELSE 'partial_return' END
  WHERE id = p_original_sale_id;

  -- 8. Restore stock for returned lines
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
        SET quantity = v_new_qty
        WHERE id = v_stock_rec.id;

        INSERT INTO stock_movements (
          product_variant_id, warehouse_id, movement_type,
          quantity, reference, notes, created_by
        ) VALUES (
          v_line.product_variant_id, v_warehouse_id, 'return',
          v_line.quantity, 'DEV-' || v_return_id::TEXT,
          'Devolución de venta ' || p_original_sale_id::TEXT,
          p_user_id
        );
      END IF;
    END LOOP;
  END IF;

  -- 9. Return result
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
