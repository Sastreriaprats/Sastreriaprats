-- ============================================================
-- Migración 218 — R5 piezas 2+3: borrar y editar un cobro de venta por FK
--
-- Replican rpc_remove_order_payment (mig 210) y rpc_update_tailoring_payment
-- (mig 214), adaptados a sale_payments. Ahora que el create (pieza 1, mig 217)
-- SÍ suma a caja, estos reversos SÍ revierten esa suma → simetría completa
-- add/remove/update.
--
-- Espejo de venta: category 'boutique', description 'Cobro venta - Ticket <n>',
-- localizado POR FK (sale_payment_id) con FALLBACK al texto del ticket.
-- check → total_transfer_sales (igual que pedido). Regla de sesión cerrada
-- idéntica a la pieza 1 y a los demás reversos (recalcular arqueo canónico).
--
-- NO confundir con rpc_update_sale_paymentS (plural, mig 177): aquel redistribuye
-- los métodos del pago mixto INICIAL de una venta (p_sale_id + jsonb). Estos
-- operan sobre UN cobro a plazos individual (p_sale_payment_id). Nombres y firmas
-- distintas → no se pisan.
--
-- El audit (old_data) lo hará el wrapper TS de la acción que las invoque, igual
-- que deleteOrderPayment/updateOrderPayment; las RPC devuelven el snapshot en el
-- JSON de retorno.
-- ============================================================

