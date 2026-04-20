-- ============================================================
-- Migration 110: rpc_create_sale — recogida de reservas
--
-- Extiende la versión 104 para manejar líneas con `reservation_id`:
--   - NO descuenta stock libre (la reserva ya tenía el stock bloqueado)
--   - Actualiza la reserva: decrementa quantity / reserved juntos
--   - Si la reserva queda consumida, la marca como 'fulfilled' con
--     fulfilled_sale_id = v_sale_id
--   - Inserta stock_movement tipo 'reservation_release' apuntando a la venta
--   - NO invoca el auto-fulfill FIFO por cliente (la línea ya apunta
--     explícitamente a una reserva concreta)
--
-- Las líneas sin reservation_id siguen el flujo normal (104).
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
  v_store_id       UUID := (p_sale->>'store_id')::UUID;
  v_client_id      UUID := NULLIF(p_sale->>'client_id', '')::UUID;
  v_stock_rec      RECORD;
  v_new_qty        INTEGER;
  v_line           JSONB;
  v_variant_id     UUID;
  v_line_qty       INTEGER;
  v_remaining      INTEGER;
  v_take           INTEGER;
  v_res            RECORD;
  v_stock_quantity INTEGER;
  v_stock_reserved INTEGER;
  v_available      INTEGER;
  v_reservation_id UUID;
  v_client_name    TEXT := 'Sin cliente';
  v_methods        TEXT[];
  v_now            TIMESTAMPTZ := NOW();
  v_today          DATE := CURRENT_DATE;
  v_next_num       INTEGER;
  v_is_tax_free    BOOLEAN;
