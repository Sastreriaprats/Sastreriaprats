-- =====================================================================
-- Script: fix-warehouses-and-stock.sql
-- Propósito: 
--   1) Mostrar el estado actual de tiendas y almacenes
--   2) Marcar como inactivos los almacenes que no son de tiendas físicas reales
--   3) Reasignar stock_levels de variantes a los almacenes correctos
-- =====================================================================

-- 1. Ver qué tiendas y almacenes existen ahora
SELECT 
  s.id AS store_id, 
  s.name AS store_name, 
  s.code AS store_code,
  s.store_type,
  s.is_active AS store_active,
  w.id AS warehouse_id,
  w.name AS warehouse_name,
  w.code AS warehouse_code,
  w.is_active AS warehouse_active
FROM stores s
LEFT JOIN warehouses w ON w.store_id = s.id
ORDER BY s.store_type, s.name, w.name;

-- =====================================================================
-- 2. Ver cuántas stock_levels hay por almacén
SELECT 
  w.name AS warehouse,
  s.name AS store,
  s.store_type,
  COUNT(sl.id) AS num_stock_levels,
  SUM(sl.quantity) AS total_units
FROM warehouses w
LEFT JOIN stores s ON s.id = w.store_id
LEFT JOIN stock_levels sl ON sl.warehouse_id = w.id
GROUP BY w.id, w.name, s.name, s.store_type
ORDER BY s.store_type, w.name;

-- =====================================================================
-- 3. ACCIÓN: Desactivar tiendas y almacenes que NO deben existir
--    (ajusta los nombres según lo que devuelva la query anterior)
--    Ejecuta SOLO si identificas las tiendas/almacenes incorrectos

-- Desactivar almacenes de tienda online (si existen)
UPDATE warehouses
SET is_active = false
WHERE store_id IN (
  SELECT id FROM stores WHERE store_type IN ('online', 'warehouse')
);

-- Desactivar tiendas online/warehouse (si no las usas)
UPDATE stores
SET is_active = false
WHERE store_type IN ('online', 'warehouse');

-- =====================================================================
-- 4. Ver variantes sin stock_levels en ningún almacén físico activo
SELECT 
  p.sku,
  p.name,
  pv.variant_sku,
  COUNT(sl.id) AS stock_records
FROM products p
JOIN product_variants pv ON pv.product_id = p.id
LEFT JOIN stock_levels sl ON sl.product_variant_id = pv.id
   AND sl.warehouse_id IN (
     SELECT w.id FROM warehouses w 
     JOIN stores s ON s.id = w.store_id
     WHERE s.store_type = 'physical' AND s.is_active = true AND w.is_active = true
   )
GROUP BY p.sku, p.name, pv.variant_sku
HAVING COUNT(sl.id) = 0;

-- =====================================================================
-- 5. ACCIÓN: Crear stock_levels para variantes que no tienen en almacenes físicos
--    Esto pone quantity=0 en cada almacén físico activo para cada variante sin registro
INSERT INTO stock_levels (product_variant_id, warehouse_id, quantity, reserved)
SELECT 
  pv.id AS product_variant_id,
  w.id AS warehouse_id,
  0,
  0
FROM product_variants pv
CROSS JOIN warehouses w
JOIN stores s ON s.id = w.store_id
WHERE s.store_type = 'physical' 
  AND s.is_active = true 
  AND w.is_active = true
  AND NOT EXISTS (
    SELECT 1 FROM stock_levels sl2
    WHERE sl2.product_variant_id = pv.id
      AND sl2.warehouse_id = w.id
  )
ON CONFLICT (product_variant_id, warehouse_id) DO NOTHING;
