-- 282_vista_productos_con_stock.sql
--
-- El filtro "Sin stock / Stock bajo / Con stock" de Stock > Productos solo
-- filtraba los 25 productos de la PÁGINA cargada: se aplicaba en el navegador
-- sobre lo que ya estaba en pantalla. Con 1.602 productos activos, elegir "Sin
-- stock" enseñaba dos filas mientras el pie seguía anunciando 1.602 productos y
-- 64 páginas, y "seleccionar todos los filtrados" trabajaba sobre lo mostrado.
--
-- Para poder filtrar de verdad hace falta el stock AGREGADO por producto, que
-- no existe en ninguna tabla: hay que sumar stock_levels a través de
-- product_variants, contando solo los almacenes activos. Esta vista lo expone
-- junto a todas las columnas de `products`, de modo que el listado puede
-- filtrar, ordenar, contar y paginar contra ella exactamente igual que contra
-- la tabla.
--
-- El criterio es el MISMO que ya usaba la pantalla en el navegador
-- (getProductStockSummary): se ignoran los almacenes con is_active = false.
--
-- Se crea con nombre propio y NO se toca la `v_products_with_stock` que ya
-- existe desde la migración 003d: aunque el código no la use, el bot de
-- Telegram consulta por SQL libre y podría estar apoyándose en ella.
--
-- `security_invoker` hace que la vista respete las políticas RLS de las tablas
-- de origen en lugar de ejecutarse con los permisos del dueño: sin esto, una
-- vista es una puerta trasera para leer productos y stock saltándose RLS.
--
-- No crea ni modifica ningún dato.

CREATE OR REPLACE VIEW public.v_products_stock_filter
WITH (security_invoker = true) AS
SELECT
  p.*,
  COALESCE(s.stock_total, 0)     AS stock_total,
  COALESCE(s.stock_reserved, 0)  AS stock_reserved,
  COALESCE(s.stock_available, 0) AS stock_available
FROM products p
LEFT JOIN (
  SELECT
    pv.product_id,
    SUM(sl.quantity)                                              AS stock_total,
    SUM(COALESCE(sl.reserved, 0))                                 AS stock_reserved,
    SUM(GREATEST(sl.quantity - COALESCE(sl.reserved, 0), 0))      AS stock_available
  FROM product_variants pv
  JOIN stock_levels sl ON sl.product_variant_id = pv.id
  JOIN warehouses w    ON w.id = sl.warehouse_id AND w.is_active
  GROUP BY pv.product_id
) s ON s.product_id = p.id;

COMMENT ON VIEW public.v_products_stock_filter IS
  'Productos con su stock agregado (solo almacenes activos), para poder filtrar y ordenar por existencias en el listado sin traerse stock_levels entero.';

GRANT SELECT ON public.v_products_stock_filter TO authenticated, service_role;
