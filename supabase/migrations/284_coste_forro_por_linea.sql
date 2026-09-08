-- ============================================================================
-- 284: COSTE DEL FORRO POR PRENDA
-- ----------------------------------------------------------------------------
-- Petición de Teresa (sep-2026): "cuando la prenda lleva forro, necesitamos
-- poder reflejar en alguna parte el coste del forro, aparte del de la prenda".
--
-- Hasta ahora el forro solo existía como TEXTO dentro de configuration
-- (forroStockNombre / forroCatalogo / forroMetros). La ficha del sastre incluso
-- calculaba `forroCosteMaterial` (€/m x metros del forro de stock), pero
-- createFichaOrder solo persistía el del TEJIDO: el coste del forro se perdía.
--
-- Se añade una columna propia `lining_cost` en la línea, hermana de
-- material_cost / labor_cost / factory_cost.
--
-- CRITERIO DE TOTALES: el forro es MATERIAL, así que suma dentro de
-- total_material_cost de la cabecera. Así `total_cost` (columna GENERADA como
-- material + obra + fábrica) sigue cuadrando sin tocar su definición y ningún
-- informe de margen se queda corto. El desglose forro vs tejido vive en la
-- LÍNEA, que es donde se consulta.
-- ============================================================================

ALTER TABLE tailoring_order_lines
  ADD COLUMN IF NOT EXISTS lining_cost DECIMAL(10,2) DEFAULT 0.00;

COMMENT ON COLUMN tailoring_order_lines.lining_cost IS
  'Coste del forro de la prenda. Es material: suma dentro de tailoring_orders.total_material_cost (ver fn_sync_order_costs).';

-- ---------------------------------------------------------------------------
-- Recalculo de los totales de la cabecera
-- ---------------------------------------------------------------------------
-- Dos cambios sobre la versión anterior:
--   1. total_material_cost = SUM(material_cost + lining_cost).
--   2. Se usa un UPDATE con subconsultas escalares en vez de UPDATE ... FROM
--      (GROUP BY). La versión vieja NO actualizaba nada cuando el pedido se
--      quedaba sin líneas (el subquery no devolvía fila), dejando los totales
--      del último borrado congelados en la cabecera.
CREATE OR REPLACE FUNCTION public.fn_sync_order_costs()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_order_id UUID := COALESCE(NEW.tailoring_order_id, OLD.tailoring_order_id);
BEGIN
  UPDATE tailoring_orders o SET
    total_material_cost = COALESCE((
      SELECT SUM(COALESCE(l.material_cost, 0) + COALESCE(l.lining_cost, 0))
      FROM tailoring_order_lines l WHERE l.tailoring_order_id = v_order_id), 0),
    total_labor_cost = COALESCE((
      SELECT SUM(COALESCE(l.labor_cost, 0))
      FROM tailoring_order_lines l WHERE l.tailoring_order_id = v_order_id), 0),
    total_factory_cost = COALESCE((
      SELECT SUM(COALESCE(l.factory_cost, 0))
      FROM tailoring_order_lines l WHERE l.tailoring_order_id = v_order_id), 0)
  WHERE o.id = v_order_id;

  RETURN COALESCE(NEW, OLD);
END;
$function$;

-- El trigger tenía la lista de columnas vigiladas en el UPDATE OF: sin
-- recrearlo, cambiar solo el forro no habría disparado el recálculo.
DROP TRIGGER IF EXISTS trg_sync_order_costs ON tailoring_order_lines;
CREATE TRIGGER trg_sync_order_costs
  AFTER INSERT OR DELETE OR UPDATE OF material_cost, lining_cost, labor_cost, factory_cost
  ON tailoring_order_lines
  FOR EACH ROW EXECUTE FUNCTION fn_sync_order_costs();
