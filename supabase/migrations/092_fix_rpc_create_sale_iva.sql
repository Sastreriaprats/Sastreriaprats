-- ============================================================
-- Migration 092: Fix rpc_create_sale - unit_price ES PVP (IVA incluido)
-- No añadir IVA encima. Extraer IVA del PVP para el desglose.
-- ============================================================

DROP FUNCTION IF EXISTS public.rpc_create_sale(JSONB, JSONB, JSONB, UUID);

CREATE OR REPLACE FUNCTION public.rpc_create_sale(
  p_sale    JSONB,
  p_lines   JSONB,
  p_payments JSONB,
  p_user_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ticket_number  TEXT;
  v_sale_id        UUID;
  v_pvp_total      NUMERIC(12,2) := 0;
  v_sale_discount  NUMERIC(12,2);
  v_total          NUMERIC(12,2);
  v_tax_amount     NUMERIC(12,2);
  v_subtotal       NUMERIC(12,2);
  v_total_paid     NUMERIC(12,2) := 0;
  v_payment_status TEXT;
  v_payment_method TEXT;
  v_warehouse_id   UUID;
  v_stock_rec      RECORD;
  v_new_qty        INTEGER;
  v_line           JSONB;
  v_client_name    TEXT := 'Sin cliente';
  v_methods        TEXT[];
  v_now            TIMESTAMPTZ := NOW();
  v_today          DATE := CURRENT_DATE;
  v_next_num       INTEGER;
  v_is_tax_free    BOOLEAN;
BEGIN

  v_is_tax_free := COALESCE((p_sale->>'is_tax_free')::BOOLEAN, FALSE);

  -- 1. Generate ticket number (formato TICK-YYYY-NNNN)
  SELECT COALESCE(
    MAX(
      NULLIF(
        SPLIT_PART(ticket_number, '-', 3), ''
      )::INTEGER
    ),
    0
  ) + 1
  INTO v_next_num
  FROM sales
  WHERE ticket_number LIKE 'TICK-' || EXTRACT(YEAR FROM CURRENT_DATE)::TEXT || '-%';

  v_ticket_number := 'TICK-' || EXTRACT(YEAR FROM CURRENT_DATE)::TEXT || '-' || LPAD(v_next_num::TEXT, 4, '0');

  -- 2. Calculate totals — unit_price ES PVP (IVA incluido)
  SELECT COALESCE(SUM(
    (l->>'unit_price')::NUMERIC * (l->>'quantity')::INTEGER
    - (l->>'unit_price')::NUMERIC * (l->>'quantity')::INTEGER * COALESCE((l->>'discount_percentage')::NUMERIC, 0) / 100
  ), 0)
  INTO v_pvp_total
  FROM jsonb_array_elements(p_lines) l;

  v_sale_discount := v_pvp_total * COALESCE((p_sale->>'discount_percentage')::NUMERIC, 0) / 100;
  v_total         := v_pvp_total - v_sale_discount;

  -- Extraer IVA del PVP (por línea, respetando tax_rate de cada una)
  IF v_is_tax_free THEN
    v_tax_amount := 0;
  ELSE
    SELECT COALESCE(SUM(
      line_pvp * tax_rate / (100 + tax_rate)
    ), 0)
    INTO v_tax_amount
    FROM (
      SELECT
        (l->>'unit_price')::NUMERIC * (l->>'quantity')::INTEGER
        * (1 - COALESCE((l->>'discount_percentage')::NUMERIC, 0) / 100)
        * (1 - COALESCE((p_sale->>'discount_percentage')::NUMERIC, 0) / 100) as line_pvp,
        COALESCE((l->>'tax_rate')::NUMERIC, 21) as tax_rate
      FROM jsonb_array_elements(p_lines) l
    ) sub;
  END IF;

  v_subtotal := v_total - v_tax_amount;

  -- 3. Determine payment method and totals
  SELECT ARRAY_AGG(DISTINCT p->>'payment_method')
  INTO v_methods
  FROM jsonb_array_elements(p_payments) p;

  v_payment_method := CASE
    WHEN array_length(v_methods, 1) = 1 THEN v_methods[1]
    ELSE 'mixed'
  END;

  SELECT COALESCE(SUM((p->>'amount')::NUMERIC), 0)
  INTO v_total_paid
  FROM jsonb_array_elements(p_payments) p;

  v_payment_status := CASE
    WHEN v_total_paid >= v_total THEN 'paid'
    WHEN v_total_paid > 0 THEN 'partial'
    ELSE 'pending'
  END;

  -- 4. INSERT sale
  INSERT INTO sales (
    ticket_number, cash_session_id, store_id, client_id, salesperson_id,
    sale_type, subtotal, discount_amount, discount_percentage, discount_code,
    tax_amount, total,
    payment_method, is_tax_free, status, tailoring_order_id, online_order_id, notes,
    amount_paid, payment_status
  ) VALUES (
    v_ticket_number,
    (p_sale->>'cash_session_id')::UUID,
    (p_sale->>'store_id')::UUID,
    NULLIF(p_sale->>'client_id', '')::UUID,
    COALESCE(NULLIF(p_sale->>'salesperson_id', '')::UUID, p_user_id),
    COALESCE(p_sale->>'sale_type', 'boutique'),
    v_subtotal,
    v_sale_discount,
    COALESCE((p_sale->>'discount_percentage')::NUMERIC, 0),
    p_sale->>'discount_code',
    v_tax_amount,
    v_total,
    v_payment_method::payment_method_type,
    v_is_tax_free,
    'completed',
    NULLIF(p_sale->>'tailoring_order_id', '')::UUID,
    NULLIF(p_sale->>'online_order_id', '')::UUID,
    p_sale->>'notes',
    v_total_paid,
    v_payment_status
  )
  RETURNING id INTO v_sale_id;

  -- 5. INSERT sale_lines — line_total = PVP (sin añadir IVA encima)
  INSERT INTO sale_lines (
    sale_id, product_variant_id, description, sku, quantity,
    unit_price, discount_percentage, discount_amount, tax_rate, line_total,
    cost_price, sort_order
  )
  SELECT
    v_sale_id,
    NULLIF(l->>'product_variant_id', '')::UUID,
    l->>'description',
    l->>'sku',
    (l->>'quantity')::INTEGER,
    (l->>'unit_price')::NUMERIC,
    COALESCE((l->>'discount_percentage')::NUMERIC, 0),
    (l->>'unit_price')::NUMERIC * (l->>'quantity')::INTEGER
      * COALESCE((l->>'discount_percentage')::NUMERIC, 0) / 100,
    COALESCE((l->>'tax_rate')::NUMERIC, 21),
    (l->>'unit_price')::NUMERIC * (l->>'quantity')::INTEGER
      - (l->>'unit_price')::NUMERIC * (l->>'quantity')::INTEGER
        * COALESCE((l->>'discount_percentage')::NUMERIC, 0) / 100,
    (l->>'cost_price')::NUMERIC,
    COALESCE((l->>'sort_order')::INTEGER, 0)
  FROM jsonb_array_elements(p_lines) l;

  -- 6. INSERT sale_payments (bulk)
  INSERT INTO sale_payments (sale_id, payment_method, amount, reference, voucher_id, next_payment_date)
  SELECT
    v_sale_id,
    (p->>'payment_method')::payment_method_type,
    (p->>'amount')::NUMERIC,
    p->>'reference',
    NULLIF(p->>'voucher_id', '')::UUID,
    (p->>'next_payment_date')::DATE
  FROM jsonb_array_elements(p_payments) p;

  -- 7. Update cash session totals (single UPDATE)
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

  -- 8. INSERT manual_transactions (bulk, one per payment)
  INSERT INTO manual_transactions (
    type, date, description, category,
    amount, tax_rate, tax_amount, total,
    notes, created_by, cash_session_id
  )
  SELECT
    'income',
    v_today,
    'Venta TPV - ' || v_ticket_number,
    'tpv',
    (p->>'amount')::NUMERIC / 1.21,
    21,
    (p->>'amount')::NUMERIC - (p->>'amount')::NUMERIC / 1.21,
    (p->>'amount')::NUMERIC,
    'Pedido ' || v_ticket_number || ' - ' || (p->>'payment_method'),
    p_user_id,
    (p_sale->>'cash_session_id')::UUID
  FROM jsonb_array_elements(p_payments) p;

  -- 9. Stock: find warehouse once, then loop lines
  SELECT id INTO v_warehouse_id
  FROM warehouses
  WHERE store_id = (p_sale->>'store_id')::UUID
    AND is_main = TRUE
  LIMIT 1;

  IF v_warehouse_id IS NOT NULL THEN
    FOR v_line IN SELECT * FROM jsonb_array_elements(p_lines)
    LOOP
      IF v_line->>'product_variant_id' IS NOT NULL
         AND v_line->>'product_variant_id' != '' THEN

        SELECT id, quantity
        INTO v_stock_rec
        FROM stock_levels
        WHERE product_variant_id = (v_line->>'product_variant_id')::UUID
          AND warehouse_id = v_warehouse_id;

        IF v_stock_rec.id IS NOT NULL THEN
          v_new_qty := GREATEST(0, v_stock_rec.quantity - (v_line->>'quantity')::INTEGER);

          UPDATE stock_levels
          SET quantity = v_new_qty,
              last_sale_at = v_now,
              last_movement_at = v_now
          WHERE id = v_stock_rec.id;

          INSERT INTO stock_movements (
            product_variant_id, warehouse_id, movement_type, quantity,
            stock_before, stock_after, reference_type, reference_id,
            created_by, store_id
          ) VALUES (
            (v_line->>'product_variant_id')::UUID,
            v_warehouse_id,
            'sale',
            -(v_line->>'quantity')::INTEGER,
            v_stock_rec.quantity,
            v_new_qty,
            'sale',
            v_sale_id,
            p_user_id,
            (p_sale->>'store_id')::UUID
          );
        END IF;
      END IF;
    END LOOP;
  END IF;

  -- 10. Client name for audit description
  IF NULLIF(p_sale->>'client_id', '') IS NOT NULL THEN
    SELECT COALESCE(
      NULLIF(full_name, ''),
      CONCAT_WS(' ', first_name, last_name),
      'Sin nombre'
    )
    INTO v_client_name
    FROM clients
    WHERE id = (p_sale->>'client_id')::UUID;
  END IF;

  -- Return result
  RETURN jsonb_build_object(
    'id',             v_sale_id,
    'ticket_number',  v_ticket_number,
    'store_id',       p_sale->>'store_id',
    'client_id',      p_sale->>'client_id',
    'cash_session_id', p_sale->>'cash_session_id',
    'sale_type',      COALESCE(p_sale->>'sale_type', 'boutique'),
    'subtotal',       v_subtotal,
    'discount_amount', v_sale_discount,
    'discount_percentage', COALESCE((p_sale->>'discount_percentage')::NUMERIC, 0),
    'tax_amount',     v_tax_amount,
    'total',          v_total,
    'payment_method', v_payment_method,
    'status',         'completed',
    'amount_paid',    v_total_paid,
    'payment_status', v_payment_status,
    'client_name',    v_client_name,
    'notes',          p_sale->>'notes'
  );

END;
$$;
