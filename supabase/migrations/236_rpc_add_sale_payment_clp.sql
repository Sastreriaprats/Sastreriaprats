-- ============================================================
-- Migración 236 — rpc_add_sale_payment + serie interna CLP
--
-- CREATE OR REPLACE partiendo de la definición VIVA (migración 217). Cambios
-- respecto a 217:
--   · v_sale ahora también lee store_id (para la ref CLP).
--   · Bloque CLP: cada cobro a plazos de venta recibe su ref (E si efectivo,
--     T en cualquier otro caso). Se añade al JSON de retorno.
-- ============================================================

CREATE OR REPLACE FUNCTION public.rpc_add_sale_payment(
  p_sale_id           uuid,
  p_payment_method    text,
  p_amount            numeric,
  p_reference         text DEFAULT NULL::text,
  p_next_payment_date date DEFAULT NULL::date,
  p_payment_date      date DEFAULT NULL::date,
  p_cash_session_id   uuid DEFAULT NULL::uuid,
  p_user_id           uuid DEFAULT NULL::uuid
)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_pay_row     RECORD;
  v_sale        RECORD;
  v_amount_paid NUMERIC(12,2);
  v_status      TEXT;
  v_base_amount NUMERIC(12,2);
  v_tax_amount  NUMERIC(12,2);
  v_session_id  UUID := p_cash_session_id;
  v_pay_date    DATE := COALESCE(p_payment_date, CURRENT_DATE);
  v_s           RECORD;
  v_expected    NUMERIC;
  v_diff        NUMERIC;
  v_internal_ref TEXT;             -- CLP (serie interna)
BEGIN
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'El importe debe ser mayor que 0';
  END IF;

  SELECT id, total, ticket_number, sale_type, store_id
    INTO v_sale
    FROM sales
   WHERE id = p_sale_id;
  IF v_sale.id IS NULL THEN
    RAISE EXCEPTION 'Venta no encontrada';
  END IF;

  -- 1. Insertar el cobro con su sesión (puede ser NULL → sin vincular)
  INSERT INTO sale_payments (
    sale_id, payment_method, amount, reference, next_payment_date, cash_session_id
  ) VALUES (
    p_sale_id, p_payment_method::payment_method_type, p_amount, p_reference, p_next_payment_date, v_session_id
  )
  RETURNING * INTO v_pay_row;

  -- 2. Recalcular amount_paid + payment_status de la venta
  SELECT COALESCE(SUM(amount), 0) INTO v_amount_paid
    FROM sale_payments WHERE sale_id = p_sale_id;

  v_status := CASE
    WHEN v_amount_paid >= v_sale.total THEN 'paid'
    WHEN v_amount_paid > 0            THEN 'partial'
    ELSE 'pending'
  END;

  UPDATE sales
     SET amount_paid = v_amount_paid, payment_status = v_status, updated_at = NOW()
   WHERE id = p_sale_id;

  -- 2b. Serie interna CLP: este cobro a plazos recibe su ref propia
  --     (E si efectivo; T en cualquier otro caso). NO fiscal.
  v_internal_ref := public.fn_assign_clp_ticket(
    (p_payment_method = 'cash'), p_amount, 'sale_installment',
    v_pay_row.id, p_sale_id, v_sale.store_id, v_session_id
  );

  -- 3 + 4. Solo si hay sesión: espejo con FK + sumar a la caja por método
  IF v_session_id IS NOT NULL THEN
    v_base_amount := p_amount / 1.21;
    v_tax_amount  := p_amount - v_base_amount;

    INSERT INTO manual_transactions (
      type, date, description, category,
      amount, tax_rate, tax_amount, total,
      notes, created_by, cash_session_id,
      sale_payment_id
    ) VALUES (
      'income',
      v_pay_date,
      'Cobro venta - Ticket ' || COALESCE(v_sale.ticket_number, p_sale_id::text),
      'boutique',
      v_base_amount, 21, v_tax_amount, p_amount,
      'Método: ' || p_payment_method || ' - Tipo: ' || COALESCE(v_sale.sale_type, ''),
      p_user_id,
      v_session_id,
      v_pay_row.id
    );

    UPDATE cash_sessions
       SET total_sales          = COALESCE(total_sales, 0)          + p_amount,
           total_cash_sales     = COALESCE(total_cash_sales, 0)
                                 + (CASE WHEN p_payment_method = 'cash'                  THEN p_amount ELSE 0 END),
           total_card_sales     = COALESCE(total_card_sales, 0)
                                 + (CASE WHEN p_payment_method = 'card'                  THEN p_amount ELSE 0 END),
           total_bizum_sales    = COALESCE(total_bizum_sales, 0)
                                 + (CASE WHEN p_payment_method = 'bizum'                 THEN p_amount ELSE 0 END),
           total_transfer_sales = COALESCE(total_transfer_sales, 0)
                                 + (CASE WHEN p_payment_method IN ('transfer','check')   THEN p_amount ELSE 0 END),
           updated_at = NOW()
     WHERE id = v_session_id;

    -- Si la sesión está cerrada, recalcular arqueo con la fórmula canónica
    -- (idéntica a rpc_remove_order_payment), usando los total_* ya actualizados.
    -- Evita la asimetría "add no recalcula pero remove sí" → sin descuadre latente.
    SELECT * INTO v_s FROM cash_sessions WHERE id = v_session_id;
    IF v_s.status = 'closed' THEN
      v_expected := COALESCE(v_s.opening_amount, 0) + COALESCE(v_s.total_cash_sales, 0)
                  - COALESCE(v_s.total_returns, 0) - COALESCE(v_s.total_withdrawals, 0);
      v_diff := COALESCE(v_s.counted_cash, 0) - v_expected;
      UPDATE cash_sessions
         SET expected_cash = v_expected, cash_difference = v_diff, updated_at = NOW()
       WHERE id = v_session_id;
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'id',                v_pay_row.id,
    'sale_id',           p_sale_id,
    'internal_ref',      v_internal_ref,
    'payment_method',    p_payment_method,
    'amount',            p_amount,
    'reference',         p_reference,
    'next_payment_date', p_next_payment_date,
    'created_at',        v_pay_row.created_at,
    'amount_paid',       v_amount_paid,
    'payment_status',    v_status,
    'cash_session_id',   v_session_id
  );
END;
$function$;

GRANT EXECUTE ON FUNCTION public.rpc_add_sale_payment(uuid, text, numeric, text, date, date, uuid, uuid) TO service_role, authenticated;
