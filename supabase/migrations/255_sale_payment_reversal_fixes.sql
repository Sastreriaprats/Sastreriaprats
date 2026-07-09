-- ============================================================
-- Migración 255 — Reversos de cobros de venta: cerrar el agujero del cobro
--                 ORIGINAL (caso TICK-2026-0392) + reparar regresión de la 253
--
-- Caso real (Mónica): venta cerrada con tarjeta 2.598,50; el cobro se borró
-- para re-registrarlo como 2.250 tarjeta + 348,50 efectivo. El borrado NO
-- revirtió nada: rpc_remove_sale_payment solo actúa si el cobro tiene
-- cash_session_id, y los cobros creados por rpc_create_sale lo llevan NULL
-- (403 de 405 en prod). Resultado: espejo "Venta TPV" huérfano y totales de
-- sesión con la venta contada DOS veces. Además, el espejo de creación se
-- vincula por sale_id (mig 209), no por sale_payment_id, y su category es
-- 'tpv' — el fallback por texto de la mig 218 exigía 'boutique' y no lo veía.
--
-- Tres arreglos + una reparación:
--  1. rpc_create_sale (base = 253, diff mínimo):
--     a. sale_payments.cash_session_id = sesión resuelta (los cobros nacen
--        vinculados y los reversos por FK funcionan).
--     b. REPARACIÓN REGRESIÓN: la 253 se reescribió partiendo de la 245 y
--        perdió el cambio de la 248 (sale_lines.tailoring_order_id por línea).
--        Se reincorpora aquí. (1 línea afectada en prod, backfilleada por DML.)
--  2. rpc_remove_sale_payment: si el cobro no tiene sesión, cae a la sesión de
--     la VENTA; el espejo se localiza por FK → (sale_id + importe) → texto, y
--     se borra UNA sola fila (ctid), no todas las del mismo importe.
--  3. rpc_update_sale_payment: mismos fallbacks de sesión y de espejo.
--  4. Backfill: sale_payments.cash_session_id desde la venta para los cobros
--     históricos creados por rpc_create_sale.
-- ============================================================

