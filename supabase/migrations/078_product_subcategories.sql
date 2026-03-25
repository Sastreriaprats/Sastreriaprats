-- Añadir categoría "Camisas y Poleras" que faltaba
INSERT INTO product_categories (name, slug, sort_order, is_active, is_visible_web, product_type, is_seasonal, level)
VALUES ('Camisas y Poleras', 'camisas-poleras', 55, true, true, 'boutique', false, 0)
ON CONFLICT (slug) DO UPDATE SET
  sort_order = EXCLUDED.sort_order,
  is_active = true,
  is_visible_web = true,
  is_seasonal = false,
  updated_at = NOW();

-- Subcategorías de Prenda Exterior
INSERT INTO product_categories (name, slug, sort_order, is_active, is_visible_web, product_type, level, parent_id)
VALUES
  ('Abrigos y Anoraks', 'abrigos-anoraks', 1, true, true, 'boutique', 1, (SELECT id FROM product_categories WHERE slug = 'prenda-exterior')),
  ('Cazadoras', 'cazadoras', 2, true, true, 'boutique', 1, (SELECT id FROM product_categories WHERE slug = 'prenda-exterior')),
  ('Gabardinas', 'gabardinas', 3, true, true, 'boutique', 1, (SELECT id FROM product_categories WHERE slug = 'prenda-exterior')),
  ('Saharianas', 'saharianas', 4, true, true, 'boutique', 1, (SELECT id FROM product_categories WHERE slug = 'prenda-exterior'))
ON CONFLICT (slug) DO UPDATE SET
  parent_id = EXCLUDED.parent_id,
  sort_order = EXCLUDED.sort_order,
  is_active = true,
  is_visible_web = true,
  level = 1,
  updated_at = NOW();

-- Subcategorías de Americanas | Tebas
INSERT INTO product_categories (name, slug, sort_order, is_active, is_visible_web, product_type, level, parent_id)
VALUES
  ('Americanas', 'americanas', 1, true, true, 'boutique', 1, (SELECT id FROM product_categories WHERE slug = 'americanas-tebas')),
  ('Tebas', 'tebas', 2, true, true, 'boutique', 1, (SELECT id FROM product_categories WHERE slug = 'americanas-tebas'))
ON CONFLICT (slug) DO UPDATE SET
  parent_id = EXCLUDED.parent_id,
  sort_order = EXCLUDED.sort_order,
  is_active = true,
  is_visible_web = true,
  level = 1,
  updated_at = NOW();

-- Subcategorías de Pantalones
INSERT INTO product_categories (name, slug, sort_order, is_active, is_visible_web, product_type, level, parent_id)
VALUES
  ('Algodón', 'pantalones-algodon', 1, true, true, 'boutique', 1, (SELECT id FROM product_categories WHERE slug = 'pantalones')),
  ('Lana', 'pantalones-lana', 2, true, true, 'boutique', 1, (SELECT id FROM product_categories WHERE slug = 'pantalones'))
ON CONFLICT (slug) DO UPDATE SET
  parent_id = EXCLUDED.parent_id,
  sort_order = EXCLUDED.sort_order,
  is_active = true,
  is_visible_web = true,
  level = 1,
  updated_at = NOW();

-- Subcategorías de Camisas y Poleras
INSERT INTO product_categories (name, slug, sort_order, is_active, is_visible_web, product_type, level, parent_id)
VALUES
  ('Camisas', 'camisas', 1, true, true, 'boutique', 1, (SELECT id FROM product_categories WHERE slug = 'camisas-poleras')),
  ('Sobrecamisas', 'sobrecamisas', 2, true, true, 'boutique', 1, (SELECT id FROM product_categories WHERE slug = 'camisas-poleras')),
  ('Poleras', 'poleras', 3, true, true, 'boutique', 1, (SELECT id FROM product_categories WHERE slug = 'camisas-poleras'))
ON CONFLICT (slug) DO UPDATE SET
  parent_id = EXCLUDED.parent_id,
  sort_order = EXCLUDED.sort_order,
  is_active = true,
  is_visible_web = true,
  level = 1,
  updated_at = NOW();

-- Subcategorías de Homewear
INSERT INTO product_categories (name, slug, sort_order, is_active, is_visible_web, product_type, level, parent_id)
VALUES
  ('Batas', 'batas', 1, true, true, 'boutique', 1, (SELECT id FROM product_categories WHERE slug = 'homewear')),
  ('Pijamas', 'pijamas', 2, true, true, 'boutique', 1, (SELECT id FROM product_categories WHERE slug = 'homewear'))
ON CONFLICT (slug) DO UPDATE SET
  parent_id = EXCLUDED.parent_id,
  sort_order = EXCLUDED.sort_order,
  is_active = true,
  is_visible_web = true,
  level = 1,
  updated_at = NOW();

-- Subcategorías de Accesorios
INSERT INTO product_categories (name, slug, sort_order, is_active, is_visible_web, product_type, level, parent_id)
VALUES
  ('Corbatas', 'corbatas', 1, true, true, 'boutique', 1, (SELECT id FROM product_categories WHERE slug = 'accesorios')),
  ('Pañuelos', 'panuelos', 2, true, true, 'boutique', 1, (SELECT id FROM product_categories WHERE slug = 'accesorios')),
  ('Smoking', 'smoking-accesorios', 3, true, true, 'boutique', 1, (SELECT id FROM product_categories WHERE slug = 'accesorios'))
ON CONFLICT (slug) DO UPDATE SET
  parent_id = EXCLUDED.parent_id,
  sort_order = EXCLUDED.sort_order,
  is_active = true,
  is_visible_web = true,
  level = 1,
  updated_at = NOW();
