-- 291 · Ticket por cada COBRO de un pedido de sastrería (serie CLP-P).
--
-- Petición: cada entrega a cuenta / pago de un pedido debe tener su propio
-- ticket con el importe COBRADO (no el total del pedido), numerado, para
-- subirlo a Hacienda. El ticket además muestra total del pedido, pagado y
-- pendiente (eso lo pinta la app; aquí solo la numeración).
--
-- · Serie propia 'P' en cash_internal_tickets → CLP-P-2026-0001, correlativa
--   por año del cobro. No se mezcla con los tickets de venta (E/T).
-- · Cobros hechos DENTRO de un ticket del TPV (línea "Cobro pendiente - PIN…")
--   NO reciben número: su ticket es el de la venta (CLP-E/T). Se enlazan con
--   tailoring_order_payments.sale_id.
-- · Reversos / borrados NO liberan número (igual que la serie CLP de ventas).
-- · Backfill: todos los cobros existentes, por orden de fecha.

-- 1. Columnas en el cobro ---------------------------------------------------
ALTER TABLE public.tailoring_order_payments
  ADD COLUMN IF NOT EXISTS ticket_number text UNIQUE,
  ADD COLUMN IF NOT EXISTS sale_id uuid REFERENCES public.sales(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.tailoring_order_payments.ticket_number IS
  'Nº de ticket del cobro (serie CLP-P). NULL si el cobro se hizo dentro de un ticket del TPV (ver sale_id).';
COMMENT ON COLUMN public.tailoring_order_payments.sale_id IS
  'Venta del TPV en cuyo ticket se cobró este pago (su ticket es el de la venta).';

-- 2. Serie P permitida -------------------------------------------------------
ALTER TABLE public.cash_internal_tickets DROP CONSTRAINT IF EXISTS cash_internal_tickets_series_check;
ALTER TABLE public.cash_internal_tickets
  ADD CONSTRAINT cash_internal_tickets_series_check CHECK (series = ANY (ARRAY['E'::bpchar, 'T'::bpchar, 'P'::bpchar]));

-- 3. Asignar número a un cobro ----------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_assign_order_payment_ticket(p_payment_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_pay   RECORD;
  v_year  integer;
  v_seq   integer;
  v_ref   text;
BEGIN
  SELECT p.*, o.store_id AS order_store_id
    INTO v_pay
    FROM tailoring_order_payments p
    JOIN tailoring_orders o ON o.id = p.tailoring_order_id
   WHERE p.id = p_payment_id;

  IF v_pay.id IS NULL OR v_pay.amount IS NULL OR v_pay.amount <= 0 THEN
    RETURN NULL;
  END IF;
  -- Ya numerado o cobrado dentro de un ticket del TPV: no consume número.
  IF v_pay.ticket_number IS NOT NULL THEN
    RETURN v_pay.ticket_number;
  END IF;
  IF v_pay.sale_id IS NOT NULL THEN
    RETURN NULL;
  END IF;

  v_year := EXTRACT(YEAR FROM COALESCE(v_pay.payment_date, CURRENT_DATE))::integer;

  PERFORM pg_advisory_xact_lock(hashtext('clp_ticket_P_' || v_year));

  SELECT COALESCE(MAX(seq), 0) + 1 INTO v_seq
    FROM cash_internal_tickets
   WHERE series = 'P' AND year = v_year;

  v_ref := 'CLP-P-' || v_year::text || '-' || LPAD(v_seq::text, 4, '0');

  INSERT INTO cash_internal_tickets (ref, series, year, seq, source, source_id, sale_id, amount, store_id, cash_session_id)
  VALUES (v_ref, 'P', v_year, v_seq, 'order', v_pay.id, NULL, v_pay.amount, v_pay.order_store_id, v_pay.cash_session_id);

  UPDATE tailoring_order_payments SET ticket_number = v_ref WHERE id = v_pay.id;

  RETURN v_ref;
END;
$function$;

-- 4. rpc_add_order_payment: + p_sale_id y numeración del cobro ---------------
-- Base = definición VIVA (mig 237). Único cambio: parámetro p_sale_id (cobro
-- hecho en un ticket del TPV) y el paso 2b, que ahora asigna CLP-P.
DROP FUNCTION IF EXISTS public.rpc_add_order_payment(uuid, date, text, numeric, text, text, date, uuid, uuid);

CREATE OR REPLACE FUNCTION public.rpc_add_order_payment(
  p_tailoring_order_id uuid,
  p_payment_date date,
  p_payment_method text,
  p_amount numeric,
  p_reference text DEFAULT NULL::text,
  p_notes text DEFAULT NULL::text,
  p_next_payment_date date DEFAULT NULL::date,
  p_store_id uuid DEFAULT NULL::uuid,
  p_user_id uuid DEFAULT NULL::uuid,
  p_sale_id uuid DEFAULT NULL::uuid
)
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
  v_internal_ref     TEXT;          -- nº de ticket del cobro (CLP-P)
BEGIN

  IF p_amount <= 0 THEN
    RAISE EXCEPTION 'El importe debe ser mayor que 0';
  END IF;

  -- 0. Localizar la sesión de caja cuyo rango temporal cubre p_payment_date.
  IF p_store_id IS NOT NULL THEN
    SELECT id INTO v_session_id
    FROM cash_sessions
    WHERE store_id = p_store_id
      AND status = 'open'
      AND opened_at::date <= p_payment_date
    ORDER BY opened_at DESC
    LIMIT 1;

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
    cash_session_id, sale_id
  ) VALUES (
    p_tailoring_order_id, p_payment_date, p_payment_method,
    p_amount, p_reference, p_notes, p_next_payment_date, p_user_id,
    v_session_id, p_sale_id
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

  -- 2b. Ticket del cobro (CLP-P). Si se cobró en un ticket del TPV (p_sale_id),
  --     no consume número: su ticket es el de la venta.
  v_internal_ref := public.fn_assign_order_payment_ticket(v_payment_id);

  -- 3 + 4. Solo si hemos podido vincular a una sesión
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
    'ticket_number',       v_internal_ref,
    'sale_id',             p_sale_id,
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

-- 5. Backfill ----------------------------------------------------------------
-- 5a. Cobros hechos dentro de un ticket del TPV: emparejar 1:1 con su línea de
--     cobro (mismo pedido + misma caja + mismo importe) y guardar sale_id.
DO $$
DECLARE
  r RECORD;
  v_sale uuid;
  v_used uuid[] := ARRAY[]::uuid[];
  v_line uuid;
BEGIN
  FOR r IN
    SELECT id, tailoring_order_id, cash_session_id, amount
      FROM tailoring_order_payments
     WHERE sale_id IS NULL
     ORDER BY payment_date, created_at
  LOOP
    SELECT sl.id, sl.sale_id INTO v_line, v_sale
      FROM sale_lines sl
      JOIN sales s ON s.id = sl.sale_id
     WHERE sl.tailoring_order_id = r.tailoring_order_id
       AND s.cash_session_id IS NOT DISTINCT FROM r.cash_session_id
       AND abs(sl.line_total - r.amount) < 0.01
       AND NOT (sl.id = ANY (v_used))
     ORDER BY s.created_at
     LIMIT 1;
    IF v_line IS NOT NULL THEN
      v_used := v_used || v_line;
      UPDATE tailoring_order_payments SET sale_id = v_sale WHERE id = r.id;
    END IF;
    v_line := NULL; v_sale := NULL;
  END LOOP;
END $$;

-- 5b. Numerar el resto por orden de fecha del cobro.
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT id FROM tailoring_order_payments
     WHERE ticket_number IS NULL AND sale_id IS NULL AND amount > 0
     ORDER BY payment_date, created_at, id
  LOOP
    PERFORM public.fn_assign_order_payment_ticket(r.id);
  END LOOP;
END $$;
