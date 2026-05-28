-- ============================================================
-- Migración 182: permiso + RPCs para corregir/reabrir/borrar sesiones de caja.
--
-- El admin puede corregir el arqueo de una sesión cerrada (counted/opening/
-- notas/desglose), reabrirla, o borrar una sesión vacía, sin SQL manual.
--
-- Notas de diseño (de la investigación):
--  * manual_transactions NO tiene updated_at en prod -> no se escribe ahí.
--  * Reabrir DEBE bloquear si la tienda ya tiene otra sesión abierta (el TPV
--    usa .single() sobre la sesión abierta; dos abiertas lo romperían).
--  * Editar opening_amount sincroniza el manual_transactions "Apertura de caja".
--  * Borrar exige sesión vacía (sin ventas/retiradas/cobros y totales en 0) y
--    limpia el manual_transactions de apertura (FK SET NULL lo dejaría huérfano).
--  * Cerrojo de periodo: si algún asiento de las ventas de la sesión está en
--    periodo cerrado, se bloquea (consistencia con ventas).
--
-- Idempotente: ON CONFLICT DO NOTHING / CREATE OR REPLACE.
-- ============================================================

-- ── Permiso ────────────────────────────────────────────────────────────────
INSERT INTO permissions (code, module, action, display_name, description, category, is_sensitive)
VALUES (
  'cash_sessions.manage',
  'cash_sessions',
  'manage',
  'Gestionar sesiones de caja',
  'Corregir el arqueo (efectivo contado/fondo/notas), reabrir o borrar una sesión de caja cerrada.',
  'Contabilidad',
  true
)
ON CONFLICT (code) DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
CROSS JOIN permissions p
WHERE r.name = 'administrador'
  AND p.code = 'cash_sessions.manage'
ON CONFLICT DO NOTHING;

-- ── Helper interno: ¿la sesión tiene asientos de venta en periodo cerrado? ──
CREATE OR REPLACE FUNCTION public._cash_session_period_closed(p_session_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM sales s
    JOIN journal_entries je
      ON (je.reference_type = 'sale' AND je.reference_id = s.id)
      OR je.id = s.journal_entry_id
    WHERE s.cash_session_id = p_session_id
      AND je.is_period_closed = true
  );
$$;

-- ── RPC A: corregir el cierre (counted/notas/desglose) ─────────────────────
CREATE OR REPLACE FUNCTION public.rpc_update_cash_session_close(
  p_session_id       uuid,
  p_counted_cash     numeric,
  p_closing_notes    text,
  p_closing_breakdown jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_s        RECORD;
  v_expected numeric;
  v_diff     numeric;
BEGIN
  SELECT * INTO v_s FROM cash_sessions WHERE id = p_session_id;
  IF v_s.id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Sesión no encontrada.');
  END IF;
  IF v_s.status <> 'closed' THEN
    RETURN jsonb_build_object('success', false, 'error', 'La sesión no está cerrada; no hay arqueo que corregir.');
  END IF;
  IF p_counted_cash IS NULL OR p_counted_cash < 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'El efectivo contado no puede ser negativo.');
  END IF;
  IF public._cash_session_period_closed(p_session_id) THEN
    RETURN jsonb_build_object('success', false, 'error', 'El periodo contable está cerrado.');
  END IF;

  -- expected_cash es consecuencia de los movimientos: se recalcula, no se edita.
  v_expected := COALESCE(v_s.opening_amount, 0) + COALESCE(v_s.total_cash_sales, 0)
              - COALESCE(v_s.total_returns, 0) - COALESCE(v_s.total_withdrawals, 0);
  v_diff := p_counted_cash - v_expected;

  UPDATE cash_sessions SET
    counted_cash      = p_counted_cash,
    expected_cash     = v_expected,
    cash_difference   = v_diff,
    closing_notes     = p_closing_notes,
    closing_breakdown = p_closing_breakdown,
    updated_at        = now()
  WHERE id = p_session_id;

  RETURN jsonb_build_object(
    'success', true,
    'message', 'Arqueo corregido.',
    'updated', jsonb_build_object('counted_cash', p_counted_cash, 'expected_cash', v_expected, 'cash_difference', v_diff)
  );
END;
$$;

