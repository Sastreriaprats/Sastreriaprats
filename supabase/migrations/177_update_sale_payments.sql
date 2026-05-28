-- ============================================================
-- Migración 177 (Fase E2): editar el método de pago de una venta.
--
-- Redistribuye los importes de los sale_payments entre métodos (ej: el
-- vendedor marcó efectivo y fue tarjeta) y reajusta los total_<método>_sales
-- de la caja. El TOTAL de la venta NO cambia -> no toca stock, asiento ni
-- factura. Solo mueve dinero entre los acumuladores de caja por método.
--
-- Limitado a métodos de caja directos: cash, card, bizum, transfer.
-- NO admite 'voucher' (implica consumir/devolver saldo de un vale -> otra
-- mecánica) ni 'mixed' (es la etiqueta de cabecera, no un pago individual).
--
-- Cerrojos: gift_card, sastrería, pago con vale existente, devolución con
-- vale canjeado, factura en Verifactu, periodo contable cerrado.
-- Caja cerrada: se permite (recalcula expected_cash/cash_difference).
-- ============================================================

CREATE OR REPLACE FUNCTION public.rpc_update_sale_payments(
  p_sale_id  uuid,
  p_payments jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sale           RECORD;
  v_invoice        RECORD;
  v_new_total      numeric;
  v_methods        text[];
  v_payment_method text;
  v_old_total      numeric := 0;
  v_old_cash       numeric := 0;
  v_old_card       numeric := 0;
  v_old_bizum      numeric := 0;
  v_old_transfer   numeric := 0;
  v_new_cash       numeric := 0;
  v_new_card       numeric := 0;
  v_new_bizum      numeric := 0;
  v_new_transfer   numeric := 0;
BEGIN
  SELECT * INTO v_sale FROM sales WHERE id = p_sale_id;
  IF v_sale.id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Venta no encontrada');
  END IF;

  -- ── Cerrojos ──────────────────────────────────────────────────────────────
  IF v_sale.sale_type = 'gift_card' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Venta de tarjeta regalo: el método de pago no se edita aquí.');
  END IF;
  IF v_sale.tailoring_order_id IS NOT NULL OR v_sale.sale_type LIKE 'tailoring%' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Venta de sastrería: gestiónala desde el pedido.');
  END IF;
  IF EXISTS (SELECT 1 FROM sale_payments WHERE sale_id = p_sale_id AND payment_method = 'voucher') THEN
    RETURN jsonb_build_object('success', false, 'error', 'La venta se pagó con un vale; el método de pago no se puede editar aquí.');
  END IF;
  IF EXISTS (
    SELECT 1 FROM returns r JOIN vouchers v ON v.id = r.voucher_id
    WHERE r.original_sale_id = p_sale_id
      AND (v.remaining_amount < v.original_amount OR v.status IN ('used','cancelled'))
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', 'La venta tiene una devolución con vale ya usado. Gestiónalo antes de editar los pagos.');
  END IF;

  SELECT * INTO v_invoice FROM invoices WHERE sale_id = p_sale_id LIMIT 1;
  IF v_invoice.id IS NOT NULL AND v_invoice.verifactu_sent = true THEN
    RETURN jsonb_build_object('success', false, 'error', 'Factura enviada a Hacienda (Verifactu). No se pueden editar los pagos.');
  END IF;

  IF EXISTS (
    SELECT 1 FROM journal_entries
    WHERE ((reference_type = 'sale' AND reference_id = p_sale_id)
           OR id = v_sale.journal_entry_id)
      AND is_period_closed = true
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', 'El periodo contable está cerrado.');
  END IF;

  -- ── Validación de los pagos nuevos ────────────────────────────────────────
  IF p_payments IS NULL OR jsonb_array_length(p_payments) = 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'No se han indicado pagos.');
  END IF;
  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(p_payments) p
    WHERE p->>'payment_method' NOT IN ('cash','card','bizum','transfer')
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Método de pago no válido (solo efectivo, tarjeta, bizum o transferencia).');
  END IF;
  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(p_payments) p WHERE (p->>'amount')::numeric <= 0
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Todos los importes deben ser mayores que 0.');
  END IF;

  -- ── Deltas por método (nuevo - viejo) ──────────────────────────────────────
  -- Viejos primero: la validación es contra el importe COBRADO (suma de los
  -- pagos actuales), NO contra sales.total — así una venta parcial puede
  -- corregir el método sin cambiar cuánto se cobró.
  SELECT
    COALESCE(SUM(amount) FILTER (WHERE payment_method = 'cash'), 0),
    COALESCE(SUM(amount) FILTER (WHERE payment_method = 'card'), 0),
    COALESCE(SUM(amount) FILTER (WHERE payment_method = 'bizum'), 0),
    COALESCE(SUM(amount) FILTER (WHERE payment_method = 'transfer'), 0)
  INTO v_old_cash, v_old_card, v_old_bizum, v_old_transfer
  FROM sale_payments WHERE sale_id = p_sale_id;
  v_old_total := v_old_cash + v_old_card + v_old_bizum + v_old_transfer;

  SELECT
    COALESCE(SUM((p->>'amount')::numeric) FILTER (WHERE p->>'payment_method' = 'cash'), 0),
    COALESCE(SUM((p->>'amount')::numeric) FILTER (WHERE p->>'payment_method' = 'card'), 0),
    COALESCE(SUM((p->>'amount')::numeric) FILTER (WHERE p->>'payment_method' = 'bizum'), 0),
    COALESCE(SUM((p->>'amount')::numeric) FILTER (WHERE p->>'payment_method' = 'transfer'), 0)
  INTO v_new_cash, v_new_card, v_new_bizum, v_new_transfer
  FROM jsonb_array_elements(p_payments) p;
  v_new_total := v_new_cash + v_new_card + v_new_bizum + v_new_transfer;

  IF ABS(v_new_total - v_old_total) > 0.01 THEN
    RETURN jsonb_build_object('success', false, 'error',
      'La suma de los pagos (' || trim(to_char(v_new_total, 'FM999990.00'))
      || '€) no coincide con el importe cobrado de la venta (' || trim(to_char(v_old_total, 'FM999990.00')) || '€).');
  END IF;

  -- ── Reemplazar sale_payments ───────────────────────────────────────────────
  DELETE FROM sale_payments WHERE sale_id = p_sale_id;
  INSERT INTO sale_payments (sale_id, payment_method, amount, reference)
  SELECT p_sale_id, (p->>'payment_method')::payment_method_type, (p->>'amount')::numeric, p->>'reference'
  FROM jsonb_array_elements(p_payments) p;

  -- payment_method de cabecera: único método o 'mixed'
  SELECT ARRAY_AGG(DISTINCT p->>'payment_method') INTO v_methods FROM jsonb_array_elements(p_payments) p;
  v_payment_method := CASE WHEN array_length(v_methods, 1) = 1 THEN v_methods[1] ELSE 'mixed' END;
  UPDATE sales SET payment_method = v_payment_method::payment_method_type, updated_at = now()
   WHERE id = p_sale_id;

  -- ── Ajustar caja: total_sales NO cambia (suma igual); solo redistribuye ────
  -- expected_cash/cash_difference solo se recalculan si la sesión está cerrada.
  UPDATE cash_sessions SET
    total_cash_sales     = total_cash_sales     + (v_new_cash - v_old_cash),
    total_card_sales     = total_card_sales     + (v_new_card - v_old_card),
    total_bizum_sales    = total_bizum_sales    + (v_new_bizum - v_old_bizum),
    total_transfer_sales = total_transfer_sales + (v_new_transfer - v_old_transfer),
    expected_cash = CASE WHEN status = 'closed'
      THEN opening_amount + (total_cash_sales + (v_new_cash - v_old_cash))
           - COALESCE(total_returns, 0) - COALESCE(total_withdrawals, 0)
      ELSE expected_cash END,
    cash_difference = CASE WHEN status = 'closed'
      THEN COALESCE(counted_cash, 0)
           - ( opening_amount + (total_cash_sales + (v_new_cash - v_old_cash))
               - COALESCE(total_returns, 0) - COALESCE(total_withdrawals, 0) )
      ELSE cash_difference END,
    updated_at = now()
  WHERE id = v_sale.cash_session_id;

  RETURN jsonb_build_object(
    'success', true,
    'message', 'Métodos de pago actualizados.',
    'payment_method', v_payment_method,
    'cash_delta', (v_new_cash - v_old_cash)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.rpc_update_sale_payments(uuid, jsonb) TO service_role, authenticated;
