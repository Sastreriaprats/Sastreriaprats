-- ============================================================
-- Migración 223: rpc_delete_supplier_order (borrado seguro de pedido a proveedor)
-- Borra un pedido a proveedor ATÓMICAMENTE: deshace el stock recibido
-- (solo purchase_receipt) + limpia TODOS sus stock_movements (cero huérfanos)
-- + borra dependencias en orden FK correcto. Guards que abortan sin tocar nada:
--   1) pedido existe y no 'cancelled'
--   2) GUARD FACTURA (A): si algún albarán del pedido está incluido en una factura
--      de proveedor (puente ap_supplier_invoice_delivery_notes, cualquier estado, o
--      enlace directo supplier_order_id) -> abortar. Respeta el many-to-many: NO
--      toca la factura (puede ligar otros pedidos).
--   3) GUARD NEGATIVO: si revertir purchase_receipt dejaría stock negativo -> abortar.
-- ============================================================
CREATE OR REPLACE FUNCTION public.rpc_delete_supplier_order(
  p_supplier_order_id uuid,
  p_user_id           uuid
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $func$
DECLARE
  v_order        record;
  v_note_ids     uuid[];
  v_inv_num      text;
  v_neg          record;
  v_reverted     jsonb;
  v_movs_deleted int := 0;
BEGIN
  SELECT id, order_number, status INTO v_order FROM supplier_orders WHERE id = p_supplier_order_id;
  IF v_order.id IS NULL THEN RAISE EXCEPTION 'Pedido no encontrado'; END IF;
  IF v_order.status = 'cancelled' THEN RAISE EXCEPTION 'Este pedido ya está cancelado'; END IF;

  SELECT array_agg(id) INTO v_note_ids FROM supplier_delivery_notes WHERE supplier_order_id = p_supplier_order_id;

  -- GUARD FACTURA (A): albarán del pedido incluido en una factura de proveedor (vía puente).
  SELECT inv.invoice_number INTO v_inv_num
  FROM ap_supplier_invoice_delivery_notes j
  JOIN supplier_delivery_notes dn ON dn.id = j.supplier_delivery_note_id
  JOIN ap_supplier_invoices inv    ON inv.id = j.supplier_invoice_id
  WHERE dn.supplier_order_id = p_supplier_order_id
  LIMIT 1;
  IF v_inv_num IS NOT NULL THEN
    RAISE EXCEPTION 'Este pedido tiene albaranes incluidos en una factura de proveedor (%). Gestiona o desliga la factura antes de borrar el pedido.', v_inv_num;
  END IF;
  -- Enlace directo (hoy 0 casos, pero por robustez)
  SELECT invoice_number INTO v_inv_num FROM ap_supplier_invoices WHERE supplier_order_id = p_supplier_order_id LIMIT 1;
  IF v_inv_num IS NOT NULL THEN
    RAISE EXCEPTION 'Este pedido tiene una factura de proveedor asociada (%). Gestiónala antes de borrar el pedido.', v_inv_num;
  END IF;

  -- GUARD NEGATIVO: recepción agregada (solo purchase_receipt) vs stock actual.
  SELECT r.product_variant_id, r.warehouse_id, r.recv, COALESCE(sl.quantity, 0) AS cur
  INTO v_neg
  FROM (
    SELECT product_variant_id, warehouse_id, SUM(quantity) AS recv
    FROM stock_movements
    WHERE movement_type = 'purchase_receipt'
      AND ( (reference_type = 'supplier_order'         AND reference_id = p_supplier_order_id)
         OR (reference_type = 'supplier_delivery_note' AND reference_id = ANY(COALESCE(v_note_ids, '{}'::uuid[]))) )
    GROUP BY 1, 2
  ) r
  LEFT JOIN stock_levels sl ON sl.product_variant_id = r.product_variant_id AND sl.warehouse_id = r.warehouse_id
  WHERE COALESCE(sl.quantity, 0) < r.recv
  LIMIT 1;
  IF v_neg.product_variant_id IS NOT NULL THEN
    RAISE EXCEPTION 'No se puede borrar: parte del género recibido ya se ha vendido o movido (variante %, almacén %: hay % uds, la recepción sumó %). Para corregir, haz un ajuste de stock o una devolución al proveedor.',
      v_neg.product_variant_id, v_neg.warehouse_id, v_neg.cur, v_neg.recv;
  END IF;

  -- Resumen de lo revertido (auditoría), antes de tocar nada
  SELECT jsonb_agg(jsonb_build_object('variant', product_variant_id, 'warehouse', warehouse_id, 'reverted', recv))
  INTO v_reverted
  FROM (
    SELECT product_variant_id, warehouse_id, SUM(quantity) AS recv
    FROM stock_movements
    WHERE movement_type = 'purchase_receipt'
      AND ( (reference_type = 'supplier_order'         AND reference_id = p_supplier_order_id)
         OR (reference_type = 'supplier_delivery_note' AND reference_id = ANY(COALESCE(v_note_ids, '{}'::uuid[]))) )
    GROUP BY 1, 2
  ) s;

  -- REVERTIR STOCK (solo purchase_receipt)
  UPDATE stock_levels sl
  SET quantity = sl.quantity - agg.recv, last_movement_at = NOW()
  FROM (
    SELECT product_variant_id, warehouse_id, SUM(quantity) AS recv
    FROM stock_movements
    WHERE movement_type = 'purchase_receipt'
      AND ( (reference_type = 'supplier_order'         AND reference_id = p_supplier_order_id)
         OR (reference_type = 'supplier_delivery_note' AND reference_id = ANY(COALESCE(v_note_ids, '{}'::uuid[]))) )
    GROUP BY 1, 2
  ) agg
  WHERE sl.product_variant_id = agg.product_variant_id AND sl.warehouse_id = agg.warehouse_id;

  -- BORRAR TODOS los movements del pedido y sus albaranes (incluye transfers) -> cero huérfanos
  DELETE FROM stock_movements
  WHERE (reference_type = 'supplier_order'         AND reference_id = p_supplier_order_id)
     OR (reference_type = 'supplier_delivery_note' AND reference_id = ANY(COALESCE(v_note_ids, '{}'::uuid[])));
  GET DIAGNOSTICS v_movs_deleted = ROW_COUNT;

  -- DEPENDENCIAS en orden FK correcto (columna real supplier_delivery_note_id).
  -- El puente se borra por robustez (el guard ya garantiza 0 filas aquí).
  IF v_note_ids IS NOT NULL THEN
    DELETE FROM ap_supplier_invoice_delivery_notes WHERE supplier_delivery_note_id = ANY(v_note_ids);
    DELETE FROM supplier_delivery_note_lines       WHERE supplier_delivery_note_id = ANY(v_note_ids);
  END IF;
  DELETE FROM supplier_delivery_notes WHERE supplier_order_id = p_supplier_order_id;
  -- (NO se borra ap_supplier_invoices: el guard garantiza que no hay factura ligada.)
  DELETE FROM supplier_order_lines    WHERE supplier_order_id = p_supplier_order_id;
  DELETE FROM supplier_orders         WHERE id = p_supplier_order_id;

  RETURN jsonb_build_object(
    'deleted',           true,
    'order_number',      v_order.order_number,
    'movements_deleted', v_movs_deleted,
    'reverted',          COALESCE(v_reverted, '[]'::jsonb)
  );
END
$func$;

GRANT EXECUTE ON FUNCTION public.rpc_delete_supplier_order(uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.rpc_delete_supplier_order(uuid, uuid) TO authenticated;
