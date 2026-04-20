-- ==========================================
-- SASTRERÍA PRATS — Migración 107
-- rpc_create_reservation con precio y pago inicial opcional
-- ==========================================
-- Reemplaza la versión de 101. Añade:
--   - p_reservation.unit_price (requerido, >= 0)
--   - p_reservation.initial_payment (opcional): { method, amount }
-- Si viene un pago inicial:
--   - Inserta en product_reservation_payments
--   - Actualiza totales de cash_sessions
--   - Inserta manual_transactions (tpv/sastrería categoría 'reservas')
--   - Actualiza product_reservations.total_paid y payment_status

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
  v_qty              INTEGER       := (p_reservation->>'quantity')::INTEGER;
  v_unit_price       NUMERIC(10,2) := COALESCE((p_reservation->>'unit_price')::NUMERIC(10,2), 0);
  v_total            NUMERIC(12,2);
  v_variant_id       UUID          := (p_reservation->>'product_variant_id')::UUID;
  v_warehouse_id     UUID          := (p_reservation->>'warehouse_id')::UUID;
  v_client_id        UUID          := (p_reservation->>'client_id')::UUID;
  v_store_id         UUID          := NULLIF(p_reservation->>'store_id', '')::UUID;
  v_cash_session_id  UUID          := NULLIF(p_reservation->>'cash_session_id', '')::UUID;
  v_stock_id         UUID;
  v_stock_quantity   INTEGER;
  v_stock_reserved   INTEGER;
  v_available        INTEGER;
  v_status           reservation_status;
  v_payment          JSONB         := p_reservation->'initial_payment';
  v_pay_method       TEXT;
  v_pay_amount       NUMERIC(10,2);
  v_pay_id           UUID;
  v_payment_status   TEXT          := 'pending';
  v_base_amount      NUMERIC(12,2);
  v_tax_amount       NUMERIC(12,2);
BEGIN
  IF v_qty IS NULL OR v_qty <= 0 THEN
    RAISE EXCEPTION 'La cantidad debe ser mayor que 0';
  END IF;
  IF v_variant_id IS NULL OR v_warehouse_id IS NULL OR v_client_id IS NULL THEN
    RAISE EXCEPTION 'Faltan datos obligatorios (cliente, variante o almacén)';
  END IF;
  IF v_unit_price < 0 THEN
    RAISE EXCEPTION 'El precio unitario no puede ser negativo';
  END IF;

  v_num   := generate_reservation_number();
  v_total := ROUND(v_unit_price * v_qty, 2);

  -- Bloqueo del stock para evitar carreras
  SELECT id, quantity, reserved
    INTO v_stock_id, v_stock_quantity, v_stock_reserved
    FROM stock_levels
   WHERE product_variant_id = v_variant_id
     AND warehouse_id       = v_warehouse_id
   FOR UPDATE;

  IF v_stock_id IS NULL THEN
    v_status := 'pending_stock';
  ELSE
    v_available := v_stock_quantity - v_stock_reserved;
    IF v_available >= v_qty THEN
      v_status := 'active';
      UPDATE stock_levels
         SET reserved         = reserved + v_qty,
             last_movement_at = NOW(),
             updated_at       = NOW()
       WHERE id = v_stock_id;
    ELSE
      v_status := 'pending_stock';
    END IF;
  END IF;

  INSERT INTO product_reservations (
    reservation_number, client_id, product_variant_id, warehouse_id, store_id,
    quantity, unit_price, total, total_paid, payment_status,
    status, notes, reason, expires_at,
    stock_reserved_at, created_by
  ) VALUES (
    v_num, v_client_id, v_variant_id, v_warehouse_id, v_store_id,
    v_qty, v_unit_price, v_total, 0, 'pending',
    v_status,
    NULLIF(p_reservation->>'notes', ''),
    NULLIF(p_reservation->>'reason', ''),
    NULLIF(p_reservation->>'expires_at', '')::TIMESTAMPTZ,
    CASE WHEN v_status = 'active' THEN NOW() ELSE NULL END,
    p_user_id
  )
  RETURNING id INTO v_id;

  IF v_status = 'active' AND v_stock_id IS NOT NULL THEN
    INSERT INTO stock_movements (
      product_variant_id, warehouse_id, movement_type, quantity,
      stock_before, stock_after, reference_type, reference_id,
      reason, created_by, store_id
    ) VALUES (
      v_variant_id, v_warehouse_id, 'reservation', v_qty,
      v_stock_quantity, v_stock_quantity,
      'product_reservation', v_id,
      'Reserva ' || v_num,
      p_user_id, v_store_id
    );
  END IF;

  -- Pago inicial opcional
  IF v_payment IS NOT NULL AND jsonb_typeof(v_payment) = 'object' THEN
    v_pay_method := NULLIF(v_payment->>'method', '');
    v_pay_amount := COALESCE((v_payment->>'amount')::NUMERIC(10,2), 0);

    IF v_pay_method IS NOT NULL AND v_pay_amount > 0 THEN
      IF v_pay_amount > v_total THEN
        RAISE EXCEPTION 'El pago inicial (%) excede el total de la reserva (%)', v_pay_amount, v_total;
      END IF;

      -- Si no viene cash_session_id, buscar uno abierto (opcional: admin)
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
         SET total_paid      = v_pay_amount,
             payment_status  = v_payment_status,
             updated_at      = NOW()
       WHERE id = v_id;

      -- Manual_transactions (contabilidad)
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

      -- Cash session totals
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
    'status',             v_status,
    'had_stock',          v_status = 'active',
    'unit_price',         v_unit_price,
    'total',              v_total,
    'total_paid',         CASE WHEN v_pay_id IS NOT NULL THEN v_pay_amount ELSE 0 END,
    'payment_status',     v_payment_status,
    'payment_id',         v_pay_id
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.rpc_create_reservation(JSONB, UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public.rpc_create_reservation(JSONB, UUID) TO authenticated;
