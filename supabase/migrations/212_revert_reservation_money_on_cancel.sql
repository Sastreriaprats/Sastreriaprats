-- ============================================================
-- Migración 212 — Fase D (3/3): reverso de DINERO al cancelar reserva (R1)
--
-- Hoy cancelar una reserva solo libera stock; deja cobros/espejos/saldo vivos.
-- Se añade _revert_reservation_money (patrón de rpc_remove_order_payment) y se
-- llama desde las dos funciones de cancelación. Lógica de stock/release INTACTA.
--
--  GUARD: una reserva 'fulfilled' (entregada) NUNCA se reembolsa (lo primero).
--  Reserva sin pago -> no-op. Espejo por FK (fallback texto) ANTES de borrar el pago.
--  Cancelar línea individual: solo revierte dinero si es la ÚLTIMA línea viva.
-- ============================================================

CREATE OR REPLACE FUNCTION public._revert_reservation_money(p_reservation_id uuid, p_user_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_res       RECORD;
  v_pay       RECORD;
  v_s         RECORD;
  v_expected  NUMERIC;
  v_diff      NUMERIC;
  v_n         INT := 0;
  v_total     NUMERIC := 0;
BEGIN
  SELECT id, reservation_number, status, total_paid INTO v_res
  FROM product_reservations WHERE id = p_reservation_id;
  IF v_res.id IS NULL THEN
    RETURN jsonb_build_object('reverted', false, 'reason', 'not_found');
  END IF;

  -- GUARD (lo PRIMERO): una reserva ENTREGADA (fulfilled) NO se reembolsa aunque se cancele.
  IF v_res.status = 'fulfilled' THEN
    RETURN jsonb_build_object('reverted', false, 'reason', 'fulfilled');
  END IF;

  -- Sin saldo cobrado -> nada que revertir (no-op, sin error).
  IF COALESCE(v_res.total_paid, 0) <= 0 THEN
    RETURN jsonb_build_object('reverted', false, 'reason', 'no_payments');
  END IF;

  FOR v_pay IN
    SELECT * FROM product_reservation_payments WHERE product_reservation_id = p_reservation_id
  LOOP
    -- 1) revertir totales de la sesión del pago (abierta o cerrada)
    IF v_pay.cash_session_id IS NOT NULL THEN
      SELECT * INTO v_s FROM cash_sessions WHERE id = v_pay.cash_session_id;

      UPDATE cash_sessions SET total_sales = COALESCE(total_sales, 0) - v_pay.amount
       WHERE id = v_pay.cash_session_id;

      IF v_pay.payment_method = 'cash' THEN
        UPDATE cash_sessions SET total_cash_sales     = COALESCE(total_cash_sales, 0)     - v_pay.amount WHERE id = v_pay.cash_session_id;
      ELSIF v_pay.payment_method = 'card' THEN
        UPDATE cash_sessions SET total_card_sales     = COALESCE(total_card_sales, 0)     - v_pay.amount WHERE id = v_pay.cash_session_id;
      ELSIF v_pay.payment_method = 'bizum' THEN
        UPDATE cash_sessions SET total_bizum_sales    = COALESCE(total_bizum_sales, 0)    - v_pay.amount WHERE id = v_pay.cash_session_id;
      ELSIF v_pay.payment_method IN ('transfer', 'check') THEN
        UPDATE cash_sessions SET total_transfer_sales = COALESCE(total_transfer_sales, 0) - v_pay.amount WHERE id = v_pay.cash_session_id;
      ELSIF v_pay.payment_method = 'voucher' THEN
        UPDATE cash_sessions SET total_voucher_sales  = COALESCE(total_voucher_sales, 0)  - v_pay.amount WHERE id = v_pay.cash_session_id;
      END IF;

      -- arqueo si la sesión está cerrada (fórmula canónica, idéntica a rpc_remove_order_payment)
      IF v_s.status = 'closed' THEN
        SELECT * INTO v_s FROM cash_sessions WHERE id = v_pay.cash_session_id;
        v_expected := COALESCE(v_s.opening_amount, 0) + COALESCE(v_s.total_cash_sales, 0)
                    - COALESCE(v_s.total_returns, 0) - COALESCE(v_s.total_withdrawals, 0);
        v_diff := COALESCE(v_s.counted_cash, 0) - v_expected;
        UPDATE cash_sessions SET expected_cash = v_expected, cash_difference = v_diff, updated_at = now()
         WHERE id = v_pay.cash_session_id;
      END IF;
    END IF;

    -- 2) borrar el espejo POR FK (fallback texto) ANTES de borrar el pago (orden SET NULL)
    DELETE FROM manual_transactions
    WHERE product_reservation_payment_id = v_pay.id
       OR (
         product_reservation_payment_id IS NULL
         AND category = 'reservas'
         AND type = 'income'
         AND cash_session_id IS NOT DISTINCT FROM v_pay.cash_session_id
         AND total = v_pay.amount
         AND description LIKE '%' || v_res.reservation_number || '%'
       );

    -- 3) snapshot a audit_logs + borrar el pago
    INSERT INTO audit_logs(user_id, action, module, entity_type, entity_id, entity_display, description, old_data, metadata, created_at)
    VALUES(p_user_id, 'delete', 'reservations', 'product_reservation_payment', v_pay.id,
           'Pago reserva ' || v_res.reservation_number,
           'Reembolso por cancelación de reserva: se revierte el cobro de caja y se borra el pago.',
           to_jsonb(v_pay),
           jsonb_build_object('reservation_number', v_res.reservation_number, 'amount', v_pay.amount, 'reason', 'reservation_cancel_refund'),
           now());

    DELETE FROM product_reservation_payments WHERE id = v_pay.id;

    v_n := v_n + 1;
    v_total := v_total + v_pay.amount;
  END LOOP;

  -- 4) reset del saldo de la reserva
  UPDATE product_reservations
     SET total_paid = 0, payment_status = 'pending', updated_at = now()
   WHERE id = p_reservation_id;

  RETURN jsonb_build_object('reverted', true, 'payments_reverted', v_n, 'amount_reverted', v_total);
END;
$function$;

CREATE OR REPLACE FUNCTION public.rpc_cancel_reservation(p_reservation_id uuid, p_reason text, p_user_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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

  -- Reverso de DINERO (Fase D 3/3): la función compartida auto-guarda (fulfilled / total_paid=0 -> no-op).
  PERFORM _revert_reservation_money(p_reservation_id, p_user_id);

  RETURN jsonb_build_object('id', p_reservation_id, 'status', 'cancelled');
END;
$function$;

CREATE OR REPLACE FUNCTION public.rpc_cancel_reservation_line(p_line_id uuid, p_reason text, p_user_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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

  -- Reverso de DINERO solo si esta era la ÚLTIMA línea viva (los pagos no están por línea).
  -- Si quedan líneas activas -> money-neutral. La función compartida auto-guarda fulfilled/total_paid=0.
  IF (SELECT count(*) FROM product_reservation_lines
        WHERE reservation_id = v_line.reservation_id
          AND status IN ('active', 'pending_stock')) = 0 THEN
    PERFORM _revert_reservation_money(v_line.reservation_id, p_user_id);
  END IF;

  RETURN jsonb_build_object('id', p_line_id, 'status', 'cancelled');
END;
$function$;
