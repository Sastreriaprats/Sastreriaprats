-- ============================================================
-- Migración 237 — serie interna CLP en cobros de sastrería y reservas
--
-- CREATE OR REPLACE de las 3 funciones de cobro de sastrería/reservas
-- partiendo de su definición VIVA (migración 209). Único cambio: bloque CLP
-- que asigna la ref (E si efectivo; T en cualquier otro caso) y la añade al
-- JSON de retorno. El resto del cuerpo es idéntico a 209.
--
--   · rpc_add_order_payment        -> cobro de pedido de sastrería
--   · rpc_add_reservation_payment  -> cobro adicional de reserva de producto
--   · rpc_create_reservation       -> pago inicial de reserva (si lo hay)
-- ============================================================

-- ---------- rpc_add_order_payment ----------
CREATE OR REPLACE FUNCTION public.rpc_add_order_payment(p_tailoring_order_id uuid, p_payment_date date, p_payment_method text, p_amount numeric, p_reference text DEFAULT NULL::text, p_notes text DEFAULT NULL::text, p_next_payment_date date DEFAULT NULL::date, p_store_id uuid DEFAULT NULL::uuid, p_user_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_payment_id       UUID;
  v_payment_row      RECORD;
  v_nuevo_total_paid NUMERIC(10,2);
  v_order_number     TEXT;
  v_base_amount      NUMERIC(12,2);
  v_tax_amount       NUMERIC(12,2);
  v_session_id       UUID := NULL;
  v_method_field     TEXT;
  v_internal_ref     TEXT;          -- CLP (serie interna)
BEGIN

  IF p_amount <= 0 THEN
    RAISE EXCEPTION 'El importe debe ser mayor que 0';
  END IF;

  -- 0. Localizar la sesión de caja cuyo rango temporal cubre p_payment_date.
  --    Prioridad: sesión 'open' que ya cubre la fecha (típicamente hoy).
  --    Fallback: sesión 'closed' cuyo [opened_at, closed_at] incluya la fecha.
  --    Si no hay ninguna → v_session_id queda NULL y el pago se inserta
  --    sin vincular (no se tocan totales ni manual_transactions).
  IF p_store_id IS NOT NULL THEN
    -- Sesión abierta cuya apertura es <= fecha del pago
    SELECT id INTO v_session_id
    FROM cash_sessions
    WHERE store_id = p_store_id
      AND status = 'open'
      AND opened_at::date <= p_payment_date
    ORDER BY opened_at DESC
    LIMIT 1;

    -- Si no hay abierta válida, buscar sesión cerrada que englobe la fecha
    IF v_session_id IS NULL THEN
      SELECT id INTO v_session_id
      FROM cash_sessions
      WHERE store_id = p_store_id
        AND status <> 'open'
        AND opened_at::date <= p_payment_date
        AND (closed_at IS NULL OR closed_at::date >= p_payment_date)
      ORDER BY opened_at DESC
      LIMIT 1;
    END IF;
  ELSE
    SELECT id INTO v_session_id
    FROM cash_sessions
    WHERE status = 'open'
      AND opened_at::date <= p_payment_date
    ORDER BY opened_at DESC
    LIMIT 1;

    IF v_session_id IS NULL THEN
      SELECT id INTO v_session_id
      FROM cash_sessions
      WHERE status <> 'open'
        AND opened_at::date <= p_payment_date
        AND (closed_at IS NULL OR closed_at::date >= p_payment_date)
      ORDER BY opened_at DESC
      LIMIT 1;
    END IF;
  END IF;

  -- 1. Insertar pago con cash_session_id (puede ser NULL)
  INSERT INTO tailoring_order_payments (
    tailoring_order_id, payment_date, payment_method,
    amount, reference, notes, next_payment_date, created_by,
    cash_session_id
  ) VALUES (
    p_tailoring_order_id, p_payment_date, p_payment_method,
    p_amount, p_reference, p_notes, p_next_payment_date, p_user_id,
    v_session_id
  )
  RETURNING * INTO v_payment_row;

  v_payment_id := v_payment_row.id;

  -- 2. Recalcular total_paid del pedido
  SELECT COALESCE(SUM(amount), 0)
  INTO v_nuevo_total_paid
  FROM tailoring_order_payments
  WHERE tailoring_order_id = p_tailoring_order_id;

  UPDATE tailoring_orders
  SET total_paid = v_nuevo_total_paid
  WHERE id = p_tailoring_order_id;

  SELECT order_number INTO v_order_number
  FROM tailoring_orders
  WHERE id = p_tailoring_order_id;

  -- 2b. Serie interna CLP del cobro de sastrería (E si efectivo; T resto). NO fiscal.
  v_internal_ref := public.fn_assign_clp_ticket(
    (p_payment_method = 'cash'), p_amount, 'order',
    v_payment_row.id, NULL, p_store_id, v_session_id
  );

  -- 3 + 4. Solo si hemos podido vincular a una sesión:
  --        - Insertar manual_transaction
  --        - Actualizar totales de la sesión correspondiente
  IF v_session_id IS NOT NULL THEN
    v_base_amount := p_amount / 1.21;
    v_tax_amount  := p_amount - v_base_amount;

    INSERT INTO manual_transactions (
      type, date, description, category,
      amount, tax_rate, tax_amount, total,
      notes, created_by, cash_session_id,
      tailoring_order_payment_id
    ) VALUES (
      'income',
      p_payment_date,
      'Pago pedido - ' || COALESCE(v_order_number, ''),
      'sastreria',
      v_base_amount,
      21,
      v_tax_amount,
      p_amount,
      'Pedido ' || COALESCE(v_order_number, '') || ' - ' || p_payment_method,
      p_user_id,
      v_session_id,
      v_payment_row.id
    );

    v_method_field := CASE p_payment_method
      WHEN 'cash'     THEN 'total_cash_sales'
      WHEN 'card'     THEN 'total_card_sales'
      WHEN 'bizum'    THEN 'total_bizum_sales'
      WHEN 'transfer' THEN 'total_transfer_sales'
      WHEN 'check'    THEN 'total_transfer_sales'
      ELSE NULL
    END;

    IF v_method_field IS NOT NULL THEN
      UPDATE cash_sessions
      SET total_sales = COALESCE(total_sales, 0) + p_amount
      WHERE id = v_session_id;

      IF v_method_field = 'total_cash_sales' THEN
        UPDATE cash_sessions SET total_cash_sales = COALESCE(total_cash_sales, 0) + p_amount WHERE id = v_session_id;
      ELSIF v_method_field = 'total_card_sales' THEN
        UPDATE cash_sessions SET total_card_sales = COALESCE(total_card_sales, 0) + p_amount WHERE id = v_session_id;
      ELSIF v_method_field = 'total_bizum_sales' THEN
        UPDATE cash_sessions SET total_bizum_sales = COALESCE(total_bizum_sales, 0) + p_amount WHERE id = v_session_id;
      ELSE
        UPDATE cash_sessions SET total_transfer_sales = COALESCE(total_transfer_sales, 0) + p_amount WHERE id = v_session_id;
      END IF;
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'id',                  v_payment_id,
    'tailoring_order_id',  p_tailoring_order_id,
    'internal_ref',        v_internal_ref,
    'payment_date',        p_payment_date,
    'payment_method',      p_payment_method,
    'amount',              p_amount,
    'reference',           p_reference,
    'notes',               p_notes,
    'next_payment_date',   p_next_payment_date,
    'created_by',          p_user_id,
    'created_at',          v_payment_row.created_at,
    'order_number',        v_order_number,
    'nuevo_total_paid',    v_nuevo_total_paid,
    'cash_session_id',     v_session_id
  );

