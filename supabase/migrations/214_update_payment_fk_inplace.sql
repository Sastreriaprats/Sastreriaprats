-- ============================================================
-- Migración 214 — rpc_update_tailoring_payment: espejo por FK + UPDATE in-place
--
-- Cierra el último vínculo por TEXTO en cobros de pedido (gap de la Fase D, R8).
-- ÚNICO cambio: el bloque de reemplazo del espejo (paso 3). Antes localizaba por
-- texto, BORRABA y RE-INSERTABA sin poblar la FK (editar un cobro le quitaba la FK).
-- Ahora: localiza por FK con fallback a texto, y hace UPDATE IN-PLACE poblando
-- tailoring_order_payment_id (mantiene si la tenía, BACKFILLEA si era null). Edge
-- sin espejo -> INSERT con FK. El resto (validación, reajuste de sesión, arqueo
-- cerrado, UPDATE del pago, recálculo de total_paid) queda byte-idéntico.
-- ============================================================

CREATE OR REPLACE FUNCTION public.rpc_update_tailoring_payment(p_payment_id uuid, p_amount numeric, p_method text, p_user_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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

    -- 3. Actualizar el espejo manual_transactions IN-PLACE.
    --    Localizar por FK (tailoring_order_payment_id) con FALLBACK al texto (mig 191).
    --    El ctid acota a 1 fila; con FK el caso primario es inequívoco. SET NULL no
    --    aplica: este flujo NO borra el pago, así que la FK vive durante toda la función.
    SELECT ctid INTO v_mt_ctid
    FROM manual_transactions
    WHERE tailoring_order_payment_id = p_payment_id
       OR (
         tailoring_order_payment_id IS NULL
         AND cash_session_id = v_session_id
         AND category = 'sastreria'
         AND type = 'income'
         AND total = v_old_amount
         AND (
           (v_order_number IS NOT NULL AND description LIKE '%' || v_order_number || '%')
           OR
           (v_order_number IS NOT NULL AND notes       LIKE '%' || v_order_number || '%')
         )
       )
    LIMIT 1;

    v_base_amount := p_amount / 1.21;
    v_tax_amount  := p_amount - v_base_amount;

    IF v_mt_ctid IS NOT NULL THEN
      -- UPDATE in-place: actualiza importe/método y POBLA la FK (la mantiene si la
      -- tenía, la BACKFILLEA si era null). description no se toca (el order_number no
      -- cambia al editar; preserva además "Entrega a cuenta"/"Pago pedido" original).
      UPDATE manual_transactions SET
        amount                     = v_base_amount,
        tax_amount                 = v_tax_amount,
        total                      = p_amount,
        notes                      = 'Pedido ' || COALESCE(v_order_number, '') || ' - ' || p_method,
        tailoring_order_payment_id = p_payment_id
      WHERE ctid = v_mt_ctid;
    ELSE
      -- Edge: no había espejo localizable -> crear uno nuevo CON FK.
      INSERT INTO manual_transactions (
        type, date, description, category,
        amount, tax_rate, tax_amount, total,
        notes, created_by, cash_session_id, tailoring_order_payment_id
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
        v_session_id,
        p_payment_id
      );
    END IF;
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
$function$;
