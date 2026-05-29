-- ============================================================
-- Migración 191: editar/borrar cobro de pedido permitiendo sesiones cerradas.
--
-- Cierra el agujero #10 del mapa de autonomía: el admin (Mónica) debe poder
-- EDITAR el importe y el método de un tailoring_order_payment desde la UI,
-- y BORRARLO, aunque el cobro esté vinculado a una sesión de caja CERRADA,
-- siempre recalculando el arqueo (no dejar fantasmas ni descuadre).
--
-- A) CREATE OR REPLACE rpc_remove_order_payment
--    - Se QUITA el cerrojo "sesión cerrada -> error" (mig 150 lo prohibía).
--      Ese cerrojo era una política conservadora, no un incidente: la
--      lección de PIN-2026-0082 era "al borrar hay que deshacer los efectos
--      contables", y eso lo seguimos haciendo. Bloquear sin más volvía la
--      función inútil (41/43 cobros viven en sesiones ya cerradas).
--    - Si la sesión está cerrada, tras revertir total_sales/total_<método>_sales
--      se RECALCULA expected_cash y cash_difference (misma fórmula que mig 182).
--
-- B) Nueva rpc_update_tailoring_payment(p_payment_id, p_amount, p_method, p_user_id)
--    Alcance v1: solo importe + método. NO fecha, NO mover de sesión, NO de pedido.
--    - Ajusta los totales de la sesión por el delta (mismo método o cambio de método).
--    - Si la sesión está cerrada, recalcula expected_cash y cash_difference.
--    - Reemplaza el espejo en manual_transactions: borra el viejo (acotado a 1 fila
--      por ctid para no tocar el espejo de un cobro hermano con idéntico importe)
--      y crea uno nuevo con el importe/método actualizados (patrón de mig 135).
--
-- tailoring_orders.total_paid lo recalcula el trigger trg_update_order_total_paid
-- (mig 058) en UPDATE/DELETE de payments; aquí además lo dejamos explícito para
-- devolverlo en el resultado.
--
-- Idempotente: CREATE OR REPLACE.
-- ============================================================

-- ── A) rpc_remove_order_payment: permitir sesión cerrada + recálculo arqueo ──
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


