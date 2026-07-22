-- ============================================================
-- Migración 267: devoluciones con REINTEGRO al método de pago original
-- y FECHA de devolución editable.
--
-- Contexto: la mig 219 dejó en rpc_create_return un camino p_return_type='cash'
-- que era CÓDIGO MUERTO — el CHECK de returns.return_type solo permite
-- 'exchange'|'voucher', así que el INSERT habría reventado antes de llegar a
-- tocar la caja. Esta migración lo sustituye por un modelo explícito:
--
-- A) Schema:
--    1. returns.return_type admite 'refund' (reintegro de dinero).
--    2. returns.refund_method ('cash'|'card'|'bizum'|'transfer'): canal del
--       reintegro. Coherencia: refund_method NO NULL ⟺ return_type='refund'.
-- B) rpc_create_return: nueva firma con p_refund_method y p_return_date
--    (ambos DEFAULT NULL → rpc_process_exchange, que la llama posicional con
--    6 args (mig 222), sigue funcionando sin tocarla). Se DROPea la firma de
--    6 args para que no haya ambigüedad de resolución en PostgREST.
--    - p_return_date (patrón fecha retro de la mig 253): sin fecha o con la de
--      hoy todo va como siempre; con fecha pasada se estampa created_at N días
--      atrás a la misma hora, el vale se emite/caduca desde esa fecha y, si el
--      reintegro es en efectivo, se resuelve la caja DE ESE DÍA (abierta
--      preferente; si no, la cerrada que cubra la fecha) y se recalcula su
--      arqueo canónico si estaba cerrada (fórmula de rpc_cancel_return).
--      No puede ser futura ni anterior a la venta original.
--    - refund en efectivo EXIGE caja (exception si no hay): el dinero sale del
--      cajón y el arqueo debe reflejarlo (total_returns += / total_sales -=,
--      igual que hacía el camino muerto de la 219, + cash_session_id en el
--      return para poder anular limpio). Otros métodos no tocan caja.
-- C) rpc_preview_return_cancellation + rpc_cancel_return: aprenden el tipo
--    'refund'. Con refund_method='cash' se comportan como el tipo 'cash'
--    (revertir sesión); con otros métodos, warning de que el abono al cliente
--    se deshace fuera de caja. Resto byte-idéntico a las defs vivas (mig 220,
--    verificadas contra pg_get_functiondef el 22-jul-2026).
-- ============================================================

-- ── A) Schema ────────────────────────────────────────────────────────────────
ALTER TABLE returns DROP CONSTRAINT IF EXISTS returns_return_type_check;
ALTER TABLE returns ADD CONSTRAINT returns_return_type_check
  CHECK (return_type = ANY (ARRAY['exchange'::text, 'voucher'::text, 'refund'::text]));

ALTER TABLE returns ADD COLUMN IF NOT EXISTS refund_method text;

ALTER TABLE returns DROP CONSTRAINT IF EXISTS returns_refund_method_check;
ALTER TABLE returns ADD CONSTRAINT returns_refund_method_check
  CHECK (refund_method IS NULL OR refund_method IN ('cash', 'card', 'bizum', 'transfer'));

ALTER TABLE returns DROP CONSTRAINT IF EXISTS returns_refund_method_coherence;
ALTER TABLE returns ADD CONSTRAINT returns_refund_method_coherence
  CHECK ((return_type = 'refund') = (refund_method IS NOT NULL));

-- ── B) rpc_create_return con método de reintegro y fecha ─────────────────────
DROP FUNCTION IF EXISTS public.rpc_create_return(uuid, text, uuid[], text, uuid, uuid);