-- ---------- PIEZA 2: rpc_remove_sale_payment ----------
CREATE OR REPLACE FUNCTION public.rpc_remove_sale_payment(p_sale_payment_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_payment        RECORD;
  v_sale_id        UUID;
  v_ticket         TEXT;
  v_sale_total     NUMERIC(12,2);
  v_amount         NUMERIC(12,2);
  v_method         TEXT;
  v_session_id     UUID;
  v_session_status TEXT;
  v_new_paid       NUMERIC(12,2);
  v_new_status     TEXT;
  v_mt_deleted     INTEGER := 0;
  v_s              RECORD;
  v_expected       NUMERIC;
  v_diff           NUMERIC;
BEGIN
  -- 1. Leer el cobro
  SELECT * INTO v_payment FROM sale_payments WHERE id = p_sale_payment_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Cobro de venta no encontrado: %', p_sale_payment_id;
  END IF;

  v_sale_id    := v_payment.sale_id;
  v_amount     := v_payment.amount;
  v_method     := v_payment.payment_method;
  v_session_id := v_payment.cash_session_id;

  SELECT ticket_number, total INTO v_ticket, v_sale_total FROM sales WHERE id = v_sale_id;

  -- 2. Si vinculado a sesión, revertir totales (abierta o cerrada).
  IF v_session_id IS NOT NULL THEN
    SELECT * INTO v_s FROM cash_sessions WHERE id = v_session_id;
    v_session_status := v_s.status;

    UPDATE cash_sessions SET total_sales = COALESCE(total_sales, 0) - v_amount WHERE id = v_session_id;

    IF v_method = 'cash' THEN
      UPDATE cash_sessions SET total_cash_sales     = COALESCE(total_cash_sales, 0)     - v_amount WHERE id = v_session_id;
    ELSIF v_method = 'card' THEN
      UPDATE cash_sessions SET total_card_sales     = COALESCE(total_card_sales, 0)     - v_amount WHERE id = v_session_id;
    ELSIF v_method = 'bizum' THEN
      UPDATE cash_sessions SET total_bizum_sales    = COALESCE(total_bizum_sales, 0)    - v_amount WHERE id = v_session_id;
    ELSIF v_method IN ('transfer', 'check') THEN
      UPDATE cash_sessions SET total_transfer_sales = COALESCE(total_transfer_sales, 0) - v_amount WHERE id = v_session_id;
    END IF;

    -- 2b. Si la sesión está cerrada, recalcular arqueo (fórmula canónica).
    IF v_session_status = 'closed' THEN
      SELECT * INTO v_s FROM cash_sessions WHERE id = v_session_id;
      v_expected := COALESCE(v_s.opening_amount, 0) + COALESCE(v_s.total_cash_sales, 0)
                  - COALESCE(v_s.total_returns, 0) - COALESCE(v_s.total_withdrawals, 0);
      v_diff := COALESCE(v_s.counted_cash, 0) - v_expected;
      UPDATE cash_sessions
      SET expected_cash = v_expected, cash_difference = v_diff, updated_at = now()
      WHERE id = v_session_id;
    END IF;

    -- 3. Borrar el espejo POR FK (fallback texto) ANTES del pago (orden SET NULL).
    DELETE FROM manual_transactions
    WHERE
      sale_payment_id = p_sale_payment_id
      OR (
        sale_payment_id IS NULL
        AND cash_session_id = v_session_id
        AND category = 'boutique'
        AND type = 'income'
        AND total = v_amount
        AND (v_ticket IS NOT NULL AND description LIKE '%' || v_ticket || '%')
      );
    GET DIAGNOSTICS v_mt_deleted = ROW_COUNT;
  END IF;

  -- 4. Borrar el cobro
  DELETE FROM sale_payments WHERE id = p_sale_payment_id;

  -- 5. Recalcular amount_paid + payment_status de la venta
  SELECT COALESCE(SUM(amount), 0) INTO v_new_paid FROM sale_payments WHERE sale_id = v_sale_id;
  v_new_status := CASE
    WHEN v_new_paid >= v_sale_total THEN 'paid'
    WHEN v_new_paid > 0            THEN 'partial'
    ELSE 'pending'
  END;
  UPDATE sales SET amount_paid = v_new_paid, payment_status = v_new_status, updated_at = now()
  WHERE id = v_sale_id;

  RETURN jsonb_build_object(
    'sale_payment_id',             p_sale_payment_id,
    'sale_id',                     v_sale_id,
    'ticket_number',               v_ticket,
    'amount_reverted',             v_amount,
    'method',                      v_method,
    'cash_session_id',             v_session_id,
    'cash_session_status',         v_session_status,
    'manual_transactions_deleted', v_mt_deleted,
    'new_amount_paid',             v_new_paid,
    'new_payment_status',          v_new_status
  );
END;
$function$;

GRANT EXECUTE ON FUNCTION public.rpc_remove_sale_payment(uuid) TO service_role, authenticated;


-- ---------- PIEZA 3: rpc_update_sale_payment (singular) ----------
CREATE OR REPLACE FUNCTION public.rpc_update_sale_payment(p_sale_payment_id uuid, p_amount numeric, p_method text, p_user_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_payment        RECORD;
  v_sale_id        UUID;
  v_ticket         TEXT;
  v_sale_total     NUMERIC(12,2);
  v_sale_type      TEXT;
  v_old_amount     NUMERIC(12,2);
  v_old_method     TEXT;
  v_session_id     UUID;
  v_session_status TEXT;
  v_delta          NUMERIC(12,2);
  v_new_paid       NUMERIC(12,2);
  v_new_status     TEXT;
  v_s              RECORD;
  v_expected       NUMERIC;
  v_diff           NUMERIC;
  v_base_amount    NUMERIC(12,2);
  v_tax_amount     NUMERIC(12,2);
  v_mt_ctid        tid;
BEGIN
  -- Validaciones
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'El importe debe ser mayor que 0.';
  END IF;
  IF p_method NOT IN ('cash', 'card', 'bizum', 'transfer', 'check') THEN
    RAISE EXCEPTION 'Método de pago no válido: %', p_method;
  END IF;

  -- 1. Obtener el cobro actual
  SELECT * INTO v_payment FROM sale_payments WHERE id = p_sale_payment_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Cobro de venta no encontrado: %', p_sale_payment_id;
  END IF;

  v_sale_id    := v_payment.sale_id;
  v_old_amount := v_payment.amount;
  v_old_method := v_payment.payment_method;
  v_session_id := v_payment.cash_session_id;
  v_delta      := p_amount - v_old_amount;

  -- Sin cambios → no-op
  IF v_delta = 0 AND p_method = v_old_method THEN
    RETURN jsonb_build_object('success', true, 'message', 'Sin cambios.', 'sale_payment_id', p_sale_payment_id);
  END IF;

  SELECT ticket_number, total, sale_type INTO v_ticket, v_sale_total, v_sale_type FROM sales WHERE id = v_sale_id;

  -- 2. Ajustar totales de la sesión (si el cobro está vinculado).
  --    El cobro NO cambia de sesión ni de fecha: solo importe/método.
  IF v_session_id IS NOT NULL THEN
    SELECT * INTO v_s FROM cash_sessions WHERE id = v_session_id;
    v_session_status := v_s.status;

    IF p_method = v_old_method THEN
      -- Mismo método: solo el delta.
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
      -- Cambio de método: restar el viejo del campo viejo, sumar el nuevo al nuevo.
      UPDATE cash_sessions SET total_sales = COALESCE(total_sales, 0) + v_delta WHERE id = v_session_id;
      IF v_old_method = 'cash' THEN
        UPDATE cash_sessions SET total_cash_sales     = COALESCE(total_cash_sales, 0)     - v_old_amount WHERE id = v_session_id;
      ELSIF v_old_method = 'card' THEN
        UPDATE cash_sessions SET total_card_sales     = COALESCE(total_card_sales, 0)     - v_old_amount WHERE id = v_session_id;
      ELSIF v_old_method = 'bizum' THEN
        UPDATE cash_sessions SET total_bizum_sales    = COALESCE(total_bizum_sales, 0)    - v_old_amount WHERE id = v_session_id;
      ELSIF v_old_method IN ('transfer', 'check') THEN
        UPDATE cash_sessions SET total_transfer_sales = COALESCE(total_transfer_sales, 0) - v_old_amount WHERE id = v_session_id;
      END IF;
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

    -- 2b. Arqueo si cerrada (fórmula canónica).
    IF v_session_status = 'closed' THEN
      SELECT * INTO v_s FROM cash_sessions WHERE id = v_session_id;
      v_expected := COALESCE(v_s.opening_amount, 0) + COALESCE(v_s.total_cash_sales, 0)
                  - COALESCE(v_s.total_returns, 0) - COALESCE(v_s.total_withdrawals, 0);
      v_diff := COALESCE(v_s.counted_cash, 0) - v_expected;
      UPDATE cash_sessions
      SET expected_cash = v_expected, cash_difference = v_diff, updated_at = now()
      WHERE id = v_session_id;
    END IF;

    -- 3. Espejo IN-PLACE por FK (fallback texto). El pago NO se borra → la FK vive.
    SELECT ctid INTO v_mt_ctid
    FROM manual_transactions
    WHERE sale_payment_id = p_sale_payment_id
       OR (
         sale_payment_id IS NULL
         AND cash_session_id = v_session_id
         AND category = 'boutique'
         AND type = 'income'
         AND total = v_old_amount
         AND (v_ticket IS NOT NULL AND description LIKE '%' || v_ticket || '%')
       )
    LIMIT 1;

    v_base_amount := p_amount / 1.21;
    v_tax_amount  := p_amount - v_base_amount;

    IF v_mt_ctid IS NOT NULL THEN
      -- UPDATE in-place: importe/método + POBLA la FK (mantiene o backfillea).
      -- description no se toca (el ticket no cambia al editar).
      UPDATE manual_transactions SET
        amount          = v_base_amount,
        tax_amount      = v_tax_amount,
        total           = p_amount,
        notes           = 'Método: ' || p_method || ' - Tipo: ' || COALESCE(v_sale_type, ''),
        sale_payment_id = p_sale_payment_id
      WHERE ctid = v_mt_ctid;
    ELSE
      -- Edge: sin espejo localizable → crear uno nuevo CON FK.
      INSERT INTO manual_transactions (
        type, date, description, category,
        amount, tax_rate, tax_amount, total,
        notes, created_by, cash_session_id, sale_payment_id
      ) VALUES (
        'income',
        v_payment.created_at::date,
        'Cobro venta - Ticket ' || COALESCE(v_ticket, ''),
        'boutique',
        v_base_amount, 21, v_tax_amount, p_amount,
        'Método: ' || p_method || ' - Tipo: ' || COALESCE(v_sale_type, ''),
        p_user_id, v_session_id, p_sale_payment_id
      );
    END IF;
  END IF;

  -- 4. Actualizar el propio cobro.
  UPDATE sale_payments
  SET amount = p_amount, payment_method = p_method::payment_method_type
  WHERE id = p_sale_payment_id;

  -- 5. Recalcular amount_paid + payment_status de la venta.
  SELECT COALESCE(SUM(amount), 0) INTO v_new_paid FROM sale_payments WHERE sale_id = v_sale_id;
  v_new_status := CASE
    WHEN v_new_paid >= v_sale_total THEN 'paid'
    WHEN v_new_paid > 0            THEN 'partial'
    ELSE 'pending'
  END;
  UPDATE sales SET amount_paid = v_new_paid, payment_status = v_new_status, updated_at = now()
  WHERE id = v_sale_id;

  RETURN jsonb_build_object(
    'success',             true,
    'message',             'Cobro actualizado.',
    'sale_payment_id',     p_sale_payment_id,
    'sale_id',             v_sale_id,
    'ticket_number',       v_ticket,
    'old_amount',          v_old_amount,
    'new_amount',          p_amount,
    'old_method',          v_old_method,
    'new_method',          p_method,
    'cash_session_id',     v_session_id,
    'cash_session_status', v_session_status,
    'new_amount_paid',     v_new_paid,
    'new_payment_status',  v_new_status
  );
END;
$function$;

GRANT EXECUTE ON FUNCTION public.rpc_update_sale_payment(uuid, numeric, text, uuid) TO service_role, authenticated;
