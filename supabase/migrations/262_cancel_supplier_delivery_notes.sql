-- ============================================================
-- Migración 262: ANULAR y BORRAR albaranes de proveedor
--
-- El módulo de albaranes (mig 052) nació sin anulación ni borrado (el CHECK
-- de status ni contemplaba 'anulado'). Esta migración añade:
--   a) status 'anulado' + columnas de auditoría de la anulación
--   b) rpc_cancel_supplier_delivery_note: anula CONSERVANDO el registro,
--      revirtiendo el stock recibido y borrando sus stock_movements
--      (patrón "cero huérfanos" de la mig 223, a nivel de albarán suelto;
--      imprescindible borrar los movements para que un posterior
--      rpc_delete_supplier_order del pedido no doble-revierta: su SUM
--      cuenta los purchase_receipt vivos)
--   c) rpc_delete_supplier_delivery_note: borrado físico SOLO de albaranes
--      'pendiente' sin stock aplicado, sin movimientos y sin factura
--
-- Guards que abortan sin tocar nada (mensajes legibles vía RAISE):
--   - albarán vinculado a factura de proveedor (desvincular antes)
--   - reversión que dejaría stock negativo (género ya vendido/movido)
-- ============================================================

-- a) Estado 'anulado' + auditoría
ALTER TABLE supplier_delivery_notes DROP CONSTRAINT IF EXISTS supplier_delivery_notes_status_check;
ALTER TABLE supplier_delivery_notes ADD CONSTRAINT supplier_delivery_notes_status_check
  CHECK (status IN ('pendiente', 'recibido', 'incidencia', 'anulado'));

ALTER TABLE supplier_delivery_notes
  ADD COLUMN IF NOT EXISTS cancelled_at  timestamptz,
  ADD COLUMN IF NOT EXISTS cancelled_by  uuid REFERENCES profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS cancel_reason text;

COMMENT ON COLUMN supplier_delivery_notes.cancelled_at IS 'Momento de la anulación (status=anulado)';
COMMENT ON COLUMN supplier_delivery_notes.cancel_reason IS 'Motivo tecleado al anular';

