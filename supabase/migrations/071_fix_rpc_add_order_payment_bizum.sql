-- ============================================================
-- Migration 071: Fix rpc_add_order_payment — añadir soporte bizum
-- El CASE anterior no incluía 'bizum', por lo que los pagos de
-- pedidos cobrados por bizum no actualizaban total_bizum_sales
-- en cash_sessions. Se corrige el CASE y el bloque IF dinámico.
-- ============================================================

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
  v_current_total    NUMERIC(12,2);
  v_current_method   NUMERIC(12,2);
BEGIN

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
