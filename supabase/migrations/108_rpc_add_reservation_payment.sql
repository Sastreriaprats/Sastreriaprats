-- ==========================================
-- SASTRERÍA PRATS — Migración 108
-- rpc_add_reservation_payment
-- ==========================================
-- Añade un pago a una reserva existente. Similar a
-- rpc_add_order_payment pero para product_reservations.

CREATE OR REPLACE FUNCTION public.rpc_add_reservation_payment(
  p_reservation_id UUID,
  p_payment_date   DATE,
  p_payment_method TEXT,
  p_amount         NUMERIC(10,2),
  p_reference      TEXT DEFAULT NULL,
  p_notes          TEXT DEFAULT NULL,
  p_store_id       UUID DEFAULT NULL,
  p_cash_session_id UUID DEFAULT NULL,
  p_user_id        UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_pay_id        UUID;
  v_pay_row       RECORD;
  v_res           RECORD;
  v_new_paid      NUMERIC(12,2);
  v_new_status    TEXT;
  v_base_amount   NUMERIC(12,2);
  v_tax_amount    NUMERIC(12,2);
  v_session_id    UUID := p_cash_session_id;
BEGIN
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'El importe del pago debe ser mayor que 0';
  END IF;

  SELECT id, reservation_number, total, total_paid, store_id
    INTO v_res
    FROM product_reservations
   WHERE id = p_reservation_id
   FOR UPDATE;
  IF v_res.id IS NULL THEN
    RAISE EXCEPTION 'Reserva no encontrada';
  END IF;

  IF (v_res.total_paid + p_amount) > v_res.total THEN
    RAISE EXCEPTION 'El pago excede el total pendiente de la reserva';
  END IF;

  -- Cash session: si no viene explícita, buscar una abierta en la tienda de la reserva
  IF v_session_id IS NULL AND v_res.store_id IS NOT NULL THEN
    SELECT id INTO v_session_id
      FROM cash_sessions
     WHERE status = 'open' AND store_id = COALESCE(p_store_id, v_res.store_id)
     LIMIT 1;
  END IF;

  INSERT INTO product_reservation_payments (
    product_reservation_id, payment_date, payment_method, amount,
    reference, notes, cash_session_id, created_by
  ) VALUES (
    p_reservation_id, p_payment_date, p_payment_method, p_amount,
    p_reference, p_notes, v_session_id, p_user_id
  )
  RETURNING * INTO v_pay_row;
  v_pay_id := v_pay_row.id;

  v_new_paid := v_res.total_paid + p_amount;
  v_new_status := CASE
    WHEN v_new_paid >= v_res.total THEN 'paid'
    WHEN v_new_paid > 0            THEN 'partial'
    ELSE 'pending'
  END;

  UPDATE product_reservations
     SET total_paid     = v_new_paid,
         payment_status = v_new_status,
         updated_at     = NOW()
   WHERE id = p_reservation_id;

  -- Contabilidad
  v_base_amount := ROUND(p_amount / 1.21, 2);
  v_tax_amount  := p_amount - v_base_amount;
  INSERT INTO manual_transactions (
    type, date, description, category,
    amount, tax_rate, tax_amount, total,
    notes, created_by, cash_session_id
  ) VALUES (
    'income', p_payment_date,
    'Pago reserva - ' || v_res.reservation_number,
    'reservas',
    v_base_amount, 21, v_tax_amount, p_amount,
    'Reserva ' || v_res.reservation_number || ' - ' || p_payment_method,
    p_user_id, v_session_id
  );

  -- Cash session totales
  IF v_session_id IS NOT NULL THEN
    UPDATE cash_sessions
       SET total_sales          = COALESCE(total_sales, 0)          + p_amount,
           total_cash_sales     = COALESCE(total_cash_sales, 0)
                                 + (CASE WHEN p_payment_method = 'cash'     THEN p_amount ELSE 0 END),
           total_card_sales     = COALESCE(total_card_sales, 0)
                                 + (CASE WHEN p_payment_method = 'card'     THEN p_amount ELSE 0 END),
           total_bizum_sales    = COALESCE(total_bizum_sales, 0)
                                 + (CASE WHEN p_payment_method = 'bizum'    THEN p_amount ELSE 0 END),
           total_transfer_sales = COALESCE(total_transfer_sales, 0)
                                 + (CASE WHEN p_payment_method = 'transfer' THEN p_amount ELSE 0 END),
           total_voucher_sales  = COALESCE(total_voucher_sales, 0)
                                 + (CASE WHEN p_payment_method = 'voucher'  THEN p_amount ELSE 0 END)
     WHERE id = v_session_id;
  END IF;

  RETURN jsonb_build_object(
    'id',                 v_pay_id,
    'reservation_id',     p_reservation_id,
    'reservation_number', v_res.reservation_number,
    'amount',             p_amount,
    'payment_method',     p_payment_method,
    'total_paid',         v_new_paid,
    'payment_status',     v_new_status,
    'created_at',         v_pay_row.created_at
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.rpc_add_reservation_payment(UUID, DATE, TEXT, NUMERIC, TEXT, TEXT, UUID, UUID, UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public.rpc_add_reservation_payment(UUID, DATE, TEXT, NUMERIC, TEXT, TEXT, UUID, UUID, UUID) TO authenticated;
