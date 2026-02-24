-- Categorías de tejidos y servicios para productos
-- Ejecutar en Supabase > SQL Editor si al elegir "Tejido" no aparecen categorías

-- 1. Añadir columna product_type si no existe
ALTER TABLE product_categories
  ADD COLUMN IF NOT EXISTS product_type TEXT;

-- 2. Añadir constraint si no existe (por si la columna ya existía sin constraint)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'product_categories_product_type_check'
  ) THEN
    ALTER TABLE product_categories
      ADD CONSTRAINT product_categories_product_type_check
      CHECK (product_type IS NULL OR product_type IN ('boutique', 'tailoring_fabric', 'accessory', 'service'));
  END IF;
END $$;

-- 3. Marcar categorías existentes como boutique (las que sigan con NULL)
UPDATE product_categories SET product_type = 'boutique' WHERE product_type IS NULL;

-- 4. Marcar Accesorios y subcategorías como complementos
UPDATE product_categories SET product_type = 'accessory'
WHERE slug IN ('accesorios', 'gemelos', 'cinturon', 'panuelo', 'pajarita');

-- 5. Insertar categorías de TEJIDOS (si no existen por slug)
INSERT INTO product_categories (name, slug, level, path, sort_order, product_type) VALUES
  ('Lana 100%', 'tejido-lana-100', 0, '/tejidos/lana-100', 1, 'tailoring_fabric'),
  ('Lana virgen', 'tejido-lana-virgen', 0, '/tejidos/lana-virgen', 2, 'tailoring_fabric'),
  ('Cachemira', 'tejido-cachemira', 0, '/tejidos/cachemira', 3, 'tailoring_fabric'),
  ('Algodón 100%', 'tejido-algodon-100', 0, '/tejidos/algodon-100', 4, 'tailoring_fabric'),
  ('Lino 100%', 'tejido-lino-100', 0, '/tejidos/lino-100', 5, 'tailoring_fabric'),
  ('Seda', 'tejido-seda', 0, '/tejidos/seda', 6, 'tailoring_fabric'),
  ('Tweed', 'tejido-tweed', 0, '/tejidos/tweed', 7, 'tailoring_fabric'),
  ('Mezcla lana', 'tejido-mezcla-lana', 0, '/tejidos/mezcla-lana', 8, 'tailoring_fabric'),
  ('Viscosa', 'tejido-viscosa', 0, '/tejidos/viscosa', 9, 'tailoring_fabric'),
  ('Terciopelo', 'tejido-terciopelo', 0, '/tejidos/terciopelo', 10, 'tailoring_fabric'),
  ('Otro tejido', 'tejido-otro', 0, '/tejidos/otro', 11, 'tailoring_fabric')
ON CONFLICT (slug) DO UPDATE SET
  product_type = EXCLUDED.product_type,
  name = EXCLUDED.name,
  path = EXCLUDED.path,
  sort_order = EXCLUDED.sort_order;

-- 6. Insertar categorías de SERVICIOS
INSERT INTO product_categories (name, slug, level, path, sort_order, product_type) VALUES
  ('Servicio sastrería', 'servicio-sastreria', 0, '/servicios/sastreria', 1, 'service'),
  ('Arreglos y ajustes', 'servicio-arreglos', 0, '/servicios/arreglos', 2, 'service'),
  ('Otro servicio', 'servicio-otro', 0, '/servicios/otro', 3, 'service')
ON CONFLICT (slug) DO UPDATE SET
  product_type = EXCLUDED.product_type,
  name = EXCLUDED.name,
  path = EXCLUDED.path,
  sort_order = EXCLUDED.sort_order;

-- Índice para filtrar por tipo
CREATE INDEX IF NOT EXISTS idx_product_categories_product_type
  ON product_categories(product_type) WHERE product_type IS NOT NULL;
