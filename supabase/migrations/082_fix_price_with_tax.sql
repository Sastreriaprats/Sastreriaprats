-- ============================================================
-- Migration 082: Convertir price_with_tax de GENERATED a columna normal
-- ============================================================
-- Problema: price_with_tax es GENERATED ALWAYS AS (ROUND(base_price * (1 + tax_rate / 100), 2))
-- El doble redondeo (base_price ya redondeado + multiplicación) produce errores de 1 céntimo.
-- Ej: PVP real 750 → base_price=619.83 → GENERATED=749.99 (pierde 1 céntimo)
--
-- Solución: almacenar price_with_tax directamente como columna normal.
-- ============================================================

-- 1. Guardar los valores actuales en columna temporal
ALTER TABLE products ADD COLUMN IF NOT EXISTS _pwt_backup DECIMAL(10,2);
UPDATE products SET _pwt_backup = price_with_tax;

-- 2. Dropear la vista que depende de la columna
DROP VIEW IF EXISTS v_products_with_stock;

-- 3. Eliminar la columna GENERATED
ALTER TABLE products DROP COLUMN IF EXISTS price_with_tax;

-- 4. Recrear como columna normal
ALTER TABLE products ADD COLUMN price_with_tax DECIMAL(10,2);

-- 5. Restaurar valores (redondeados al entero más cercano si están a < 0.02 de un entero)
UPDATE products SET price_with_tax = CASE
  WHEN ABS(_pwt_backup - ROUND(_pwt_backup, 0)) < 0.02
    THEN ROUND(_pwt_backup, 0)
  ELSE _pwt_backup
END
WHERE _pwt_backup IS NOT NULL;

-- 6. Para productos sin valor, recalcular
UPDATE products SET price_with_tax = ROUND(base_price * (1 + tax_rate / 100), 2)
WHERE price_with_tax IS NULL AND base_price IS NOT NULL;

-- 7. Limpiar columna temporal
ALTER TABLE products DROP COLUMN IF EXISTS _pwt_backup;

-- 8. Índice para ordenar por precio
CREATE INDEX IF NOT EXISTS idx_products_price_with_tax ON products(price_with_tax);

-- 9. Recrear la vista v_products_with_stock con la nueva columna
CREATE OR REPLACE VIEW v_products_with_stock AS
SELECT
  p.id,
  p.sku,
  p.name,
  p.product_type,
  p.brand,
  p.base_price,
  p.price_with_tax,
  p.cost_price,
  p.main_image_url,
  p.is_visible_web,
  p.is_active,
  pc.name AS category_name,
  pc.slug AS category_slug,
  s.name AS supplier_name,
  COALESCE(stock.total_quantity, 0) AS total_stock,
  COALESCE(stock.total_available, 0) AS total_available,
  COALESCE(stock.variant_count, 0) AS variant_count,
  COALESCE(stock.store_count, 0) AS store_count
FROM products p
LEFT JOIN product_categories pc ON pc.id = p.category_id
LEFT JOIN suppliers s ON s.id = p.supplier_id
LEFT JOIN LATERAL (
  SELECT
    SUM(sl.quantity) AS total_quantity,
    SUM(sl.available) AS total_available,
    COUNT(DISTINCT pv.id) AS variant_count,
    COUNT(DISTINCT sl.warehouse_id) AS store_count
  FROM product_variants pv
  JOIN stock_levels sl ON sl.product_variant_id = pv.id
  WHERE pv.product_id = p.id AND pv.is_active = TRUE
) stock ON TRUE;