-- ── RPC B: reabrir sesión cerrada ──────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.rpc_reopen_cash_session(
  p_session_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_s RECORD;
BEGIN
  SELECT * INTO v_s FROM cash_sessions WHERE id = p_session_id;
  IF v_s.id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Sesión no encontrada.');
  END IF;
  IF v_s.status <> 'closed' THEN
    RETURN jsonb_build_object('success', false, 'error', 'La sesión no está cerrada.');
  END IF;

  -- Cerrojo OBLIGATORIO: una sola sesión abierta por tienda (el TPV depende de ello).
  IF EXISTS (
    SELECT 1 FROM cash_sessions
    WHERE store_id = v_s.store_id AND status = 'open' AND id <> p_session_id
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Ya hay una caja abierta en esta tienda. Ciérrala primero.');
  END IF;

  IF public._cash_session_period_closed(p_session_id) THEN
    RETURN jsonb_build_object('success', false, 'error', 'El periodo contable está cerrado.');
  END IF;

  UPDATE cash_sessions SET
    status            = 'open',
    closed_at         = NULL,
    closed_by         = NULL,
    counted_cash      = NULL,
    expected_cash     = NULL,
    cash_difference   = NULL,
    closing_notes     = NULL,
    closing_breakdown = NULL,
    updated_at        = now()
  WHERE id = p_session_id;

  RETURN jsonb_build_object('success', true, 'message', 'Sesión reabierta.');
END;
$$;

-- ── RPC C: corregir el fondo de apertura ───────────────────────────────────
CREATE OR REPLACE FUNCTION public.rpc_update_cash_session_opening(
  p_session_id        uuid,
  p_opening_amount    numeric,
  p_opening_breakdown jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_s        RECORD;
  v_expected numeric := NULL;
  v_diff     numeric := NULL;
BEGIN
  SELECT * INTO v_s FROM cash_sessions WHERE id = p_session_id;
  IF v_s.id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Sesión no encontrada.');
  END IF;
  IF p_opening_amount IS NULL OR p_opening_amount < 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'El fondo de apertura no puede ser negativo.');
  END IF;
  IF public._cash_session_period_closed(p_session_id) THEN
    RETURN jsonb_build_object('success', false, 'error', 'El periodo contable está cerrado.');
  END IF;

  IF v_s.status = 'closed' THEN
    v_expected := p_opening_amount + COALESCE(v_s.total_cash_sales, 0)
                - COALESCE(v_s.total_returns, 0) - COALESCE(v_s.total_withdrawals, 0);
    v_diff := COALESCE(v_s.counted_cash, 0) - v_expected;
  END IF;

  UPDATE cash_sessions SET
    opening_amount    = p_opening_amount,
    opening_breakdown = p_opening_breakdown,
    expected_cash     = CASE WHEN status = 'closed' THEN v_expected ELSE expected_cash END,
    cash_difference   = CASE WHEN status = 'closed' THEN v_diff ELSE cash_difference END,
    updated_at        = now()
  WHERE id = p_session_id;

  -- Sincronizar el espejo contable "Apertura de caja" (manual_transactions NO
  -- tiene updated_at -> no se toca).
  UPDATE manual_transactions SET
    amount = p_opening_amount,
    total  = p_opening_amount
  WHERE cash_session_id = p_session_id
    AND type = 'income' AND category = 'caja' AND description = 'Apertura de caja';

  RETURN jsonb_build_object(
    'success', true,
    'message', 'Fondo de apertura corregido.',
    'updated', jsonb_build_object('opening_amount', p_opening_amount, 'expected_cash', v_expected, 'cash_difference', v_diff)
  );
END;
$$;

-- ── RPC D: borrar sesión vacía ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.rpc_delete_cash_session(
  p_session_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_s RECORD;
BEGIN
  SELECT * INTO v_s FROM cash_sessions WHERE id = p_session_id;
  IF v_s.id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Sesión no encontrada.');
  END IF;

  IF EXISTS (SELECT 1 FROM sales WHERE cash_session_id = p_session_id) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Tiene ventas. No se puede borrar.');
  END IF;
  IF EXISTS (SELECT 1 FROM cash_withdrawals WHERE cash_session_id = p_session_id) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Tiene retiradas. Bórralas primero.');
  END IF;
  IF EXISTS (SELECT 1 FROM tailoring_order_payments WHERE cash_session_id = p_session_id) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Tiene cobros de pedidos vinculados.');
  END IF;
  IF COALESCE(v_s.total_sales, 0) <> 0 OR COALESCE(v_s.total_returns, 0) <> 0 OR COALESCE(v_s.total_withdrawals, 0) <> 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'La sesión tiene totales registrados (residuo de movimientos pasados). No se puede borrar.');
  END IF;
  IF v_s.status = 'open' THEN
    RETURN jsonb_build_object('success', false, 'error', 'La sesión está abierta. Ciérrala primero.');
  END IF;
  IF public._cash_session_period_closed(p_session_id) THEN
    RETURN jsonb_build_object('success', false, 'error', 'El periodo contable está cerrado.');
  END IF;

  -- Limpiar el espejo "Apertura de caja" (la FK SET NULL lo dejaría huérfano).
  DELETE FROM manual_transactions WHERE cash_session_id = p_session_id;
  DELETE FROM cash_sessions WHERE id = p_session_id;

  RETURN jsonb_build_object('success', true, 'message', 'Sesión eliminada.');
END;
$$;

GRANT EXECUTE ON FUNCTION public._cash_session_period_closed(uuid) TO service_role, authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_update_cash_session_close(uuid, numeric, text, jsonb) TO service_role, authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_reopen_cash_session(uuid) TO service_role, authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_update_cash_session_opening(uuid, numeric, jsonb) TO service_role, authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_delete_cash_session(uuid) TO service_role, authenticated;