-- ---------- 1. rpc_create_sale (v253 + payments.cash_session_id + 248 reincorporada) ----------
CREATE OR REPLACE FUNCTION public.rpc_create_sale(p_sale jsonb, p_lines jsonb, p_payments jsonb, p_user_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
  v_res_line       RECORD;
  v_fifo_line      RECORD;
  v_stock_quantity INTEGER;
  v_stock_reserved INTEGER;
  v_available      INTEGER;
  v_res_line_id    UUID;
  v_client_name    TEXT := 'Sin cliente';
  v_methods        TEXT[];
  v_now            TIMESTAMPTZ := NOW();
  v_today          DATE := CURRENT_DATE;
  v_next_num       INTEGER;
  v_is_tax_free    BOOLEAN;
  v_payment        JSONB;
  v_voucher_id     UUID;
  v_voucher_amt    NUMERIC(12,2);
  v_voucher        RECORD;
  v_internal_ref   TEXT;            -- CLP (serie interna)
  v_all_cash       BOOLEAN;         -- CLP
  v_reservation_salesperson UUID;   -- 245: vendedor de la reserva (manda sobre el cajero)
  v_sale_date      DATE := NULLIF(p_sale->>'sale_date', '')::DATE;      -- 253: fecha retro opcional
  v_session_id     UUID := (p_sale->>'cash_session_id')::UUID;          -- 253: sesión resuelta
  v_created_at     TIMESTAMPTZ := NOW();                                -- 253: timestamp de la venta
BEGIN

  -- 0. (253) Fecha de la venta. Sin sale_date (o con la de hoy) todo queda como
  --    siempre. Con fecha pasada: se re-resuelve la sesión de caja de ese día
  --    (patrón mig 135) y se estampa el timestamp N días atrás a la misma hora.
  IF v_sale_date IS NULL OR v_sale_date = CURRENT_DATE THEN
    v_sale_date := CURRENT_DATE;
  ELSIF v_sale_date > CURRENT_DATE THEN
    RAISE EXCEPTION 'La fecha de la venta no puede ser futura (%)', to_char(v_sale_date, 'DD/MM/YYYY');
  ELSE
    v_today      := v_sale_date;
    v_created_at := v_now - make_interval(days => (CURRENT_DATE - v_sale_date));

    v_session_id := NULL;
    SELECT id INTO v_session_id
      FROM cash_sessions
     WHERE store_id = v_store_id
       AND status = 'open'
       AND opened_at::date <= v_sale_date
     ORDER BY opened_at DESC
     LIMIT 1;

    IF v_session_id IS NULL THEN
      SELECT id INTO v_session_id
        FROM cash_sessions
       WHERE store_id = v_store_id
         AND status <> 'open'
         AND opened_at::date <= v_sale_date
         AND (closed_at IS NULL OR closed_at::date >= v_sale_date)
       ORDER BY opened_at DESC
       LIMIT 1;
    END IF;

    IF v_session_id IS NULL THEN
      RAISE EXCEPTION 'No hay ninguna caja del % en esta tienda: la venta no puede asignarse a esa fecha', to_char(v_sale_date, 'DD/MM/YYYY');
    END IF;
  END IF;

  v_is_tax_free := COALESCE((p_sale->>'is_tax_free')::BOOLEAN, FALSE);

  -- 1. Ticket number (253: año de la FECHA DE VENTA, no del reloj)
  SELECT COALESCE(
    MAX(NULLIF(SPLIT_PART(ticket_number, '-', 3), '')::INTEGER),
    0
  ) + 1
  INTO v_next_num
  FROM sales
  WHERE ticket_number LIKE 'TICK-' || EXTRACT(YEAR FROM v_today)::TEXT || '-%';

  v_ticket_number := 'TICK-' || EXTRACT(YEAR FROM v_today)::TEXT || '-' || LPAD(v_next_num::TEXT, 4, '0');

  -- 2. Totales
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

  -- 3. Pagos: detectar método principal y total cobrado
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

  -- 3b. Validar y MARCAR COMO USADO cualquier voucher utilizado.
  --     A partir de la migración 133, el original SIEMPRE queda en 'used'
  --     con remaining_amount = 0. Si quedaba saldo, el JS crea un vale
  --     residual con prev_remaining - amount tras esta llamada.
  --     (253: la caducidad se evalúa a v_today = fecha de la venta.)
  FOR v_payment IN SELECT * FROM jsonb_array_elements(p_payments)
  LOOP
    IF v_payment->>'payment_method' = 'voucher' AND NULLIF(v_payment->>'voucher_id', '') IS NOT NULL THEN
      v_voucher_id  := (v_payment->>'voucher_id')::UUID;
      v_voucher_amt := (v_payment->>'amount')::NUMERIC;

      SELECT id, status, remaining_amount, expiry_date
        INTO v_voucher
        FROM vouchers
       WHERE id = v_voucher_id
       FOR UPDATE;

      IF v_voucher.id IS NULL THEN
        RAISE EXCEPTION 'Vale % no encontrado', v_voucher_id;
      END IF;
      IF v_voucher.status NOT IN ('active', 'partially_used') THEN
        RAISE EXCEPTION 'Vale no disponible (estado: %)', v_voucher.status;
      END IF;
      IF v_voucher.expiry_date < v_today THEN
        RAISE EXCEPTION 'Vale caducado (caducidad: %)', v_voucher.expiry_date;
      END IF;
      IF v_voucher.remaining_amount < v_voucher_amt THEN
        RAISE EXCEPTION 'Saldo insuficiente en vale (saldo: %, importe: %)', v_voucher.remaining_amount, v_voucher_amt;
      END IF;

      -- El vale original siempre queda totalmente consumido. El residual lo crea
      -- el código JS post-RPC con el sobrante (prev_remaining - amount).
      UPDATE vouchers
         SET remaining_amount = 0,
             status = 'used'::voucher_status,
             updated_at = v_now
       WHERE id = v_voucher_id;
    END IF;
  END LOOP;

  -- 3c. (245) Vendedor de la RESERVA más antigua entre las líneas de esta venta.
  --     Resuelve la reserva por reservation_id y, en su defecto, por
  --     reservation_line_id (defensa: el TPV envía ambos, pero por si acaso).
  --     Si no hay línea de reserva, queda NULL → no interfiere (venta directa).
  SELECT r.employee_id
    INTO v_reservation_salesperson
    FROM jsonb_array_elements(p_lines) l
    LEFT JOIN product_reservation_lines rl
      ON rl.id = NULLIF(l->>'reservation_line_id', '')::UUID
    JOIN product_reservations r
      ON r.id = COALESCE(NULLIF(l->>'reservation_id', '')::UUID, rl.reservation_id)
   WHERE r.employee_id IS NOT NULL
   ORDER BY r.created_at ASC
   LIMIT 1;

  -- 4. INSERT sale (253: sesión resuelta + created_at estampado)
  INSERT INTO sales (
    ticket_number, cash_session_id, store_id, client_id, salesperson_id,
    sale_type, subtotal, discount_amount, discount_percentage, discount_code,
    tax_amount, total,
    payment_method, is_tax_free, status, tailoring_order_id, online_order_id, notes,
    amount_paid, payment_status, created_at
  ) VALUES (
    v_ticket_number,
    v_session_id,
    v_store_id,
    v_client_id,
    COALESCE(v_reservation_salesperson, NULLIF(p_sale->>'salesperson_id', '')::UUID, p_user_id),
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
    v_payment_status,
    v_created_at
  )
  RETURNING id INTO v_sale_id;

  -- 5. INSERT sale_lines
  --    (248, reincorporada en 255) tailoring_order_id por línea: si la línea es
  --    un cobro de pedido de sastrería desde el TPV, los informes la excluyen
  --    de boutique sin duplicar sastrería.
  INSERT INTO sale_lines (
    sale_id, product_variant_id, description, sku, quantity,
    unit_price, discount_percentage, discount_amount, tax_rate, line_total,
    cost_price, sort_order, reservation_id, reservation_line_id, tailoring_order_id
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
    NULLIF(l->>'reservation_id', '')::UUID,
    NULLIF(l->>'reservation_line_id', '')::UUID,
    NULLIF(l->>'tailoring_order_id', '')::UUID
  FROM jsonb_array_elements(p_lines) l;

  -- 6. Sale payments (253: created_at estampado; 255: nacen VINCULADOS a la
  --    sesión resuelta para que los reversos por FK funcionen siempre)
  INSERT INTO sale_payments (sale_id, payment_method, amount, reference, voucher_id, next_payment_date, created_at, cash_session_id)
  SELECT
    v_sale_id,
    (p->>'payment_method')::payment_method_type,
    (p->>'amount')::NUMERIC,
    p->>'reference',
    NULLIF(p->>'voucher_id', '')::UUID,
    (p->>'next_payment_date')::DATE,
    v_created_at,
    v_session_id
  FROM jsonb_array_elements(p_payments) p;

  -- 6b. Serie interna CLP (control interno de caja, NO fiscal).
  --     E si el cobro es 100% efectivo; T en cualquier otro caso (incl. mixto).
  --     Solo si hubo cobro (v_total_paid > 0); el helper devuelve NULL si no.
  --     (253: se vincula a la sesión resuelta; la serie/año CLP sigue siendo la
  --     del momento de emisión, coherente con "histórico del cobro emitido".)
  v_all_cash := (array_length(v_methods, 1) = 1 AND v_methods[1] = 'cash');
  v_internal_ref := public.fn_assign_clp_ticket(
    v_all_cash, v_total_paid, 'sale', v_sale_id, v_sale_id, v_store_id,
    v_session_id
  );

  -- 7. Cash sessions totales (253: los suma la sesión de la FECHA de la venta)
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
  WHERE id = v_session_id;

  -- 8. Manual transactions: registramos solo los pagos que mueven dinero "real" hacia caja.
  --    Excluimos voucher porque el ingreso ya se contabilizó al vender la tarjeta.
  --    (253: date = fecha de la venta, sesión resuelta.)
  INSERT INTO manual_transactions (
    type, date, description, category,
    amount, tax_rate, tax_amount, total,
    notes, created_by, cash_session_id,
    sale_id
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
    v_session_id,
    v_sale_id
  FROM jsonb_array_elements(p_payments) p
  WHERE p->>'payment_method' <> 'voucher';

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

      v_variant_id  := (v_line->>'product_variant_id')::UUID;
      v_line_qty    := (v_line->>'quantity')::INTEGER;
      v_res_line_id := NULLIF(v_line->>'reservation_line_id', '')::UUID;

      IF v_res_line_id IS NOT NULL THEN
        SELECT l.id, l.status, l.quantity, l.product_variant_id, l.warehouse_id,
               r.reservation_number, r.store_id
          INTO v_res_line
          FROM product_reservation_lines l
          JOIN product_reservations r ON r.id = l.reservation_id
         WHERE l.id = v_res_line_id
         FOR UPDATE OF l;

        IF v_res_line.id IS NULL THEN
          RAISE EXCEPTION 'Línea de reserva % no encontrada', v_res_line_id;
        END IF;
        IF v_res_line.status <> 'active' THEN
          RAISE EXCEPTION 'La línea de reserva % no está activa (estado: %)', v_res_line.reservation_number, v_res_line.status;
        END IF;
        IF v_res_line.quantity < v_line_qty THEN
          RAISE EXCEPTION 'La línea de reserva % tiene % uds y se intentan recoger %', v_res_line.reservation_number, v_res_line.quantity, v_line_qty;
        END IF;

        SELECT id, quantity, reserved
          INTO v_stock_rec
          FROM stock_levels
         WHERE product_variant_id = v_res_line.product_variant_id
           AND warehouse_id       = v_res_line.warehouse_id
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
            v_res_line.product_variant_id, v_res_line.warehouse_id, 'reservation_release',
            -v_line_qty, v_stock_quantity, GREATEST(0, v_stock_quantity - v_line_qty),
            'sale', v_sale_id,
            'Recogida reserva ' || v_res_line.reservation_number,
            p_user_id, v_store_id
          );
        END IF;

        IF v_line_qty >= v_res_line.quantity THEN
          UPDATE product_reservation_lines
             SET status            = 'fulfilled',
                 fulfilled_at      = v_now,
                 fulfilled_sale_id = v_sale_id,
                 updated_at        = v_now
           WHERE id = v_res_line.id;
        ELSE
          UPDATE product_reservation_lines
             SET quantity   = quantity - v_line_qty,
                 line_total = ROUND(unit_price * (quantity - v_line_qty), 2),
                 updated_at = v_now
           WHERE id = v_res_line.id;
        END IF;

        CONTINUE;
      END IF;

      v_remaining := v_line_qty;

      IF v_client_id IS NOT NULL AND v_remaining > 0 THEN
        FOR v_fifo_line IN
          SELECT l.id AS line_id, l.quantity AS line_qty, r.reservation_number AS r_num
            FROM product_reservation_lines l
            JOIN product_reservations r ON r.id = l.reservation_id
           WHERE r.client_id          = v_client_id
             AND l.product_variant_id = v_variant_id
             AND l.warehouse_id       = v_warehouse_id
             AND l.status             = 'active'
           ORDER BY l.created_at ASC
           FOR UPDATE OF l
        LOOP
          EXIT WHEN v_remaining <= 0;
          v_take := LEAST(v_remaining, v_fifo_line.line_qty);

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
              -v_take, v_stock_quantity, GREATEST(0, v_stock_quantity - v_take),
              'sale', v_sale_id,
              'Cumplida línea reserva ' || v_fifo_line.r_num,
              p_user_id, v_store_id
            );
          END IF;

          IF v_take = v_fifo_line.line_qty THEN
            UPDATE product_reservation_lines
               SET status            = 'fulfilled',
                   fulfilled_at      = v_now,
                   fulfilled_sale_id = v_sale_id,
                   updated_at        = v_now
             WHERE id = v_fifo_line.line_id;
          ELSE
            UPDATE product_reservation_lines
               SET quantity   = quantity - v_take,
                   line_total = ROUND(unit_price * (quantity - v_take), 2),
                   updated_at = v_now
             WHERE id = v_fifo_line.line_id;
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
    'id',                 v_sale_id,
    'ticket_number',      v_ticket_number,
    'internal_ref',       v_internal_ref,
    'store_id',           p_sale->>'store_id',
    'client_id',          p_sale->>'client_id',
    'cash_session_id',    v_session_id,
    'sale_date',          v_today,
    'sale_type',          COALESCE(p_sale->>'sale_type', 'boutique'),
    'subtotal',           v_subtotal,
    'discount_amount',    v_sale_discount,
    'discount_percentage', COALESCE((p_sale->>'discount_percentage')::NUMERIC, 0),
    'tax_amount',         v_tax_amount,
    'total',              v_total,
    'payment_method',     v_payment_method,
    'status',             'completed',
    'amount_paid',        v_total_paid,
    'payment_status',     v_payment_status,
    'client_name',        v_client_name,
    'notes',              p_sale->>'notes'
  );
