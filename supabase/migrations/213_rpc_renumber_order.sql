-- ============================================================
-- Migración 213 — R8: renumerar pedido (cambio de tienda) CON cobros, atómico
--
-- Renumerar un pedido cambia su order_number. Los espejos de caja
-- (manual_transactions de sus cobros) llevan el nº VIEJO en description/notes.
-- `rpc_update_tailoring_payment` (editar cobro) localiza el espejo por TEXTO del
-- nº → si no se refresca, tras renumerar editar un cobro haría DOBLE espejo.
--
-- Esta RPC hace AMBAS cosas en UNA transacción (atómico): renumera + refresca el
-- texto de los espejos del pedido al nº nuevo. Cubre:
--   - espejos CON FK (tailoring_order_payment_id): refresco cosmético + deja bien
--     rpc_update_tailoring_payment (text-based).
--   - espejos SIN FK: el fallback por texto de rpc_remove_order_payment pasa a
--     encontrar el nº nuevo.
-- Si falla cualquiera de los dos UPDATE, no se aplica ninguno (transacción única).
-- ============================================================

CREATE OR REPLACE FUNCTION public.rpc_renumber_order(p_order_id uuid, p_new_number text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_old          TEXT;
  v_mt_refreshed INT := 0;
BEGIN
  SELECT order_number INTO v_old FROM tailoring_orders WHERE id = p_order_id;
  IF v_old IS NULL THEN
    RAISE EXCEPTION 'Pedido no encontrado: %', p_order_id;
  END IF;

  -- 1) renumerar el pedido
  UPDATE tailoring_orders SET order_number = p_new_number WHERE id = p_order_id;

  -- 2) refrescar el texto de los espejos de caja de ESE pedido (misma transacción).
  --    FK del espejo: localiza por id del pago (no por nº) → solo refresco de texto.
  --    Sin FK: el match por texto (acotado a v_old) hace que el fallback encuentre el nº nuevo.
  UPDATE manual_transactions
  SET description = replace(description, v_old, p_new_number),
      notes       = replace(notes,       v_old, p_new_number)
  WHERE tailoring_order_payment_id IN (
          SELECT id FROM tailoring_order_payments WHERE tailoring_order_id = p_order_id)
     OR (category = 'sastreria' AND type = 'income'
         AND (description LIKE '%' || v_old || '%' OR notes LIKE '%' || v_old || '%'));
  GET DIAGNOSTICS v_mt_refreshed = ROW_COUNT;

  RETURN jsonb_build_object(
    'order_number',      p_new_number,
    'old_number',        v_old,
    'mirrors_refreshed', v_mt_refreshed
  );
END;
$function$;

GRANT EXECUTE ON FUNCTION public.rpc_renumber_order(uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.rpc_renumber_order(uuid, text) TO authenticated;
