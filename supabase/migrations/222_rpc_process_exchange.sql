-- ============================================================
-- Migración 222: rpc_process_exchange — Cambio directo ATÓMICO
--
-- Reescribe el "Cambio directo" del TPV (pieza 1/4). Orquesta, en UNA sola
-- transacción (el cuerpo de la función):
--   1) rpc_create_return('voucher')  -> crea vale X por lo devuelto, marca líneas
--      devueltas, repone stock; NO toca caja.
--   2) rpc_create_sale               -> venta de los productos nuevos (Y), pagada
--      con el vale X (+ diferencia si Y>X); consume el vale (used), descuenta
--      stock, ajusta caja y manual_transactions.
--   3) vale RESIDUAL (X-Y) si X>Y    -> mismo patrón que el residual de createSale
--      (kind 'residual', parent = vale X), código GC- con loop anti-colisión.
--   4) UPDATE returns                -> return_type='exchange' + exchange_sale_id.
--
-- Si CUALQUIER paso falla, se revierte todo -> cero huérfanos (corrige el bug del
-- "cambio directo" antiguo, que dejaba returns sin vale ni venta ligada).
-- NO modifica rpc_create_return ni rpc_create_sale (se reutilizan tal cual).
-- ============================================================
CREATE OR REPLACE FUNCTION public.rpc_process_exchange(
  p_original_sale_id uuid,
  p_return_line_ids  uuid[],
  p_new_lines        jsonb,
  p_diff_payment     jsonb,
  p_reason           text,
  p_store_id         uuid,
  p_cash_session_id  uuid,
  p_user_id          uuid
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $func$
DECLARE
  v_ret           jsonb;
  v_return_id     uuid;
  v_voucher_id    uuid;            -- vale X
  v_voucher_code  text;
  v_credit        numeric(12,2);   -- X (lo devuelto)
  v_buy_total     numeric(12,2);   -- Y (la compra nueva)
  v_applied       numeric(12,2);   -- LEAST(X, Y) aplicado del vale
  v_diff          numeric(12,2);   -- Y - X
  v_payments      jsonb;
  v_diff_method   text;
  v_diff_amount   numeric(12,2);
  v_sale          jsonb;
  v_sale_id       uuid;
  v_ticket        text;
  v_client_id     uuid;
  v_residual      numeric(12,2);   -- X - Y
  v_residual_code text := NULL;
  v_residual_id   uuid := NULL;
BEGIN
  IF p_new_lines IS NULL OR jsonb_array_length(p_new_lines) = 0 THEN
    RAISE EXCEPTION 'El cambio requiere al menos un producto nuevo';
  END IF;

  SELECT client_id INTO v_client_id FROM sales WHERE id = p_original_sale_id;

  -- 1) Devolución a VALE (crea vale X, marca líneas, repone stock; NO toca caja).
  --    Reutiliza rpc_create_return tal cual. Valida que las líneas pertenezcan a la venta.
  v_ret := rpc_create_return(p_original_sale_id, 'voucher', p_return_line_ids, p_reason, p_store_id, p_user_id);
  v_return_id    := (v_ret->>'return_id')::uuid;
  v_voucher_id   := (v_ret->>'voucher_id')::uuid;
  v_voucher_code := v_ret->>'voucher_code';
  v_credit       := (v_ret->>'total_returned')::numeric;
  IF v_voucher_id IS NULL THEN
    RAISE EXCEPTION 'No se generó el vale de la devolución';
  END IF;

  -- 2) Total de la compra nueva (Y)
  SELECT COALESCE(SUM(
    (l->>'unit_price')::numeric * (l->>'quantity')::int
    - (l->>'unit_price')::numeric * (l->>'quantity')::int * COALESCE((l->>'discount_percentage')::numeric, 0) / 100
  ), 0)
  INTO v_buy_total
  FROM jsonb_array_elements(p_new_lines) l;

  v_applied := LEAST(v_credit, v_buy_total);
  v_diff    := round(v_buy_total - v_credit, 2);

  -- 3) Pagos: vale (aplicado) + diferencia si Y>X, con validaciones estrictas
  v_payments := jsonb_build_array(
    jsonb_build_object('payment_method', 'voucher', 'amount', v_applied, 'voucher_id', v_voucher_id::text)
  );

  IF v_diff > 0.005 THEN
    IF p_diff_payment IS NULL THEN
      RAISE EXCEPTION 'La compra (%) supera el crédito (%): falta el pago de la diferencia (%)', v_buy_total, v_credit, v_diff;
    END IF;
    v_diff_method := p_diff_payment->>'payment_method';
    v_diff_amount := (p_diff_payment->>'amount')::numeric;
    IF v_diff_method NOT IN ('cash','card','bizum','transfer') THEN
      RAISE EXCEPTION 'Método de pago de la diferencia inválido: %', COALESCE(v_diff_method,'(null)');
    END IF;
    IF abs(v_diff_amount - v_diff) > 0.005 THEN
      RAISE EXCEPTION 'El pago de la diferencia (%) no cuadra con la diferencia esperada (%)', v_diff_amount, v_diff;
    END IF;
    v_payments := v_payments || jsonb_build_array(
      jsonb_build_object('payment_method', v_diff_method, 'amount', v_diff_amount)
    );
  ELSE
    IF p_diff_payment IS NOT NULL THEN
      RAISE EXCEPTION 'No se cobra diferencia: la compra (%) no supera el crédito (%)', v_buy_total, v_credit;
    END IF;
  END IF;

  -- 4) Venta nueva pagada con el vale (+ diferencia). Reutiliza rpc_create_sale:
  --    consume el vale X (used), descuenta stock, ajusta caja y manual_transactions.
  v_sale := rpc_create_sale(
    jsonb_build_object(
      'store_id',        p_store_id::text,
      'client_id',       v_client_id::text,
      'cash_session_id', p_cash_session_id::text,
      'salesperson_id',  p_user_id::text,
      'sale_type',       'boutique',
      'is_tax_free',     false
    ),
    p_new_lines,
    v_payments,
    p_user_id
  );
  v_sale_id := (v_sale->>'id')::uuid;
  v_ticket  := v_sale->>'ticket_number';

  -- 5) Vale residual si X > Y (mismo patrón que createSale en JS, replicado en SQL;
  --    mismo prefijo GC- que el residual de ventas normales).
  v_residual := round(v_credit - v_buy_total, 2);
  IF v_residual > 0.005 THEN
    LOOP
      v_residual_code := 'GC-' || upper(substr(md5(random()::text || clock_timestamp()::text), 1, 8));
      EXIT WHEN NOT EXISTS (SELECT 1 FROM vouchers WHERE code = v_residual_code);
    END LOOP;
    INSERT INTO vouchers (
      code, voucher_type, voucher_kind, parent_voucher_id,
      original_amount, remaining_amount, origin_sale_id, client_id,
      issued_date, expiry_date, status, issued_by_store_id, issued_by, notes
    ) VALUES (
      v_residual_code, 'fixed', 'residual', v_voucher_id,
      v_residual, v_residual, v_sale_id, v_client_id,
      CURRENT_DATE, CURRENT_DATE + INTERVAL '365 days', 'active', p_store_id, p_user_id,
      'Saldo residual del cambio (vale ' || v_voucher_id::text || ')'
    ) RETURNING id INTO v_residual_id;
  END IF;

  -- 6) Ligar el return como cambio (voucher_id ya quedó puesto en el paso 1)
  UPDATE returns
     SET return_type = 'exchange',
         exchange_sale_id = v_sale_id
   WHERE id = v_return_id;

  -- 7) Resultado
  RETURN jsonb_build_object(
    'return_id',          v_return_id,
    'voucher_id',         v_voucher_id,
    'voucher_code',       v_voucher_code,
    'exchange_sale_id',   v_sale_id,
    'new_ticket_number',  v_ticket,
    'credito_X',          v_credit,
    'compra_Y',           v_buy_total,
    'aplicado_vale',      v_applied,
    'diferencia_cobrada', CASE WHEN v_diff > 0.005 THEN v_diff ELSE 0 END,
    'residual_code',      v_residual_code,
    'residual_amount',    CASE WHEN v_residual > 0.005 THEN v_residual ELSE 0 END,
    'residual_id',        v_residual_id
  );
END;
$func$;

GRANT EXECUTE ON FUNCTION public.rpc_process_exchange(uuid, uuid[], jsonb, jsonb, text, uuid, uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.rpc_process_exchange(uuid, uuid[], jsonb, jsonb, text, uuid, uuid, uuid) TO authenticated;
