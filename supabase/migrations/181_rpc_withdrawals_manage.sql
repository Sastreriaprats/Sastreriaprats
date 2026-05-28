-- ============================================================
-- Migración 181: permiso + RPCs para editar/borrar retiradas de caja.
--
-- El admin puede corregir el importe/motivo de una retirada ya registrada o
-- eliminarla, sin SQL manual. Ambas operaciones son atómicas, reajustan el
-- arqueo de la sesión (total_withdrawals y, si está cerrada, expected_cash y
-- cash_difference) y mantienen sincronizado el espejo manual_transactions
-- (vínculo determinista por withdrawal_id, migración 180).
--
-- Sin cerrojo de periodo: una retirada NO genera journal_entry (cerrar caja no
-- postea asiento), así que no hay is_period_closed que consultar. Editar una
-- retirada de sesión cerrada se PERMITE (recalcula el arqueo); el aviso de
-- "sesión cerrada" lo da la UI.
--
-- Idempotente: ON CONFLICT DO NOTHING / CREATE OR REPLACE.
-- ============================================================

-- ── Permiso ────────────────────────────────────────────────────────────────
INSERT INTO permissions (code, module, action, display_name, description, category, is_sensitive)
VALUES (
  'cash_withdrawals.manage',
  'cash_withdrawals',
  'manage',
  'Gestionar retiradas de caja',
  'Editar el importe/motivo o eliminar una retirada de caja ya registrada. Reajusta el arqueo de la sesión.',
  'Contabilidad',
  true
)
ON CONFLICT (code) DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
CROSS JOIN permissions p
WHERE r.name = 'administrador'
  AND p.code = 'cash_withdrawals.manage'
ON CONFLICT DO NOTHING;

-- ── RPC: editar retirada (importe y/o motivo) ───────────────────────────────
CREATE OR REPLACE FUNCTION public.rpc_update_withdrawal(
  p_withdrawal_id uuid,
  p_amount        numeric,
  p_reason        text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_wd     RECORD;
  v_delta  numeric;
BEGIN
  SELECT * INTO v_wd FROM cash_withdrawals WHERE id = p_withdrawal_id;
  IF v_wd.id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Retirada no encontrada.');
  END IF;

  IF p_amount IS NULL OR p_amount <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'El importe debe ser mayor que 0.');
  END IF;
  IF p_reason IS NULL OR btrim(p_reason) = '' THEN
    RETURN jsonb_build_object('success', false, 'error', 'El motivo no puede estar vacío.');
  END IF;

  v_delta := p_amount - v_wd.amount;

  UPDATE cash_withdrawals
     SET amount = p_amount, reason = p_reason
   WHERE id = p_withdrawal_id;

  -- Reajuste de caja. Las expresiones del SET usan los valores ANTIGUOS de la
  -- fila, así que (total_withdrawals + v_delta) ya es el valor nuevo.
  -- expected_cash/cash_difference solo se recalculan si la sesión está cerrada.
  UPDATE cash_sessions SET
    total_withdrawals = total_withdrawals + v_delta,
    expected_cash = CASE WHEN status = 'closed'
      THEN opening_amount + total_cash_sales
           - COALESCE(total_returns, 0) - (total_withdrawals + v_delta)
      ELSE expected_cash END,
    cash_difference = CASE WHEN status = 'closed'
      THEN COALESCE(counted_cash, 0)
           - ( opening_amount + total_cash_sales
               - COALESCE(total_returns, 0) - (total_withdrawals + v_delta) )
      ELSE cash_difference END,
    updated_at = now()
  WHERE id = v_wd.cash_session_id;

  -- Espejo contable (vínculo determinista por withdrawal_id, migración 180).
  -- (manual_transactions no tiene updated_at en prod, no se toca.)
  UPDATE manual_transactions SET
    amount      = p_amount,
    total       = p_amount,
    description = 'Retirada de caja: ' || p_reason
  WHERE withdrawal_id = p_withdrawal_id;

  RETURN jsonb_build_object(
    'success', true,
    'message', 'Retirada actualizada.',
    'updated', jsonb_build_object(
      'withdrawal_id', p_withdrawal_id,
      'amount', p_amount,
      'reason', p_reason,
      'delta', v_delta,
      'cash_session_id', v_wd.cash_session_id
    )
  );
END;
$$;

-- ── RPC: borrar retirada ────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.rpc_delete_withdrawal(
  p_withdrawal_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_wd RECORD;
BEGIN
  SELECT * INTO v_wd FROM cash_withdrawals WHERE id = p_withdrawal_id;
  IF v_wd.id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Retirada no encontrada.');
  END IF;

  -- Reajuste de caja ANTES del DELETE (usamos v_wd.amount ya capturado).
  UPDATE cash_sessions SET
    total_withdrawals = total_withdrawals - v_wd.amount,
    expected_cash = CASE WHEN status = 'closed'
      THEN opening_amount + total_cash_sales
           - COALESCE(total_returns, 0) - (total_withdrawals - v_wd.amount)
      ELSE expected_cash END,
    cash_difference = CASE WHEN status = 'closed'
      THEN COALESCE(counted_cash, 0)
           - ( opening_amount + total_cash_sales
               - COALESCE(total_returns, 0) - (total_withdrawals - v_wd.amount) )
      ELSE cash_difference END,
    updated_at = now()
  WHERE id = v_wd.cash_session_id;

  -- El espejo manual_transactions se borra solo por ON DELETE CASCADE (mig. 180).
  DELETE FROM cash_withdrawals WHERE id = p_withdrawal_id;

  RETURN jsonb_build_object(
    'success', true,
    'message', 'Retirada eliminada.',
    'deleted', jsonb_build_object(
      'withdrawal_id', p_withdrawal_id,
      'amount', v_wd.amount,
      'cash_session_id', v_wd.cash_session_id
    )
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.rpc_update_withdrawal(uuid, numeric, text) TO service_role, authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_delete_withdrawal(uuid) TO service_role, authenticated;
