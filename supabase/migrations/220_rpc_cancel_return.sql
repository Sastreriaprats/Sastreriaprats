-- ============================================================
-- Migración 220 — R6 pieza 2: rpc_cancel_return (reverso real de una devolución).
--
-- A) CREATE OR REPLACE rpc_preview_return_cancellation: AÑADE el guard de MAPEO
--    — si la venta original tiene >1 return, no se puede saber qué líneas son de
--    ESTE return (no hay return_lines) → ambiguo → BLOQUEA. Hoy 0 ventas tienen
--    >1 return (preventivo). El resto del preview, idéntico a mig 219.
--
-- B) CREATE rpc_cancel_return(p_return_id): el reverso. LLAMA al preview y aborta
--    si no es anulable (guard único, sin duplicar). Para un return ANULABLE
--    revierte las 4 cosas ATÓMICAMENTE (la RPC es una transacción):
--      1. STOCK: deshace los movements 'return' (stock_levels -= qty + borra mov).
--      2. CAJA (solo cash con sesión): total_returns -= , total_sales += , arqueo
--         canónico si la sesión está cerrada. Sin espejo FK (no existe).
--      3. VALE (solo voucher): status='cancelled', remaining=0 (guard = intacto).
--      4. RESTAURAR VENTA: sale_lines devueltas → quantity_returned=0/returned_at
--         null; sales.status → completed (no quedan devueltas, garantizado por el
--         guard de 1 return) + total_returned -= . Luego borra el return.
-- ============================================================

-- ── A) preview + guard de mapeo ──────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.rpc_preview_return_cancellation(p_return_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_ret      RECORD;
  v_sale     RECORD;
  v_voucher  RECORD;
  v_voucher_code text := NULL;
  v_session_status text := NULL;
  v_invoice  RECORD;
  v_blockers text[] := '{}';
  v_warnings text[] := '{}';
  v_stock    jsonb;
BEGIN
  SELECT * INTO v_ret FROM returns WHERE id = p_return_id;
  IF v_ret.id IS NULL THEN
    RETURN jsonb_build_object('error', 'Devolución no encontrada');
  END IF;

  SELECT * INTO v_sale FROM sales WHERE id = v_ret.original_sale_id;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'product_variant_id', sm.product_variant_id,
           'warehouse_id',       sm.warehouse_id,
           'quantity',           sm.quantity)), '[]'::jsonb)
  INTO v_stock
  FROM stock_movements sm
  WHERE sm.reference_type = 'return' AND sm.reference_id = p_return_id;

  -- ── Clasificación por tipo ────────────────────────────────────────────────
  IF v_ret.return_type = 'voucher' THEN
    SELECT * INTO v_voucher FROM vouchers WHERE id = v_ret.voucher_id;
    v_voucher_code := v_voucher.code; -- capturar para el RETURN (no referenciar el record fuera del branch)
    IF v_ret.voucher_id IS NULL OR v_voucher.id IS NULL THEN
      v_blockers := array_append(v_blockers, 'La devolución por vale no tiene vale asociado (dato inconsistente).');
    ELSIF v_voucher.status = 'active' AND v_voucher.remaining_amount = v_voucher.original_amount THEN
      NULL; -- vale intacto → ANULABLE
    ELSIF v_voucher.status = 'cancelled' THEN
      v_blockers := array_append(v_blockers,
        'El vale de la devolución (' || COALESCE(v_voucher.code, '?') || ') ya está cancelado; la devolución pudo deshacerse antes.');
    ELSE
      v_blockers := array_append(v_blockers,
        'El vale de la devolución (' || COALESCE(v_voucher.code, '?') || ') ya se ha canjeado (estado: ' || v_voucher.status || '). No se puede anular.');
    END IF;

  ELSIF v_ret.return_type = 'exchange' THEN
    v_blockers := array_append(v_blockers,
      'Es un cambio por otro producto. Anula la venta del cambio aparte antes de deshacer.');

  ELSIF v_ret.return_type = 'cash' THEN
    IF v_ret.cash_session_id IS NULL THEN
      v_blockers := array_append(v_blockers,
        'Devolución en efectivo sin sesión de caja registrada. Deshazla manualmente.');
    ELSE
      SELECT status INTO v_session_status FROM cash_sessions WHERE id = v_ret.cash_session_id;
      IF v_session_status IS NULL THEN
        v_blockers := array_append(v_blockers, 'La sesión de caja de la devolución ya no existe.');
      ELSIF v_session_status = 'closed' THEN
        v_warnings := array_append(v_warnings,
          'La caja de la devolución está cerrada; al anular se recalculará su arqueo.');
      END IF;
    END IF;

  ELSE
    v_blockers := array_append(v_blockers, 'Tipo de devolución desconocido: ' || COALESCE(v_ret.return_type, '(null)'));
  END IF;

  -- ── Guards generales ──────────────────────────────────────────────────────
  IF v_sale.id IS NULL THEN
    v_blockers := array_append(v_blockers, 'La venta original ya no existe; no se puede restaurar su estado.');
  END IF;

  -- Guard de MAPEO (R6 pieza 2): si la venta tiene >1 return, no se puede saber
  -- qué líneas son de ESTE return (no hay return_lines) → ambiguo → bloquear.
  IF (SELECT COUNT(*) FROM returns WHERE original_sale_id = v_ret.original_sale_id) > 1 THEN
    v_blockers := array_append(v_blockers,
      'La venta tiene varias devoluciones; no se puede determinar con certeza qué líneas restaurar. Deshazla manualmente.');
  END IF;

  SELECT * INTO v_invoice FROM invoices WHERE sale_id = v_ret.original_sale_id LIMIT 1;
  IF v_invoice.id IS NOT NULL AND v_invoice.verifactu_sent = true THEN
    v_warnings := array_append(v_warnings,
      'La venta tiene factura enviada a Hacienda (Verifactu). Anular la devolución cambia el estado de la venta; revisa implicaciones fiscales.');
  END IF;

  RETURN jsonb_build_object(
    'return_id',      v_ret.id,
    'return_type',    v_ret.return_type,
    'total_returned', v_ret.total_returned,
    'sale', CASE WHEN v_sale.id IS NOT NULL
      THEN jsonb_build_object('id', v_sale.id, 'ticket_number', v_sale.ticket_number, 'status', v_sale.status)
      ELSE NULL END,
    'reverts', jsonb_build_object(
      'stock_back_to_sold', v_stock,
      'cash', CASE WHEN v_ret.return_type = 'cash' AND v_ret.cash_session_id IS NOT NULL
        THEN jsonb_build_object('amount', v_ret.total_returned, 'cash_session_id', v_ret.cash_session_id,
             'session_status', COALESCE(v_session_status, '?'))
        ELSE NULL END,
      'voucher_to_cancel', CASE WHEN v_ret.return_type = 'voucher' AND v_ret.voucher_id IS NOT NULL
        THEN jsonb_build_object('voucher_id', v_ret.voucher_id, 'code', v_voucher_code, 'amount', v_ret.total_returned)
        ELSE NULL END
    ),
    'blockers',   to_jsonb(v_blockers),
    'warnings',   to_jsonb(v_warnings),
    'can_cancel', (array_length(v_blockers, 1) IS NULL)
  );
