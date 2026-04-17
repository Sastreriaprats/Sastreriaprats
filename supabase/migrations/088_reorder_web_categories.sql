-- Reordenar categorías web según preferencia del usuario
UPDATE product_categories SET sort_order = 10 WHERE slug = 'nueva-coleccion';
UPDATE product_categories SET sort_order = 20 WHERE slug = 'trajes';
UPDATE product_categories SET sort_order = 30 WHERE slug = 'americanas-tebas';
UPDATE product_categories SET sort_order = 40 WHERE slug = 'pantalones';
UPDATE product_categories SET sort_order = 50 WHERE slug = 'jersey';
UPDATE product_categories SET sort_order = 60 WHERE slug = 'camisas-poleras';
UPDATE product_categories SET sort_order = 70 WHERE slug = 'prenda-exterior';
UPDATE product_categories SET sort_order = 80 WHERE slug = 'homewear';
UPDATE product_categories SET sort_order = 90 WHERE slug = 'accesorios';

-- Vincular categorías antiguas (usadas por productos) como hijas de las nuevas categorías web.
-- Así al filtrar por categoría web padre se encuentran los productos asignados a las antiguas.

-- Americana → hija de Americanas | Tebas
UPDATE product_categories SET parent_id = (SELECT id FROM product_categories WHERE slug = 'americanas-tebas')
WHERE slug = 'americana' AND parent_id IS NULL;

-- Pantalón → hija de Pantalones
UPDATE product_categories SET parent_id = (SELECT id FROM product_categories WHERE slug = 'pantalones')
WHERE slug = 'pantalon' AND parent_id IS NULL;

-- Camisa → hija de Camisas y Poleras
UPDATE product_categories SET parent_id = (SELECT id FROM product_categories WHERE slug = 'camisas-poleras')
WHERE slug = 'camisa' AND parent_id IS NULL;

-- Abrigo → hija de Prenda Exterior
UPDATE product_categories SET parent_id = (SELECT id FROM product_categories WHERE slug = 'prenda-exterior')
WHERE slug = 'abrigo' AND parent_id IS NULL;

-- Punto → hija de Jersey
UPDATE product_categories SET parent_id = (SELECT id FROM product_categories WHERE slug = 'jersey')
WHERE slug = 'punto' AND parent_id IS NULL;

-- Chaleco y Ceremonia → hijas de Trajes
UPDATE product_categories SET parent_id = (SELECT id FROM product_categories WHERE slug = 'trajes')
WHERE slug IN ('chaleco', 'ceremonia') AND parent_id IS NULL;

-- Corbata → hija de Accesorios
UPDATE product_categories SET parent_id = (SELECT id FROM product_categories WHERE slug = 'accesorios')
WHERE slug = 'corbata' AND parent_id IS NULL;