-- ── B) rpc_update_tailoring_payment: editar importe + método ────────────────
CREATE OR REPLACE FUNCTION public.rpc_update_tailoring_payment(
  p_payment_id UUID,
  p_amount     NUMERIC(12,2),
  p_method     TEXT,
  p_user_id    UUID DEFAULT NULL
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
  v_old_amount     NUMERIC(12,2);
  v_old_method     TEXT;
  v_session_id     UUID;
  v_session_status TEXT;
  v_delta          NUMERIC(12,2);
  v_new_total_paid NUMERIC(12,2);
  v_s              RECORD;
  v_expected       NUMERIC;
  v_diff           NUMERIC;
  v_base_amount    NUMERIC(12,2);
  v_tax_amount     NUMERIC(12,2);
  v_mt_ctid        tid;
BEGIN
  -- Validaciones de entrada
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'El importe debe ser mayor que 0.';
  END IF;
  IF p_method NOT IN ('cash', 'card', 'bizum', 'transfer', 'check') THEN
    RAISE EXCEPTION 'Método de pago no válido: %', p_method;
  END IF;

  -- 1. Obtener el pago actual
  SELECT * INTO v_payment FROM tailoring_order_payments WHERE id = p_payment_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Pago no encontrado: %', p_payment_id;
  END IF;

  v_order_id   := v_payment.tailoring_order_id;
  v_old_amount := v_payment.amount;
  v_old_method := v_payment.payment_method;
  v_session_id := v_payment.cash_session_id;
  v_delta      := p_amount - v_old_amount;

  -- Sin cambios -> no-op
  IF v_delta = 0 AND p_method = v_old_method THEN
    RETURN jsonb_build_object('success', true, 'message', 'Sin cambios.', 'payment_id', p_payment_id);
  END IF;

  SELECT order_number INTO v_order_number FROM tailoring_orders WHERE id = v_order_id;

  -- 2. Ajustar totales de la sesión (si el cobro está vinculado).
  IF v_session_id IS NOT NULL THEN
    SELECT * INTO v_s FROM cash_sessions WHERE id = v_session_id;
    v_session_status := v_s.status;

    IF p_method = v_old_method THEN
      -- Mismo método: solo aplicar el delta.
      UPDATE cash_sessions SET total_sales = COALESCE(total_sales, 0) + v_delta WHERE id = v_session_id;

      IF p_method = 'cash' THEN
        UPDATE cash_sessions SET total_cash_sales     = COALESCE(total_cash_sales, 0)     + v_delta WHERE id = v_session_id;
      ELSIF p_method = 'card' THEN
        UPDATE cash_sessions SET total_card_sales     = COALESCE(total_card_sales, 0)     + v_delta WHERE id = v_session_id;
      ELSIF p_method = 'bizum' THEN
        UPDATE cash_sessions SET total_bizum_sales    = COALESCE(total_bizum_sales, 0)    + v_delta WHERE id = v_session_id;
      ELSE -- transfer | check
        UPDATE cash_sessions SET total_transfer_sales = COALESCE(total_transfer_sales, 0) + v_delta WHERE id = v_session_id;
      END IF;
    ELSE
      -- Cambio de método: quitar el importe viejo del campo viejo y sumar el
      -- nuevo importe al campo nuevo. total_sales solo varía por el delta.
      UPDATE cash_sessions SET total_sales = COALESCE(total_sales, 0) + v_delta WHERE id = v_session_id;

      -- restar viejo del método viejo
      IF v_old_method = 'cash' THEN
        UPDATE cash_sessions SET total_cash_sales     = COALESCE(total_cash_sales, 0)     - v_old_amount WHERE id = v_session_id;
      ELSIF v_old_method = 'card' THEN
        UPDATE cash_sessions SET total_card_sales     = COALESCE(total_card_sales, 0)     - v_old_amount WHERE id = v_session_id;
      ELSIF v_old_method = 'bizum' THEN
        UPDATE cash_sessions SET total_bizum_sales    = COALESCE(total_bizum_sales, 0)    - v_old_amount WHERE id = v_session_id;
      ELSIF v_old_method IN ('transfer', 'check') THEN
        UPDATE cash_sessions SET total_transfer_sales = COALESCE(total_transfer_sales, 0) - v_old_amount WHERE id = v_session_id;
      END IF;

      -- sumar nuevo al método nuevo
      IF p_method = 'cash' THEN
        UPDATE cash_sessions SET total_cash_sales     = COALESCE(total_cash_sales, 0)     + p_amount WHERE id = v_session_id;
      ELSIF p_method = 'card' THEN
        UPDATE cash_sessions SET total_card_sales     = COALESCE(total_card_sales, 0)     + p_amount WHERE id = v_session_id;
      ELSIF p_method = 'bizum' THEN
        UPDATE cash_sessions SET total_bizum_sales    = COALESCE(total_bizum_sales, 0)    + p_amount WHERE id = v_session_id;
      ELSE -- transfer | check
        UPDATE cash_sessions SET total_transfer_sales = COALESCE(total_transfer_sales, 0) + p_amount WHERE id = v_session_id;
      END IF;
    END IF;

    -- 2b. Si la sesión está cerrada, recalcular arqueo (mismo cálculo que mig 182).
    IF v_session_status = 'closed' THEN
      SELECT * INTO v_s FROM cash_sessions WHERE id = v_session_id;
      v_expected := COALESCE(v_s.opening_amount, 0) + COALESCE(v_s.total_cash_sales, 0)
                  - COALESCE(v_s.total_returns, 0) - COALESCE(v_s.total_withdrawals, 0);
      v_diff := COALESCE(v_s.counted_cash, 0) - v_expected;
      UPDATE cash_sessions
      SET expected_cash = v_expected, cash_difference = v_diff, updated_at = now()
      WHERE id = v_session_id;
    END IF;

    -- 3. Reemplazar el espejo manual_transactions.
    --    Borrar el viejo (1 fila por ctid para no tocar el de un cobro hermano
    --    con idéntico importe/pedido en la misma sesión).
    SELECT ctid INTO v_mt_ctid
    FROM manual_transactions
    WHERE cash_session_id = v_session_id
      AND category = 'sastreria'
      AND type = 'income'
      AND total = v_old_amount
      AND (
        (v_order_number IS NOT NULL AND description LIKE '%' || v_order_number || '%')
        OR
        (v_order_number IS NOT NULL AND notes       LIKE '%' || v_order_number || '%')
      )
    LIMIT 1;

    IF v_mt_ctid IS NOT NULL THEN
      DELETE FROM manual_transactions WHERE ctid = v_mt_ctid;
    END IF;

    -- Crear el nuevo espejo con el importe/método actualizados (patrón mig 135).
    v_base_amount := p_amount / 1.21;
    v_tax_amount  := p_amount - v_base_amount;

    INSERT INTO manual_transactions (
      type, date, description, category,
      amount, tax_rate, tax_amount, total,
      notes, created_by, cash_session_id
    ) VALUES (
      'income',
      v_payment.payment_date,
      'Pago pedido - ' || COALESCE(v_order_number, ''),
      'sastreria',
      v_base_amount,
      21,
      v_tax_amount,
      p_amount,
      'Pedido ' || COALESCE(v_order_number, '') || ' - ' || p_method,
      COALESCE(p_user_id, v_payment.created_by),
      v_session_id
    );
  END IF;

  -- 4. Actualizar el propio pago.
  UPDATE tailoring_order_payments
  SET amount = p_amount, payment_method = p_method
  WHERE id = p_payment_id;

  -- 5. Recalcular total_paid del pedido (el trigger también lo hace; explícito
  --    para devolverlo).
  SELECT COALESCE(SUM(amount), 0) INTO v_new_total_paid
  FROM tailoring_order_payments
  WHERE tailoring_order_id = v_order_id;

  UPDATE tailoring_orders
  SET total_paid = v_new_total_paid
  WHERE id = v_order_id;

  RETURN jsonb_build_object(
    'success',             true,
    'message',             'Cobro actualizado.',
    'payment_id',          p_payment_id,
    'tailoring_order_id',  v_order_id,
    'order_number',        v_order_number,
    'old_amount',          v_old_amount,
    'new_amount',          p_amount,
    'old_method',          v_old_method,
    'new_method',          p_method,
    'cash_session_id',     v_session_id,
    'cash_session_status', v_session_status,
    'new_total_paid',      v_new_total_paid
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.rpc_update_tailoring_payment(UUID, NUMERIC, TEXT, UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public.rpc_update_tailoring_payment(UUID, NUMERIC, TEXT, UUID) TO authenticated;
