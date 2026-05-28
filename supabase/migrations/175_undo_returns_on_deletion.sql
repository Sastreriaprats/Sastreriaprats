-- ============================================================
-- Migración 175 (Fase 3b): deshacer devoluciones autónomamente al borrar.
--
-- En vez de bloquear toda venta con devolución, el borrado DESHACE la
-- devolución cuando es seguro: cancela el vale generado (si está intacto) y
-- revierte el stock que la devolución repuso. Solo bloquea lo imposible.
--
-- Clasificación de cada return (original_sale_id = p_sale_id):
--   - voucher con vale INTACTO (active, remaining=original) -> AUTOMATIZABLE
--   - voucher con vale USADO/cancelado -> BLOQUEA (el dinero salió)
--   - exchange -> BLOQUEA (cambio por otro producto, exchange_sale_id ambiguo)
--   - cash -> BLOQUEA (returns no guarda la cash_session que ajustó; la sesión
--             de la devolución pudo ser otra y estar cerrada -> indeterminado).
--             Decisión de diseño: NO automatizar cash en esta fase.
--
-- TRAMPA DE STOCK (verificada en datos): la venta hizo -1 (movement 'sale'),
-- la devolución +1 (movement 'return'). Deshacer ambos = neto 0 (correcto).
-- Hay que revertir TAMBIÉN los movements 'return', no solo los 'sale'.
--
-- FK RESTRICT: returns.original_sale_id es RESTRICT -> los returns se deshacen
-- y se borran ANTES de borrar la venta.
--
-- Las devoluciones no generan asiento contable (verificado), así que deshacerlas
-- no toca journal_entries.
-- ============================================================