CREATE OR REPLACE FUNCTION public.rpc_create_return(
  p_original_sale_id uuid,
  p_return_type      text,
  p_line_ids         uuid[],
  p_reason           text,
  p_store_id         uuid,
  p_user_id          uuid,
  p_refund_method    text DEFAULT NULL,
  p_return_date      date DEFAULT NULL
)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_original_sale     RECORD;
  v_total_returned    NUMERIC(12,2);
  v_gross_ret         NUMERIC(12,2);
  v_gross_all         NUMERIC(12,2);
  v_voucher_id        UUID := NULL;
  v_voucher_code      TEXT := NULL;
  v_return_id         UUID;
  v_all_returned      BOOLEAN;
  v_warehouse_id      UUID;
  v_line              RECORD;
  v_stock_rec         RECORD;
  v_new_qty           INTEGER;
  v_now               TIMESTAMPTZ := NOW();
  v_matching_count    INTEGER;
  v_return_session_id UUID;
  -- 267: fecha de la devolución + timestamp estampado (patrón mig 253)
  v_return_date       DATE;
  v_created_at        TIMESTAMPTZ;
  v_session_status    TEXT;
  v_s                 RECORD;
  v_expected          NUMERIC;
BEGIN

  IF p_return_type NOT IN ('voucher', 'exchange', 'refund') THEN
    RAISE EXCEPTION 'Tipo de devolución no válido: %', COALESCE(p_return_type, '(null)');
  END IF;
  IF p_return_type = 'refund' AND COALESCE(p_refund_method, '') NOT IN ('cash', 'card', 'bizum', 'transfer') THEN
    RAISE EXCEPTION 'Método de reintegro no válido: %', COALESCE(p_refund_method, '(null)');
  END IF;

  SELECT * INTO v_original_sale
  FROM sales
  WHERE id = p_original_sale_id;

  IF v_original_sale.id IS NULL THEN
    RAISE EXCEPTION 'Venta original no encontrada';
  END IF;

  -- 267: fecha de la devolución. Sin fecha (o con la de hoy) todo queda como
  -- siempre; con fecha pasada se estampa N días atrás a la misma hora.
  v_return_date := COALESCE(p_return_date, CURRENT_DATE);
  IF v_return_date > CURRENT_DATE THEN
    RAISE EXCEPTION 'La fecha de la devolución no puede ser futura (%)', to_char(v_return_date, 'DD/MM/YYYY');
  ELSIF v_return_date < v_original_sale.created_at::date THEN
    RAISE EXCEPTION 'La fecha de la devolución (%) no puede ser anterior a la venta original (%)',
      to_char(v_return_date, 'DD/MM/YYYY'), to_char(v_original_sale.created_at::date, 'DD/MM/YYYY');
  END IF;
  v_created_at := v_now - make_interval(days => (CURRENT_DATE - v_return_date));

  SELECT COUNT(*) INTO v_matching_count
  FROM sale_lines
  WHERE id = ANY(p_line_ids)
    AND sale_id = p_original_sale_id
    AND COALESCE(quantity_returned, 0) < quantity;

  IF v_matching_count != array_length(p_line_ids, 1) THEN
    RAISE EXCEPTION 'Una o más líneas no pertenecen a la venta original o ya han sido devueltas';
  END IF;

  -- ── Cálculo del importe a devolver (FIX mig. 185) ─────────────────────────
  SELECT COALESCE(SUM(line_total), 0)
  INTO v_gross_ret
  FROM sale_lines
  WHERE sale_id = p_original_sale_id
    AND id = ANY(p_line_ids);

  IF v_gross_ret = 0 THEN
    RAISE EXCEPTION 'Las líneas seleccionadas no tienen importe';
  END IF;

  SELECT COALESCE(SUM(line_total), 0)
  INTO v_gross_all
  FROM sale_lines
  WHERE sale_id = p_original_sale_id;

  IF COALESCE(v_original_sale.discount_amount, 0) > 0 THEN
    v_total_returned := ROUND(
      v_gross_ret * (1 - v_original_sale.discount_amount / NULLIF(v_gross_all, 0)), 2);
  ELSIF COALESCE(v_original_sale.discount_percentage, 0) > 0 THEN
    v_total_returned := ROUND(
      v_gross_ret * (1 - v_original_sale.discount_percentage / 100.0), 2);
  ELSE
    v_total_returned := ROUND(v_gross_ret, 2);
  END IF;
  -- ──────────────────────────────────────────────────────────────────────────

  IF p_return_type = 'voucher' THEN
    v_voucher_code := 'DEV-' || UPPER(TO_HEX(EXTRACT(EPOCH FROM v_now)::BIGINT))
                      || '-' || UPPER(SUBSTR(MD5(RANDOM()::TEXT), 1, 4));

    INSERT INTO vouchers (
      code, voucher_type, original_amount, remaining_amount,
      origin_sale_id, client_id, issued_date, expiry_date,
      status, issued_by_store_id, issued_by
    ) VALUES (
      v_voucher_code,
      'fixed',
      v_total_returned,
      v_total_returned,
      p_original_sale_id,
      v_original_sale.client_id,
      v_return_date,
      v_return_date + INTERVAL '365 days',
      'active',
      p_store_id,
      p_user_id
    )
    RETURNING id INTO v_voucher_id;
  END IF;

  INSERT INTO returns (
    original_sale_id, return_type, total_returned,
    voucher_id, reason, processed_by, store_id,
    refund_method, created_at
  ) VALUES (
    p_original_sale_id,
    p_return_type,
    v_total_returned,
    v_voucher_id,
    p_reason,
    p_user_id,
    p_store_id,
    CASE WHEN p_return_type = 'refund' THEN p_refund_method ELSE NULL END,
    v_created_at
  )
  RETURNING id INTO v_return_id;

  UPDATE sale_lines
  SET quantity_returned = quantity,
      returned_at = v_created_at,
      return_reason = p_reason
  WHERE id = ANY(p_line_ids);

  SELECT NOT EXISTS (
    SELECT 1 FROM sale_lines
    WHERE sale_id = p_original_sale_id
      AND COALESCE(quantity_returned, 0) < quantity
  ) INTO v_all_returned;

  UPDATE sales
  SET status = (CASE WHEN v_all_returned THEN 'fully_returned' ELSE 'partially_returned' END)::sale_status,
      total_returned = COALESCE(total_returned, 0) + v_total_returned
  WHERE id = p_original_sale_id;

  SELECT id INTO v_warehouse_id
  FROM warehouses
  WHERE store_id = p_store_id
  LIMIT 1;

  IF v_warehouse_id IS NOT NULL THEN
    FOR v_line IN
      SELECT sl.product_variant_id, sl.quantity
      FROM sale_lines sl
      WHERE sl.id = ANY(p_line_ids) AND sl.product_variant_id IS NOT NULL
    LOOP
      SELECT * INTO v_stock_rec
      FROM stock_levels
      WHERE product_variant_id = v_line.product_variant_id
        AND warehouse_id = v_warehouse_id;

      IF v_stock_rec.id IS NOT NULL THEN
        v_new_qty := v_stock_rec.quantity + v_line.quantity;
        UPDATE stock_levels
        SET quantity = v_new_qty,
            last_movement_at = v_now
        WHERE id = v_stock_rec.id;
      ELSE
        INSERT INTO stock_levels (product_variant_id, warehouse_id, quantity, last_movement_at)
        VALUES (v_line.product_variant_id, v_warehouse_id, v_line.quantity, v_now);
        v_new_qty := v_line.quantity;
      END IF;

      INSERT INTO stock_movements (
        product_variant_id, warehouse_id, movement_type, quantity,
        stock_before, stock_after,
        reference_type, reference_id,
        reason, notes,
        created_by, store_id
      ) VALUES (
        v_line.product_variant_id,
        v_warehouse_id,
        'return',
        v_line.quantity,
        COALESCE(v_stock_rec.quantity, 0),
        v_new_qty,
        'return',
        v_return_id,
        p_reason,
        'Devolución de venta ' || p_original_sale_id::TEXT,
        p_user_id,
        p_store_id
      );
    END LOOP;
  END IF;

  -- 267: reintegro en EFECTIVO → sale dinero del cajón: exige caja del día de
  -- la devolución y ajusta su arqueo (sustituye al camino muerto 'cash' de la 219).
  IF p_return_type = 'refund' AND p_refund_method = 'cash' THEN
    SELECT id INTO v_return_session_id
      FROM cash_sessions
     WHERE store_id = p_store_id
       AND status = 'open'
       AND opened_at::date <= v_return_date
     ORDER BY opened_at DESC
     LIMIT 1;

    IF v_return_session_id IS NULL THEN
      SELECT id INTO v_return_session_id
        FROM cash_sessions
       WHERE store_id = p_store_id
         AND status <> 'open'
         AND opened_at::date <= v_return_date
         AND (closed_at IS NULL OR closed_at::date >= v_return_date)
       ORDER BY opened_at DESC
       LIMIT 1;
    END IF;

    IF v_return_session_id IS NULL THEN
      RAISE EXCEPTION 'No hay ninguna caja del % en esta tienda: no se puede devolver efectivo sin caja',
        to_char(v_return_date, 'DD/MM/YYYY');
    END IF;

    UPDATE cash_sessions
    SET total_returns = COALESCE(total_returns, 0) + v_total_returned,
        total_sales   = COALESCE(total_sales,   0) - v_total_returned
    WHERE id = v_return_session_id;

    UPDATE returns SET cash_session_id = v_return_session_id WHERE id = v_return_id;

    -- Si la sesión ya está cerrada (fecha retro), recalcular arqueo canónico
    -- (misma fórmula que rpc_cancel_return, mig 220).
    SELECT status INTO v_session_status FROM cash_sessions WHERE id = v_return_session_id;
    IF v_session_status = 'closed' THEN
      SELECT * INTO v_s FROM cash_sessions WHERE id = v_return_session_id;
      v_expected := COALESCE(v_s.opening_amount, 0) + COALESCE(v_s.total_cash_sales, 0)
                  - COALESCE(v_s.total_returns, 0) - COALESCE(v_s.total_withdrawals, 0);
      UPDATE cash_sessions
      SET expected_cash = v_expected,
          cash_difference = COALESCE(v_s.counted_cash, 0) - v_expected,
          updated_at = now()
      WHERE id = v_return_session_id;
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'return_id',      v_return_id,
    'total_returned', v_total_returned,
    'voucher_id',     v_voucher_id,
    'voucher_code',   v_voucher_code,
    'all_returned',   v_all_returned,
    'refund_method',  CASE WHEN p_return_type = 'refund' THEN p_refund_method ELSE NULL END,
    'return_date',    v_return_date,
    'cash_session_id', v_return_session_id
  );

