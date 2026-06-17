-- ============================================================
-- Migración 210 — Fase D (1/3): rpc_remove_order_payment localiza el espejo por FK
--
-- ÚNICO cambio: el WHERE del DELETE de manual_transactions (paso 4) pasa de
-- localizar por TEXTO a localizar por FK (tailoring_order_payment_id) con
-- FALLBACK al texto actual para espejos sin FK. TODO lo demás idéntico:
-- lectura del pago, resta de total_*, recálculo de arqueo si cerrada, DELETE del
-- pago DESPUÉS del espejo, recálculo de total_paid. El orden no cambia.
-- Equivalencia verificada: para los 80 espejos con FK, FK->fila == texto->fila
-- (78 exactos; 2 = doble-espejo de PIN-2026-0055, mismo comportamiento). text_misses_fk=0.
-- ============================================================

CREATE OR REPLACE FUNCTION public.rpc_remove_order_payment(p_payment_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
  v_s              RECORD;
  v_expected       NUMERIC;
  v_diff           NUMERIC;
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

  -- 2. Si está vinculado a una sesión, revertir totales (abierta o cerrada).
  --    Ya NO se bloquea por sesión cerrada: se deshace el efecto contable y,
  --    si está cerrada, se recalcula el arqueo.
  IF v_session_id IS NOT NULL THEN
    SELECT * INTO v_s FROM cash_sessions WHERE id = v_session_id;
    v_session_status := v_s.status;

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

    -- 3b. Si la sesión está cerrada, recalcular arqueo (mismo cálculo que mig 182).
    IF v_session_status = 'closed' THEN
      SELECT * INTO v_s FROM cash_sessions WHERE id = v_session_id;
      v_expected := COALESCE(v_s.opening_amount, 0) + COALESCE(v_s.total_cash_sales, 0)
                  - COALESCE(v_s.total_returns, 0) - COALESCE(v_s.total_withdrawals, 0);
      v_diff := COALESCE(v_s.counted_cash, 0) - v_expected;
      UPDATE cash_sessions
      SET expected_cash = v_expected, cash_difference = v_diff, updated_at = now()
      WHERE id = v_session_id;
    END IF;

    -- 4. Borrar manual_transactions vinculada al cobro (matching estricto, mig 150).
    DELETE FROM manual_transactions
    WHERE
      -- Localización por FK (espejos con tailoring_order_payment_id, mig 208/209).
      tailoring_order_payment_id = p_payment_id
      -- Fallback por TEXTO para espejos SIN FK (históricos / sastrería con FK null).
      -- Idéntico al match de hoy (mig 150): sesión + categoría + tipo + importe + nº.
      OR (
        tailoring_order_payment_id IS NULL
        AND cash_session_id = v_session_id
        AND category = 'sastreria'
        AND type = 'income'
        AND total = v_amount
        AND (
          (v_order_number IS NOT NULL AND description LIKE '%' || v_order_number || '%')
          OR
          (v_order_number IS NOT NULL AND notes       LIKE '%' || v_order_number || '%')
        )
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
$function$;
