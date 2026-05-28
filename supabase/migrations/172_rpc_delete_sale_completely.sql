-- ============================================================
-- Migración 172: rpc_delete_sale_completely (Fase 1 — BORRADO ATÓMICO REAL)
--
-- Borra físicamente un ticket de TPV y todo lo asociado, de forma atómica
-- (una sola función plpgsql: si algo falla, Postgres revierte TODO).
--
-- Revalida los 4 cerrojos ANTES de mutar nada (no confía en el preview):
--   devoluciones · verifactu · periodo cerrado · pedido de sastrería.
--
-- Ajuste de caja: lee sale_payments (no sales.payment_method, por mixtos).
-- expected_cash/cash_difference SOLO se recalculan si la sesión está cerrada
-- (en sesión abierta son NULL hasta el cierre, que ya los calcula).
--
-- p_withdrawal_ids: retiradas que el admin marcó para borrar. Se validan
-- contra la cash_session de la venta (nunca se toca una de otra sesión).
-- ============================================================

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
  v_sale        RECORD;
  v_session     RECORD;
  v_invoice     RECORD;
  v_invoice_je  uuid;
  v_je_ids      uuid[];
  v_mov         RECORD;
  v_d_cash      numeric := 0;
  v_d_card      numeric := 0;
  v_d_bizum     numeric := 0;
  v_d_transfer  numeric := 0;
  v_d_voucher   numeric := 0;
  v_wd_total    numeric := 0;
  v_n_lines     int := 0;
  v_n_movs      int := 0;
  v_n_wd        int := 0;
