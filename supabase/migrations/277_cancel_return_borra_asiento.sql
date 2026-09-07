-- 277_cancel_return_borra_asiento.sql
--
-- Anular una devolución NO borraba su asiento contable: el Diario se quedaba
-- con el abono de una devolución que ya no existe, así que las ventas dejaban
-- de cuadrar con la contabilidad y nadie se enteraba.
--
-- El asiento lo crea createSaleReturnJournalEntry (src/actions/accounting-triggers.ts)
-- con reference_type='sale_return' y reference_id = la venta original;
-- rpc_cancel_return no lo mencionaba en ningún sitio.
--
-- Partida de la definición VIVA en producción (pg_get_functiondef), no de la
-- del repositorio. ÚNICO cambio: el bloque 5b que borra el asiento y sus
-- líneas, y el contador que se devuelve.
--
-- No altera nada del histórico: hoy hay 23 devoluciones y 23 asientos
-- 'sale_return', con CERO huérfanos, porque todavía no se ha anulado ninguna
-- devolución desde que existen estos asientos. Cambia lo que pasará la próxima
-- vez que se anule una.

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
  v_journal_deleted INTEGER := 0;
  v_still_returned boolean;
  v_voucher_done   jsonb := NULL;
  v_stock_reverted int := 0;
  v_is_cash_refund boolean := false;
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

  v_is_cash_refund := (v_ret.return_type = 'cash')
                   OR (v_ret.return_type = 'refund' AND v_ret.refund_method = 'cash');

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

  -- 3. CAJA (cash legado o refund en efectivo, con sesión guardada): revertir
  --    total_returns/total_sales + recalcular arqueo si la sesión está cerrada.
  IF v_is_cash_refund AND v_ret.cash_session_id IS NOT NULL THEN
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

  -- 5b. BORRAR EL ASIENTO CONTABLE de la devolución. Lo crea
  --     createSaleReturnJournalEntry con reference_type='sale_return' y
  --     reference_id = la venta original. Sin esto, anular una devolución
  --     dejaba en el Diario el abono de una devolución que ya no existe.
  --     El guard del preview garantiza que la venta tiene UNA sola devolución,
  --     así que ese asiento es inequívocamente el de este return.
  DELETE FROM journal_entry_lines
   WHERE journal_entry_id IN (
     SELECT id FROM journal_entries
      WHERE reference_type = 'sale_return'
        AND reference_id = v_ret.original_sale_id
   );

  DELETE FROM journal_entries
   WHERE reference_type = 'sale_return'
     AND reference_id = v_ret.original_sale_id;

  GET DIAGNOSTICS v_journal_deleted = ROW_COUNT;

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
    'cash_session_id',           CASE WHEN v_is_cash_refund THEN v_ret.cash_session_id ELSE NULL END,
    'new_sale_status',           v_new_status,
    'journal_entries_deleted',   v_journal_deleted
  );
END;
$function$

