-- ============================================================
-- Migration 073: Unificar categorías de manual_transactions
--
-- Categorías válidas:
--   'boutique'  → ventas TPV de productos (antes 'tpv')
--   'sastreria' → pagos de pedidos a medida (sin cambio)
--   'caja'      → apertura/retirada de caja (sin cambio)
--
-- 1. Migra datos existentes: 'tpv' → 'boutique'
-- 2. Recrea rpc_create_sale con category 'boutique'
-- ============================================================

-- ── 1. Migrar datos existentes ────────────────────────────────
UPDATE manual_transactions
SET category = 'boutique'
WHERE category = 'tpv';

-- ── 2. Recrear rpc_create_sale con category 'boutique' ────────
-- (solo se reemplaza el literal 'tpv' por 'boutique' en el INSERT)

CREATE OR REPLACE FUNCTION public.rpc_create_sale(
  p_sale     JSONB,
  p_lines    JSONB,
  p_payments JSONB,
  p_user_id  UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sale_id       UUID;
  v_ticket_number TEXT;
  v_today         DATE := CURRENT_DATE;
  v_total         NUMERIC(12,2);
  v_warehouse_id  UUID;
  v_line          JSONB;
  v_product_id    UUID;
  v_variant_id    UUID;
  v_stock_item_id UUID;
BEGIN

  -- 1. Generate ticket number
  SELECT 'TICK-' || TO_CHAR(CURRENT_DATE, 'YYYY') || '-' || LPAD(CAST(COALESCE(
    (SELECT MAX(CAST(SPLIT_PART(ticket_number, '-', 3) AS INTEGER))
     FROM sales
     WHERE ticket_number LIKE 'TICK-' || TO_CHAR(CURRENT_DATE, 'YYYY') || '-%'
       AND ticket_number ~ '^TICK-[0-9]{4}-[0-9]+$'), 0) + 1 AS TEXT), 4, '0')
  INTO v_ticket_number;

  v_total := (p_sale->>'total')::NUMERIC;

  -- 2. INSERT sale
  INSERT INTO sales (
    ticket_number, client_id, store_id, cashier_id,
    sale_type, total, subtotal, discount_amount, discount_percentage,
    tax_amount, payment_method, payment_status, amount_paid,
    cash_session_id, is_tax_free, status
  ) VALUES (
    v_ticket_number,
    NULLIF(p_sale->>'client_id', '')::UUID,
    NULLIF(p_sale->>'store_id', '')::UUID,
    NULLIF(p_sale->>'cashier_id', '')::UUID,
    COALESCE(p_sale->>'sale_type', 'boutique'),
    v_total,
    (p_sale->>'subtotal')::NUMERIC,
    COALESCE((p_sale->>'discount_amount')::NUMERIC, 0),
    COALESCE((p_sale->>'discount_percentage')::NUMERIC, 0),
    COALESCE((p_sale->>'tax_amount')::NUMERIC, 0),
    COALESCE(p_sale->>'payment_method', 'cash'),
    CASE WHEN v_total <= 0 THEN 'paid'
         WHEN COALESCE((SELECT SUM((p->>'amount')::NUMERIC) FROM jsonb_array_elements(p_payments) p), 0) >= v_total THEN 'paid'
         ELSE 'partial' END,
    COALESCE((SELECT SUM((p->>'amount')::NUMERIC) FROM jsonb_array_elements(p_payments) p), 0),
    NULLIF(p_sale->>'cash_session_id', '')::UUID,
    COALESCE((p_sale->>'is_tax_free')::BOOLEAN, FALSE),
    'completed'
  )
  RETURNING id INTO v_sale_id;

  -- 3. INSERT sale_lines
  INSERT INTO sale_lines (sale_id, product_id, variant_id, description, quantity, unit_price, discount_percentage, line_total, is_custom)
  SELECT
    v_sale_id,
    NULLIF(l->>'product_id', '')::UUID,
    NULLIF(l->>'variant_id', '')::UUID,
    l->>'description',
    (l->>'quantity')::NUMERIC,
    (l->>'unit_price')::NUMERIC,
    COALESCE((l->>'discount_percentage')::NUMERIC, 0),
    (l->>'line_total')::NUMERIC,
    COALESCE((l->>'is_custom')::BOOLEAN, FALSE)
  FROM jsonb_array_elements(p_lines) l;

  -- 4. INSERT sale_payments
  INSERT INTO sale_payments (sale_id, payment_method, amount, cash_session_id)
  SELECT
    v_sale_id,
    p->>'payment_method',
    (p->>'amount')::NUMERIC,
    NULLIF(p_sale->>'cash_session_id', '')::UUID
  FROM jsonb_array_elements(p_payments) p;

  -- 5. UPDATE client stats
  IF (p_sale->>'client_id') IS NOT NULL AND (p_sale->>'client_id') != '' THEN
    UPDATE clients
    SET
      total_spent    = COALESCE(total_spent, 0) + v_total,
      purchase_count = COALESCE(purchase_count, 0) + 1,
      average_ticket = (COALESCE(total_spent, 0) + v_total) / (COALESCE(purchase_count, 0) + 1),
      last_purchase_date = v_today
    WHERE id = (p_sale->>'client_id')::UUID;
  END IF;

  -- 6. UPDATE cash session totals
  IF (p_sale->>'cash_session_id') IS NOT NULL AND (p_sale->>'cash_session_id') != '' THEN
    UPDATE cash_sessions SET
      total_sales          = COALESCE(total_sales, 0) + v_total,
      total_cash_sales     = COALESCE(total_cash_sales, 0)
        + COALESCE((SELECT SUM((p->>'amount')::NUMERIC) FROM jsonb_array_elements(p_payments) p WHERE p->>'payment_method' = 'cash'), 0),
      total_card_sales     = COALESCE(total_card_sales, 0)
        + COALESCE((SELECT SUM((p->>'amount')::NUMERIC) FROM jsonb_array_elements(p_payments) p WHERE p->>'payment_method' = 'card'), 0),
      total_bizum_sales    = COALESCE(total_bizum_sales, 0)
        + COALESCE((SELECT SUM((p->>'amount')::NUMERIC) FROM jsonb_array_elements(p_payments) p WHERE p->>'payment_method' = 'bizum'), 0),
      total_transfer_sales = COALESCE(total_transfer_sales, 0)
        + COALESCE((SELECT SUM((p->>'amount')::NUMERIC) FROM jsonb_array_elements(p_payments) p WHERE p->>'payment_method' = 'transfer'), 0),
      total_voucher_sales  = COALESCE(total_voucher_sales, 0)
        + COALESCE((SELECT SUM((p->>'amount')::NUMERIC) FROM jsonb_array_elements(p_payments) p WHERE p->>'payment_method' = 'voucher'), 0)
    WHERE id = (p_sale->>'cash_session_id')::UUID;
  END IF;

  -- 7. INSERT manual_transactions (bulk, one per payment)
  INSERT INTO manual_transactions (
    type, date, description, category,
    amount, tax_rate, tax_amount, total,
    notes, created_by, cash_session_id
  )
  SELECT
    'income',
    v_today,
    'Venta TPV - ' || v_ticket_number,
    'boutique',
    (p->>'amount')::NUMERIC / 1.21,
    21,
    (p->>'amount')::NUMERIC - (p->>'amount')::NUMERIC / 1.21,
    (p->>'amount')::NUMERIC,
    'Pedido ' || v_ticket_number || ' - ' || (p->>'payment_method'),
    p_user_id,
    NULLIF(p_sale->>'cash_session_id', '')::UUID
  FROM jsonb_array_elements(p_payments) p;

  -- 8. Stock: find warehouse once, then loop lines
  IF (p_sale->>'store_id') IS NOT NULL AND (p_sale->>'store_id') != '' THEN
    SELECT id INTO v_warehouse_id
    FROM warehouses
    WHERE store_id = (p_sale->>'store_id')::UUID
    LIMIT 1;

    FOR v_line IN SELECT * FROM jsonb_array_elements(p_lines)
    LOOP
      v_product_id := NULLIF(v_line->>'product_id', '')::UUID;
      v_variant_id := NULLIF(v_line->>'variant_id', '')::UUID;
      IF v_product_id IS NULL THEN CONTINUE; END IF;
      IF (v_line->>'is_custom')::BOOLEAN IS TRUE THEN CONTINUE; END IF;

      IF v_variant_id IS NOT NULL THEN
        SELECT id INTO v_stock_item_id
        FROM stock_items
        WHERE warehouse_id = v_warehouse_id AND variant_id = v_variant_id
        LIMIT 1;
      ELSE
        SELECT id INTO v_stock_item_id
        FROM stock_items
        WHERE warehouse_id = v_warehouse_id AND product_id = v_product_id AND variant_id IS NULL
        LIMIT 1;
      END IF;

      IF v_stock_item_id IS NOT NULL THEN
        UPDATE stock_items
        SET quantity = GREATEST(0, quantity - COALESCE((v_line->>'quantity')::NUMERIC, 1))
        WHERE id = v_stock_item_id;
      END IF;
    END LOOP;
  END IF;

  RETURN jsonb_build_object(
    'id',             v_sale_id,
    'ticket_number',  v_ticket_number,
    'total',          v_total
  );

END;
$$;

GRANT EXECUTE ON FUNCTION public.rpc_create_sale(JSONB, JSONB, JSONB, UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public.rpc_create_sale(JSONB, JSONB, JSONB, UUID) TO authenticated;
