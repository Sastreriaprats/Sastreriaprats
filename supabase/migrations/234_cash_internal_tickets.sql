-- ============================================================
-- Migración 234 — Serie interna CLP de tickets de caja
--
-- Control INTERNO (NO fiscal, NO toca sales.ticket_number ni invoices):
-- cada COBRO que entra en caja recibe una referencia CLP con DOS series
-- independientes según el método de pago:
--   · Serie E  (CLP-E-AAAA-NNNN)  -> el cobro es 100% EFECTIVO
--   · Serie T  (CLP-T-AAAA-NNNN)  -> cualquier otro caso
--                                    (tarjeta, transferencia, bizum, vale o MIXTO)
--
-- Reinicio anual (como TICK). Numeración atómica (advisory lock por serie+año)
-- y sin huecos (MAX(seq)+1 recalculado dentro de la transacción: si el cobro
-- revierte, no deja salto).
--
-- Reversos/ediciones/devoluciones NO consumen ni anulan CLP: el número queda
-- como histórico del cobro emitido.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.cash_internal_tickets (
  id               uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  ref              text          NOT NULL,
  series           char(1)       NOT NULL CHECK (series IN ('E', 'T')),
  year             integer       NOT NULL,
  seq              integer       NOT NULL,
  source           text          NOT NULL,   -- 'sale' | 'sale_installment' | 'order' | 'reservation'
  source_id        uuid,                      -- id del pago/venta de origen (polimórfico)
  sale_id          uuid          REFERENCES public.sales(id) ON DELETE SET NULL,
  amount           numeric(12,2) NOT NULL,
  store_id         uuid,
  cash_session_id  uuid,
  created_at       timestamptz   NOT NULL DEFAULT now(),
  CONSTRAINT cash_internal_tickets_ref_key        UNIQUE (ref),
  CONSTRAINT cash_internal_tickets_series_seq_key UNIQUE (series, year, seq)
);

CREATE INDEX IF NOT EXISTS idx_cash_internal_tickets_session ON public.cash_internal_tickets (cash_session_id);
CREATE INDEX IF NOT EXISTS idx_cash_internal_tickets_sale    ON public.cash_internal_tickets (sale_id);
CREATE INDEX IF NOT EXISTS idx_cash_internal_tickets_series  ON public.cash_internal_tickets (series, year, seq);

-- ------------------------------------------------------------
-- Helper compartido: asigna el siguiente CLP de la serie correspondiente.
-- Lo llaman las 5 RPC de cobro. Devuelve la ref (o NULL si amount <= 0).
-- ------------------------------------------------------------
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
  -- Sin cobro real => sin ticket interno (p. ej. venta creada como pendiente).
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RETURN NULL;
  END IF;

  -- Serializa esta serie+año: dos cajas concurrentes no toman el mismo número.
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

GRANT EXECUTE ON FUNCTION public.fn_assign_clp_ticket(boolean, numeric, text, uuid, uuid, uuid, uuid) TO service_role, authenticated;