END;
$function$;

-- ---------- rpc_add_reservation_payment ----------
CREATE OR REPLACE FUNCTION public.rpc_add_reservation_payment(p_reservation_id uuid, p_payment_date date, p_payment_method text, p_amount numeric, p_reference text DEFAULT NULL::text, p_notes text DEFAULT NULL::text, p_store_id uuid DEFAULT NULL::uuid, p_cash_session_id uuid DEFAULT NULL::uuid, p_user_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_pay_id        UUID;
  v_pay_row       RECORD;
  v_res           RECORD;
  v_new_paid      NUMERIC(12,2);
  v_new_status    TEXT;
  v_base_amount   NUMERIC(12,2);
  v_tax_amount    NUMERIC(12,2);
  v_session_id    UUID := p_cash_session_id;
  v_internal_ref  TEXT;            -- CLP (serie interna)
BEGIN
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'El importe del pago debe ser mayor que 0';
  END IF;

  SELECT id, reservation_number, total, total_paid, store_id
    INTO v_res
    FROM product_reservations
   WHERE id = p_reservation_id
   FOR UPDATE;
  IF v_res.id IS NULL THEN
    RAISE EXCEPTION 'Reserva no encontrada';
  END IF;

  IF (v_res.total_paid + p_amount) > v_res.total THEN
    RAISE EXCEPTION 'El pago excede el total pendiente de la reserva';
  END IF;

  -- Cash session: si no viene explícita, buscar una abierta en la tienda de la reserva
  IF v_session_id IS NULL AND v_res.store_id IS NOT NULL THEN
    SELECT id INTO v_session_id
      FROM cash_sessions
     WHERE status = 'open' AND store_id = COALESCE(p_store_id, v_res.store_id)
     LIMIT 1;
  END IF;

  INSERT INTO product_reservation_payments (
    product_reservation_id, payment_date, payment_method, amount,
    reference, notes, cash_session_id, created_by
  ) VALUES (
    p_reservation_id, p_payment_date, p_payment_method, p_amount,
    p_reference, p_notes, v_session_id, p_user_id
  )
  RETURNING * INTO v_pay_row;
  v_pay_id := v_pay_row.id;

  v_new_paid := v_res.total_paid + p_amount;
  v_new_status := CASE
    WHEN v_new_paid >= v_res.total THEN 'paid'
    WHEN v_new_paid > 0            THEN 'partial'
    ELSE 'pending'
  END;

  UPDATE product_reservations
     SET total_paid     = v_new_paid,
         payment_status = v_new_status,
         updated_at     = NOW()
   WHERE id = p_reservation_id;

  -- Serie interna CLP del cobro de reserva (E si efectivo; T resto). NO fiscal.
  v_internal_ref := public.fn_assign_clp_ticket(
    (p_payment_method = 'cash'), p_amount, 'reservation',
    v_pay_row.id, NULL, v_res.store_id, v_session_id
  );

  -- Contabilidad
  v_base_amount := ROUND(p_amount / 1.21, 2);
  v_tax_amount  := p_amount - v_base_amount;
  INSERT INTO manual_transactions (
    type, date, description, category,
    amount, tax_rate, tax_amount, total,
    notes, created_by, cash_session_id,
    product_reservation_payment_id
  ) VALUES (
    'income', p_payment_date,
    'Pago reserva - ' || v_res.reservation_number,
    'reservas',
    v_base_amount, 21, v_tax_amount, p_amount,
    'Reserva ' || v_res.reservation_number || ' - ' || p_payment_method,
    p_user_id, v_session_id, v_pay_row.id
  );

  -- Cash session totales
  IF v_session_id IS NOT NULL THEN
    UPDATE cash_sessions
       SET total_sales          = COALESCE(total_sales, 0)          + p_amount,
           total_cash_sales     = COALESCE(total_cash_sales, 0)
                                 + (CASE WHEN p_payment_method = 'cash'     THEN p_amount ELSE 0 END),
           total_card_sales     = COALESCE(total_card_sales, 0)
                                 + (CASE WHEN p_payment_method = 'card'     THEN p_amount ELSE 0 END),
           total_bizum_sales    = COALESCE(total_bizum_sales, 0)
                                 + (CASE WHEN p_payment_method = 'bizum'    THEN p_amount ELSE 0 END),
           total_transfer_sales = COALESCE(total_transfer_sales, 0)
                                 + (CASE WHEN p_payment_method = 'transfer' THEN p_amount ELSE 0 END),
           total_voucher_sales  = COALESCE(total_voucher_sales, 0)
                                 + (CASE WHEN p_payment_method = 'voucher'  THEN p_amount ELSE 0 END)
     WHERE id = v_session_id;
  END IF;

  RETURN jsonb_build_object(
    'id',                 v_pay_id,
    'reservation_id',     p_reservation_id,
    'reservation_number', v_res.reservation_number,
    'internal_ref',       v_internal_ref,
    'amount',             p_amount,
    'payment_method',     p_payment_method,
    'total_paid',         v_new_paid,
    'payment_status',     v_new_status,
    'created_at',         v_pay_row.created_at
  );
END;
$function$;

-- ---------- rpc_create_reservation ----------
CREATE OR REPLACE FUNCTION public.rpc_create_reservation(p_reservation jsonb, p_user_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_id               UUID;
  v_num              TEXT;
  v_client_id        UUID          := (p_reservation->>'client_id')::UUID;
  v_store_id         UUID          := NULLIF(p_reservation->>'store_id', '')::UUID;
  v_cash_session_id  UUID          := NULLIF(p_reservation->>'cash_session_id', '')::UUID;
  v_employee_id      UUID          := NULLIF(p_reservation->>'employee_id', '')::UUID;
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
  v_internal_ref     TEXT;          -- CLP (serie interna)
BEGIN
  IF v_client_id IS NULL THEN
    RAISE EXCEPTION 'Falta el cliente';
  END IF;
  IF v_employee_id IS NULL THEN
    RAISE EXCEPTION 'Falta el vendedor asignado a la reserva';
  END IF;
  IF v_lines IS NULL OR jsonb_typeof(v_lines) <> 'array' OR jsonb_array_length(v_lines) = 0 THEN
    RAISE EXCEPTION 'La reserva debe tener al menos una línea';
  END IF;

  v_num := generate_reservation_number();

  -- Cabecera: quantity/unit_price son legacy (la verdad vive en líneas).
  -- unit_price es NOT NULL DEFAULT 0 (migración 106), así que pasamos 0.
  INSERT INTO product_reservations (
    reservation_number, client_id, store_id,
    quantity, unit_price, total, total_paid, payment_status,
    status, notes, reason, expires_at, created_by, employee_id
  ) VALUES (
    v_num, v_client_id, v_store_id,
    NULL, 0, 0, 0, 'pending',
    'active',
    NULLIF(p_reservation->>'notes', ''),
    NULLIF(p_reservation->>'reason', ''),
    NULLIF(p_reservation->>'expires_at', '')::TIMESTAMPTZ,
    p_user_id,
    v_employee_id
  )
  RETURNING id INTO v_id;

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

    IF v_line_status = 'active'        THEN v_any_active  := TRUE; END IF;
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

  IF v_any_active THEN
    v_header_status := 'active';
  ELSIF v_any_pending THEN
    v_header_status := 'pending_stock';
  ELSE
    v_header_status := 'active';
  END IF;

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

      -- Serie interna CLP del pago inicial de reserva (E si efectivo; T resto). NO fiscal.
      v_internal_ref := public.fn_assign_clp_ticket(
        (v_pay_method = 'cash'), v_pay_amount, 'reservation',
        v_pay_id, NULL, v_store_id, v_cash_session_id
      );

      v_base_amount := ROUND(v_pay_amount / 1.21, 2);
      v_tax_amount  := v_pay_amount - v_base_amount;
      INSERT INTO manual_transactions (
        type, date, description, category,
        amount, tax_rate, tax_amount, total,
        notes, created_by, cash_session_id,
        product_reservation_payment_id
      ) VALUES (
        'income', CURRENT_DATE,
        'Pago reserva - ' || v_num,
        'reservas',
        v_base_amount, 21, v_tax_amount, v_pay_amount,
        'Reserva ' || v_num || ' - ' || v_pay_method,
        p_user_id, v_cash_session_id, v_pay_id
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
    'internal_ref',       v_internal_ref,
    'status',             v_header_status,
    'had_stock',          v_any_active AND NOT v_any_pending,
    'total',              v_total,
    'total_paid',         CASE WHEN v_pay_id IS NOT NULL THEN v_pay_amount ELSE 0 END,
    'payment_status',     v_payment_status,
    'payment_id',         v_pay_id,
    'lines',              v_lines_result
  );
END;
$function$;