END;
$function$;

GRANT EXECUTE ON FUNCTION public.rpc_create_return(UUID, TEXT, UUID[], TEXT, UUID, UUID, TEXT, DATE) TO service_role;
GRANT EXECUTE ON FUNCTION public.rpc_create_return(UUID, TEXT, UUID[], TEXT, UUID, UUID, TEXT, DATE) TO authenticated;

-- ── C) preview: clasificar el tipo 'refund' ──────────────────────────────────
-- Base: def viva (mig 220, con guard de mapeo). Cambios: rama 'refund' y el
-- bloque 'reverts'.'cash' cubre también refund+cash.
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
  v_is_cash_refund boolean := false;
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

  v_is_cash_refund := (v_ret.return_type = 'cash')
                   OR (v_ret.return_type = 'refund' AND v_ret.refund_method = 'cash');

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

  ELSIF v_is_cash_refund THEN
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

  ELSIF v_ret.return_type = 'refund' THEN
    -- Reintegro por tarjeta/bizum/transferencia: el dinero salió fuera de caja.
    v_warnings := array_append(v_warnings,
      'El reintegro se hizo por ' || COALESCE(v_ret.refund_method, '?') ||
      ' (fuera de caja); el abono al cliente debe deshacerse aparte (banco/TPV).');

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
    'refund_method',  v_ret.refund_method,
    'total_returned', v_ret.total_returned,
    'sale', CASE WHEN v_sale.id IS NOT NULL
      THEN jsonb_build_object('id', v_sale.id, 'ticket_number', v_sale.ticket_number, 'status', v_sale.status)
      ELSE NULL END,
    'reverts', jsonb_build_object(
      'stock_back_to_sold', v_stock,
      'cash', CASE WHEN v_is_cash_refund AND v_ret.cash_session_id IS NOT NULL
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

-- ── D) cancel: revertir caja también en refund+cash ──────────────────────────
-- Base: def viva (mig 220). Cambio único: la condición del paso 3 y el
-- cash_session_id del RETURN cubren refund_method='cash'.
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
    'new_sale_status',           v_new_status
  );
END;
$function$;

GRANT EXECUTE ON FUNCTION public.rpc_preview_return_cancellation(uuid) TO service_role, authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_cancel_return(uuid, uuid) TO service_role, authenticated;
