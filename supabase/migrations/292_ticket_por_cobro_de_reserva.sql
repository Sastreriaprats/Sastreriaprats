-- 292 · Ticket por cada COBRO de una reserva (serie CLP-R).
--
-- Petición de David (24-sep-2026), a raíz de RSV-2026-0169: se cobraron 660 €
-- de una reserva y no había ningún papel que enseñara ese cobro. El ticket de
-- la recogida sale a 0 € (el TPV descuenta lo ya pagado), así que el dinero
-- solo figuraba como una línea suelta "Reserva RSV-…" en contabilidad.
--
-- Mismo criterio que la 291 hizo con los cobros de pedidos de sastrería: cada
-- cobro lleva su propio ticket numerado, imprimible y correlativo por año.
--
-- · Serie propia 'R' en cash_internal_tickets → CLP-R-2026-0001. No se mezcla
--   con los tickets de venta (E/T) ni con los de cobro de pedido (P).
-- · Se asigna por TRIGGER y no desde las RPC: los cobros de reserva entran por
--   dos funciones distintas (rpc_add_reservation_payment y las dos sobrecargas
--   de rpc_create_reservation, con el pago inicial). Con el trigger quedan
--   cubiertos todos los caminos, presentes y futuros, sin reescribir 15 KB de
--   PL/pgSQL que hoy funcionan.
-- · Reversos / borrados NO liberan número (igual que las series E/T y P).
-- · Backfill: todos los cobros existentes, por orden de fecha.
--
-- OJO: `fn_assign_clp_ticket` se llamaba ya desde las dos RPC con
-- p_source='reservation', pero esa función devuelve NULL para todo lo que no
-- sea una venta ("El CLP es el nº de ticket: solo ventas"), así que la llamada
-- no hacía nada. Se deja como está: quien numera ahora es este trigger.

-- 1. Columna en el cobro -----------------------------------------------------
ALTER TABLE public.product_reservation_payments
  ADD COLUMN IF NOT EXISTS ticket_number text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'product_reservation_payments_ticket_number_key'
  ) THEN
    ALTER TABLE public.product_reservation_payments
      ADD CONSTRAINT product_reservation_payments_ticket_number_key UNIQUE (ticket_number);
  END IF;
END $$;

COMMENT ON COLUMN public.product_reservation_payments.ticket_number IS
  'Nº de ticket del cobro de la reserva (serie CLP-R), correlativo por año del cobro.';

-- 2. Serie R permitida -------------------------------------------------------
ALTER TABLE public.cash_internal_tickets DROP CONSTRAINT IF EXISTS cash_internal_tickets_series_check;
ALTER TABLE public.cash_internal_tickets
  ADD CONSTRAINT cash_internal_tickets_series_check
  CHECK (series = ANY (ARRAY['E'::bpchar, 'T'::bpchar, 'P'::bpchar, 'R'::bpchar]));

-- 3. Asignar número a un cobro de reserva ------------------------------------
CREATE OR REPLACE FUNCTION public.fn_assign_reservation_payment_ticket()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_year     integer;
  v_seq      integer;
  v_ref      text;
  v_store_id uuid;
BEGIN
  -- Ya numerado (backfill, reimportación) o sin importe: no consume número.
  IF NEW.ticket_number IS NOT NULL THEN
    RETURN NEW;
  END IF;
  IF NEW.amount IS NULL OR NEW.amount <= 0 THEN
    RETURN NEW;
  END IF;

  SELECT store_id INTO v_store_id
    FROM product_reservations
   WHERE id = NEW.product_reservation_id;

  v_year := EXTRACT(YEAR FROM COALESCE(NEW.payment_date, CURRENT_DATE))::integer;

  PERFORM pg_advisory_xact_lock(hashtext('clp_ticket_R_' || v_year));

  SELECT COALESCE(MAX(seq), 0) + 1 INTO v_seq
    FROM cash_internal_tickets
   WHERE series = 'R' AND year = v_year;

  v_ref := 'CLP-R-' || v_year::text || '-' || LPAD(v_seq::text, 4, '0');

  INSERT INTO cash_internal_tickets (
    ref, series, year, seq, source, source_id, sale_id, amount, store_id, cash_session_id
  ) VALUES (
    v_ref, 'R', v_year, v_seq, 'reservation', NEW.id, NULL, NEW.amount, v_store_id, NEW.cash_session_id
  );

  NEW.ticket_number := v_ref;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trigger_reservation_payment_ticket ON public.product_reservation_payments;
CREATE TRIGGER trigger_reservation_payment_ticket
  BEFORE INSERT ON public.product_reservation_payments
  FOR EACH ROW EXECUTE FUNCTION public.fn_assign_reservation_payment_ticket();

-- 4. Backfill ----------------------------------------------------------------
-- Los cobros ya existentes, numerados por orden de fecha (y de creación para
-- desempatar), de modo que la serie quede cronológica.
DO $$
DECLARE
  r        RECORD;
  v_year   integer;
  v_seq    integer;
  v_ref    text;
  v_store  uuid;
BEGIN
  FOR r IN
    SELECT p.id, p.amount, p.payment_date, p.cash_session_id, p.product_reservation_id
      FROM product_reservation_payments p
     WHERE p.ticket_number IS NULL
       AND p.amount > 0
     ORDER BY p.payment_date, p.created_at, p.id
  LOOP
    v_year := EXTRACT(YEAR FROM COALESCE(r.payment_date, CURRENT_DATE))::integer;

    SELECT COALESCE(MAX(seq), 0) + 1 INTO v_seq
      FROM cash_internal_tickets
     WHERE series = 'R' AND year = v_year;

    v_ref := 'CLP-R-' || v_year::text || '-' || LPAD(v_seq::text, 4, '0');

    SELECT store_id INTO v_store FROM product_reservations WHERE id = r.product_reservation_id;

    INSERT INTO cash_internal_tickets (
      ref, series, year, seq, source, source_id, sale_id, amount, store_id, cash_session_id
    ) VALUES (
      v_ref, 'R', v_year, v_seq, 'reservation', r.id, NULL, r.amount, v_store, r.cash_session_id
    );

    UPDATE product_reservation_payments SET ticket_number = v_ref WHERE id = r.id;
  END LOOP;
END $$;
