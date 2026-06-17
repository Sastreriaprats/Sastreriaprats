-- ============================================================
-- Migración 216 — R2(A): reembolsar los cobros al cancelar un pedido
--
-- Hoy cancelar un pedido pagado deja los cobros/espejos vivos (no reembolsa).
-- _revert_order_money reusa el reverso ya probado rpc_remove_order_payment (mig
-- 210) en un wrapper ATÓMICO: al ir todos los PERFORM dentro de esta función =
-- una sola transacción = todo-o-nada (si uno fallara, revierte entero).
--
--  GUARD (lo PRIMERO): un pedido 'delivered' (entregado al cliente) NO se
--  reembolsa al cancelar (el cliente ya tiene la prenda; la devolución de caja la
--  registra el admin a mano como gasto). Se evalúa con el estado REAL del pedido
--  (la ruta de cancelación llama a esta función ANTES de marcar 'cancelled').
--  total_paid=0 -> no-op. Tras revertir, total_paid lo recalcula rpc_remove y
--  total_pending da 0 por la columna generada (mig 215).
-- ============================================================

CREATE OR REPLACE FUNCTION public._revert_order_money(p_order_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_order  RECORD;
  v_pay    RECORD;
  v_n      INT := 0;
  v_total  NUMERIC := 0;
BEGIN
  SELECT id, status, total_paid INTO v_order
  FROM tailoring_orders WHERE id = p_order_id;
  IF v_order.id IS NULL THEN
    RETURN jsonb_build_object('reverted', false, 'reason', 'not_found');
  END IF;

  -- GUARD (lo PRIMERO): pedido ENTREGADO -> NO reembolsar.
  IF v_order.status = 'delivered'::tailoring_order_status THEN
    RETURN jsonb_build_object('reverted', false, 'reason', 'delivered');
  END IF;

  -- Sin cobros -> no-op (sin error).
  IF COALESCE(v_order.total_paid, 0) <= 0 THEN
    RETURN jsonb_build_object('reverted', false, 'reason', 'no_payments');
  END IF;

  -- Reusar el reverso probado por cada cobro (reajusta sesión por método + arqueo
  -- cerrado + borra el espejo por FK). Todo en esta transacción => atómico.
  FOR v_pay IN
    SELECT id, amount FROM tailoring_order_payments WHERE tailoring_order_id = p_order_id
  LOOP
    PERFORM rpc_remove_order_payment(v_pay.id);
    v_n := v_n + 1;
    v_total := v_total + COALESCE(v_pay.amount, 0);
  END LOOP;

  RETURN jsonb_build_object('reverted', true, 'payments_reverted', v_n, 'amount_reverted', v_total);
END;
$function$;

GRANT EXECUTE ON FUNCTION public._revert_order_money(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public._revert_order_money(uuid) TO authenticated;
