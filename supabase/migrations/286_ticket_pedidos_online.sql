-- ============================================================================
-- 286 · TICKET (NO FACTURA) EN LOS PEDIDOS ONLINE
-- ----------------------------------------------------------------------------
-- Petición de David (17-sep-2026): a partir de ahora, un pedido online pagado
-- genera un TICKET en vez de la factura W automática (mig 257).
--
-- Decisiones:
--   · Numeración: la serie oficial de tickets CLP-T (regla de la mig 234: todo
--     cobro que no es 100% efectivo va a la T). Mismo candado que
--     fn_assign_clp_ticket para no chocar con los tickets de tienda.
--   · Tienda "Tienda Online" (código WEB) y SIN caja: el cobro va a la pasarela,
--     no a un cajón. No entra en ningún arqueo.
--   · NO se crea fila en `sales`: la venta online sigue viviendo en
--     online_orders (informes, objetivos, fichas de cliente ya la leen de ahí).
--     Meterla en `sales` la duplicaría en todos ellos. El ticket es el número
--     CLP (cash_internal_tickets, source='online_order') + online_orders.ticket_ref.
--
-- fn_assign_clp_ticket no sirve tal cual: devuelve NULL si source <> 'sale'
-- (mig 241). Se replica su lógica aquí con el MISMO advisory lock.
--
-- Los pedidos anteriores conservan su factura W. Esta función se niega a
-- numerar un pedido que ya tenga factura vigente: sería documentar dos veces.
-- ============================================================================

ALTER TABLE public.online_orders
  ADD COLUMN IF NOT EXISTS ticket_ref       text,
  ADD COLUMN IF NOT EXISTS ticket_issued_at timestamptz;

CREATE UNIQUE INDEX IF NOT EXISTS uq_online_orders_ticket_ref
  ON public.online_orders (ticket_ref) WHERE ticket_ref IS NOT NULL;

-- Un solo número CLP por pedido online (los webhooks reintentan).
CREATE UNIQUE INDEX IF NOT EXISTS uq_cash_internal_tickets_online_order
  ON public.cash_internal_tickets (source_id) WHERE source = 'online_order';

CREATE OR REPLACE FUNCTION public.rpc_issue_online_order_ticket(p_order_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order  public.online_orders%ROWTYPE;
  v_store  uuid;
  v_year   integer := EXTRACT(YEAR FROM CURRENT_DATE)::integer;
  v_seq    integer;
  v_ref    text;
BEGIN
  SELECT * INTO v_order FROM public.online_orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Pedido online no encontrado');
  END IF;

  IF v_order.ticket_ref IS NOT NULL THEN
    RETURN jsonb_build_object('ok', true, 'skipped', true, 'ticket_ref', v_order.ticket_ref);
  END IF;

  IF v_order.paid_at IS NULL OR v_order.status NOT IN ('paid', 'processing', 'shipped', 'delivered') THEN
    RETURN jsonb_build_object('ok', true, 'skipped', true, 'reason', 'Pedido no cobrado o cancelado');
  END IF;

  IF COALESCE(v_order.total, 0) <= 0 THEN
    RETURN jsonb_build_object('ok', true, 'skipped', true, 'reason', 'Pedido sin importe');
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.invoices
     WHERE online_order_id = p_order_id AND status <> 'cancelled'
  ) THEN
    RETURN jsonb_build_object('ok', true, 'skipped', true, 'reason', 'El pedido ya tiene factura W');
  END IF;

  SELECT id INTO v_store FROM public.stores WHERE code = 'WEB' LIMIT 1;

  -- Mismo candado que fn_assign_clp_ticket (serie T del año).
  PERFORM pg_advisory_xact_lock(hashtext('clp_ticket_T_' || v_year));

  SELECT COALESCE(MAX(seq), 0) + 1
    INTO v_seq
    FROM public.cash_internal_tickets
   WHERE series = 'T' AND year = v_year;

  v_ref := 'CLP-T-' || v_year::text || '-' || LPAD(v_seq::text, 4, '0');

  INSERT INTO public.cash_internal_tickets (
    ref, series, year, seq, source, source_id, sale_id, amount, store_id, cash_session_id
  ) VALUES (
    v_ref, 'T', v_year, v_seq, 'online_order', p_order_id, NULL, v_order.total, v_store, NULL
  );

  UPDATE public.online_orders
     SET ticket_ref = v_ref, ticket_issued_at = now()
   WHERE id = p_order_id;

  RETURN jsonb_build_object('ok', true, 'ticket_ref', v_ref);
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_issue_online_order_ticket(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_issue_online_order_ticket(uuid) TO service_role;