-- ── PREVIEW (solo lectura) ────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.rpc_preview_sale_deletion(p_sale_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sale          RECORD;
  v_session       RECORD;
  v_invoice       RECORD;
  v_giftcard      RECORD;
  v_ret           RECORD;
  v_blockers      text[] := '{}';
  v_warnings      text[] := '{}';
  v_auto_actions  text[] := '{}';
  v_period_closed boolean := false;
  v_je_ids        uuid[];
  v_lines         jsonb;
  v_stock         jsonb;
  v_payments      jsonb;
  v_withdrawals   jsonb;
  v_journals      jsonb;
  v_adjust_items  jsonb;
  v_cash_adjust   jsonb;
BEGIN
  SELECT * INTO v_sale FROM sales WHERE id = p_sale_id;
  IF v_sale.id IS NULL THEN
    RETURN jsonb_build_object('error', 'Venta no encontrada');
  END IF;

  SELECT * INTO v_session FROM cash_sessions WHERE id = v_sale.cash_session_id;
  SELECT * INTO v_invoice FROM invoices WHERE sale_id = p_sale_id LIMIT 1;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'description', sl.description, 'quantity', sl.quantity, 'product_variant_id', sl.product_variant_id
         ) ORDER BY sl.sort_order), '[]'::jsonb)
  INTO v_lines FROM sale_lines sl WHERE sl.sale_id = p_sale_id;

  SELECT COALESCE(jsonb_agg(t.x), '[]'::jsonb) INTO v_stock FROM (
    SELECT jsonb_build_object('product_variant_id', sm.product_variant_id, 'warehouse_id', sm.warehouse_id, 'quantity', SUM(ABS(sm.quantity))) AS x
    FROM stock_movements sm WHERE sm.reference_type = 'sale' AND sm.reference_id = p_sale_id
    GROUP BY sm.product_variant_id, sm.warehouse_id
  ) t;

  SELECT COALESCE(jsonb_agg(jsonb_build_object('payment_method', sp.payment_method, 'amount', sp.amount)), '[]'::jsonb)
  INTO v_payments FROM sale_payments sp WHERE sp.sale_id = p_sale_id;

  SELECT COALESCE(jsonb_agg(t.adj), '[]'::jsonb) INTO v_adjust_items FROM (
    SELECT jsonb_build_object(
             'total_field', CASE sp.payment_method
               WHEN 'cash' THEN 'total_cash_sales' WHEN 'card' THEN 'total_card_sales'
               WHEN 'bizum' THEN 'total_bizum_sales' WHEN 'transfer' THEN 'total_transfer_sales'
               WHEN 'voucher' THEN 'total_voucher_sales' ELSE 'total_other' END,
             'current_value', CASE sp.payment_method
               WHEN 'cash' THEN v_session.total_cash_sales WHEN 'card' THEN v_session.total_card_sales
               WHEN 'bizum' THEN v_session.total_bizum_sales WHEN 'transfer' THEN v_session.total_transfer_sales
               WHEN 'voucher' THEN v_session.total_voucher_sales ELSE 0 END,
             'delta', -SUM(sp.amount)
           ) AS adj
    FROM sale_payments sp WHERE sp.sale_id = p_sale_id GROUP BY sp.payment_method
  ) t;
  v_adjust_items := v_adjust_items || jsonb_build_array(jsonb_build_object(
    'total_field', 'total_sales', 'current_value', v_session.total_sales, 'delta', -v_sale.total));

  v_cash_adjust := jsonb_build_object(
    'cash_session_id', v_sale.cash_session_id, 'session_status', v_session.status, 'adjustments', v_adjust_items);
  IF v_session.status = 'closed' THEN
    v_cash_adjust := v_cash_adjust || jsonb_build_object(
      'session_closed', true, 'expected_cash', v_session.expected_cash,
      'counted_cash', v_session.counted_cash, 'cash_difference', v_session.cash_difference);
  END IF;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'id', cw.id, 'amount', cw.amount, 'reason', cw.reason, 'withdrawn_at', cw.withdrawn_at
         ) ORDER BY cw.withdrawn_at DESC), '[]'::jsonb)
  INTO v_withdrawals FROM cash_withdrawals cw WHERE cw.cash_session_id = v_sale.cash_session_id;

  SELECT array_agg(DISTINCT s.je_id) INTO v_je_ids FROM (
    SELECT v_sale.journal_entry_id AS je_id WHERE v_sale.journal_entry_id IS NOT NULL
    UNION SELECT v_invoice.journal_entry_id WHERE v_invoice.journal_entry_id IS NOT NULL
    UNION SELECT je.id FROM journal_entries je WHERE je.reference_type = 'sale' AND je.reference_id = p_sale_id
  ) s;
  SELECT COALESCE(jsonb_agg(jsonb_build_object('id', je.id, 'entry_number', je.entry_number, 'description', je.description)), '[]'::jsonb)
  INTO v_journals FROM journal_entries je WHERE je.id = ANY(v_je_ids);

  -- ── Cerrojos ──────────────────────────────────────────────────────────────
  -- Devoluciones (Fase 3b): clasificar cada return de la venta.
  FOR v_ret IN
    SELECT r.return_type, r.total_returned, r.voucher_id,
           v.code AS vcode, v.status AS vstatus, v.remaining_amount AS vrem, v.original_amount AS vorig
    FROM returns r LEFT JOIN vouchers v ON v.id = r.voucher_id
    WHERE r.original_sale_id = p_sale_id
  LOOP
    IF v_ret.return_type = 'voucher' THEN
      IF v_ret.voucher_id IS NOT NULL AND v_ret.vstatus = 'active' AND v_ret.vrem = v_ret.vorig THEN
        v_auto_actions := array_append(v_auto_actions,
          'Se deshará la devolución de ' || trim(to_char(v_ret.total_returned, 'FM999990.00'))
          || '€ y se cancelará el vale ' || COALESCE(v_ret.vcode, '(sin código)'));
      ELSE
        v_blockers := array_append(v_blockers,
          'La devolución de ' || trim(to_char(v_ret.total_returned, 'FM999990.00'))
          || '€ generó el vale ' || COALESCE(v_ret.vcode, '?') || ' que ya se ha usado. Gestiona el vale antes de eliminar.');
      END IF;
    ELSIF v_ret.return_type = 'cash' THEN
      v_blockers := array_append(v_blockers,
        'Devolución en efectivo de ' || trim(to_char(v_ret.total_returned, 'FM999990.00'))
        || '€: deshazla manualmente (no se puede determinar la sesión de caja afectada).');
    ELSE
      v_blockers := array_append(v_blockers,
        'La devolución es un cambio por otro producto. Deshazlo manualmente antes de eliminar.');
    END IF;
  END LOOP;

  IF v_invoice.id IS NOT NULL AND v_invoice.verifactu_sent = true THEN
    v_blockers := array_append(v_blockers, 'Factura enviada a Hacienda (Verifactu). No se puede eliminar.');
  END IF;

  SELECT EXISTS(SELECT 1 FROM journal_entries je WHERE je.id = ANY(v_je_ids) AND je.is_period_closed = true) INTO v_period_closed;
  IF v_period_closed THEN
    v_blockers := array_append(v_blockers, 'El periodo contable está cerrado.');
  END IF;

  IF v_sale.tailoring_order_id IS NOT NULL OR v_sale.sale_type LIKE 'tailoring%' THEN
    v_blockers := array_append(v_blockers, 'Venta vinculada a un pedido de sastrería (señal o pago). Elimínala manualmente.');
  END IF;

  -- Tarjeta regalo (Fase 3a — autónomo)
  IF v_sale.sale_type = 'gift_card' THEN
    SELECT * INTO v_giftcard FROM vouchers
      WHERE origin_sale_id = p_sale_id AND voucher_kind = 'gift_card' ORDER BY created_at LIMIT 1;
    IF v_giftcard.id IS NULL THEN
      NULL;
    ELSIF v_giftcard.status = 'active' AND v_giftcard.remaining_amount = v_giftcard.original_amount THEN
      v_auto_actions := array_append(v_auto_actions,
        'Se cancelará la tarjeta regalo ' || v_giftcard.code || ' de ' ||
        trim(to_char(v_giftcard.original_amount, 'FM999990.00')) || '€ (sin usar)');
    ELSE
      v_blockers := array_append(v_blockers,
        'La tarjeta regalo ' || v_giftcard.code || ' ya tiene saldo usado (' ||
        trim(to_char(v_giftcard.original_amount - v_giftcard.remaining_amount, 'FM999990.00')) || '€ gastados). No se puede eliminar.');
    END IF;
  END IF;

  -- ── Avisos ──────────────────────────────────────────────────────────────
  IF v_session.status = 'closed' THEN
    v_warnings := array_append(v_warnings,
      'La caja de esta venta (' || COALESCE(to_char(v_session.closed_at, 'YYYY-MM-DD'), 'sin fecha')
      || ') ya está cerrada. Eliminarla afectará al arqueo de ese día.');
  END IF;

  RETURN jsonb_build_object(
    'sale', jsonb_build_object(
      'id', v_sale.id, 'ticket_number', v_sale.ticket_number, 'total', v_sale.total,
      'status', v_sale.status, 'created_at', v_sale.created_at, 'sale_type', v_sale.sale_type,
      'tailoring_order_id', v_sale.tailoring_order_id),
    'lines', v_lines,
    'stock_to_return', v_stock,
    'payments', v_payments,
    'cash_adjustment', v_cash_adjust,
    'withdrawals_in_session', v_withdrawals,
    'journal_entries_to_delete', v_journals,
    'invoice', CASE WHEN v_invoice.id IS NOT NULL
      THEN jsonb_build_object('id', v_invoice.id, 'invoice_number', v_invoice.invoice_number, 'status', v_invoice.status)
      ELSE NULL END,
    'blockers', to_jsonb(v_blockers),
    'warnings', to_jsonb(v_warnings),
    'auto_actions', to_jsonb(v_auto_actions),
    'can_delete', (array_length(v_blockers, 1) IS NULL)
  );