END;
$function$;

GRANT EXECUTE ON FUNCTION public.rpc_create_sale(JSONB, JSONB, JSONB, UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public.rpc_create_sale(JSONB, JSONB, JSONB, UUID) TO authenticated;


-- ---------- 2. rpc_remove_sale_payment (v218 + fallbacks de sesión y espejo) ----------
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
  v_mt_ctid        tid;
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

  -- 1b. (255) Cobro ORIGINAL creado por rpc_create_sale: hasta la mig 255 esos
  --     cobros nacían con cash_session_id NULL, pero sus importes SÍ se sumaron
  --     a la sesión de la VENTA. Sin este fallback el borrado se saltaba el
  --     reverso entero (caso TICK-2026-0392: espejo huérfano + totales dobles).
  IF v_session_id IS NULL THEN
    SELECT cash_session_id INTO v_session_id FROM sales WHERE id = v_sale_id;
  END IF;

  -- 2. Si hay sesión, revertir totales (abierta o cerrada).
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

    -- 3. (255) Borrar UN espejo, en este orden:
    --    a) por FK sale_payment_id (cobros a plazos, mig 217)
    --    b) espejo de creación de la venta: sale_id + importe (mig 209; los
    --       crea rpc_create_sale con category 'tpv' y sale_payment_id NULL)
    --    c) texto legacy (espejos anteriores a las FKs)
    --    Siempre UNA fila (ctid): dos pagos del mismo importe no se pisan.
    SELECT ctid INTO v_mt_ctid FROM manual_transactions
     WHERE sale_payment_id = p_sale_payment_id
     LIMIT 1;
    IF v_mt_ctid IS NULL THEN
      SELECT ctid INTO v_mt_ctid FROM manual_transactions
       WHERE sale_payment_id IS NULL AND sale_id = v_sale_id
         AND type = 'income' AND total = v_amount
       LIMIT 1;
    END IF;
    IF v_mt_ctid IS NULL THEN
      SELECT ctid INTO v_mt_ctid FROM manual_transactions
       WHERE sale_payment_id IS NULL AND sale_id IS NULL
         AND cash_session_id = v_session_id
         AND type = 'income' AND total = v_amount
         AND (v_ticket IS NOT NULL AND description LIKE '%' || v_ticket || '%')
       LIMIT 1;
    END IF;
    IF v_mt_ctid IS NOT NULL THEN
      DELETE FROM manual_transactions WHERE ctid = v_mt_ctid;
      v_mt_deleted := 1;
    END IF;
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