END;
$function$;

-- ── B) rpc_cancel_return — el reverso real ───────────────────────────────────
CREATE OR REPLACE FUNCTION public.rpc_cancel_return(p_return_id uuid, p_user_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_preview        jsonb;
  v_ret            RECORD;
  v_sale           RECORD;
  v_rmov           RECORD;
  v_session_status text;
  v_s              RECORD;
  v_expected       numeric;
  v_diff           numeric;
  v_new_status     text;
  v_still_returned boolean;
  v_voucher_done   jsonb := NULL;
  v_stock_reverted int := 0;
BEGIN
  -- 1. GUARD: re-evaluar con el preview; abortar si NO es anulable. Guard único
  --    (no se duplica la lógica) — hereda todos los bloqueos del preview.
  v_preview := rpc_preview_return_cancellation(p_return_id);
  IF v_preview ? 'error' THEN
    RAISE EXCEPTION '%', v_preview->>'error';
  END IF;
  IF NOT (v_preview->>'can_cancel')::boolean THEN
    RAISE EXCEPTION 'No se puede anular la devolución: %', COALESCE(v_preview->'blockers'->>0, 'bloqueada');
  END IF;

  SELECT * INTO v_ret  FROM returns WHERE id = p_return_id;
  SELECT * INTO v_sale FROM sales   WHERE id = v_ret.original_sale_id;

  -- 2. STOCK: deshacer lo que la devolución repuso (movements 'return').
  FOR v_rmov IN
    SELECT product_variant_id, warehouse_id, quantity FROM stock_movements
    WHERE reference_type = 'return' AND reference_id = p_return_id
      AND product_variant_id IS NOT NULL AND warehouse_id IS NOT NULL
  LOOP
    UPDATE stock_levels SET quantity = quantity - ABS(v_rmov.quantity), last_movement_at = now()
      WHERE product_variant_id = v_rmov.product_variant_id AND warehouse_id = v_rmov.warehouse_id;
    v_stock_reverted := v_stock_reverted + 1;
  END LOOP;
  DELETE FROM stock_movements WHERE reference_type = 'return' AND reference_id = p_return_id;

  -- 3. CAJA (solo cash con sesión guardada): revertir total_returns/total_sales
  --    + recalcular arqueo si la sesión está cerrada (fórmula canónica).
  IF v_ret.return_type = 'cash' AND v_ret.cash_session_id IS NOT NULL THEN
    SELECT status INTO v_session_status FROM cash_sessions WHERE id = v_ret.cash_session_id;
    UPDATE cash_sessions SET
      total_returns = COALESCE(total_returns, 0) - v_ret.total_returned,
      total_sales   = COALESCE(total_sales,   0) + v_ret.total_returned,
      updated_at = now()
    WHERE id = v_ret.cash_session_id;

    IF v_session_status = 'closed' THEN
      SELECT * INTO v_s FROM cash_sessions WHERE id = v_ret.cash_session_id;
      v_expected := COALESCE(v_s.opening_amount, 0) + COALESCE(v_s.total_cash_sales, 0)
                  - COALESCE(v_s.total_returns, 0) - COALESCE(v_s.total_withdrawals, 0);
      v_diff := COALESCE(v_s.counted_cash, 0) - v_expected;
      UPDATE cash_sessions SET expected_cash = v_expected, cash_difference = v_diff, updated_at = now()
        WHERE id = v_ret.cash_session_id;
    END IF;
  END IF;

  -- 4. VALE (solo voucher): cancelar el vale (revalidación atómica en el WHERE).
  IF v_ret.return_type = 'voucher' AND v_ret.voucher_id IS NOT NULL THEN
    UPDATE vouchers SET status = 'cancelled', remaining_amount = 0, updated_at = now()
      WHERE id = v_ret.voucher_id AND status = 'active' AND remaining_amount = original_amount;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'El vale de la devolución se canjeó mientras tanto. Operación cancelada.';
    END IF;
    v_voucher_done := jsonb_build_object('voucher_id', v_ret.voucher_id);
  END IF;

  -- 5. RESTAURAR LA VENTA. Mapeo inequívoco (el guard garantizó 1 return en la
  --    venta) → TODAS las líneas devueltas de la venta son de este return.
  UPDATE sale_lines
    SET quantity_returned = 0, returned_at = NULL, return_reason = NULL
    WHERE sale_id = v_ret.original_sale_id AND COALESCE(quantity_returned, 0) > 0;

  SELECT EXISTS(SELECT 1 FROM sale_lines
    WHERE sale_id = v_ret.original_sale_id AND COALESCE(quantity_returned, 0) > 0)
    INTO v_still_returned;
  v_new_status := CASE WHEN v_still_returned THEN 'partially_returned' ELSE 'completed' END;

  UPDATE sales
    SET status = v_new_status::sale_status,
        total_returned = GREATEST(COALESCE(total_returned, 0) - v_ret.total_returned, 0)
    WHERE id = v_ret.original_sale_id;

  -- 6. Borrar el registro de devolución (FK RESTRICT ya liberada: stock movs y
  --    vale gestionados; la venta sigue viva).
  DELETE FROM returns WHERE id = p_return_id;

  RETURN jsonb_build_object(
    'success',                   true,
    'return_id',                 p_return_id,
    'return_type',               v_ret.return_type,
    'sale_id',                   v_ret.original_sale_id,
    'ticket_number',             v_sale.ticket_number,
    'amount_reverted',           v_ret.total_returned,
    'stock_movements_reverted',  v_stock_reverted,
    'voucher_cancelled',         v_voucher_done,
    'cash_session_id',           CASE WHEN v_ret.return_type = 'cash' THEN v_ret.cash_session_id ELSE NULL END,
    'new_sale_status',           v_new_status
  );
END;
$function$;

GRANT EXECUTE ON FUNCTION public.rpc_cancel_return(uuid, uuid) TO service_role, authenticated;
