-- ============================================================
-- Migración 221 — R7: herramienta de limpieza de stock_movements huérfanos.
--
-- Un huérfano = stock_movement con reference_id NOT NULL cuya entidad ya no
-- existe (la venta/return/reserva/pedido se borró pero el movimiento quedó).
-- reference_type=null NO son huérfanos (nunca apuntaron a nada) → excluidos.
--
-- SEGURIDAD: borrar un huérfano solo quita el REGISTRO del log. NO recalcula
-- stock_levels (no hay trigger; stock_levels es el saldo acumulado, los movements
-- son el histórico). El efecto del movimiento ya se aplicó al saldo en su día.
--
-- El filtro de borrado (rpc_clean) re-evalúa el MISMO NOT EXISTS dentro del DELETE
-- (vía CTE) → es IMPOSIBLE borrar un movement cuya entidad sí existe, aunque entre
-- el listar y el limpiar una entidad "reviva".
--
-- Mapa reference_type → tabla (genérico, todos los tipos que apuntan a entidad):
--   sale→sales, return→returns, product_reservation_line→product_reservation_lines,
--   product_reservation→product_reservations, supplier_order→supplier_orders,
--   online_order_line→online_order_lines, manual_adjustment→sales.
-- Un reference_type NO listado no se considera huérfano (conservador: no se sabe
-- verificar) → nunca se borra.
-- ============================================================

-- ── Listar huérfanos (read-only) ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.rpc_list_orphan_stock_movements()
 RETURNS TABLE(
   id uuid, reference_type text, reference_id uuid, movement_type text,
   quantity integer, product_name text, variant_desc text, created_at timestamptz
 )
 LANGUAGE sql
 STABLE
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT
    sm.id, sm.reference_type, sm.reference_id, sm.movement_type::text,
    sm.quantity,
    COALESCE(p.name, '(producto desconocido)') AS product_name,
    NULLIF(TRIM(COALESCE(pv.size, '') || ' ' || COALESCE(pv.color, '')), '') AS variant_desc,
    sm.created_at
  FROM stock_movements sm
  LEFT JOIN product_variants pv ON pv.id = sm.product_variant_id
  LEFT JOIN products p ON p.id = pv.product_id
  WHERE sm.reference_id IS NOT NULL AND (
       (sm.reference_type = 'sale'                     AND NOT EXISTS (SELECT 1 FROM sales x                     WHERE x.id = sm.reference_id))
    OR (sm.reference_type = 'return'                   AND NOT EXISTS (SELECT 1 FROM returns x                   WHERE x.id = sm.reference_id))
    OR (sm.reference_type = 'product_reservation_line' AND NOT EXISTS (SELECT 1 FROM product_reservation_lines x WHERE x.id = sm.reference_id))
    OR (sm.reference_type = 'product_reservation'      AND NOT EXISTS (SELECT 1 FROM product_reservations x      WHERE x.id = sm.reference_id))
    OR (sm.reference_type = 'supplier_order'           AND NOT EXISTS (SELECT 1 FROM supplier_orders x           WHERE x.id = sm.reference_id))
    OR (sm.reference_type = 'online_order_line'        AND NOT EXISTS (SELECT 1 FROM online_order_lines x        WHERE x.id = sm.reference_id))
    OR (sm.reference_type = 'manual_adjustment'        AND NOT EXISTS (SELECT 1 FROM sales x                     WHERE x.id = sm.reference_id))
  )
  ORDER BY sm.created_at;
$function$;

GRANT EXECUTE ON FUNCTION public.rpc_list_orphan_stock_movements() TO service_role, authenticated;

-- ── Limpiar huérfanos (muta; mismo filtro estricto que el listar) ────────────
CREATE OR REPLACE FUNCTION public.rpc_clean_orphan_stock_movements()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_deleted jsonb;
  v_count   integer;
BEGIN
  WITH orphans AS (
    SELECT sm.id
    FROM stock_movements sm
    WHERE sm.reference_id IS NOT NULL AND (
         (sm.reference_type = 'sale'                     AND NOT EXISTS (SELECT 1 FROM sales x                     WHERE x.id = sm.reference_id))
      OR (sm.reference_type = 'return'                   AND NOT EXISTS (SELECT 1 FROM returns x                   WHERE x.id = sm.reference_id))
      OR (sm.reference_type = 'product_reservation_line' AND NOT EXISTS (SELECT 1 FROM product_reservation_lines x WHERE x.id = sm.reference_id))
      OR (sm.reference_type = 'product_reservation'      AND NOT EXISTS (SELECT 1 FROM product_reservations x      WHERE x.id = sm.reference_id))
      OR (sm.reference_type = 'supplier_order'           AND NOT EXISTS (SELECT 1 FROM supplier_orders x           WHERE x.id = sm.reference_id))
      OR (sm.reference_type = 'online_order_line'        AND NOT EXISTS (SELECT 1 FROM online_order_lines x        WHERE x.id = sm.reference_id))
      OR (sm.reference_type = 'manual_adjustment'        AND NOT EXISTS (SELECT 1 FROM sales x                     WHERE x.id = sm.reference_id))
    )
  ),
  del AS (
    DELETE FROM stock_movements
    WHERE id IN (SELECT id FROM orphans)
    RETURNING id, reference_type, reference_id, movement_type, quantity,
              product_variant_id, warehouse_id, created_at
  )
  SELECT COALESCE(jsonb_agg(to_jsonb(del)), '[]'::jsonb), COUNT(*) INTO v_deleted, v_count FROM del;

  RETURN jsonb_build_object('count', v_count, 'deleted', v_deleted);
END;
$function$;

GRANT EXECUTE ON FUNCTION public.rpc_clean_orphan_stock_movements() TO service_role, authenticated;
