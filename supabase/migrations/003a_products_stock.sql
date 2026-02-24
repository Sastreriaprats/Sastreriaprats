-- ==========================================
-- SASTRERÍA PRATS — Migración 003a
-- Productos, Variantes y Stock Multi-tienda
-- ==========================================

-- 1. ENUMS
CREATE TYPE product_type AS ENUM ('boutique', 'tailoring_fabric', 'accessory', 'service');
CREATE TYPE stock_movement_type AS ENUM (
  'purchase', 'sale', 'return', 'transfer_in', 'transfer_out',
  'adjustment_positive', 'adjustment_negative', 'inventory',
  'reservation', 'reservation_release', 'initial'
);
CREATE TYPE transfer_status AS ENUM ('requested', 'approved', 'in_transit', 'received', 'cancelled');

-- 2. CATEGORÍAS DE PRODUCTO (jerárquicas)
CREATE TABLE product_categories (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  description TEXT,
  parent_id UUID REFERENCES product_categories(id) ON DELETE SET NULL,
  level INTEGER DEFAULT 0,
  path TEXT,
  image_url TEXT,
  is_visible_web BOOLEAN DEFAULT TRUE,
  seo_title TEXT,
  seo_description TEXT,
  sort_order INTEGER DEFAULT 0,
  icon TEXT,
  is_active BOOLEAN DEFAULT TRUE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE INDEX idx_product_categories_slug ON product_categories(slug);
CREATE INDEX idx_product_categories_parent ON product_categories(parent_id);
CREATE INDEX idx_product_categories_path ON product_categories(path);
CREATE INDEX idx_product_categories_active ON product_categories(is_active);

CREATE TRIGGER trigger_product_categories_updated_at
  BEFORE UPDATE ON product_categories FOR EACH ROW EXECUTE PROCEDURE update_updated_at();

-- 3. PRODUCTOS (artículo maestro)
CREATE TABLE products (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  sku VARCHAR(30) NOT NULL UNIQUE,
  name TEXT NOT NULL,
  description TEXT,
  product_type product_type DEFAULT 'boutique' NOT NULL,
  category_id UUID REFERENCES product_categories(id) ON DELETE SET NULL,
  brand TEXT,
  collection TEXT,
  season TEXT,
  
  cost_price DECIMAL(10,2),
  base_price DECIMAL(10,2) NOT NULL,
  tax_rate DECIMAL(5,2) DEFAULT 21.00,
  price_with_tax DECIMAL(10,2) GENERATED ALWAYS AS (ROUND(base_price * (1 + tax_rate / 100), 2)) STORED,
  
  supplier_id UUID REFERENCES suppliers(id) ON DELETE SET NULL,
  supplier_reference TEXT,
  
  images JSONB DEFAULT '[]'::jsonb,
  main_image_url TEXT,
  
  color TEXT,
  material TEXT,
  
  is_visible_web BOOLEAN DEFAULT FALSE,
  web_slug TEXT UNIQUE,
  web_title TEXT,
  web_description TEXT,
  seo_title TEXT,
  seo_description TEXT,
  web_tags TEXT[] DEFAULT '{}',
  related_product_ids UUID[] DEFAULT '{}',
  
  barcode TEXT,
  barcode_type TEXT DEFAULT 'EAN13' CHECK (barcode_type IN ('EAN13', 'Code128', 'QR')),
  label_description TEXT,
  
  min_stock_alert INTEGER,
  stale_days_threshold INTEGER DEFAULT 90,
  
  is_sample BOOLEAN DEFAULT FALSE,
  
  is_active BOOLEAN DEFAULT TRUE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  created_by UUID REFERENCES profiles(id) ON DELETE SET NULL
);

CREATE INDEX idx_products_sku ON products(sku);
CREATE INDEX idx_products_name ON products USING gin(name gin_trgm_ops);
CREATE INDEX idx_products_type ON products(product_type);
CREATE INDEX idx_products_category ON products(category_id);
CREATE INDEX idx_products_supplier ON products(supplier_id);
CREATE INDEX idx_products_brand ON products(brand);
CREATE INDEX idx_products_season ON products(season);
CREATE INDEX idx_products_web ON products(is_visible_web) WHERE is_visible_web = TRUE;
CREATE INDEX idx_products_web_slug ON products(web_slug);
CREATE INDEX idx_products_barcode ON products(barcode);
CREATE INDEX idx_products_active ON products(is_active);
CREATE INDEX idx_products_sample ON products(is_sample) WHERE is_sample = TRUE;

CREATE TRIGGER trigger_products_updated_at
  BEFORE UPDATE ON products FOR EACH ROW EXECUTE PROCEDURE update_updated_at();

-- 4. VARIANTES DE PRODUCTO (talla + color = SKU único)
CREATE TABLE product_variants (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  size TEXT,
  color TEXT,
  color_hex TEXT,
  variant_sku VARCHAR(40) NOT NULL UNIQUE,
  barcode TEXT UNIQUE,
  price_override DECIMAL(10,2),
  cost_price_override DECIMAL(10,2),
  image_url TEXT,
  weight_grams INTEGER,
  is_active BOOLEAN DEFAULT TRUE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  UNIQUE(product_id, size, color)
);

CREATE INDEX idx_product_variants_product ON product_variants(product_id);
CREATE INDEX idx_product_variants_sku ON product_variants(variant_sku);
CREATE INDEX idx_product_variants_barcode ON product_variants(barcode);
CREATE INDEX idx_product_variants_size ON product_variants(size);
CREATE INDEX idx_product_variants_color ON product_variants(color);
CREATE INDEX idx_product_variants_active ON product_variants(is_active);

CREATE TRIGGER trigger_product_variants_updated_at
  BEFORE UPDATE ON product_variants FOR EACH ROW EXECUTE PROCEDURE update_updated_at();

-- 5. STOCK POR ALMACÉN
CREATE TABLE stock_levels (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  product_variant_id UUID NOT NULL REFERENCES product_variants(id) ON DELETE CASCADE,
  warehouse_id UUID NOT NULL REFERENCES warehouses(id) ON DELETE CASCADE,
  quantity INTEGER DEFAULT 0 NOT NULL,
  reserved INTEGER DEFAULT 0 NOT NULL,
  available INTEGER GENERATED ALWAYS AS (quantity - reserved) STORED,
  min_stock INTEGER,
  last_movement_at TIMESTAMPTZ,
  last_sale_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  UNIQUE(product_variant_id, warehouse_id)
);

CREATE INDEX idx_stock_levels_variant ON stock_levels(product_variant_id);
CREATE INDEX idx_stock_levels_warehouse ON stock_levels(warehouse_id);
CREATE INDEX idx_stock_levels_low ON stock_levels(quantity, min_stock) WHERE min_stock IS NOT NULL;

CREATE TRIGGER trigger_stock_levels_updated_at
  BEFORE UPDATE ON stock_levels FOR EACH ROW EXECUTE PROCEDURE update_updated_at();

-- 6. MOVIMIENTOS DE STOCK
CREATE TABLE stock_movements (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  product_variant_id UUID NOT NULL REFERENCES product_variants(id) ON DELETE RESTRICT,
  warehouse_id UUID NOT NULL REFERENCES warehouses(id) ON DELETE RESTRICT,
  movement_type stock_movement_type NOT NULL,
  quantity INTEGER NOT NULL,
  stock_before INTEGER NOT NULL,
  stock_after INTEGER NOT NULL,
  reference_type TEXT,
  reference_id UUID,
  reason TEXT,
  notes TEXT,
  created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  store_id UUID REFERENCES stores(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE INDEX idx_stock_movements_variant ON stock_movements(product_variant_id);
CREATE INDEX idx_stock_movements_warehouse ON stock_movements(warehouse_id);
CREATE INDEX idx_stock_movements_type ON stock_movements(movement_type);
CREATE INDEX idx_stock_movements_reference ON stock_movements(reference_type, reference_id);
CREATE INDEX idx_stock_movements_created ON stock_movements(created_at DESC);

-- 7. TRASPASOS ENTRE TIENDAS
CREATE TABLE stock_transfers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  transfer_number VARCHAR(30) NOT NULL UNIQUE,
  from_warehouse_id UUID NOT NULL REFERENCES warehouses(id) ON DELETE RESTRICT,
  to_warehouse_id UUID NOT NULL REFERENCES warehouses(id) ON DELETE RESTRICT,
  status transfer_status DEFAULT 'requested' NOT NULL,
  requested_by UUID NOT NULL REFERENCES profiles(id) ON DELETE SET NULL,
  approved_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  approved_at TIMESTAMPTZ,
  received_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  received_at TIMESTAMPTZ,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE INDEX idx_stock_transfers_status ON stock_transfers(status);
CREATE INDEX idx_stock_transfers_from ON stock_transfers(from_warehouse_id);
CREATE INDEX idx_stock_transfers_to ON stock_transfers(to_warehouse_id);

CREATE TRIGGER trigger_stock_transfers_updated_at
  BEFORE UPDATE ON stock_transfers FOR EACH ROW EXECUTE PROCEDURE update_updated_at();

-- 8. LÍNEAS DE TRASPASO
CREATE TABLE stock_transfer_lines (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  transfer_id UUID NOT NULL REFERENCES stock_transfers(id) ON DELETE CASCADE,
  product_variant_id UUID NOT NULL REFERENCES product_variants(id) ON DELETE RESTRICT,
  quantity_requested INTEGER NOT NULL,
  quantity_sent INTEGER DEFAULT 0,
  quantity_received INTEGER DEFAULT 0,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE INDEX idx_stock_transfer_lines_transfer ON stock_transfer_lines(transfer_id);

-- 9. INVENTARIOS
CREATE TABLE inventories (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  warehouse_id UUID NOT NULL REFERENCES warehouses(id) ON DELETE RESTRICT,
  inventory_type TEXT DEFAULT 'full' CHECK (inventory_type IN ('full', 'partial')),
  category_filter UUID REFERENCES product_categories(id) ON DELETE SET NULL,
  status TEXT DEFAULT 'in_progress' CHECK (status IN ('in_progress', 'completed', 'cancelled')),
  total_items_counted INTEGER DEFAULT 0,
  total_differences INTEGER DEFAULT 0,
  total_value_difference DECIMAL(12,2) DEFAULT 0.00,
  started_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  completed_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  started_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE INDEX idx_inventories_warehouse ON inventories(warehouse_id);
CREATE INDEX idx_inventories_status ON inventories(status);

CREATE TRIGGER trigger_inventories_updated_at
  BEFORE UPDATE ON inventories FOR EACH ROW EXECUTE PROCEDURE update_updated_at();

-- 10. LÍNEAS DE INVENTARIO
CREATE TABLE inventory_lines (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  inventory_id UUID NOT NULL REFERENCES inventories(id) ON DELETE CASCADE,
  product_variant_id UUID NOT NULL REFERENCES product_variants(id) ON DELETE RESTRICT,
  expected_quantity INTEGER NOT NULL,
  counted_quantity INTEGER,
  difference INTEGER GENERATED ALWAYS AS (counted_quantity - expected_quantity) STORED,
  reason TEXT,
  counted_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  counted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE INDEX idx_inventory_lines_inventory ON inventory_lines(inventory_id);
CREATE INDEX idx_inventory_lines_variant ON inventory_lines(product_variant_id);

-- SEED: Categorías de producto
INSERT INTO product_categories (name, slug, level, path, sort_order) VALUES
  ('Americana', 'americana', 0, '/americana', 1),
  ('Pantalón', 'pantalon', 0, '/pantalon', 2),
  ('Camisa', 'camisa', 0, '/camisa', 3),
  ('Chaleco', 'chaleco', 0, '/chaleco', 4),
  ('Corbata', 'corbata', 0, '/corbata', 5),
  ('Abrigo', 'abrigo', 0, '/abrigo', 6),
  ('Accesorios', 'accesorios', 0, '/accesorios', 7),
  ('Zapatos', 'zapatos', 0, '/zapatos', 8),
  ('Punto', 'punto', 0, '/punto', 9),
  ('Ceremonia', 'ceremonia', 0, '/ceremonia', 10);

-- Subcategorías
INSERT INTO product_categories (name, slug, parent_id, level, path, sort_order) VALUES
  ('Americana Sport', 'americana-sport', (SELECT id FROM product_categories WHERE slug='americana'), 1, '/americana/sport', 1),
  ('Americana Traje', 'americana-traje', (SELECT id FROM product_categories WHERE slug='americana'), 1, '/americana/traje', 2),
  ('Americana Blazer', 'americana-blazer', (SELECT id FROM product_categories WHERE slug='americana'), 1, '/americana/blazer', 3),
  ('Pantalón Vestir', 'pantalon-vestir', (SELECT id FROM product_categories WHERE slug='pantalon'), 1, '/pantalon/vestir', 1),
  ('Pantalón Chino', 'pantalon-chino', (SELECT id FROM product_categories WHERE slug='pantalon'), 1, '/pantalon/chino', 2),
  ('Camisa Vestir', 'camisa-vestir', (SELECT id FROM product_categories WHERE slug='camisa'), 1, '/camisa/vestir', 1),
  ('Camisa Sport', 'camisa-sport', (SELECT id FROM product_categories WHERE slug='camisa'), 1, '/camisa/sport', 2),
  ('Gemelos', 'gemelos', (SELECT id FROM product_categories WHERE slug='accesorios'), 1, '/accesorios/gemelos', 1),
  ('Cinturón', 'cinturon', (SELECT id FROM product_categories WHERE slug='accesorios'), 1, '/accesorios/cinturon', 2),
  ('Pañuelo', 'panuelo', (SELECT id FROM product_categories WHERE slug='accesorios'), 1, '/accesorios/panuelo', 3),
  ('Pajarita', 'pajarita', (SELECT id FROM product_categories WHERE slug='accesorios'), 1, '/accesorios/pajarita', 4),
  ('Chaqué', 'chaque', (SELECT id FROM product_categories WHERE slug='ceremonia'), 1, '/ceremonia/chaque', 1),
  ('Smoking', 'smoking', (SELECT id FROM product_categories WHERE slug='ceremonia'), 1, '/ceremonia/smoking', 2);