BEGIN

  v_is_tax_free := COALESCE((p_sale->>'is_tax_free')::BOOLEAN, FALSE);

  -- 1. Ticket number
  SELECT COALESCE(
    MAX(NULLIF(SPLIT_PART(ticket_number, '-', 3), '')::INTEGER),
    0
  ) + 1
  INTO v_next_num
  FROM sales
  WHERE ticket_number LIKE 'TICK-' || EXTRACT(YEAR FROM CURRENT_DATE)::TEXT || '-%';

  v_ticket_number := 'TICK-' || EXTRACT(YEAR FROM CURRENT_DATE)::TEXT || '-' || LPAD(v_next_num::TEXT, 4, '0');

  -- 2. Totales (unit_price = PVP con IVA)
  SELECT COALESCE(SUM(
    (l->>'unit_price')::NUMERIC * (l->>'quantity')::INTEGER
    - (l->>'unit_price')::NUMERIC * (l->>'quantity')::INTEGER * COALESCE((l->>'discount_percentage')::NUMERIC, 0) / 100
  ), 0)
  INTO v_pvp_total
  FROM jsonb_array_elements(p_lines) l;

  v_sale_discount := v_pvp_total * COALESCE((p_sale->>'discount_percentage')::NUMERIC, 0) / 100;
  v_total         := v_pvp_total - v_sale_discount;

  IF v_is_tax_free THEN
    v_tax_amount := 0;
  ELSE
    SELECT COALESCE(SUM(line_pvp * tax_rate / (100 + tax_rate)), 0)
    INTO v_tax_amount
    FROM (
      SELECT
        (l->>'unit_price')::NUMERIC * (l->>'quantity')::INTEGER
        * (1 - COALESCE((l->>'discount_percentage')::NUMERIC, 0) / 100)
        * (1 - COALESCE((p_sale->>'discount_percentage')::NUMERIC, 0) / 100) AS line_pvp,
        COALESCE((l->>'tax_rate')::NUMERIC, 21) AS tax_rate
      FROM jsonb_array_elements(p_lines) l
    ) sub;
  END IF;

  v_subtotal := v_total - v_tax_amount;

  -- 3. Pagos
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
    v_store_id,
    v_client_id,
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

  -- 5. INSERT sale_lines (con reservation_id si viene)
  INSERT INTO sale_lines (
    sale_id, product_variant_id, description, sku, quantity,
    unit_price, discount_percentage, discount_amount, tax_rate, line_total,
    cost_price, sort_order, reservation_id
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
    COALESCE((l->>'sort_order')::INTEGER, 0),
    NULLIF(l->>'reservation_id', '')::UUID
  FROM jsonb_array_elements(p_lines) l;

  -- 6. Sale payments
  INSERT INTO sale_payments (sale_id, payment_method, amount, reference, voucher_id, next_payment_date)
  SELECT
    v_sale_id,
    (p->>'payment_method')::payment_method_type,
    (p->>'amount')::NUMERIC,
    p->>'reference',
    NULLIF(p->>'voucher_id', '')::UUID,
    (p->>'next_payment_date')::DATE
  FROM jsonb_array_elements(p_payments) p;

  -- 7. Cash sessions totales
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

  -- 8. Manual transactions (contabilidad)
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

  -- 9. Stock y reservas
  SELECT id INTO v_warehouse_id
  FROM warehouses
  WHERE store_id = v_store_id
    AND is_main = TRUE
  LIMIT 1;

  IF v_warehouse_id IS NOT NULL THEN
    FOR v_line IN SELECT * FROM jsonb_array_elements(p_lines)
    LOOP
      IF v_line->>'product_variant_id' IS NULL OR v_line->>'product_variant_id' = '' THEN
        CONTINUE;
      END IF;

      v_variant_id     := (v_line->>'product_variant_id')::UUID;
      v_line_qty       := (v_line->>'quantity')::INTEGER;
      v_reservation_id := NULLIF(v_line->>'reservation_id', '')::UUID;

      -- 9.A — Línea vinculada a una reserva concreta (recogida)
      IF v_reservation_id IS NOT NULL THEN
        SELECT id, status, quantity, product_variant_id, warehouse_id, reservation_number, store_id
          INTO v_res
          FROM product_reservations
         WHERE id = v_reservation_id
         FOR UPDATE;

        IF v_res.id IS NULL THEN
          RAISE EXCEPTION 'Reserva % no encontrada', v_reservation_id;
        END IF;
        IF v_res.status <> 'active' THEN
          RAISE EXCEPTION 'La reserva % no está activa (estado: %)', v_res.reservation_number, v_res.status;
        END IF;
        IF v_res.quantity < v_line_qty THEN
          RAISE EXCEPTION 'La reserva % tiene % uds y la línea intenta recoger %', v_res.reservation_number, v_res.quantity, v_line_qty;
        END IF;

        -- Bloquear y ajustar stock_levels (quantity y reserved juntos)
        SELECT id, quantity, reserved
          INTO v_stock_rec
          FROM stock_levels
         WHERE product_variant_id = v_res.product_variant_id
           AND warehouse_id       = v_res.warehouse_id
         FOR UPDATE;

        IF v_stock_rec.id IS NOT NULL THEN
          v_stock_quantity := v_stock_rec.quantity;
          v_stock_reserved := v_stock_rec.reserved;

          UPDATE stock_levels
             SET quantity         = GREATEST(0, v_stock_quantity - v_line_qty),
                 reserved         = GREATEST(0, v_stock_reserved - v_line_qty),
                 last_sale_at     = v_now,
                 last_movement_at = v_now,
                 updated_at       = v_now
           WHERE id = v_stock_rec.id;

          INSERT INTO stock_movements (
            product_variant_id, warehouse_id, movement_type, quantity,
            stock_before, stock_after, reference_type, reference_id,
            reason, created_by, store_id
          ) VALUES (
            v_res.product_variant_id, v_res.warehouse_id, 'reservation_release',
            -v_line_qty,
            v_stock_quantity, GREATEST(0, v_stock_quantity - v_line_qty),
            'sale', v_sale_id,
            'Recogida reserva ' || v_res.reservation_number,
            p_user_id, v_store_id
          );
        END IF;

        -- Actualizar la reserva
        IF v_line_qty >= v_res.quantity THEN
          -- Recogida total: marcar como fulfilled
          UPDATE product_reservations
             SET status            = 'fulfilled',
                 fulfilled_at      = v_now,
                 fulfilled_sale_id = v_sale_id,
                 updated_at        = v_now
           WHERE id = v_res.id;
        ELSE
          -- Recogida parcial: restar cantidades (caso poco frecuente)
          UPDATE product_reservations
             SET quantity   = quantity - v_line_qty,
                 updated_at = v_now
           WHERE id = v_res.id;
        END IF;

        CONTINUE; -- siguiente línea
      END IF;

      -- 9.B — Línea normal (flujo original 104): auto-fulfill FIFO por cliente
      v_remaining := v_line_qty;

      IF v_client_id IS NOT NULL AND v_remaining > 0 THEN
        FOR v_res IN
          SELECT id, reservation_number, quantity, store_id
            FROM product_reservations
           WHERE client_id          = v_client_id
             AND product_variant_id = v_variant_id
             AND warehouse_id       = v_warehouse_id
             AND status             = 'active'
           ORDER BY created_at ASC
           FOR UPDATE
        LOOP
          EXIT WHEN v_remaining <= 0;
          v_take := LEAST(v_remaining, v_res.quantity);

          SELECT id, quantity, reserved
            INTO v_stock_rec
            FROM stock_levels
           WHERE product_variant_id = v_variant_id
             AND warehouse_id       = v_warehouse_id
           FOR UPDATE;

          IF v_stock_rec.id IS NOT NULL THEN
            v_stock_quantity := v_stock_rec.quantity;
            v_stock_reserved := v_stock_rec.reserved;

            UPDATE stock_levels
               SET quantity         = GREATEST(0, v_stock_quantity - v_take),
                   reserved         = GREATEST(0, v_stock_reserved - v_take),
                   last_sale_at     = v_now,
                   last_movement_at = v_now,
                   updated_at       = v_now
             WHERE id = v_stock_rec.id;

            INSERT INTO stock_movements (
              product_variant_id, warehouse_id, movement_type, quantity,
              stock_before, stock_after, reference_type, reference_id,
              reason, created_by, store_id
            ) VALUES (
              v_variant_id, v_warehouse_id, 'reservation_release',
              -v_take,
              v_stock_quantity, GREATEST(0, v_stock_quantity - v_take),
              'sale', v_sale_id,
              'Cumplida reserva ' || v_res.reservation_number,
              p_user_id, v_store_id
            );
          END IF;

          IF v_take = v_res.quantity THEN
            UPDATE product_reservations
               SET status            = 'fulfilled',
                   fulfilled_at      = v_now,
                   fulfilled_sale_id = v_sale_id,
                   updated_at        = v_now
             WHERE id = v_res.id;
          ELSE
            UPDATE product_reservations
               SET quantity   = quantity - v_take,
                   updated_at = v_now
             WHERE id = v_res.id;
          END IF;

          v_remaining := v_remaining - v_take;
        END LOOP;
      END IF;

      IF v_remaining > 0 THEN
        SELECT id, quantity, reserved
          INTO v_stock_rec
          FROM stock_levels
         WHERE product_variant_id = v_variant_id
           AND warehouse_id       = v_warehouse_id
         FOR UPDATE;

        IF v_stock_rec.id IS NOT NULL THEN
          v_stock_quantity := v_stock_rec.quantity;
          v_stock_reserved := v_stock_rec.reserved;
          v_available      := v_stock_quantity - v_stock_reserved;

          IF v_available < v_remaining THEN
            RAISE EXCEPTION 'Stock insuficiente (reservado para otros clientes). Producto: %',
              COALESCE(v_line->>'description', v_variant_id::TEXT);
          END IF;

          v_new_qty := GREATEST(0, v_stock_quantity - v_remaining);
          UPDATE stock_levels
             SET quantity         = v_new_qty,
                 last_sale_at     = v_now,
                 last_movement_at = v_now,
                 updated_at       = v_now
           WHERE id = v_stock_rec.id;

          INSERT INTO stock_movements (
            product_variant_id, warehouse_id, movement_type, quantity,
            stock_before, stock_after, reference_type, reference_id,
            created_by, store_id
          ) VALUES (
            v_variant_id, v_warehouse_id, 'sale',
            -v_remaining,
            v_stock_quantity, v_new_qty,
            'sale', v_sale_id,
            p_user_id, v_store_id
          );
        END IF;
      END IF;
    END LOOP;
  END IF;

  -- 10. Client name
  IF v_client_id IS NOT NULL THEN
    SELECT COALESCE(NULLIF(full_name, ''), CONCAT_WS(' ', first_name, last_name), 'Sin nombre')
      INTO v_client_name
      FROM clients
     WHERE id = v_client_id;
  END IF;

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

GRANT EXECUTE ON FUNCTION public.rpc_create_sale(JSONB, JSONB, JSONB, UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public.rpc_create_sale(JSONB, JSONB, JSONB, UUID) TO authenticated;
