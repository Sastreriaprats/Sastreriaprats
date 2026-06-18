-- ============================================================
-- Migración 219 — R6 pieza 1: cimiento para anular devoluciones.
--
-- PARTE A — schema + create:
--   1. `returns.cash_session_id` (FK nullable → cash_sessions): las devoluciones
--      a EFECTIVO ya guardan QUÉ sesión ajustaron, para poder revertirla limpio.
--      Los 16 returns existentes quedan NULL (0 son cash → no importa).
--   2. rpc_create_return: cuando type='cash' y ajusta la sesión abierta, GUARDA
--      ese cash_session_id en el return. Resto byte-idéntico a la def viva.
-- PARTE B — rpc_preview_return_cancellation(p_return_id): clasificador READ-ONLY
--   (no muta nada). Dice si la devolución es anulable o por qué se bloquea, y qué
--   se revertiría. Espejo de la clasificación de rpc_preview_sale_deletion (mig 175).
--
-- El reverso real (rpc_cancel_return) va en la pieza 2. Aquí NADA muta salvo el
-- ALTER (aditivo) y el CREATE OR REPLACE (data-neutral).
-- ============================================================

-- ── PARTE A.1 — schema ──────────────────────────────────────────────────────
ALTER TABLE returns ADD COLUMN IF NOT EXISTS cash_session_id uuid REFERENCES cash_sessions(id);
CREATE INDEX IF NOT EXISTS idx_returns_cash_session ON returns(cash_session_id) WHERE cash_session_id IS NOT NULL;

-- ── PARTE A.2 — rpc_create_return guarda la sesión en devoluciones a efectivo ──
CREATE OR REPLACE FUNCTION public.rpc_create_return(p_original_sale_id uuid, p_return_type text, p_line_ids uuid[], p_reason text, p_store_id uuid, p_user_id uuid)
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
BEGIN

  SELECT * INTO v_original_sale
  FROM sales
  WHERE id = p_original_sale_id;

  IF v_original_sale.id IS NULL THEN
    RAISE EXCEPTION 'Venta original no encontrada';
  END IF;

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
      CURRENT_DATE,
      CURRENT_DATE + INTERVAL '365 days',
      'active',
      p_store_id,
      p_user_id
    )
    RETURNING id INTO v_voucher_id;
  END IF;

  INSERT INTO returns (
    original_sale_id, return_type, total_returned,
    voucher_id, reason, processed_by, store_id
  ) VALUES (
    p_original_sale_id,
    p_return_type,
    v_total_returned,
    v_voucher_id,
    p_reason,
    p_user_id,
    p_store_id
  )
  RETURNING id INTO v_return_id;

  UPDATE sale_lines
  SET quantity_returned = quantity,
      returned_at = v_now,
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

  -- Solo actualizar cash_sessions cuando la devolución sale en efectivo.
  IF p_return_type = 'cash' THEN
    SELECT id INTO v_return_session_id
    FROM cash_sessions
    WHERE store_id = p_store_id AND status = 'open'
    LIMIT 1;

    IF v_return_session_id IS NOT NULL THEN
      UPDATE cash_sessions
      SET total_returns = COALESCE(total_returns, 0) + v_total_returned,
          total_sales   = COALESCE(total_sales,   0) - v_total_returned
      WHERE id = v_return_session_id;
      -- R6 (mig 219): guardar la sesión ajustada en el return → anulable limpio.
      UPDATE returns SET cash_session_id = v_return_session_id WHERE id = v_return_id;
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'return_id',      v_return_id,
    'total_returned', v_total_returned,
    'voucher_id',     v_voucher_id,
    'voucher_code',   v_voucher_code,
    'all_returned',   v_all_returned
  );

END;
$function$;

-- ── PARTE B — rpc_preview_return_cancellation (clasificador READ-ONLY) ────────
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

  -- Stock que volvería a "vendido" (lo que la devolución repuso).
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

GRANT EXECUTE ON FUNCTION public.rpc_preview_return_cancellation(uuid) TO service_role, authenticated;
