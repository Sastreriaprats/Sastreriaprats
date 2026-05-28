-- ============================================================
-- Migración 178 (Fase E3): editar líneas, precio y descuento de una venta.
--
-- Edición IN-PLACE (conserva id/ticket_number/created_at). Reemplaza las
-- sale_lines, recalcula totales (IVA incluido, misma fórmula que rpc_create_sale),
-- reajusta el stock (revierte el viejo, aplica el nuevo) y la caja, y borra el
-- asiento viejo (la server action lo regenera con createSaleJournalEntry).
--
-- DECISIÓN (opción 2 — saldo): los PAGOS no se tocan. Si el nuevo total difiere
-- de lo cobrado, la venta queda parcial/con saldo (payment_status recalculado).
-- Por eso la caja solo ajusta total_sales (lo facturado) por el delta; los
-- total_<método>_sales y expected_cash NO cambian (los pagos no cambian).
--
-- Cerrojos: gift_card, sastrería, devoluciones, CUALQUIER factura (draft o
-- emitida), periodo cerrado. Caja cerrada: se permite (no afecta a expected_cash).
--
-- NOTA: si hay factura, se bloquea (no se regenera automáticamente en esta fase).
-- ============================================================

-- ── PREVIEW (solo lectura) ────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.rpc_preview_sale_edit(
  p_sale_id     uuid,
  p_new_lines   jsonb,
  p_new_discount jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sale         RECORD;
  v_invoice      RECORD;
  v_session      RECORD;
  v_blockers     text[] := '{}';
  v_warnings     text[] := '{}';
  v_auto_actions text[] := '{}';
  v_is_tax_free  boolean;
  v_disc_pct     numeric;
  v_pvp_total    numeric;
  v_sale_disc    numeric;
  v_total        numeric;
  v_tax          numeric;
  v_subtotal     numeric;
  v_old_total    numeric;
  v_paid         numeric;
  v_period_closed boolean := false;
  v_je_ids       uuid[];
BEGIN
  SELECT * INTO v_sale FROM sales WHERE id = p_sale_id;
  IF v_sale.id IS NULL THEN
    RETURN jsonb_build_object('error', 'Venta no encontrada');
  END IF;
  v_old_total := v_sale.total;
  v_is_tax_free := COALESCE(v_sale.is_tax_free, false);
  v_disc_pct := COALESCE((p_new_discount->>'discount_percentage')::numeric, 0);

  SELECT * INTO v_session FROM cash_sessions WHERE id = v_sale.cash_session_id;
  SELECT * INTO v_invoice FROM invoices WHERE sale_id = p_sale_id LIMIT 1;
  SELECT COALESCE(SUM(amount), 0) INTO v_paid FROM sale_payments WHERE sale_id = p_sale_id;

  -- Totales nuevos (IVA incluido, misma fórmula que rpc_create_sale)
  SELECT COALESCE(SUM(
    (l->>'unit_price')::numeric * (l->>'quantity')::int
    * (1 - COALESCE((l->>'discount_percentage')::numeric, 0)/100)
  ), 0) INTO v_pvp_total FROM jsonb_array_elements(p_new_lines) l;
  v_sale_disc := v_pvp_total * v_disc_pct / 100;
  v_total := v_pvp_total - v_sale_disc;
  IF v_is_tax_free THEN
    v_tax := 0;
  ELSE
    SELECT COALESCE(SUM(line_pvp * tax_rate / (100 + tax_rate)), 0) INTO v_tax FROM (
      SELECT (l->>'unit_price')::numeric * (l->>'quantity')::int
             * (1 - COALESCE((l->>'discount_percentage')::numeric,0)/100)
             * (1 - v_disc_pct/100) AS line_pvp,
             COALESCE((l->>'tax_rate')::numeric, 21) AS tax_rate
      FROM jsonb_array_elements(p_new_lines) l
    ) sub;
  END IF;
  v_subtotal := v_total - v_tax;

  -- ── Cerrojos ──────────────────────────────────────────────────────────────
  IF v_sale.sale_type = 'gift_card' THEN
    v_blockers := array_append(v_blockers, 'Venta de tarjeta regalo: no se editan sus líneas.');
  END IF;
  IF v_sale.tailoring_order_id IS NOT NULL OR v_sale.sale_type LIKE 'tailoring%' THEN
    v_blockers := array_append(v_blockers, 'Venta de sastrería: edítala desde el pedido.');
  END IF;
  IF EXISTS (SELECT 1 FROM returns WHERE original_sale_id = p_sale_id) OR COALESCE(v_sale.total_returned,0) > 0 THEN
    v_blockers := array_append(v_blockers, 'Tiene devoluciones. Reviértelas o anula la venta y vuelve a crearla.');
  END IF;
  IF v_invoice.id IS NOT NULL THEN
    IF v_invoice.verifactu_sent = true THEN
      v_blockers := array_append(v_blockers, 'Factura enviada a Hacienda (Verifactu). Anula la venta para emitir una rectificativa.');
    ELSIF v_invoice.status::text <> 'draft' THEN
      v_blockers := array_append(v_blockers, 'La factura está emitida. Anula la venta para emitir una rectificativa.');
    ELSE
      v_blockers := array_append(v_blockers, 'La venta tiene una factura en borrador (' || v_invoice.invoice_number || '). Bórrala antes de editar las líneas.');
    END IF;
  END IF;

  SELECT array_agg(DISTINCT s.je_id) INTO v_je_ids FROM (
    SELECT v_sale.journal_entry_id AS je_id WHERE v_sale.journal_entry_id IS NOT NULL
    UNION SELECT je.id FROM journal_entries je WHERE je.reference_type = 'sale' AND je.reference_id = p_sale_id
  ) s;
  IF v_je_ids IS NOT NULL AND EXISTS (SELECT 1 FROM journal_entries WHERE id = ANY(v_je_ids) AND is_period_closed = true) THEN
    v_blockers := array_append(v_blockers, 'El periodo contable está cerrado.');
    v_period_closed := true;
  END IF;

  -- Validación de líneas
  IF p_new_lines IS NULL OR jsonb_array_length(p_new_lines) = 0 THEN
    v_blockers := array_append(v_blockers, 'La venta debe tener al menos una línea.');
  END IF;

  -- ── Avisos + acciones automáticas ──────────────────────────────────────────
  IF v_session.status = 'closed' THEN
    v_warnings := array_append(v_warnings,
      'La caja de esta venta ya está cerrada. Editarla cambiará el total facturado de ese arqueo.');
  END IF;
  IF ABS(v_total - v_paid) > 0.01 THEN
    v_warnings := array_append(v_warnings,
      'El nuevo total (' || trim(to_char(v_total,'FM999990.00')) || '€) no coincide con lo cobrado ('
      || trim(to_char(v_paid,'FM999990.00')) || '€). La venta quedará '
      || CASE WHEN v_total > v_paid THEN 'con saldo pendiente.' ELSE 'con saldo a favor del cliente.' END);
  END IF;
  v_auto_actions := array_append(v_auto_actions, 'Se reajustará el stock y se regenerará el asiento contable.');

  RETURN jsonb_build_object(
    'sale', jsonb_build_object('id', v_sale.id, 'ticket_number', v_sale.ticket_number,
      'old_total', v_old_total, 'paid', v_paid, 'sale_type', v_sale.sale_type),
    'new_totals', jsonb_build_object('subtotal', round(v_subtotal,2), 'tax_amount', round(v_tax,2), 'total', round(v_total,2)),
    'total_delta', round(v_total - v_old_total, 2),
    'cash_adjustment', jsonb_build_object('session_status', v_session.status, 'total_sales_delta', round(v_total - v_old_total, 2)),
    'new_payment_status', CASE WHEN v_paid >= v_total - 0.01 THEN 'paid' WHEN v_paid > 0 THEN 'partial' ELSE 'pending' END,
    'blockers', to_jsonb(v_blockers),
    'warnings', to_jsonb(v_warnings),
    'auto_actions', to_jsonb(v_auto_actions),
    'can_edit', (array_length(v_blockers,1) IS NULL)
  );
END;
$$;

-- ── EDIT (atómico) ──────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.rpc_edit_sale_lines(
  p_sale_id      uuid,
  p_new_lines    jsonb,
  p_new_discount jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sale        RECORD;
  v_invoice     RECORD;
  v_warehouse   uuid;
  v_is_tax_free boolean;
  v_disc_pct    numeric;
  v_pvp_total   numeric;
  v_sale_disc   numeric;
  v_total       numeric;
  v_tax         numeric;
  v_subtotal    numeric;
  v_old_total   numeric;
  v_paid        numeric;
  v_je_ids      uuid[];
  v_mov         RECORD;
  v_line        jsonb;
  v_variant     uuid;
  v_qty         int;
  v_stock       RECORD;
  v_new_status  text;
BEGIN
  SELECT * INTO v_sale FROM sales WHERE id = p_sale_id;
  IF v_sale.id IS NULL THEN RETURN jsonb_build_object('success', false, 'error', 'Venta no encontrada'); END IF;

  -- ── Cerrojos (revalidación, antes de mutar) ────────────────────────────────
  IF v_sale.sale_type = 'gift_card' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Venta de tarjeta regalo: no se editan sus líneas.');
  END IF;
  IF v_sale.tailoring_order_id IS NOT NULL OR v_sale.sale_type LIKE 'tailoring%' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Venta de sastrería: edítala desde el pedido.');
  END IF;
  IF EXISTS (SELECT 1 FROM returns WHERE original_sale_id = p_sale_id) OR COALESCE(v_sale.total_returned,0) > 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Tiene devoluciones. Reviértelas o anula la venta y vuelve a crearla.');
  END IF;
  SELECT * INTO v_invoice FROM invoices WHERE sale_id = p_sale_id LIMIT 1;
  IF v_invoice.id IS NOT NULL THEN
    IF v_invoice.verifactu_sent = true OR v_invoice.status::text <> 'draft' THEN
      RETURN jsonb_build_object('success', false, 'error', 'La factura está emitida. Anula la venta para emitir una rectificativa.');
    ELSE
      RETURN jsonb_build_object('success', false, 'error', 'La venta tiene una factura en borrador. Bórrala antes de editar las líneas.');
    END IF;
  END IF;
  SELECT array_agg(DISTINCT s.je_id) INTO v_je_ids FROM (
    SELECT v_sale.journal_entry_id AS je_id WHERE v_sale.journal_entry_id IS NOT NULL
    UNION SELECT je.id FROM journal_entries je WHERE je.reference_type = 'sale' AND je.reference_id = p_sale_id
  ) s;
  IF v_je_ids IS NOT NULL AND EXISTS (SELECT 1 FROM journal_entries WHERE id = ANY(v_je_ids) AND is_period_closed = true) THEN
    RETURN jsonb_build_object('success', false, 'error', 'El periodo contable está cerrado.');
  END IF;
  IF p_new_lines IS NULL OR jsonb_array_length(p_new_lines) = 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'La venta debe tener al menos una línea.');
  END IF;

  v_old_total := v_sale.total;
  v_is_tax_free := COALESCE(v_sale.is_tax_free, false);
  v_disc_pct := COALESCE((p_new_discount->>'discount_percentage')::numeric, 0);
  SELECT COALESCE(SUM(amount), 0) INTO v_paid FROM sale_payments WHERE sale_id = p_sale_id;

  -- ── Totales nuevos ──────────────────────────────────────────────────────────
  SELECT COALESCE(SUM(
    (l->>'unit_price')::numeric * (l->>'quantity')::int * (1 - COALESCE((l->>'discount_percentage')::numeric,0)/100)
  ), 0) INTO v_pvp_total FROM jsonb_array_elements(p_new_lines) l;
  v_sale_disc := v_pvp_total * v_disc_pct / 100;
  v_total := v_pvp_total - v_sale_disc;
  IF v_is_tax_free THEN v_tax := 0;
  ELSE
    SELECT COALESCE(SUM(line_pvp * tax_rate / (100 + tax_rate)), 0) INTO v_tax FROM (
      SELECT (l->>'unit_price')::numeric * (l->>'quantity')::int
             * (1 - COALESCE((l->>'discount_percentage')::numeric,0)/100) * (1 - v_disc_pct/100) AS line_pvp,
             COALESCE((l->>'tax_rate')::numeric, 21) AS tax_rate
      FROM jsonb_array_elements(p_new_lines) l
    ) sub;
  END IF;
  v_subtotal := v_total - v_tax;

  -- Almacén principal de la tienda de la venta
  SELECT id INTO v_warehouse FROM warehouses WHERE store_id = v_sale.store_id AND is_main = TRUE LIMIT 1;

  -- ── 1) Revertir el stock viejo (movements 'sale') ──────────────────────────
  FOR v_mov IN
    SELECT product_variant_id, warehouse_id, quantity FROM stock_movements
    WHERE reference_type = 'sale' AND reference_id = p_sale_id
      AND product_variant_id IS NOT NULL AND warehouse_id IS NOT NULL
  LOOP
    UPDATE stock_levels SET quantity = quantity + ABS(v_mov.quantity), last_movement_at = now()
      WHERE product_variant_id = v_mov.product_variant_id AND warehouse_id = v_mov.warehouse_id;
  END LOOP;
  DELETE FROM stock_movements WHERE reference_type = 'sale' AND reference_id = p_sale_id;

  -- ── 2) Reemplazar sale_lines ────────────────────────────────────────────────
  DELETE FROM sale_lines WHERE sale_id = p_sale_id;
  INSERT INTO sale_lines (
    sale_id, product_variant_id, description, sku, quantity, unit_price,
    discount_percentage, discount_amount, tax_rate, line_total, cost_price, sort_order
  )
  SELECT
    p_sale_id,
    NULLIF(l->>'product_variant_id','')::uuid,
    l->>'description',
    l->>'sku',
    (l->>'quantity')::int,
    (l->>'unit_price')::numeric,
    COALESCE((l->>'discount_percentage')::numeric,0),
    (l->>'unit_price')::numeric * (l->>'quantity')::int * COALESCE((l->>'discount_percentage')::numeric,0)/100,
    COALESCE((l->>'tax_rate')::numeric,21),
    (l->>'unit_price')::numeric * (l->>'quantity')::int
      - (l->>'unit_price')::numeric * (l->>'quantity')::int * COALESCE((l->>'discount_percentage')::numeric,0)/100,
    NULLIF(l->>'cost_price','')::numeric,
    COALESCE((l->>'sort_order')::int, 0)
  FROM jsonb_array_elements(p_new_lines) l;

  -- ── 3) Aplicar el stock nuevo (descontar; crear movements 'sale') ──────────
  IF v_warehouse IS NOT NULL THEN
    FOR v_line IN SELECT * FROM jsonb_array_elements(p_new_lines)
    LOOP
      IF NULLIF(v_line->>'product_variant_id','') IS NULL THEN CONTINUE; END IF;
      v_variant := (v_line->>'product_variant_id')::uuid;
      v_qty := (v_line->>'quantity')::int;
      SELECT id, quantity INTO v_stock FROM stock_levels
        WHERE product_variant_id = v_variant AND warehouse_id = v_warehouse FOR UPDATE;
      IF v_stock.id IS NOT NULL THEN
        IF v_stock.quantity < v_qty THEN
          RAISE EXCEPTION 'Stock insuficiente para % (disponible %, requerido %)',
            COALESCE(v_line->>'description', v_variant::text), v_stock.quantity, v_qty;
        END IF;
        UPDATE stock_levels SET quantity = quantity - v_qty, last_sale_at = now(), last_movement_at = now()
          WHERE id = v_stock.id;
        INSERT INTO stock_movements (
          product_variant_id, warehouse_id, movement_type, quantity, stock_before, stock_after,
          reference_type, reference_id, created_by, store_id
        ) VALUES (
          v_variant, v_warehouse, 'sale', -v_qty, v_stock.quantity, v_stock.quantity - v_qty,
          'sale', p_sale_id, v_sale.salesperson_id, v_sale.store_id
        );
      END IF;
    END LOOP;
  END IF;

  -- ── 4) Actualizar la venta (totales + payment_status; pagos NO cambian) ────
  v_new_status := CASE WHEN v_paid >= v_total - 0.01 THEN 'paid' WHEN v_paid > 0 THEN 'partial' ELSE 'pending' END;
  UPDATE sales SET
    subtotal = round(v_subtotal, 2),
    discount_amount = round(v_sale_disc, 2),
    discount_percentage = v_disc_pct,
    discount_code = COALESCE(p_new_discount->>'discount_code', discount_code),
    tax_amount = round(v_tax, 2),
    total = round(v_total, 2),
    payment_status = v_new_status,
    journal_entry_id = NULL,
    updated_at = now()
  WHERE id = p_sale_id;

  -- ── 5) Ajustar caja: solo total_sales (lo facturado) por el delta ──────────
  --     Los pagos no cambian -> total_<método>_sales y expected_cash intactos.
  UPDATE cash_sessions SET
    total_sales = total_sales + (round(v_total,2) - v_old_total),
    updated_at = now()
  WHERE id = v_sale.cash_session_id;

  -- ── 6) Borrar el asiento viejo (la action regenera con createSaleJournalEntry)
  IF v_je_ids IS NOT NULL THEN
    DELETE FROM journal_entry_lines WHERE journal_entry_id = ANY(v_je_ids);
    DELETE FROM journal_entries WHERE id = ANY(v_je_ids);
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'message', 'Venta ' || v_sale.ticket_number || ' actualizada.',
    'new_total', round(v_total,2),
    'old_total', v_old_total,
    'payment_status', v_new_status,
    'regenerate_journal', true
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.rpc_preview_sale_edit(uuid, jsonb, jsonb) TO service_role, authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_edit_sale_lines(uuid, jsonb, jsonb) TO service_role, authenticated;