BEGIN
  -- ── 1) CARGA + CERROJOS (return antes de cualquier mutación) ──────────────
  SELECT * INTO v_sale FROM sales WHERE id = p_sale_id;
  IF v_sale.id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Venta no encontrada');
  END IF;

  IF v_sale.tailoring_order_id IS NOT NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Venta vinculada a pedido de sastrería. Elimínala manualmente.');
  END IF;

  IF EXISTS (SELECT 1 FROM returns WHERE original_sale_id = p_sale_id)
     OR COALESCE(v_sale.total_returned, 0) > 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Tiene devoluciones. Revierte la devolución primero.');
  END IF;

  SELECT * INTO v_invoice FROM invoices WHERE sale_id = p_sale_id LIMIT 1;
  IF v_invoice.id IS NOT NULL AND v_invoice.verifactu_sent = true THEN
    RETURN jsonb_build_object('success', false, 'error', 'Factura enviada a Hacienda (Verifactu). No se puede eliminar.');
  END IF;
  v_invoice_je := v_invoice.journal_entry_id;  -- puede ser NULL

  -- Conjunto de asientos a borrar: venta + factura + cualquiera por reference.
  SELECT array_agg(DISTINCT s.je_id) INTO v_je_ids FROM (
    SELECT v_sale.journal_entry_id AS je_id WHERE v_sale.journal_entry_id IS NOT NULL
    UNION
    SELECT v_invoice_je WHERE v_invoice_je IS NOT NULL
    UNION
    SELECT je.id FROM journal_entries je
      WHERE je.reference_type = 'sale' AND je.reference_id = p_sale_id
  ) s;

  IF v_je_ids IS NOT NULL AND EXISTS (
    SELECT 1 FROM journal_entries WHERE id = ANY(v_je_ids) AND is_period_closed = true
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Periodo contable cerrado.');
  END IF;

  -- ── A) CAPTURAR valores antes de borrar (sale_payments se va por CASCADE) ──
  SELECT * INTO v_session FROM cash_sessions WHERE id = v_sale.cash_session_id;

  SELECT
    COALESCE(SUM(amount) FILTER (WHERE payment_method = 'cash'), 0),
    COALESCE(SUM(amount) FILTER (WHERE payment_method = 'card'), 0),
    COALESCE(SUM(amount) FILTER (WHERE payment_method = 'bizum'), 0),
    COALESCE(SUM(amount) FILTER (WHERE payment_method = 'transfer'), 0),
    COALESCE(SUM(amount) FILTER (WHERE payment_method = 'voucher'), 0)
  INTO v_d_cash, v_d_card, v_d_bizum, v_d_transfer, v_d_voucher
  FROM sale_payments WHERE sale_id = p_sale_id;

  -- Retiradas válidas (solo las de ESTA sesión): suma + conteo.
  SELECT COALESCE(SUM(amount), 0), COUNT(*)
  INTO v_wd_total, v_n_wd
  FROM cash_withdrawals
  WHERE id = ANY(p_withdrawal_ids) AND cash_session_id = v_sale.cash_session_id;

  SELECT COUNT(*) INTO v_n_lines FROM sale_lines WHERE sale_id = p_sale_id;
  SELECT COUNT(*) INTO v_n_movs FROM stock_movements
    WHERE reference_type = 'sale' AND reference_id = p_sale_id;

  -- ── B) REVERTIR STOCK + borrar movimientos ────────────────────────────────
  FOR v_mov IN
    SELECT product_variant_id, warehouse_id, quantity
    FROM stock_movements
    WHERE reference_type = 'sale' AND reference_id = p_sale_id
      AND product_variant_id IS NOT NULL AND warehouse_id IS NOT NULL
  LOOP
    -- available es columna GENERADA → no se toca, se recalcula sola.
    UPDATE stock_levels
      SET quantity = quantity + ABS(v_mov.quantity),
          last_movement_at = now()
      WHERE product_variant_id = v_mov.product_variant_id
        AND warehouse_id = v_mov.warehouse_id;
  END LOOP;
  DELETE FROM stock_movements WHERE reference_type = 'sale' AND reference_id = p_sale_id;

  -- ── C) BORRAR FACTURA (1:1) ────────────────────────────────────────────────
  IF v_invoice.id IS NOT NULL THEN
    DELETE FROM invoice_lines WHERE invoice_id = v_invoice.id;
    DELETE FROM invoices WHERE id = v_invoice.id;
  END IF;

  -- ── D) BORRAR LA VENTA (CASCADE limpia sale_lines y sale_payments) ─────────
  --     Esto libera la FK sales.journal_entry_id antes de borrar el asiento.
  DELETE FROM sales WHERE id = p_sale_id;

  -- ── E) BORRAR ASIENTOS (venta + factura) ──────────────────────────────────
  IF v_je_ids IS NOT NULL THEN
    DELETE FROM journal_entry_lines WHERE journal_entry_id = ANY(v_je_ids);
    DELETE FROM journal_entries WHERE id = ANY(v_je_ids);
  END IF;

  -- ── F) BORRAR RETIRADAS SELECCIONADAS (solo las de esta sesión) ────────────
  IF array_length(p_withdrawal_ids, 1) IS NOT NULL THEN
    DELETE FROM cash_withdrawals
      WHERE id = ANY(p_withdrawal_ids) AND cash_session_id = v_sale.cash_session_id;
  END IF;

  -- ── G) AJUSTAR CAJA en un solo UPDATE (totales venta + retiradas) ──────────
  --     Las expresiones del SET usan los valores ANTIGUOS de la fila, así que
  --     (total_cash_sales - v_d_cash) etc. ya es el valor nuevo. expected_cash
  --     y cash_difference solo se recalculan si la sesión está cerrada.
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

  -- ── 8) RESUMEN ─────────────────────────────────────────────────────────────
  RETURN jsonb_build_object(
    'success', true,
    'message', 'Venta ' || v_sale.ticket_number || ' eliminada por completo.',
    'deleted', jsonb_build_object(
      'sale_id', p_sale_id,
      'ticket_number', v_sale.ticket_number,
      'total', v_sale.total,
      'lines', v_n_lines,
      'stock_movements_reverted', v_n_movs,
      'invoice_deleted', (v_invoice.id IS NOT NULL),
      'invoice_number', v_invoice.invoice_number,
      'journal_entries_deleted', COALESCE(array_length(v_je_ids, 1), 0),
      'withdrawals_deleted', v_n_wd,
      'cash_session_id', v_sale.cash_session_id,
      'cash_session_status', v_session.status
    )
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.rpc_delete_sale_completely(uuid, uuid[]) TO service_role;
GRANT EXECUTE ON FUNCTION public.rpc_delete_sale_completely(uuid, uuid[]) TO authenticated;