-- ---------- 3. rpc_update_sale_payment (v218 + mismos fallbacks) ----------
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

  -- 1b. (255) Cobro ORIGINAL sin sesión propia: usar la de la venta (ver
  --     rpc_remove_sale_payment; mismo agujero, mismo fallback).
  IF v_session_id IS NULL THEN
    SELECT cash_session_id INTO v_session_id FROM sales WHERE id = v_sale_id;
  END IF;

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

    -- 3. (255) Espejo IN-PLACE, localizado en este orden: FK → espejo de
    --    creación (sale_id + importe viejo) → texto legacy. El UPDATE puebla
    --    la FK (backfill progresivo).
    SELECT ctid INTO v_mt_ctid FROM manual_transactions
     WHERE sale_payment_id = p_sale_payment_id
     LIMIT 1;
    IF v_mt_ctid IS NULL THEN
      SELECT ctid INTO v_mt_ctid FROM manual_transactions
       WHERE sale_payment_id IS NULL AND sale_id = v_sale_id
         AND type = 'income' AND total = v_old_amount
       LIMIT 1;
    END IF;
    IF v_mt_ctid IS NULL THEN
      SELECT ctid INTO v_mt_ctid FROM manual_transactions
       WHERE sale_payment_id IS NULL AND sale_id IS NULL
         AND cash_session_id = v_session_id
         AND type = 'income' AND total = v_old_amount
         AND (v_ticket IS NOT NULL AND description LIKE '%' || v_ticket || '%')
       LIMIT 1;
    END IF;

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

  -- 4. Actualizar el propio cobro (255: y dejarlo vinculado a la sesión usada).
  UPDATE sale_payments
  SET amount = p_amount, payment_method = p_method::payment_method_type,
      cash_session_id = COALESCE(cash_session_id, v_session_id)
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


-- ---------- 4. Backfill: cobros originales heredan la sesión de su venta ----------
-- Solo los que están a NULL (los cobros a plazos ya traen la suya propia).
UPDATE sale_payments p
   SET cash_session_id = s.cash_session_id
  FROM sales s
 WHERE s.id = p.sale_id
   AND p.cash_session_id IS NULL
   AND s.cash_session_id IS NOT NULL;
