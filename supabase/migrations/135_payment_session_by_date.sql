-- ============================================================
-- Migración 135: rpc_add_order_payment vincula pagos a la sesión
--                de caja correspondiente a la FECHA del pago, no
--                a la sesión "open" actual.
--
-- Antes (mig 097): siempre se cogía la sesión status='open' de la
-- tienda. Si el sastre registraba un cobro con fecha pasada o
-- futura, el pago quedaba pegado a la sesión abierta hoy → KPIs
-- de la sesión actual inflados y la sesión real (cerrada o futura)
-- sin reflejar el cobro.
--
-- Ahora: localizamos la sesión cuyo rango temporal incluye
-- p_payment_date. Si la fecha es hoy y hay sesión abierta, encaja.
-- Si la fecha cae dentro del rango de una sesión cerrada, encaja
-- también. Si no hay sesión que cubra esa fecha → cash_session_id
-- queda NULL y NO se tocan totales ni manual_transactions.
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
BEGIN

  IF p_amount <= 0 THEN
    RAISE EXCEPTION 'El importe debe ser mayor que 0';
  END IF;

  -- 0. Localizar la sesión de caja cuyo rango temporal cubre p_payment_date.
  --    Prioridad: sesión 'open' que ya cubre la fecha (típicamente hoy).
  --    Fallback: sesión 'closed' cuyo [opened_at, closed_at] incluya la fecha.
  --    Si no hay ninguna → v_session_id queda NULL y el pago se inserta
  --    sin vincular (no se tocan totales ni manual_transactions).
  IF p_store_id IS NOT NULL THEN
    -- Sesión abierta cuya apertura es <= fecha del pago
    SELECT id INTO v_session_id
    FROM cash_sessions
    WHERE store_id = p_store_id
      AND status = 'open'
      AND opened_at::date <= p_payment_date
    ORDER BY opened_at DESC
    LIMIT 1;

    -- Si no hay abierta válida, buscar sesión cerrada que englobe la fecha
    IF v_session_id IS NULL THEN
      SELECT id INTO v_session_id
      FROM cash_sessions
      WHERE store_id = p_store_id
        AND status <> 'open'
        AND opened_at::date <= p_payment_date
        AND (closed_at IS NULL OR closed_at::date >= p_payment_date)
      ORDER BY opened_at DESC
      LIMIT 1;
    END IF;
  ELSE
    SELECT id INTO v_session_id
    FROM cash_sessions
    WHERE status = 'open'
      AND opened_at::date <= p_payment_date
    ORDER BY opened_at DESC
    LIMIT 1;

    IF v_session_id IS NULL THEN
      SELECT id INTO v_session_id
      FROM cash_sessions
      WHERE status <> 'open'
        AND opened_at::date <= p_payment_date
        AND (closed_at IS NULL OR closed_at::date >= p_payment_date)
      ORDER BY opened_at DESC
      LIMIT 1;
    END IF;
  END IF;

  -- 1. Insertar pago con cash_session_id (puede ser NULL)
  INSERT INTO tailoring_order_payments (
    tailoring_order_id, payment_date, payment_method,
    amount, reference, notes, next_payment_date, created_by,
    cash_session_id
  ) VALUES (
    p_tailoring_order_id, p_payment_date, p_payment_method,
    p_amount, p_reference, p_notes, p_next_payment_date, p_user_id,
    v_session_id
  )
  RETURNING * INTO v_payment_row;

  v_payment_id := v_payment_row.id;

  -- 2. Recalcular total_paid del pedido
  SELECT COALESCE(SUM(amount), 0)
  INTO v_nuevo_total_paid
  FROM tailoring_order_payments
  WHERE tailoring_order_id = p_tailoring_order_id;

  UPDATE tailoring_orders
  SET total_paid = v_nuevo_total_paid
  WHERE id = p_tailoring_order_id;

  SELECT order_number INTO v_order_number
  FROM tailoring_orders
  WHERE id = p_tailoring_order_id;

  -- 3 + 4. Solo si hemos podido vincular a una sesión:
  --        - Insertar manual_transaction
  --        - Actualizar totales de la sesión correspondiente
  IF v_session_id IS NOT NULL THEN
    v_base_amount := p_amount / 1.21;
    v_tax_amount  := p_amount - v_base_amount;

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

    v_method_field := CASE p_payment_method
      WHEN 'cash'     THEN 'total_cash_sales'
      WHEN 'card'     THEN 'total_card_sales'
      WHEN 'bizum'    THEN 'total_bizum_sales'
      WHEN 'transfer' THEN 'total_transfer_sales'
      WHEN 'check'    THEN 'total_transfer_sales'
      ELSE NULL
    END;

    IF v_method_field IS NOT NULL THEN
      UPDATE cash_sessions
      SET total_sales = COALESCE(total_sales, 0) + p_amount
      WHERE id = v_session_id;

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
    'nuevo_total_paid',    v_nuevo_total_paid,
    'cash_session_id',     v_session_id
  );

END;
$$;

GRANT EXECUTE ON FUNCTION public.rpc_add_order_payment(UUID, DATE, TEXT, NUMERIC, TEXT, TEXT, DATE, UUID, UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public.rpc_add_order_payment(UUID, DATE, TEXT, NUMERIC, TEXT, TEXT, DATE, UUID, UUID) TO authenticated;
