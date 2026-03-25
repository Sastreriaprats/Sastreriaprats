-- Añadir campo is_seasonal para categorías estacionales
ALTER TABLE product_categories ADD COLUMN IF NOT EXISTS is_seasonal BOOLEAN DEFAULT false;

-- Insertar categorías que falten (ON CONFLICT por slug)
INSERT INTO product_categories (name, slug, sort_order, is_active, is_visible_web, product_type, is_seasonal)
VALUES
  ('Nueva Colección', 'nueva-coleccion', 10, true, true, 'boutique', false),
  ('Prenda Exterior', 'prenda-exterior', 20, true, true, 'boutique', false),
  ('Americanas | Tebas', 'americanas-tebas', 30, true, true, 'boutique', false),
  ('Trajes', 'trajes', 40, true, true, 'boutique', false),
  ('Pantalones', 'pantalones', 50, true, true, 'boutique', false),
  ('Jersey', 'jersey', 60, true, true, 'boutique', true),
  ('Homewear', 'homewear', 70, true, true, 'boutique', false),
  ('Accesorios', 'accesorios', 80, true, true, 'boutique', false)
ON CONFLICT (slug) DO UPDATE SET
  sort_order = EXCLUDED.sort_order,
  is_active = EXCLUDED.is_active,
  is_visible_web = EXCLUDED.is_visible_web,
  is_seasonal = EXCLUDED.is_seasonal,
  updated_at = NOW();

-- Actualizar sort_order de categorías existentes que coincidan por nombre (variantes)
UPDATE product_categories SET sort_order = 80, name = 'Accesorios', is_visible_web = true WHERE slug = 'accesorios';
UPDATE product_categories SET sort_order = 50, name = 'Pantalones', is_visible_web = true WHERE slug IN ('pantalon', 'pantalones');
UPDATE product_categories SET is_seasonal = true WHERE slug = 'jersey';

-- Desactivar categorías boutique de nivel 0 que no están en la nueva lista (pero NO borrar)
-- Las categorías de tejido/servicio se mantienen intactas
UPDATE product_categories
SET is_visible_web = false
WHERE parent_id IS NULL
  AND product_type = 'boutique'
  AND slug NOT IN (
    'nueva-coleccion', 'prenda-exterior', 'americanas-tebas',
    'trajes', 'pantalones', 'jersey', 'homewear', 'accesorios'
  );
