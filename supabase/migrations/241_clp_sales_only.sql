-- ============================================================
-- Migración 241 — el CLP es el número de TICKET (solo ventas)
--
-- El CLP pasa a ser el número de ticket oficial. Solo se asigna a ventas
-- (source='sale'); los cobros de pedido/reserva/plazo ya no consumen número,
-- así la serie de tickets queda limpia y sin huecos. Redefine el helper
-- añadiendo el corte por source; el resto es idéntico a la mig 234.
-- ============================================================

CREATE OR REPLACE FUNCTION public.fn_assign_clp_ticket(
  p_all_cash        boolean,
  p_amount          numeric,
  p_source          text,
  p_source_id       uuid,
  p_sale_id         uuid,
  p_store_id        uuid,
  p_cash_session_id uuid
) RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_series char(1) := CASE WHEN p_all_cash THEN 'E' ELSE 'T' END;
  v_year   integer := EXTRACT(YEAR FROM CURRENT_DATE)::integer;
  v_seq    integer;
  v_ref    text;
BEGIN
  -- El CLP es el nº de ticket: solo ventas. Otros cobros no consumen número.
  IF p_source <> 'sale' THEN
    RETURN NULL;
  END IF;
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RETURN NULL;
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('clp_ticket_' || v_series || '_' || v_year));

  SELECT COALESCE(MAX(seq), 0) + 1
    INTO v_seq
    FROM public.cash_internal_tickets
   WHERE series = v_series
     AND year   = v_year;

  v_ref := 'CLP-' || v_series || '-' || v_year::text || '-' || LPAD(v_seq::text, 4, '0');

  INSERT INTO public.cash_internal_tickets (
    ref, series, year, seq, source, source_id, sale_id, amount, store_id, cash_session_id
  ) VALUES (
    v_ref, v_series, v_year, v_seq, p_source, p_source_id, p_sale_id, p_amount, p_store_id, p_cash_session_id
  );

  RETURN v_ref;
END;
$$;