END;
$$;

-- ── DELETE (borrado atómico) ───────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.rpc_delete_sale_completely(
  p_sale_id uuid,
  p_withdrawal_ids uuid[] DEFAULT '{}'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sale             RECORD;
  v_session          RECORD;
  v_invoice          RECORD;
  v_giftcard         RECORD;
  v_ret              RECORD;
  v_rmov             RECORD;
  v_invoice_je       uuid;
  v_je_ids           uuid[];
  v_mov              RECORD;
  v_d_cash           numeric := 0;
  v_d_card           numeric := 0;
  v_d_bizum          numeric := 0;
  v_d_transfer       numeric := 0;
  v_d_voucher        numeric := 0;
  v_wd_total         numeric := 0;
  v_n_lines          int := 0;
  v_n_movs           int := 0;
  v_n_wd             int := 0;
  v_voucher_cancelled jsonb := NULL;
  v_returns_undone   jsonb := '[]'::jsonb;
BEGIN
  SELECT * INTO v_sale FROM sales WHERE id = p_sale_id;
  IF v_sale.id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Venta no encontrada');
  END IF;

  -- Sastrería
  IF v_sale.tailoring_order_id IS NOT NULL OR v_sale.sale_type LIKE 'tailoring%' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Venta vinculada a un pedido de sastrería (señal o pago). Elimínala manualmente.');
  END IF;

  -- Tarjeta regalo: bloquear solo si el vale ya se usó (revalidación)
  IF v_sale.sale_type = 'gift_card' THEN
    SELECT * INTO v_giftcard FROM vouchers
      WHERE origin_sale_id = p_sale_id AND voucher_kind = 'gift_card' ORDER BY created_at LIMIT 1;
    IF v_giftcard.id IS NOT NULL
       AND NOT (v_giftcard.status = 'active' AND v_giftcard.remaining_amount = v_giftcard.original_amount) THEN
      RETURN jsonb_build_object('success', false, 'error',
        'La tarjeta regalo ' || v_giftcard.code || ' se ha usado o no está activa. No se puede eliminar.');
    END IF;
  END IF;

  -- Devoluciones (Fase 3b): VALIDACIÓN PURA (sin mutar). Aborta si alguna no es
  -- automatizable. Se hace antes de cualquier mutación para que un RETURN no
  -- deje cambios a medias.
  FOR v_ret IN
    SELECT r.id, r.return_type, r.voucher_id,
           v.status AS vstatus, v.remaining_amount AS vrem, v.original_amount AS vorig
    FROM returns r LEFT JOIN vouchers v ON v.id = r.voucher_id
    WHERE r.original_sale_id = p_sale_id
  LOOP
    IF v_ret.return_type = 'voucher' THEN
      IF NOT (v_ret.voucher_id IS NOT NULL AND v_ret.vstatus = 'active' AND v_ret.vrem = v_ret.vorig) THEN
        RETURN jsonb_build_object('success', false, 'error', 'La devolución generó un vale que ya se ha usado. Gestiónalo antes de eliminar.');
      END IF;
    ELSIF v_ret.return_type = 'cash' THEN
      RETURN jsonb_build_object('success', false, 'error', 'Devolución en efectivo: deshazla manualmente (no se puede determinar la sesión de caja afectada).');
    ELSE
      RETURN jsonb_build_object('success', false, 'error', 'La devolución es un cambio por otro producto. Deshazlo manualmente antes de eliminar.');
    END IF;
  END LOOP;

  SELECT * INTO v_invoice FROM invoices WHERE sale_id = p_sale_id LIMIT 1;
  IF v_invoice.id IS NOT NULL AND v_invoice.verifactu_sent = true THEN
    RETURN jsonb_build_object('success', false, 'error', 'Factura enviada a Hacienda (Verifactu). No se puede eliminar.');
  END IF;
  v_invoice_je := v_invoice.journal_entry_id;

  SELECT array_agg(DISTINCT s.je_id) INTO v_je_ids FROM (
    SELECT v_sale.journal_entry_id AS je_id WHERE v_sale.journal_entry_id IS NOT NULL
    UNION SELECT v_invoice_je WHERE v_invoice_je IS NOT NULL
    UNION SELECT je.id FROM journal_entries je WHERE je.reference_type = 'sale' AND je.reference_id = p_sale_id
  ) s;
  IF v_je_ids IS NOT NULL AND EXISTS (SELECT 1 FROM journal_entries WHERE id = ANY(v_je_ids) AND is_period_closed = true) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Periodo contable cerrado.');
  END IF;

  -- ── A partir de aquí, MUTACIONES (validaciones ya pasaron) ─────────────────
  SELECT * INTO v_session FROM cash_sessions WHERE id = v_sale.cash_session_id;

  SELECT
    COALESCE(SUM(amount) FILTER (WHERE payment_method = 'cash'), 0),
    COALESCE(SUM(amount) FILTER (WHERE payment_method = 'card'), 0),
    COALESCE(SUM(amount) FILTER (WHERE payment_method = 'bizum'), 0),
    COALESCE(SUM(amount) FILTER (WHERE payment_method = 'transfer'), 0),
    COALESCE(SUM(amount) FILTER (WHERE payment_method = 'voucher'), 0)
  INTO v_d_cash, v_d_card, v_d_bizum, v_d_transfer, v_d_voucher
  FROM sale_payments WHERE sale_id = p_sale_id;

  SELECT COALESCE(SUM(amount), 0), COUNT(*) INTO v_wd_total, v_n_wd
  FROM cash_withdrawals WHERE id = ANY(p_withdrawal_ids) AND cash_session_id = v_sale.cash_session_id;

  SELECT COUNT(*) INTO v_n_lines FROM sale_lines WHERE sale_id = p_sale_id;
  SELECT COUNT(*) INTO v_n_movs FROM stock_movements WHERE reference_type = 'sale' AND reference_id = p_sale_id;

  -- Cancelar tarjeta regalo (antes de borrar la venta; FK SET NULL)
  IF v_sale.sale_type = 'gift_card' AND v_giftcard.id IS NOT NULL THEN
    UPDATE vouchers SET status = 'cancelled', remaining_amount = 0, updated_at = now()
      WHERE origin_sale_id = p_sale_id AND voucher_kind = 'gift_card'
        AND status = 'active' AND remaining_amount = original_amount;
    IF FOUND THEN
      v_voucher_cancelled := jsonb_build_object('code', v_giftcard.code, 'amount', v_giftcard.original_amount);
    END IF;
  END IF;

  -- Deshacer cada devolución (todas validadas como voucher-intacto). ANTES de
  -- borrar la venta (FK RESTRICT de returns.original_sale_id).
  FOR v_ret IN
    SELECT r.id, r.return_type, r.total_returned, r.voucher_id, v.code AS vcode
    FROM returns r LEFT JOIN vouchers v ON v.id = r.voucher_id
    WHERE r.original_sale_id = p_sale_id
  LOOP
    -- Cancelar el vale de la devolución (revalidación atómica en el WHERE).
    IF v_ret.voucher_id IS NOT NULL THEN
      UPDATE vouchers SET status = 'cancelled', remaining_amount = 0, updated_at = now()
        WHERE id = v_ret.voucher_id AND status = 'active' AND remaining_amount = original_amount;
      IF NOT FOUND THEN
        -- Canje concurrente entre validación y mutación: abortar TODO (rollback).
        RAISE EXCEPTION 'El vale de la devolución (%) se usó mientras tanto. Operación cancelada.', v_ret.vcode;
      END IF;
    END IF;
    -- Revertir el stock que la devolución repuso (movements 'return').
    FOR v_rmov IN
      SELECT product_variant_id, warehouse_id, quantity FROM stock_movements
      WHERE reference_type = 'return' AND reference_id = v_ret.id
        AND product_variant_id IS NOT NULL AND warehouse_id IS NOT NULL
    LOOP
      UPDATE stock_levels SET quantity = quantity - ABS(v_rmov.quantity), last_movement_at = now()
        WHERE product_variant_id = v_rmov.product_variant_id AND warehouse_id = v_rmov.warehouse_id;
    END LOOP;
    DELETE FROM stock_movements WHERE reference_type = 'return' AND reference_id = v_ret.id;
    -- Borrar el registro de devolución (libera la FK RESTRICT).
    DELETE FROM returns WHERE id = v_ret.id;
    v_returns_undone := v_returns_undone || jsonb_build_array(jsonb_build_object(
      'type', v_ret.return_type, 'amount', v_ret.total_returned, 'voucher_code', v_ret.vcode));
  END LOOP;

  -- Revertir stock 'sale' + borrar movimientos
  FOR v_mov IN
    SELECT product_variant_id, warehouse_id, quantity FROM stock_movements
    WHERE reference_type = 'sale' AND reference_id = p_sale_id
      AND product_variant_id IS NOT NULL AND warehouse_id IS NOT NULL
  LOOP
    UPDATE stock_levels SET quantity = quantity + ABS(v_mov.quantity), last_movement_at = now()
      WHERE product_variant_id = v_mov.product_variant_id AND warehouse_id = v_mov.warehouse_id;
  END LOOP;
  DELETE FROM stock_movements WHERE reference_type = 'sale' AND reference_id = p_sale_id;

  -- Borrar factura (1:1)
  IF v_invoice.id IS NOT NULL THEN
    DELETE FROM invoice_lines WHERE invoice_id = v_invoice.id;
    DELETE FROM invoices WHERE id = v_invoice.id;
  END IF;

  -- Borrar venta (CASCADE → sale_lines + sale_payments)
  DELETE FROM sales WHERE id = p_sale_id;

  -- Borrar asientos
  IF v_je_ids IS NOT NULL THEN
    DELETE FROM journal_entry_lines WHERE journal_entry_id = ANY(v_je_ids);
    DELETE FROM journal_entries WHERE id = ANY(v_je_ids);
  END IF;

  -- Borrar retiradas seleccionadas (solo las de esta sesión)
  IF array_length(p_withdrawal_ids, 1) IS NOT NULL THEN
    DELETE FROM cash_withdrawals WHERE id = ANY(p_withdrawal_ids) AND cash_session_id = v_sale.cash_session_id;
  END IF;

  -- Ajustar caja (un solo UPDATE)
  UPDATE cash_sessions SET
    total_cash_sales     = total_cash_sales     - v_d_cash,
    total_card_sales     = total_card_sales     - v_d_card,
    total_bizum_sales    = total_bizum_sales    - v_d_bizum,
    total_transfer_sales = total_transfer_sales - v_d_transfer,
    total_voucher_sales  = total_voucher_sales  - v_d_voucher,
    total_sales          = total_sales          - v_sale.total,
    total_withdrawals    = total_withdrawals    - v_wd_total,
    expected_cash = CASE WHEN status = 'closed'
      THEN opening_amount + (total_cash_sales - v_d_cash)
           - COALESCE(total_returns, 0) - (total_withdrawals - v_wd_total)
      ELSE expected_cash END,
    cash_difference = CASE WHEN status = 'closed'
      THEN COALESCE(counted_cash, 0)
           - ( opening_amount + (total_cash_sales - v_d_cash)
               - COALESCE(total_returns, 0) - (total_withdrawals - v_wd_total) )
      ELSE cash_difference END,
    updated_at = now()
  WHERE id = v_sale.cash_session_id;

  RETURN jsonb_build_object(
    'success', true,
    'message', 'Venta ' || v_sale.ticket_number || ' eliminada por completo.',
    'deleted', jsonb_build_object(
      'sale_id', p_sale_id, 'ticket_number', v_sale.ticket_number, 'total', v_sale.total,
      'lines', v_n_lines, 'stock_movements_reverted', v_n_movs,
      'invoice_deleted', (v_invoice.id IS NOT NULL), 'invoice_number', v_invoice.invoice_number,
      'journal_entries_deleted', COALESCE(array_length(v_je_ids, 1), 0),
      'withdrawals_deleted', v_n_wd,
      'voucher_cancelled', v_voucher_cancelled,
      'returns_undone', v_returns_undone,
      'cash_session_id', v_sale.cash_session_id, 'cash_session_status', v_session.status
    )
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.rpc_preview_sale_deletion(uuid) TO service_role, authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_delete_sale_completely(uuid, uuid[]) TO service_role, authenticated;
