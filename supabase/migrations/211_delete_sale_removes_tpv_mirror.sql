-- ============================================================
-- Migración 211 — Fase D (2/3): rpc_delete_sale_completely borra el espejo "Venta TPV"
--
-- ÚNICO cambio: se AÑADE un DELETE de los espejos manual_transactions de la venta
-- (category='tpv'), localizados por FK sale_id con fallback a texto, INSERTADO
-- ANTES del 'DELETE FROM sales' (la FK es ON DELETE SET NULL: borrarlos después
-- los dejaría huérfanos = el bug R4). El reajuste de sesión [:177-195] queda
-- INTACTO: lee los deltas de sale_payments al principio (antes del CASCADE) y
-- aplica el UPDATE con variables; no se toca. Multiplicidad: borra TODOS los
-- espejos de la venta (varios métodos). Resto de la función byte-idéntico.
-- ============================================================

CREATE OR REPLACE FUNCTION public.rpc_delete_sale_completely(p_sale_id uuid, p_withdrawal_ids uuid[] DEFAULT '{}'::uuid[])
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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

  -- Cancelar tarjeta regalo (antes de borrar la venta; FK SET NULL).
  -- FIX 179: IF anidado en vez de "... AND v_giftcard.id IS NOT NULL" para no
  -- leer el campo de un record sin asignar en ventas no-gift_card.
  IF v_sale.sale_type = 'gift_card' THEN
    IF v_giftcard.id IS NOT NULL THEN
      UPDATE vouchers SET status = 'cancelled', remaining_amount = 0, updated_at = now()
        WHERE origin_sale_id = p_sale_id AND voucher_kind = 'gift_card'
          AND status = 'active' AND remaining_amount = original_amount;
      IF FOUND THEN
        v_voucher_cancelled := jsonb_build_object('code', v_giftcard.code, 'amount', v_giftcard.original_amount);
      END IF;
    END IF;
  END IF;

  -- Deshacer cada devolución (todas validadas como voucher-intacto). ANTES de
  -- borrar la venta (FK RESTRICT de returns.original_sale_id).
  FOR v_ret IN
    SELECT r.id, r.return_type, r.total_returned, r.voucher_id, v.code AS vcode
    FROM returns r LEFT JOIN vouchers v ON v.id = r.voucher_id
    WHERE r.original_sale_id = p_sale_id
  LOOP
    IF v_ret.voucher_id IS NOT NULL THEN
      UPDATE vouchers SET status = 'cancelled', remaining_amount = 0, updated_at = now()
        WHERE id = v_ret.voucher_id AND status = 'active' AND remaining_amount = original_amount;
      IF NOT FOUND THEN
        RAISE EXCEPTION 'El vale de la devolución (%) se usó mientras tanto. Operación cancelada.', v_ret.vcode;
      END IF;
    END IF;
    FOR v_rmov IN
      SELECT product_variant_id, warehouse_id, quantity FROM stock_movements
      WHERE reference_type = 'return' AND reference_id = v_ret.id
        AND product_variant_id IS NOT NULL AND warehouse_id IS NOT NULL
    LOOP
      UPDATE stock_levels SET quantity = quantity - ABS(v_rmov.quantity), last_movement_at = now()
        WHERE product_variant_id = v_rmov.product_variant_id AND warehouse_id = v_rmov.warehouse_id;
    END LOOP;
    DELETE FROM stock_movements WHERE reference_type = 'return' AND reference_id = v_ret.id;
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

  -- Borrar los espejos "Venta TPV" de manual_transactions ANTES de borrar la venta.
  -- FK sale_id es ON DELETE SET NULL: si se borraran DESPUÉS del DELETE sales, sale_id
  -- ya sería NULL y no se encontrarían (huérfanos = el bug R4). Una venta puede tener
  -- varios espejos (uno por método de pago) → se borran TODOS (sin LIMIT). Fallback
  -- por texto para ventas sin FK, con v_sale.ticket_number (la venta aún vive aquí).
  DELETE FROM manual_transactions
  WHERE sale_id = p_sale_id
     OR (sale_id IS NULL
         AND category = 'tpv'
         AND type = 'income'
         AND cash_session_id = v_sale.cash_session_id
         AND description = 'Venta TPV - ' || v_sale.ticket_number);

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
$function$;
