-- ============================================================
-- Migración 150: rpc_remove_order_payment
--
-- Simétrica de rpc_add_order_payment (mig 135). Al borrar un
-- tailoring_order_payment NO basta con eliminar la fila — hay
-- que deshacer los efectos contables que el alta provocó:
--
--   1) manual_transactions  (income, category='sastreria',
--                            cash_session_id = el del pago)
--   2) cash_sessions.total_sales y total_<method>_sales
--   3) tailoring_orders.total_paid (recalcular SUM)
--
-- Hasta ahora deleteOrderPayment (src/actions/payments.ts)
-- solo borraba la fila y recalculaba total_paid del pedido, lo
-- que dejaba "fantasmas" en cash_sessions y manual_transactions
-- y descuadraba el cierre de caja (incidente PIN-2026-0082).
--
-- Reglas:
--   - Si el pago estaba vinculado a una sesión 'closed', se
--     PROHÍBE el borrado (RAISE EXCEPTION). El usuario no
--     debe poder modificar contabilidad de una caja cerrada.
--   - Si el pago no estaba vinculado a ninguna sesión
--     (cash_session_id IS NULL → fecha fuera de cualquier
--     sesión), solo se borra la fila y se recalcula total_paid.
--   - El matching de manual_transactions usa cash_session_id +
--     category + type + total + order_number en notes/description.
--     Eso bloquea el riesgo de borrar otra MT por colisión.
-- ============================================================

CREATE OR REPLACE FUNCTION public.rpc_remove_order_payment(
  p_payment_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_payment        RECORD;
  v_order_id       UUID;
  v_order_number   TEXT;
  v_amount         NUMERIC(12,2);
  v_method         TEXT;
  v_session_id     UUID;
  v_session_status TEXT;
  v_new_total_paid NUMERIC(12,2);
  v_mt_deleted     INTEGER := 0;
BEGIN
  -- 1. Obtener el pago a borrar
  SELECT * INTO v_payment
  FROM tailoring_order_payments
  WHERE id = p_payment_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Pago no encontrado: %', p_payment_id;
  END IF;

  v_order_id   := v_payment.tailoring_order_id;
  v_amount     := v_payment.amount;
  v_method     := v_payment.payment_method;
  v_session_id := v_payment.cash_session_id;

  SELECT order_number INTO v_order_number
  FROM tailoring_orders
  WHERE id = v_order_id;

  -- 2. Si está vinculado a una sesión, bloquear si la sesión está cerrada
  --    y revertir totales si está abierta.
  IF v_session_id IS NOT NULL THEN
    SELECT status INTO v_session_status
    FROM cash_sessions
    WHERE id = v_session_id;

    IF v_session_status IS DISTINCT FROM 'open' THEN
      RAISE EXCEPTION 'No se puede borrar un cobro vinculado a una sesión de caja ya cerrada. Sesión: %', v_session_id;
    END IF;

    -- 3. Revertir cash_sessions.total_sales y total_<method>_sales
    UPDATE cash_sessions
    SET total_sales = COALESCE(total_sales, 0) - v_amount
    WHERE id = v_session_id;

    IF v_method = 'cash' THEN
      UPDATE cash_sessions SET total_cash_sales     = COALESCE(total_cash_sales, 0)     - v_amount WHERE id = v_session_id;
    ELSIF v_method = 'card' THEN
      UPDATE cash_sessions SET total_card_sales     = COALESCE(total_card_sales, 0)     - v_amount WHERE id = v_session_id;
    ELSIF v_method = 'bizum' THEN
      UPDATE cash_sessions SET total_bizum_sales    = COALESCE(total_bizum_sales, 0)    - v_amount WHERE id = v_session_id;
    ELSIF v_method IN ('transfer', 'check') THEN
      UPDATE cash_sessions SET total_transfer_sales = COALESCE(total_transfer_sales, 0) - v_amount WHERE id = v_session_id;
    END IF;

    -- 4. Borrar manual_transactions vinculada al cobro.
    --    Matching estricto: misma sesión + categoría sastrería + income +
    --    total exacto + número de pedido en notas o descripción. Eso cubre:
    --      - description = 'Pago pedido - <ORDER_NUMBER>'           (RPC añade)
    --      - description = 'Entrega a cuenta - <ORDER_NUMBER>'      (legacy createFichaOrder pre-mig 150)
    --      - notes LIKE  'Pedido <ORDER_NUMBER>%'                   (ambos)
    DELETE FROM manual_transactions
    WHERE cash_session_id = v_session_id
      AND category = 'sastreria'
      AND type = 'income'
      AND total = v_amount
      AND (
        (v_order_number IS NOT NULL AND description LIKE '%' || v_order_number || '%')
        OR
        (v_order_number IS NOT NULL AND notes       LIKE '%' || v_order_number || '%')
      );

    GET DIAGNOSTICS v_mt_deleted = ROW_COUNT;
  END IF;

  -- 5. Borrar el pago
  DELETE FROM tailoring_order_payments WHERE id = p_payment_id;

  -- 6. Recalcular total_paid del pedido (suma de pagos restantes)
  SELECT COALESCE(SUM(amount), 0) INTO v_new_total_paid
  FROM tailoring_order_payments
  WHERE tailoring_order_id = v_order_id;

  UPDATE tailoring_orders
  SET total_paid = v_new_total_paid
  WHERE id = v_order_id;

  RETURN jsonb_build_object(
    'payment_id',                p_payment_id,
    'tailoring_order_id',        v_order_id,
    'order_number',              v_order_number,
    'amount_reverted',           v_amount,
    'method',                    v_method,
    'cash_session_id',           v_session_id,
    'cash_session_status',       v_session_status,
    'manual_transactions_deleted', v_mt_deleted,
    'new_total_paid',            v_new_total_paid
  );

END;
$$;

GRANT EXECUTE ON FUNCTION public.rpc_remove_order_payment(UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public.rpc_remove_order_payment(UUID) TO authenticated;
