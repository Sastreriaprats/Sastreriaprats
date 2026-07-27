-- ============================================================
-- Migración 270: restaurar salesperson_id por LÍNEA en las ventas
-- ============================================================
-- CONTEXTO / BUG
--   La definición CANÓNICA de "facturado por empleado" (employee-billing.ts)
--   atribuye por LÍNEA leyendo sale_lines.salesperson_id. La mig 122 lo escribía
--   en el INSERT de sale_lines; la reescritura 245 (rpc_create_sale, ~23-abr-2026)
--   lo ELIMINÓ del INSERT y solo dejó el vendedor en la cabecera (sales). Las 248
--   y 253 heredaron el fallo. Resultado: desde finales de abril, TODAS las líneas
--   nacen con salesperson_id = NULL, así que el Dashboard del vendedor y "Mis
--   ventas" (nivel línea) muestran ~0 €, mientras las comisiones (nivel ticket,
--   sales.salesperson_id) siguen bien. De ahí que solo se vieran las comisiones.
--
-- ARREGLO
--   1) rpc_create_sale: reañadir salesperson_id al INSERT de sale_lines, con el
--      MISMO criterio de la 122 — vendedor de la reserva de esa línea si la hay,
--      si no el vendedor de la venta (cabecera).
--   2) rpc_edit_sale_lines: al reeditar líneas, conservar salesperson_id
--      (= sales.salesperson_id) en vez de dejarlas NULL.
--   3) Backfill: rellenar las líneas históricas con salesperson_id NULL a partir
--      del vendedor de su venta padre (sales.salesperson_id).
-- ============================================================

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
  v_sale_salesperson UUID;          -- 270: vendedor efectivo de la venta (heredado por cada línea)
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

  -- 3d. (270) Vendedor efectivo: reserva > salesperson enviado > cajero. Se usa
  --     en la cabecera Y como fallback por línea, para restaurar la atribución
  --     por línea que la 245 dejó de escribir (informes/panel por empleado).
  v_sale_salesperson := COALESCE(v_reservation_salesperson, NULLIF(p_sale->>'salesperson_id', '')::UUID, p_user_id);

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
    v_sale_salesperson,
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
    cost_price, sort_order, reservation_id, reservation_line_id, tailoring_order_id, salesperson_id
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
    NULLIF(l->>'tailoring_order_id', '')::UUID,
    -- 270: atribución por línea = vendedor de la reserva de esa línea si la hay;
    -- en su defecto, el vendedor de la venta (cabecera).
    COALESCE(
      (SELECT r.employee_id
         FROM product_reservation_lines rl
         JOIN product_reservations r ON r.id = rl.reservation_id
        WHERE rl.id = NULLIF(l->>'reservation_line_id', '')::UUID),
      v_sale_salesperson
    )
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

CREATE OR REPLACE FUNCTION public.rpc_edit_sale_lines(p_sale_id uuid, p_new_lines jsonb, p_new_discount jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
    discount_percentage, discount_amount, tax_rate, line_total, cost_price, sort_order, salesperson_id
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
    COALESCE((l->>'sort_order')::int, 0),
    v_sale.salesperson_id  -- 270: conservar la atribución por línea al reeditar
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
$function$;

-- 3) Backfill de líneas históricas sin atribución.
UPDATE sale_lines sl
   SET salesperson_id = s.salesperson_id
  FROM sales s
 WHERE sl.sale_id = s.id
   AND sl.salesperson_id IS NULL
   AND s.salesperson_id IS NOT NULL;