-- b) Anulación con reversión de stock
CREATE OR REPLACE FUNCTION public.rpc_cancel_supplier_delivery_note(
  p_note_id uuid,
  p_user_id uuid,
  p_reason  text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $func$
DECLARE
  v_note         record;
  v_inv_num      text;
  v_neg          record;
  v_reverted     jsonb;
  v_movs_deleted int := 0;
BEGIN
  SELECT id, supplier_reference, status, stock_updated_at
  INTO v_note
  FROM supplier_delivery_notes
  WHERE id = p_note_id
  FOR UPDATE;
  IF v_note.id IS NULL THEN RAISE EXCEPTION 'Albarán no encontrado'; END IF;
  IF v_note.status = 'anulado' THEN RAISE EXCEPTION 'Este albarán ya está anulado'; END IF;

  -- GUARD FACTURA: incluido en una factura de proveedor (puente many-to-many).
  SELECT inv.invoice_number INTO v_inv_num
  FROM ap_supplier_invoice_delivery_notes j
  JOIN ap_supplier_invoices inv ON inv.id = j.supplier_invoice_id
  WHERE j.supplier_delivery_note_id = p_note_id
  LIMIT 1;
  IF v_inv_num IS NOT NULL THEN
    RAISE EXCEPTION 'Este albarán está incluido en la factura de proveedor %. Desvincúlalo de la factura antes de anularlo.', v_inv_num;
  END IF;

  -- GUARD NEGATIVO: revertir la recepción no puede dejar stock bajo cero.
  SELECT r.product_variant_id, r.warehouse_id, r.recv, COALESCE(sl.quantity, 0) AS cur
  INTO v_neg
  FROM (
    SELECT product_variant_id, warehouse_id, SUM(quantity) AS recv
    FROM stock_movements
    WHERE movement_type = 'purchase_receipt'
      AND reference_type = 'supplier_delivery_note'
      AND reference_id = p_note_id
    GROUP BY 1, 2
  ) r
  LEFT JOIN stock_levels sl
    ON sl.product_variant_id = r.product_variant_id AND sl.warehouse_id = r.warehouse_id
  WHERE COALESCE(sl.quantity, 0) < r.recv
  LIMIT 1;
  IF v_neg.product_variant_id IS NOT NULL THEN
    RAISE EXCEPTION 'No se puede anular: parte del género de este albarán ya se ha vendido o movido (variante %, almacén %: hay % uds y la recepción sumó %). Haz un ajuste de stock o una devolución al proveedor.',
      v_neg.product_variant_id, v_neg.warehouse_id, v_neg.cur, v_neg.recv;
  END IF;

  -- Resumen de lo revertido (para auditoría), antes de tocar nada
  SELECT jsonb_agg(jsonb_build_object('variant', product_variant_id, 'warehouse', warehouse_id, 'reverted', recv))
  INTO v_reverted
  FROM (
    SELECT product_variant_id, warehouse_id, SUM(quantity) AS recv
    FROM stock_movements
    WHERE movement_type = 'purchase_receipt'
      AND reference_type = 'supplier_delivery_note'
      AND reference_id = p_note_id
    GROUP BY 1, 2
  ) s;

  -- REVERTIR STOCK
  UPDATE stock_levels sl
  SET quantity = sl.quantity - agg.recv, last_movement_at = NOW()
  FROM (
    SELECT product_variant_id, warehouse_id, SUM(quantity) AS recv
    FROM stock_movements
    WHERE movement_type = 'purchase_receipt'
      AND reference_type = 'supplier_delivery_note'
      AND reference_id = p_note_id
    GROUP BY 1, 2
  ) agg
  WHERE sl.product_variant_id = agg.product_variant_id AND sl.warehouse_id = agg.warehouse_id;

  -- BORRAR los movements del albarán (cero huérfanos, sin doble reversión futura)
  DELETE FROM stock_movements
  WHERE reference_type = 'supplier_delivery_note' AND reference_id = p_note_id;
  GET DIAGNOSTICS v_movs_deleted = ROW_COUNT;

  -- Marcar anulado (stock_updated_at a NULL: ya no hay stock aplicado)
  UPDATE supplier_delivery_notes
  SET status        = 'anulado',
      cancelled_at  = NOW(),
      cancelled_by  = p_user_id,
      cancel_reason = NULLIF(TRIM(COALESCE(p_reason, '')), ''),
      stock_updated_at = NULL,
      updated_at    = NOW()
  WHERE id = p_note_id;

  RETURN jsonb_build_object(
    'cancelled',          true,
    'supplier_reference', v_note.supplier_reference,
    'movements_deleted',  v_movs_deleted,
    'reverted',           COALESCE(v_reverted, '[]'::jsonb)
  );
END
$func$;

GRANT EXECUTE ON FUNCTION public.rpc_cancel_supplier_delivery_note(uuid, uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.rpc_cancel_supplier_delivery_note(uuid, uuid, text) TO authenticated;

-- c) Borrado físico (solo pendientes limpios)
CREATE OR REPLACE FUNCTION public.rpc_delete_supplier_delivery_note(
  p_note_id uuid,
  p_user_id uuid
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $func$
DECLARE
  v_note      record;
  v_inv_num   text;
  v_has_moves boolean;
BEGIN
  SELECT id, supplier_reference, status, stock_updated_at
  INTO v_note
  FROM supplier_delivery_notes
  WHERE id = p_note_id
  FOR UPDATE;
  IF v_note.id IS NULL THEN RAISE EXCEPTION 'Albarán no encontrado'; END IF;
  IF v_note.status <> 'pendiente' THEN
    RAISE EXCEPTION 'Solo se puede borrar un albarán pendiente (este está "%"). Usa Anular.', v_note.status;
  END IF;
  IF v_note.stock_updated_at IS NOT NULL THEN
    RAISE EXCEPTION 'Este albarán ya aplicó stock. Usa Anular (revierte el stock).';
  END IF;
  SELECT EXISTS (
    SELECT 1 FROM stock_movements
    WHERE reference_type = 'supplier_delivery_note' AND reference_id = p_note_id
  ) INTO v_has_moves;
  IF v_has_moves THEN
    RAISE EXCEPTION 'Este albarán tiene movimientos de stock. Usa Anular (revierte el stock).';
  END IF;
  -- El RESTRICT del puente ya lo impediría; guard con mensaje legible.
  SELECT inv.invoice_number INTO v_inv_num
  FROM ap_supplier_invoice_delivery_notes j
  JOIN ap_supplier_invoices inv ON inv.id = j.supplier_invoice_id
  WHERE j.supplier_delivery_note_id = p_note_id
  LIMIT 1;
  IF v_inv_num IS NOT NULL THEN
    RAISE EXCEPTION 'Este albarán está incluido en la factura de proveedor %. Desvincúlalo antes de borrarlo.', v_inv_num;
  END IF;

  DELETE FROM supplier_delivery_note_lines WHERE supplier_delivery_note_id = p_note_id;
  DELETE FROM supplier_delivery_notes WHERE id = p_note_id;

  RETURN jsonb_build_object('deleted', true, 'supplier_reference', v_note.supplier_reference);
END
$func$;

GRANT EXECUTE ON FUNCTION public.rpc_delete_supplier_delivery_note(uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.rpc_delete_supplier_delivery_note(uuid, uuid) TO authenticated;
