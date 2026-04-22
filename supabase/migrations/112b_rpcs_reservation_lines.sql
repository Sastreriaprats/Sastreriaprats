-- ==========================================
-- SASTRERÍA PRATS — Migración 112
-- RPCs adaptados a reservas multi-línea
-- ==========================================
-- Reescribe los RPCs de la cadena 107/102/103/105/110 para que trabajen
-- sobre product_reservation_lines en lugar de sobre la cabecera.
--
-- Cambios:
--   - rpc_create_reservation: acepta p_reservation.lines[]
--   - rpc_cancel_reservation: cancela todas las líneas no cumplidas
--   - rpc_cancel_reservation_line: nuevo, cancela una línea
--   - rpc_fulfill_reservation_line: renombrado de rpc_fulfill_reservation, por línea
--   - rpc_create_sale: acepta reservation_line_id en cada línea de venta
--   - fn_activate_pending_reservations: itera líneas pending

-- ─────────────────────────────────────────────────────────────
-- 1. rpc_create_reservation (multi-línea)
-- ─────────────────────────────────────────────────────────────
DROP FUNCTION IF EXISTS public.rpc_create_reservation(JSONB, UUID);

CREATE OR REPLACE FUNCTION public.rpc_create_reservation(
  p_reservation JSONB,
  p_user_id     UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id               UUID;
  v_num              TEXT;
  v_client_id        UUID          := (p_reservation->>'client_id')::UUID;
  v_store_id         UUID          := NULLIF(p_reservation->>'store_id', '')::UUID;
  v_cash_session_id  UUID          := NULLIF(p_reservation->>'cash_session_id', '')::UUID;
  v_lines            JSONB         := p_reservation->'lines';
  v_line             JSONB;
  v_line_id          UUID;
  v_variant_id       UUID;
  v_warehouse_id     UUID;
  v_qty              INTEGER;
  v_unit_price       NUMERIC(10,2);
  v_line_total       NUMERIC(12,2);
  v_total            NUMERIC(12,2) := 0;
  v_stock_id         UUID;
  v_stock_quantity   INTEGER;
  v_stock_reserved   INTEGER;
  v_available        INTEGER;
  v_line_status      reservation_status;
  v_any_active       BOOLEAN := FALSE;
  v_any_pending      BOOLEAN := FALSE;
  v_header_status    reservation_status;
  v_sort             INTEGER := 0;
  v_lines_result     JSONB   := '[]'::JSONB;
  v_payment          JSONB   := p_reservation->'initial_payment';
  v_pay_method       TEXT;
  v_pay_amount       NUMERIC(10,2);
  v_pay_id           UUID;
  v_payment_status   TEXT    := 'pending';
  v_base_amount      NUMERIC(12,2);
  v_tax_amount       NUMERIC(12,2);
BEGIN
  IF v_client_id IS NULL THEN
    RAISE EXCEPTION 'Falta el cliente';
  END IF;
  IF v_lines IS NULL OR jsonb_typeof(v_lines) <> 'array' OR jsonb_array_length(v_lines) = 0 THEN
    RAISE EXCEPTION 'La reserva debe tener al menos una línea';
  END IF;

  v_num := generate_reservation_number();

  -- Cabecera (product_variant_id/warehouse_id/quantity quedan NULL — legacy)
  INSERT INTO product_reservations (
    reservation_number, client_id, store_id,
    quantity, unit_price, total, total_paid, payment_status,
    status, notes, reason, expires_at, created_by
  ) VALUES (
    v_num, v_client_id, v_store_id,
    NULL, NULL, 0, 0, 'pending',
    'active',
    NULLIF(p_reservation->>'notes', ''),
    NULLIF(p_reservation->>'reason', ''),
    NULLIF(p_reservation->>'expires_at', '')::TIMESTAMPTZ,
    p_user_id
  )
  RETURNING id INTO v_id;

  -- Procesar líneas
  FOR v_line IN SELECT * FROM jsonb_array_elements(v_lines)
  LOOP
    v_variant_id   := (v_line->>'product_variant_id')::UUID;
    v_warehouse_id := (v_line->>'warehouse_id')::UUID;
    v_qty          := (v_line->>'quantity')::INTEGER;
    v_unit_price   := COALESCE((v_line->>'unit_price')::NUMERIC(10,2), 0);

    IF v_variant_id IS NULL OR v_warehouse_id IS NULL THEN
      RAISE EXCEPTION 'Falta variante o almacén en una línea';
    END IF;
    IF v_qty IS NULL OR v_qty <= 0 THEN
      RAISE EXCEPTION 'Cantidad inválida en una línea';
    END IF;
    IF v_unit_price < 0 THEN
      RAISE EXCEPTION 'Precio negativo en una línea';
    END IF;

    v_line_total := ROUND(v_unit_price * v_qty, 2);
    v_total      := v_total + v_line_total;

    -- Bloqueo de stock
    SELECT id, quantity, reserved
      INTO v_stock_id, v_stock_quantity, v_stock_reserved
      FROM stock_levels
     WHERE product_variant_id = v_variant_id
       AND warehouse_id       = v_warehouse_id
     FOR UPDATE;

    IF v_stock_id IS NULL THEN
      v_line_status := 'pending_stock';
    ELSE
      v_available := v_stock_quantity - v_stock_reserved;
      IF v_available >= v_qty THEN
        v_line_status := 'active';
        UPDATE stock_levels
           SET reserved         = reserved + v_qty,
               last_movement_at = NOW(),
               updated_at       = NOW()
         WHERE id = v_stock_id;
      ELSE
        v_line_status := 'pending_stock';
      END IF;
    END IF;

    IF v_line_status = 'active'       THEN v_any_active  := TRUE; END IF;
    IF v_line_status = 'pending_stock' THEN v_any_pending := TRUE; END IF;

    INSERT INTO product_reservation_lines (
      reservation_id, product_variant_id, warehouse_id, quantity,
      unit_price, line_total, status, stock_reserved_at, sort_order
    ) VALUES (
      v_id, v_variant_id, v_warehouse_id, v_qty,
      v_unit_price, v_line_total, v_line_status,
      CASE WHEN v_line_status = 'active' THEN NOW() ELSE NULL END,
      v_sort
    )
    RETURNING id INTO v_line_id;

    IF v_line_status = 'active' AND v_stock_id IS NOT NULL THEN
      INSERT INTO stock_movements (
        product_variant_id, warehouse_id, movement_type, quantity,
        stock_before, stock_after, reference_type, reference_id,
        reason, created_by, store_id
      ) VALUES (
        v_variant_id, v_warehouse_id, 'reservation', v_qty,
        v_stock_quantity, v_stock_quantity,
        'product_reservation_line', v_line_id,
        'Reserva ' || v_num,
        p_user_id, v_store_id
      );
    END IF;

    v_lines_result := v_lines_result || jsonb_build_object(
      'id',                 v_line_id,
      'product_variant_id', v_variant_id,
      'warehouse_id',       v_warehouse_id,
      'quantity',           v_qty,
      'unit_price',         v_unit_price,
      'line_total',         v_line_total,
      'status',             v_line_status
    );

    v_sort := v_sort + 1;
  END LOOP;

  -- Status cabecera (el trigger ya lo recalcula, pero forzamos el total)
  IF v_any_active THEN
    v_header_status := 'active';
  ELSIF v_any_pending THEN
    v_header_status := 'pending_stock';
  ELSE
    v_header_status := 'active';
  END IF;

  -- Pago inicial opcional (sobre el total de la cabecera)
  IF v_payment IS NOT NULL AND jsonb_typeof(v_payment) = 'object' THEN
    v_pay_method := NULLIF(v_payment->>'method', '');
    v_pay_amount := COALESCE((v_payment->>'amount')::NUMERIC(10,2), 0);

    IF v_pay_method IS NOT NULL AND v_pay_amount > 0 THEN
      IF v_pay_amount > v_total THEN
        RAISE EXCEPTION 'El pago inicial (%) excede el total de la reserva (%)', v_pay_amount, v_total;
      END IF;

      IF v_cash_session_id IS NULL AND v_store_id IS NOT NULL THEN
        SELECT id INTO v_cash_session_id
          FROM cash_sessions
         WHERE status = 'open' AND store_id = v_store_id
         LIMIT 1;
      END IF;

      INSERT INTO product_reservation_payments (
        product_reservation_id, payment_date, payment_method, amount,
        reference, notes, cash_session_id, created_by
      ) VALUES (
        v_id, CURRENT_DATE, v_pay_method, v_pay_amount,
        NULLIF(v_payment->>'reference', ''),
        NULLIF(v_payment->>'notes', ''),
        v_cash_session_id,
        p_user_id
      )
      RETURNING id INTO v_pay_id;

      IF v_pay_amount >= v_total THEN v_payment_status := 'paid';
      ELSE v_payment_status := 'partial';
      END IF;

      UPDATE product_reservations
         SET total_paid     = v_pay_amount,
             payment_status = v_payment_status,
             updated_at     = NOW()
       WHERE id = v_id;

      v_base_amount := ROUND(v_pay_amount / 1.21, 2);
      v_tax_amount  := v_pay_amount - v_base_amount;
      INSERT INTO manual_transactions (
        type, date, description, category,
        amount, tax_rate, tax_amount, total,
        notes, created_by, cash_session_id
      ) VALUES (
        'income', CURRENT_DATE,
        'Pago reserva - ' || v_num,
        'reservas',
        v_base_amount, 21, v_tax_amount, v_pay_amount,
        'Reserva ' || v_num || ' - ' || v_pay_method,
        p_user_id, v_cash_session_id
      );

      IF v_cash_session_id IS NOT NULL THEN
        UPDATE cash_sessions
           SET total_sales          = COALESCE(total_sales, 0)          + v_pay_amount,
               total_cash_sales     = COALESCE(total_cash_sales, 0)
                                     + (CASE WHEN v_pay_method = 'cash'     THEN v_pay_amount ELSE 0 END),
               total_card_sales     = COALESCE(total_card_sales, 0)
                                     + (CASE WHEN v_pay_method = 'card'     THEN v_pay_amount ELSE 0 END),
               total_bizum_sales    = COALESCE(total_bizum_sales, 0)
                                     + (CASE WHEN v_pay_method = 'bizum'    THEN v_pay_amount ELSE 0 END),
               total_transfer_sales = COALESCE(total_transfer_sales, 0)
                                     + (CASE WHEN v_pay_method = 'transfer' THEN v_pay_amount ELSE 0 END),
               total_voucher_sales  = COALESCE(total_voucher_sales, 0)
                                     + (CASE WHEN v_pay_method = 'voucher'  THEN v_pay_amount ELSE 0 END)
         WHERE id = v_cash_session_id;
      END IF;
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'id',                 v_id,
    'reservation_number', v_num,
    'status',             v_header_status,
    'had_stock',          v_any_active AND NOT v_any_pending,
    'total',              v_total,
    'total_paid',         CASE WHEN v_pay_id IS NOT NULL THEN v_pay_amount ELSE 0 END,
    'payment_status',     v_payment_status,
    'payment_id',         v_pay_id,
    'lines',              v_lines_result
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.rpc_create_reservation(JSONB, UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public.rpc_create_reservation(JSONB, UUID) TO authenticated;

-- ─────────────────────────────────────────────────────────────
-- 2. rpc_cancel_reservation (cabecera — cancela todas las líneas no cumplidas)
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.rpc_cancel_reservation(
  p_reservation_id UUID,
  p_reason         TEXT,
  p_user_id        UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_header   RECORD;
  v_line     RECORD;
  v_stock_id UUID;
  v_stock_q  INTEGER;
  v_stock_r  INTEGER;
BEGIN
  SELECT id, reservation_number, store_id, status
    INTO v_header
    FROM product_reservations
   WHERE id = p_reservation_id
   FOR UPDATE;

  IF v_header.id IS NULL THEN
    RAISE EXCEPTION 'Reserva no encontrada';
  END IF;

  FOR v_line IN
    SELECT id, product_variant_id, warehouse_id, quantity, status
      FROM product_reservation_lines
     WHERE reservation_id = p_reservation_id
       AND status IN ('active', 'pending_stock')
     FOR UPDATE
  LOOP
    IF v_line.status = 'active' THEN
      SELECT id, quantity, reserved
        INTO v_stock_id, v_stock_q, v_stock_r
        FROM stock_levels
       WHERE product_variant_id = v_line.product_variant_id
         AND warehouse_id       = v_line.warehouse_id
       FOR UPDATE;

      IF v_stock_id IS NOT NULL THEN
        UPDATE stock_levels
           SET reserved         = GREATEST(0, v_stock_r - v_line.quantity),
               last_movement_at = NOW(),
               updated_at       = NOW()
         WHERE id = v_stock_id;

        INSERT INTO stock_movements (
          product_variant_id, warehouse_id, movement_type, quantity,
          stock_before, stock_after, reference_type, reference_id,
          reason, created_by, store_id
        ) VALUES (
          v_line.product_variant_id, v_line.warehouse_id, 'reservation_release',
          v_line.quantity, v_stock_q, v_stock_q,
          'product_reservation_line', v_line.id,
          'Cancelación reserva ' || v_header.reservation_number,
          p_user_id, v_header.store_id
        );
      END IF;
    END IF;

    UPDATE product_reservation_lines
       SET status           = 'cancelled',
           cancelled_at     = NOW(),
           cancelled_reason = NULLIF(p_reason, ''),
           updated_at       = NOW()
     WHERE id = v_line.id;
  END LOOP;

  UPDATE product_reservations
     SET cancelled_at     = NOW(),
         cancelled_reason = NULLIF(p_reason, ''),
         updated_at       = NOW()
   WHERE id = p_reservation_id;

  RETURN jsonb_build_object('id', p_reservation_id, 'status', 'cancelled');
END;
$$;

GRANT EXECUTE ON FUNCTION public.rpc_cancel_reservation(UUID, TEXT, UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public.rpc_cancel_reservation(UUID, TEXT, UUID) TO authenticated;

-- ─────────────────────────────────────────────────────────────
-- 3. rpc_cancel_reservation_line (nuevo — cancela UNA línea)
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.rpc_cancel_reservation_line(
  p_line_id UUID,
  p_reason  TEXT,
  p_user_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_line     RECORD;
  v_num      TEXT;
  v_store_id UUID;
  v_stock_id UUID;
  v_stock_q  INTEGER;
  v_stock_r  INTEGER;
BEGIN
  SELECT l.id, l.reservation_id, l.product_variant_id, l.warehouse_id, l.quantity, l.status,
         r.reservation_number, r.store_id
    INTO v_line
    FROM product_reservation_lines l
    JOIN product_reservations r ON r.id = l.reservation_id
   WHERE l.id = p_line_id
   FOR UPDATE OF l;

  IF v_line.id IS NULL THEN
    RAISE EXCEPTION 'Línea de reserva no encontrada';
  END IF;
  IF v_line.status NOT IN ('active', 'pending_stock') THEN
    RAISE EXCEPTION 'No se puede cancelar una línea en estado %', v_line.status;
  END IF;

  v_num      := v_line.reservation_number;
  v_store_id := v_line.store_id;

  IF v_line.status = 'active' THEN
    SELECT id, quantity, reserved
      INTO v_stock_id, v_stock_q, v_stock_r
      FROM stock_levels
     WHERE product_variant_id = v_line.product_variant_id
       AND warehouse_id       = v_line.warehouse_id
     FOR UPDATE;

    IF v_stock_id IS NOT NULL THEN
      UPDATE stock_levels
         SET reserved         = GREATEST(0, v_stock_r - v_line.quantity),
             last_movement_at = NOW(),
             updated_at       = NOW()
       WHERE id = v_stock_id;

      INSERT INTO stock_movements (
        product_variant_id, warehouse_id, movement_type, quantity,
        stock_before, stock_after, reference_type, reference_id,
        reason, created_by, store_id
      ) VALUES (
        v_line.product_variant_id, v_line.warehouse_id, 'reservation_release',
        v_line.quantity, v_stock_q, v_stock_q,
        'product_reservation_line', v_line.id,
        'Cancelación línea reserva ' || v_num,
        p_user_id, v_store_id
      );
    END IF;
  END IF;

  UPDATE product_reservation_lines
     SET status           = 'cancelled',
         cancelled_at     = NOW(),
         cancelled_reason = NULLIF(p_reason, ''),
         updated_at       = NOW()
   WHERE id = p_line_id;

  RETURN jsonb_build_object('id', p_line_id, 'status', 'cancelled');
END;
$$;

GRANT EXECUTE ON FUNCTION public.rpc_cancel_reservation_line(UUID, TEXT, UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public.rpc_cancel_reservation_line(UUID, TEXT, UUID) TO authenticated;

-- ─────────────────────────────────────────────────────────────
-- 4. rpc_fulfill_reservation_line (nuevo, por línea)
--    Borrar el viejo rpc_fulfill_reservation que operaba a nivel cabecera.
-- ─────────────────────────────────────────────────────────────
DROP FUNCTION IF EXISTS public.rpc_fulfill_reservation(UUID, UUID, UUID);

CREATE OR REPLACE FUNCTION public.rpc_fulfill_reservation_line(
  p_line_id UUID,
  p_sale_id UUID,
  p_user_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_line     RECORD;
  v_num      TEXT;
  v_store_id UUID;
  v_stock_id UUID;
  v_stock_q  INTEGER;
  v_stock_r  INTEGER;
  v_new_q    INTEGER;
  v_new_r    INTEGER;
BEGIN
  SELECT l.id, l.reservation_id, l.product_variant_id, l.warehouse_id, l.quantity, l.status,
         r.reservation_number, r.store_id
    INTO v_line
    FROM product_reservation_lines l
    JOIN product_reservations r ON r.id = l.reservation_id
   WHERE l.id = p_line_id
   FOR UPDATE OF l;

  IF v_line.id IS NULL THEN
    RAISE EXCEPTION 'Línea de reserva no encontrada';
  END IF;
  IF v_line.status <> 'active' THEN
    RAISE EXCEPTION 'Solo se puede cumplir una línea activa (estado: %)', v_line.status;
  END IF;

  v_num      := v_line.reservation_number;
  v_store_id := v_line.store_id;

  SELECT id, quantity, reserved
    INTO v_stock_id, v_stock_q, v_stock_r
    FROM stock_levels
   WHERE product_variant_id = v_line.product_variant_id
     AND warehouse_id       = v_line.warehouse_id
   FOR UPDATE;

  IF v_stock_id IS NOT NULL THEN
    v_new_q := GREATEST(0, v_stock_q - v_line.quantity);
    v_new_r := GREATEST(0, v_stock_r - v_line.quantity);
    UPDATE stock_levels
       SET quantity         = v_new_q,
           reserved         = v_new_r,
           last_sale_at     = NOW(),
           last_movement_at = NOW(),
           updated_at       = NOW()
     WHERE id = v_stock_id;

    INSERT INTO stock_movements (
      product_variant_id, warehouse_id, movement_type, quantity,
      stock_before, stock_after, reference_type, reference_id,
      reason, created_by, store_id
    ) VALUES (
      v_line.product_variant_id, v_line.warehouse_id, 'reservation_release',
      -v_line.quantity, v_stock_q, v_new_q,
      'sale', p_sale_id,
      'Cumplida línea reserva ' || v_num,
      p_user_id, v_store_id
    );
  END IF;

  UPDATE product_reservation_lines
     SET status            = 'fulfilled',
         fulfilled_at      = NOW(),
         fulfilled_sale_id = p_sale_id,
         updated_at        = NOW()
   WHERE id = p_line_id;

  RETURN jsonb_build_object(
    'id',       p_line_id,
    'status',   'fulfilled',
    'quantity', v_line.quantity
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.rpc_fulfill_reservation_line(UUID, UUID, UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public.rpc_fulfill_reservation_line(UUID, UUID, UUID) TO authenticated;

-- ─────────────────────────────────────────────────────────────
-- 5. fn_activate_pending_reservations (itera líneas pending_stock)
--    Nota: cambia el row type (añade reservation_line_id), así que hay
--    que DROP antes de CREATE.
-- ─────────────────────────────────────────────────────────────
DROP FUNCTION IF EXISTS public.fn_activate_pending_reservations(UUID, UUID, UUID);

CREATE OR REPLACE FUNCTION public.fn_activate_pending_reservations(
  p_product_variant_id UUID,
  p_warehouse_id       UUID,
  p_user_id            UUID
)
RETURNS TABLE (
  reservation_id     UUID,
  reservation_line_id UUID,
  reservation_number TEXT,
  client_id          UUID,
  quantity           INTEGER,
  activated          BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_stock_id       UUID;
  v_stock_quantity INTEGER;
  v_stock_reserved INTEGER;
  v_available      INTEGER;
  v_line           RECORD;
BEGIN
  SELECT id, quantity, reserved
    INTO v_stock_id, v_stock_quantity, v_stock_reserved
    FROM stock_levels
   WHERE product_variant_id = p_product_variant_id
     AND warehouse_id       = p_warehouse_id
   FOR UPDATE;

  IF v_stock_id IS NULL THEN
    RETURN;
  END IF;

  v_available := v_stock_quantity - v_stock_reserved;

  FOR v_line IN
    SELECT l.id AS line_id, l.reservation_id AS res_id, l.quantity AS qty,
           r.reservation_number AS r_num, r.client_id AS r_client, r.store_id AS r_store
      FROM product_reservation_lines l
      JOIN product_reservations r ON r.id = l.reservation_id
     WHERE l.product_variant_id = p_product_variant_id
       AND l.warehouse_id       = p_warehouse_id
       AND l.status             = 'pending_stock'
     ORDER BY l.created_at ASC
     FOR UPDATE OF l
  LOOP
    IF v_available >= v_line.qty THEN
      UPDATE stock_levels
         SET reserved         = reserved + v_line.qty,
             last_movement_at = NOW(),
             updated_at       = NOW()
       WHERE id = v_stock_id;

      INSERT INTO stock_movements (
        product_variant_id, warehouse_id, movement_type, quantity,
        stock_before, stock_after, reference_type, reference_id,
        reason, created_by, store_id
      ) VALUES (
        p_product_variant_id, p_warehouse_id, 'reservation', v_line.qty,
        v_stock_quantity, v_stock_quantity,
        'product_reservation_line', v_line.line_id,
        'Activación automática al recibir stock',
        p_user_id, v_line.r_store
      );

      UPDATE product_reservation_lines
         SET status            = 'active',
             stock_reserved_at = NOW(),
             updated_at        = NOW()
       WHERE id = v_line.line_id;

      v_stock_reserved := v_stock_reserved + v_line.qty;
      v_available      := v_available - v_line.qty;

      reservation_id     := v_line.res_id;
      reservation_line_id := v_line.line_id;
      reservation_number := v_line.r_num;
      client_id          := v_line.r_client;
      quantity           := v_line.qty;
      activated          := TRUE;
      RETURN NEXT;
    ELSE
      reservation_id     := v_line.res_id;
      reservation_line_id := v_line.line_id;
      reservation_number := v_line.r_num;
      client_id          := v_line.r_client;
      quantity           := v_line.qty;
      activated          := FALSE;
      RETURN NEXT;
    END IF;
  END LOOP;
END;
$$;

GRANT EXECUTE ON FUNCTION public.fn_activate_pending_reservations(UUID, UUID, UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_activate_pending_reservations(UUID, UUID, UUID) TO authenticated;

-- ─────────────────────────────────────────────────────────────
-- 6. rpc_create_sale — acepta reservation_line_id por línea de venta
--    Mantenemos `reservation_id` legacy: si viene, consume la primera
--    línea activa de esa reserva con misma variante.
-- ─────────────────────────────────────────────────────────────
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

  -- 5. INSERT sale_lines (con reservation_line_id y reservation_id)
  INSERT INTO sale_lines (
    sale_id, product_variant_id, description, sku, quantity,
    unit_price, discount_percentage, discount_amount, tax_rate, line_total,
    cost_price, sort_order, reservation_id, reservation_line_id
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
    NULLIF(l->>'reservation_line_id', '')::UUID
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

  -- 8. Manual transactions
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

      v_variant_id  := (v_line->>'product_variant_id')::UUID;
      v_line_qty    := (v_line->>'quantity')::INTEGER;
      v_res_line_id := NULLIF(v_line->>'reservation_line_id', '')::UUID;

      -- 9.A — Línea vinculada a una LÍNEA de reserva concreta (recogida explícita)
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

      -- 9.B — Línea normal: auto-fulfill FIFO por cliente sobre LÍNEAS activas
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
    'store_id',           p_sale->>'store_id',
    'client_id',          p_sale->>'client_id',
    'cash_session_id',    p_sale->>'cash_session_id',
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
$$;

GRANT EXECUTE ON FUNCTION public.rpc_create_sale(JSONB, JSONB, JSONB, UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public.rpc_create_sale(JSONB, JSONB, JSONB, UUID) TO authenticated;
