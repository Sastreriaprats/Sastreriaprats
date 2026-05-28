-- ============================================================
-- Migración 171: rpc_preview_sale_deletion (Fase 0 — PREVIEW, NO MUTA NADA)
--
-- Calcula qué implicaría el borrado físico de un ticket de TPV y devuelve un
-- JSON con el plan + cerrojos (blockers) + avisos (warnings). NO ejecuta
-- ningún DELETE/UPDATE/INSERT: solo SELECTs. El borrado real será otra RPC
-- en una fase posterior. Alimenta el diálogo de confirmación de la UI.
--
-- Cerrojos duros (bloquean, can_delete=false):
--   1. Devoluciones previas (returns o total_returned>0)
--   2. Factura enviada a Verifactu (verifactu_sent=true)
--   3. Periodo contable cerrado (journal_entries.is_period_closed=true)
--   4. Venta vinculada a pedido de sastrería (tailoring_order_id no null)
-- Avisos (no bloquean):
--   - Caja de la venta cerrada (afecta a un arqueo histórico)
-- ============================================================

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
  v_blockers      text[] := '{}';
  v_warnings      text[] := '{}';
  v_has_returns   boolean := false;
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

  -- Sesión de caja de la venta
  SELECT * INTO v_session FROM cash_sessions WHERE id = v_sale.cash_session_id;

  -- Factura (1:1 verificado en producción)
  SELECT * INTO v_invoice FROM invoices WHERE sale_id = p_sale_id LIMIT 1;

  -- Líneas de venta
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'description', sl.description,
           'quantity', sl.quantity,
           'product_variant_id', sl.product_variant_id
         ) ORDER BY sl.sort_order), '[]'::jsonb)
  INTO v_lines
  FROM sale_lines sl WHERE sl.sale_id = p_sale_id;

  -- Stock a devolver: de stock_movements de la venta, agrupado por variante+almacén
  SELECT COALESCE(jsonb_agg(t.x), '[]'::jsonb) INTO v_stock FROM (
    SELECT jsonb_build_object(
             'product_variant_id', sm.product_variant_id,
             'warehouse_id', sm.warehouse_id,
             'quantity', SUM(ABS(sm.quantity))
           ) AS x
    FROM stock_movements sm
    WHERE sm.reference_type = 'sale' AND sm.reference_id = p_sale_id
    GROUP BY sm.product_variant_id, sm.warehouse_id
  ) t;

  -- Pagos de la venta
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'payment_method', sp.payment_method,
           'amount', sp.amount
         )), '[]'::jsonb)
  INTO v_payments
  FROM sale_payments sp WHERE sp.sale_id = p_sale_id;

  -- Ajuste de caja: un delta por cada método presente en sale_payments
  -- (cash→total_cash_sales, etc.) usando los importes reales de sale_payments
  -- (no sales.payment_method, que puede ser 'mixed').
  SELECT COALESCE(jsonb_agg(t.adj), '[]'::jsonb) INTO v_adjust_items FROM (
    SELECT jsonb_build_object(
             'total_field', CASE sp.payment_method
               WHEN 'cash'     THEN 'total_cash_sales'
               WHEN 'card'     THEN 'total_card_sales'
               WHEN 'bizum'    THEN 'total_bizum_sales'
               WHEN 'transfer' THEN 'total_transfer_sales'
               WHEN 'voucher'  THEN 'total_voucher_sales'
               ELSE 'total_other' END,
             'current_value', CASE sp.payment_method
               WHEN 'cash'     THEN v_session.total_cash_sales
               WHEN 'card'     THEN v_session.total_card_sales
               WHEN 'bizum'    THEN v_session.total_bizum_sales
               WHEN 'transfer' THEN v_session.total_transfer_sales
               WHEN 'voucher'  THEN v_session.total_voucher_sales
               ELSE 0 END,
             'delta', -SUM(sp.amount)
           ) AS adj
    FROM sale_payments sp
    WHERE sp.sale_id = p_sale_id
    GROUP BY sp.payment_method
  ) t;

  -- total_sales baja por el total de la venta
  v_adjust_items := v_adjust_items || jsonb_build_array(jsonb_build_object(
    'total_field', 'total_sales',
    'current_value', v_session.total_sales,
    'delta', -v_sale.total
  ));

  v_cash_adjust := jsonb_build_object(
    'cash_session_id', v_sale.cash_session_id,
    'session_status', v_session.status,
    'adjustments', v_adjust_items
  );
  IF v_session.status = 'closed' THEN
    v_cash_adjust := v_cash_adjust || jsonb_build_object(
      'session_closed', true,
      'expected_cash', v_session.expected_cash,
      'counted_cash', v_session.counted_cash,
      'cash_difference', v_session.cash_difference
    );
  END IF;

  -- Retiradas de la misma sesión (TODAS — el admin elige luego cuáles borrar)
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'id', cw.id,
           'amount', cw.amount,
           'reason', cw.reason,
           'withdrawn_at', cw.withdrawn_at
         ) ORDER BY cw.withdrawn_at DESC), '[]'::jsonb)
  INTO v_withdrawals
  FROM cash_withdrawals cw WHERE cw.cash_session_id = v_sale.cash_session_id;

  -- Asientos a borrar: el de la venta + el de la factura + cualquiera ligado
  -- por reference_type='sale'/reference_id (defensivo).
  SELECT array_agg(DISTINCT s.je_id) INTO v_je_ids FROM (
    SELECT v_sale.journal_entry_id AS je_id WHERE v_sale.journal_entry_id IS NOT NULL
    UNION
    SELECT v_invoice.journal_entry_id WHERE v_invoice.journal_entry_id IS NOT NULL
    UNION
    SELECT je.id FROM journal_entries je
      WHERE je.reference_type = 'sale' AND je.reference_id = p_sale_id
  ) s;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'id', je.id,
           'entry_number', je.entry_number,
           'description', je.description
         )), '[]'::jsonb)
  INTO v_journals
  FROM journal_entries je WHERE je.id = ANY(v_je_ids);

  -- ── Cerrojos (blockers) ──────────────────────────────────────────────────
  SELECT EXISTS(SELECT 1 FROM returns WHERE original_sale_id = p_sale_id) INTO v_has_returns;
  IF v_has_returns OR COALESCE(v_sale.total_returned, 0) > 0 THEN
    v_blockers := array_append(v_blockers, 'Tiene devoluciones. Revierte la devolución antes de eliminar.');
  END IF;

  IF v_invoice.id IS NOT NULL AND v_invoice.verifactu_sent = true THEN
    v_blockers := array_append(v_blockers, 'Factura enviada a Hacienda (Verifactu). No se puede eliminar.');
  END IF;

  SELECT EXISTS(
    SELECT 1 FROM journal_entries je
    WHERE je.id = ANY(v_je_ids) AND je.is_period_closed = true
  ) INTO v_period_closed;
  IF v_period_closed THEN
    v_blockers := array_append(v_blockers, 'El periodo contable está cerrado.');
  END IF;

  IF v_sale.tailoring_order_id IS NOT NULL THEN
    v_blockers := array_append(v_blockers, 'Venta vinculada a un pedido de sastrería. Elimínala manualmente.');
  END IF;

  -- ── Avisos (warnings) ────────────────────────────────────────────────────
  IF v_session.status = 'closed' THEN
    v_warnings := array_append(v_warnings,
      'La caja de esta venta (' || COALESCE(to_char(v_session.closed_at, 'YYYY-MM-DD'), 'sin fecha')
      || ') ya está cerrada. Eliminarla afectará al arqueo de ese día.');
  END IF;

  RETURN jsonb_build_object(
    'sale', jsonb_build_object(
      'id', v_sale.id,
      'ticket_number', v_sale.ticket_number,
      'total', v_sale.total,
      'status', v_sale.status,
      'created_at', v_sale.created_at,
      'sale_type', v_sale.sale_type,
      'tailoring_order_id', v_sale.tailoring_order_id
    ),
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
    'can_delete', (array_length(v_blockers, 1) IS NULL)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.rpc_preview_sale_deletion(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.rpc_preview_sale_deletion(uuid) TO authenticated;
