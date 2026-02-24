-- =====================================================================
-- Script: move-stock-to-pinzon.sql
-- Mueve todo el stock al almacén de Hernán Pinzón y pone Wellington a 0
-- =====================================================================

-- 1. Ver IDs de los dos almacenes
SELECT w.id, w.name, s.name AS store
FROM warehouses w
JOIN stores s ON s.id = w.store_id
WHERE s.is_active = true AND w.is_active = true
ORDER BY w.name;

-- =====================================================================
-- 2. Mover stock de Wellington a Pinzón
--    (suma la cantidad de Wellington en Pinzón y pone Wellington a 0)

WITH pinzon AS (
  SELECT w.id
  FROM warehouses w
  JOIN stores s ON s.id = w.store_id
  WHERE s.store_type = 'physical' AND s.is_active = true AND w.is_active = true
    AND (w.name ILIKE '%pinz%' OR s.name ILIKE '%pinz%' OR s.name ILIKE '%hern%')
  LIMIT 1
),
wellington AS (
  SELECT w.id
  FROM warehouses w
  JOIN stores s ON s.id = w.store_id
  WHERE s.store_type = 'physical' AND s.is_active = true AND w.is_active = true
    AND (w.name ILIKE '%welling%' OR s.name ILIKE '%welling%')
  LIMIT 1
)
-- Sumar el stock de Wellington al de Pinzón (para cada variante que tenga stock en Wellington)
UPDATE stock_levels sl_pinzon
SET quantity = sl_pinzon.quantity + sl_welling.quantity
FROM stock_levels sl_welling, pinzon, wellington
WHERE sl_pinzon.warehouse_id = pinzon.id
  AND sl_welling.warehouse_id = wellington.id
  AND sl_pinzon.product_variant_id = sl_welling.product_variant_id
  AND sl_welling.quantity > 0;

-- Poner Wellington a 0
UPDATE stock_levels
SET quantity = 0, reserved = 0
WHERE warehouse_id = (
  SELECT w.id FROM warehouses w
  JOIN stores s ON s.id = w.store_id
  WHERE s.store_type = 'physical' AND s.is_active = true AND w.is_active = true
    AND (w.name ILIKE '%welling%' OR s.name ILIKE '%welling%')
  LIMIT 1
);

-- =====================================================================
-- 3. Verificar resultado
SELECT 
  w.name AS almacen,
  COUNT(sl.id) AS variantes,
  SUM(sl.quantity) AS total_unidades
FROM stock_levels sl
JOIN warehouses w ON w.id = sl.warehouse_id
JOIN stores s ON s.id = w.store_id
WHERE s.is_active = true AND w.is_active = true AND s.store_type = 'physical'
GROUP BY w.name
ORDER BY w.name;
