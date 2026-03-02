# Migraciones Supabase – Listado y SQL para ejecutar manualmente

## 1. Todas las migraciones en `supabase/migrations/` (ordenadas por nombre)

| Orden | Archivo |
|-------|---------|
| 1 | 001_auth_roles_stores.sql |
| 2 | 002_clients_measurements_suppliers.sql |
| 3 | 003a_products_stock.sql |
| 4 | 003b_tailoring_orders.sql |
| 5 | **003c_pos_cash.sql** |
| 6 | 003d_accounting.sql |
| 7 | 004_appointments.sql |
| 8 | 005_cms.sql |
| 9 | 006_online_orders.sql |
| 10 | 007_client_wishlist.sql |
| 11 | 008_email_system.sql |
| 12 | 009_migration_system.sql |
| 13 | 010_roles_v2.sql |
| 14 | 011_officials_permissions.sql |
| 15 | 012_officials_table.sql |
| 16 | 013_officials_rls.sql |
| 17 | 015_sync_schema.sql |
| 18 | 016_estimates_rls.sql |
| 19 | 017_manual_transactions.sql |
| 20 | 018_sales_journal_entry_id.sql |
| 21 | 019_online_orders_payment_reference.sql |
| 22 | 020_estimates_pdf_url_documents_bucket.sql |
| 23 | 021_product_categories_by_type.sql |
| 24 | 022_products_fabric_meters_used.sql |
| 25 | 023_deactivate_industrial_garment_type.sql |
| 26 | 024_client_measurements_body_type_id.sql |
| 27 | 025_payments_system.sql |
| 28 | 026_next_payment_date.sql |
| 29 | 027_online_orders_demo_payment.sql |
| 30 | 028_pending_online_orders.sql |
| 31 | 029_cancel_pending_online_orders.sql |
| 32 | 030_sastre_clients_create.sql |
| 33 | 031_sastre_permissions_medidas.sql |
| 34 | **032_vendedor_basico_permissions.sql** |
| 35 | **033_vendedor_basico_edit_stock.sql** |
| 36 | **034_product_barcodes.sql** |
| 37 | **035_search_pos_products.sql** |
| 38 | **036_tickets.sql** |
| 39 | **037_sastre_plus.sql** |
| 40 | **038_vendedor_avanzado.sql** |
| 41 | **039_barcodes_manage_admin_sastre_plus.sql** |

---

## 2. Migraciones que pueden NO estar aplicadas en tu Supabase

- **003c_pos_cash.sql** – El dashboard falla si falta: crea `cash_sessions`, `sales`, `sale_lines`, etc. que usa el dashboard. Es la que suele indicar el mensaje de error.
- **032** a **039** – Son las más recientes; si no has corrido migraciones hace tiempo, es probable que falten alguna o todas.

**Orden recomendado al ejecutar manualmente:** 003c → 032 → 033 → 034 → 035 → 036 → 037 → 038 → 039.

**Importante:** 003c debe estar aplicada antes que 003d, 018, etc. Si ya tienes las tablas `sales` y `cash_sessions`, no hace falta volver a ejecutar 003c (fallaría por “already exists”). En ese caso ejecuta solo las que falten a partir de 032.

---

## 3. Contenido de cada migración para pegar en Supabase SQL Editor

Ejecuta **una por una** en el SQL Editor de Supabase, en el orden indicado. Si alguna da error de “already exists” o “duplicate”, puedes omitirla y seguir con la siguiente.

---

### 003c_pos_cash.sql (TPV, caja, ventas, tickets)

```sql
-- ==========================================
-- SASTRERÍA PRATS — Migración 003c
-- TPV, Ventas, Caja, Tickets, Vales
-- ==========================================

-- 1. ENUMS
CREATE TYPE cash_session_status AS ENUM ('open', 'closed');
CREATE TYPE sale_status AS ENUM ('completed', 'partially_returned', 'fully_returned', 'voided');
CREATE TYPE payment_method_type AS ENUM ('cash', 'card', 'bizum', 'transfer', 'voucher', 'mixed');
CREATE TYPE voucher_status AS ENUM ('active', 'partially_used', 'used', 'expired', 'cancelled');

-- 2. SESIONES DE CAJA
CREATE TABLE cash_sessions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  store_id UUID NOT NULL REFERENCES stores(id) ON DELETE RESTRICT,

  opened_by UUID NOT NULL REFERENCES profiles(id) ON DELETE SET NULL,
  opened_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  opening_amount DECIMAL(12,2) NOT NULL,

  closed_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  closed_at TIMESTAMPTZ,

  total_cash_sales DECIMAL(12,2) DEFAULT 0.00,
  total_card_sales DECIMAL(12,2) DEFAULT 0.00,
  total_bizum_sales DECIMAL(12,2) DEFAULT 0.00,
  total_transfer_sales DECIMAL(12,2) DEFAULT 0.00,
  total_voucher_sales DECIMAL(12,2) DEFAULT 0.00,
  total_sales DECIMAL(12,2) DEFAULT 0.00,
  total_returns DECIMAL(12,2) DEFAULT 0.00,
  total_withdrawals DECIMAL(12,2) DEFAULT 0.00,
  total_deposits_collected DECIMAL(12,2) DEFAULT 0.00,

  expected_cash DECIMAL(12,2),
  counted_cash DECIMAL(12,2),
  cash_difference DECIMAL(12,2),

  status cash_session_status DEFAULT 'open' NOT NULL,
  closing_notes TEXT,

  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE INDEX idx_cash_sessions_store ON cash_sessions(store_id);
CREATE INDEX idx_cash_sessions_status ON cash_sessions(status);
CREATE INDEX idx_cash_sessions_opened ON cash_sessions(opened_at DESC);
CREATE INDEX idx_cash_sessions_open ON cash_sessions(store_id, status) WHERE status = 'open';

CREATE TRIGGER trigger_cash_sessions_updated_at
  BEFORE UPDATE ON cash_sessions FOR EACH ROW EXECUTE PROCEDURE update_updated_at();

-- 3. RETIRADAS DE EFECTIVO
CREATE TABLE cash_withdrawals (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  cash_session_id UUID NOT NULL REFERENCES cash_sessions(id) ON DELETE CASCADE,
  amount DECIMAL(12,2) NOT NULL,
  reason TEXT NOT NULL,
  withdrawn_by UUID NOT NULL REFERENCES profiles(id) ON DELETE SET NULL,
  withdrawn_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE INDEX idx_cash_withdrawals_session ON cash_withdrawals(cash_session_id);

-- 4. VENTAS / TICKETS
CREATE TABLE sales (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

  ticket_number VARCHAR(30) NOT NULL UNIQUE,

  cash_session_id UUID NOT NULL REFERENCES cash_sessions(id) ON DELETE RESTRICT,
  store_id UUID NOT NULL REFERENCES stores(id) ON DELETE RESTRICT,

  client_id UUID REFERENCES clients(id) ON DELETE SET NULL,

  salesperson_id UUID NOT NULL REFERENCES profiles(id) ON DELETE SET NULL,

  sale_type TEXT DEFAULT 'boutique' CHECK (sale_type IN ('boutique', 'tailoring_deposit', 'tailoring_final', 'alteration', 'online')),

  subtotal DECIMAL(12,2) NOT NULL,
  discount_amount DECIMAL(12,2) DEFAULT 0.00,
  discount_percentage DECIMAL(5,2) DEFAULT 0.00,
  discount_code TEXT,
  tax_amount DECIMAL(12,2) NOT NULL,
  total DECIMAL(12,2) NOT NULL,

  payment_method payment_method_type NOT NULL,

  is_tax_free BOOLEAN DEFAULT FALSE,
  tax_free_provider TEXT,
  tax_free_document_number TEXT,

  status sale_status DEFAULT 'completed' NOT NULL,

  tailoring_order_id UUID REFERENCES tailoring_orders(id) ON DELETE SET NULL,

  online_order_id UUID,

  notes TEXT,

  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE INDEX idx_sales_ticket ON sales(ticket_number);
CREATE INDEX idx_sales_session ON sales(cash_session_id);
CREATE INDEX idx_sales_store ON sales(store_id);
CREATE INDEX idx_sales_client ON sales(client_id);
CREATE INDEX idx_sales_salesperson ON sales(salesperson_id);
CREATE INDEX idx_sales_status ON sales(status);
CREATE INDEX idx_sales_type ON sales(sale_type);
CREATE INDEX idx_sales_tailoring ON sales(tailoring_order_id);
CREATE INDEX idx_sales_date ON sales(created_at DESC);
CREATE INDEX idx_sales_tax_free ON sales(is_tax_free) WHERE is_tax_free = TRUE;

CREATE TRIGGER trigger_sales_updated_at
  BEFORE UPDATE ON sales FOR EACH ROW EXECUTE PROCEDURE update_updated_at();

-- 5. LÍNEAS DE VENTA
CREATE TABLE sale_lines (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  sale_id UUID NOT NULL REFERENCES sales(id) ON DELETE CASCADE,

  product_variant_id UUID REFERENCES product_variants(id) ON DELETE SET NULL,

  description TEXT NOT NULL,
  sku TEXT,

  quantity INTEGER NOT NULL DEFAULT 1,

  unit_price DECIMAL(10,2) NOT NULL,
  discount_percentage DECIMAL(5,2) DEFAULT 0.00,
  discount_amount DECIMAL(10,2) DEFAULT 0.00,
  tax_rate DECIMAL(5,2) DEFAULT 21.00,
  line_total DECIMAL(10,2) NOT NULL,

  cost_price DECIMAL(10,2),

  quantity_returned INTEGER DEFAULT 0,
  returned_at TIMESTAMPTZ,
  return_reason TEXT,

  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE INDEX idx_sale_lines_sale ON sale_lines(sale_id);
CREATE INDEX idx_sale_lines_variant ON sale_lines(product_variant_id);

-- 6. PAGOS DE VENTA (soporta pagos mixtos)
CREATE TABLE sale_payments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  sale_id UUID NOT NULL REFERENCES sales(id) ON DELETE CASCADE,

  payment_method payment_method_type NOT NULL,
  amount DECIMAL(12,2) NOT NULL,

  reference TEXT,

  voucher_id UUID,

  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE INDEX idx_sale_payments_sale ON sale_payments(sale_id);
CREATE INDEX idx_sale_payments_method ON sale_payments(payment_method);

-- 7. VALES / GIFT CARDS
CREATE TABLE vouchers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

  code VARCHAR(20) NOT NULL UNIQUE,

  voucher_type TEXT DEFAULT 'fixed' CHECK (voucher_type IN ('fixed', 'percentage')),

  original_amount DECIMAL(10,2) NOT NULL,
  remaining_amount DECIMAL(10,2) NOT NULL,
  percentage DECIMAL(5,2),

  origin_sale_id UUID REFERENCES sales(id) ON DELETE SET NULL,

  client_id UUID REFERENCES clients(id) ON DELETE SET NULL,

  issued_date DATE DEFAULT CURRENT_DATE NOT NULL,
  expiry_date DATE NOT NULL,

  status voucher_status DEFAULT 'active' NOT NULL,

  issued_by_store_id UUID REFERENCES stores(id) ON DELETE SET NULL,
  issued_by UUID REFERENCES profiles(id) ON DELETE SET NULL,

  notes TEXT,

  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE INDEX idx_vouchers_code ON vouchers(code);
CREATE INDEX idx_vouchers_client ON vouchers(client_id);
CREATE INDEX idx_vouchers_status ON vouchers(status);
CREATE INDEX idx_vouchers_expiry ON vouchers(expiry_date) WHERE status = 'active';

CREATE TRIGGER trigger_vouchers_updated_at
  BEFORE UPDATE ON vouchers FOR EACH ROW EXECUTE PROCEDURE update_updated_at();

ALTER TABLE sale_payments
  ADD CONSTRAINT fk_sale_payments_voucher
  FOREIGN KEY (voucher_id) REFERENCES vouchers(id) ON DELETE SET NULL;

-- 8. DEVOLUCIONES / CAMBIOS
CREATE TABLE returns (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

  original_sale_id UUID NOT NULL REFERENCES sales(id) ON DELETE RESTRICT,

  return_type TEXT DEFAULT 'exchange' CHECK (return_type IN ('exchange', 'voucher')),

  total_returned DECIMAL(12,2) NOT NULL,

  voucher_id UUID REFERENCES vouchers(id) ON DELETE SET NULL,

  exchange_sale_id UUID REFERENCES sales(id) ON DELETE SET NULL,

  reason TEXT NOT NULL,

  processed_by UUID NOT NULL REFERENCES profiles(id) ON DELETE SET NULL,
  store_id UUID NOT NULL REFERENCES stores(id) ON DELETE RESTRICT,

  notes TEXT,

  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE INDEX idx_returns_original_sale ON returns(original_sale_id);
CREATE INDEX idx_returns_type ON returns(return_type);
CREATE INDEX idx_returns_store ON returns(store_id);
CREATE INDEX idx_returns_date ON returns(created_at DESC);

ALTER TABLE boutique_alterations
  ADD CONSTRAINT fk_alterations_sale
  FOREIGN KEY (sale_id) REFERENCES sales(id) ON DELETE SET NULL;

-- 9. CÓDIGOS DE DESCUENTO / CUPONES
CREATE TABLE discount_codes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  code VARCHAR(30) NOT NULL UNIQUE,
  description TEXT,

  discount_type TEXT DEFAULT 'percentage' CHECK (discount_type IN ('percentage', 'fixed')),
  discount_value DECIMAL(10,2) NOT NULL,

  min_purchase DECIMAL(10,2),
  max_uses INTEGER,
  current_uses INTEGER DEFAULT 0,
  valid_from DATE DEFAULT CURRENT_DATE,
  valid_until DATE,

  applies_to TEXT DEFAULT 'all' CHECK (applies_to IN ('all', 'boutique', 'tailoring', 'online')),
  category_ids UUID[] DEFAULT '{}',

  is_active BOOLEAN DEFAULT TRUE NOT NULL,
  created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,

  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE INDEX idx_discount_codes_code ON discount_codes(code);
CREATE INDEX idx_discount_codes_active ON discount_codes(is_active, valid_until);

CREATE TRIGGER trigger_discount_codes_updated_at
  BEFORE UPDATE ON discount_codes FOR EACH ROW EXECUTE PROCEDURE update_updated_at();
```

---

### 032_vendedor_basico_permissions.sql

```sql
-- Permisos del rol vendedor_basico para el panel /vendedor
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
CROSS JOIN permissions p
WHERE r.name = 'vendedor_basico'
AND p.code IN (
  'clients.view',
  'clients.create',
  'clients.edit',
  'products.view',
  'products.edit',
  'products.edit_price',
  'stock.view',
  'stock.edit',
  'orders.view',
  'pos.access',
  'pos.open_session',
  'pos.close_session',
  'pos.sell'
)
ON CONFLICT (role_id, permission_id) DO NOTHING;
```

---

### 033_vendedor_basico_edit_stock.sql

```sql
-- vendedor_basico: permitir editar productos y modificar stock
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
JOIN permissions p ON p.code IN ('products.edit', 'products.edit_price', 'stock.edit')
WHERE r.name = 'vendedor_basico'
ON CONFLICT (role_id, permission_id) DO NOTHING;
```

---

### 034_product_barcodes.sql

```sql
-- Códigos de barras EAN-13 en productos
ALTER TABLE products ADD COLUMN IF NOT EXISTS barcode_generated_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_products_barcode ON products(barcode);

CREATE UNIQUE INDEX IF NOT EXISTS idx_products_barcode_unique ON products(barcode) WHERE barcode IS NOT NULL AND barcode != '';
```

---

### 035_search_pos_products.sql

```sql
-- Búsqueda TPV por nombre/SKU/código de barras
CREATE OR REPLACE FUNCTION search_pos_products(
  p_query text,
  p_warehouse_id uuid,
  p_limit int DEFAULT 20
)
RETURNS SETOF jsonb
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'id', v.id,
    'variant_sku', v.variant_sku,
    'size', v.size,
    'color', v.color,
    'barcode', v.barcode,
    'price_override', v.price_override,
    'is_active', v.is_active,
    'products', jsonb_build_object(
      'id', p.id,
      'sku', p.sku,
      'name', p.name,
      'base_price', p.base_price,
      'price_with_tax', p.price_with_tax,
      'tax_rate', p.tax_rate,
      'main_image_url', p.main_image_url,
      'product_type', p.product_type,
      'brand', p.brand,
      'cost_price', p.cost_price
    ),
    'stock_levels', COALESCE(
      (
        SELECT jsonb_agg(jsonb_build_object(
          'quantity', sl.quantity,
          'available', sl.available,
          'warehouse_id', sl.warehouse_id
        ))
        FROM stock_levels sl
        WHERE sl.product_variant_id = v.id AND sl.warehouse_id = p_warehouse_id
      ),
      '[]'::jsonb
    )
  )
  FROM product_variants v
  JOIN products p ON p.id = v.product_id
  WHERE v.is_active = true
    AND EXISTS (
      SELECT 1 FROM stock_levels sl2
      WHERE sl2.product_variant_id = v.id AND sl2.warehouse_id = p_warehouse_id
    )
    AND (
      v.variant_sku ILIKE '%' || p_query || '%'
      OR v.barcode ILIKE '%' || p_query || '%'
      OR p.name ILIKE '%' || p_query || '%'
      OR p.sku ILIKE '%' || p_query || '%'
    )
  ORDER BY p.name, v.variant_sku
  LIMIT p_limit;
$$;

COMMENT ON FUNCTION search_pos_products(text, uuid, int) IS 'Búsqueda de variantes para TPV por texto (nombre producto, SKU, código de barras) en el almacén dado.';
```

---

### 036_tickets.sql

```sql
-- Tickets: URL de PDF opcional
ALTER TABLE sales ADD COLUMN IF NOT EXISTS ticket_pdf_url TEXT;

COMMENT ON COLUMN sales.ticket_pdf_url IS 'URL del PDF del ticket si se ha generado y subido a storage.';
```

---

### 037_sastre_plus.sql

```sql
-- Rol sastre_plus: permisos combinados de sastre + vendedor_basico
INSERT INTO roles (name, display_name, description)
VALUES ('sastre_plus', 'Sastre Plus', 'Sastre con acceso completo a tienda')
ON CONFLICT (name) DO UPDATE SET
  display_name = EXCLUDED.display_name,
  description = EXCLUDED.description;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
CROSS JOIN permissions p
WHERE r.name = 'sastre_plus'
AND p.code IN (
  'clients.view', 'clients.create', 'clients.edit',
  'clients.view_measurements', 'clients.edit_measurements',
  'orders.view', 'orders.create', 'orders.edit',
  'products.view', 'products.create', 'products.edit',
  'stock.view', 'stock.edit',
  'pos.access', 'pos.open_session', 'pos.close_session', 'pos.sell',
  'accounting.view'
)
ON CONFLICT (role_id, permission_id) DO NOTHING;
```

---

### 038_vendedor_avanzado.sql

```sql
-- Rol vendedor_avanzado y permiso barcodes.manage
INSERT INTO roles (name, display_name, description, role_type, system_role, hierarchy_level, color, icon)
VALUES (
  'vendedor_avanzado',
  'Vendedor Avanzado',
  'Vendedor con acceso a etiquetas y códigos de barras',
  'system',
  'salesperson',
  35,
  '#B45309',
  'shopping-bag'
)
ON CONFLICT (name) DO UPDATE SET
  display_name = EXCLUDED.display_name,
  description  = EXCLUDED.description,
  color        = EXCLUDED.color;

INSERT INTO permissions (code, module, action, display_name, description, category, sort_order)
VALUES (
  'barcodes.manage',
  'stock',
  'update',
  'Gestionar códigos de barras',
  'Gestionar códigos de barras e imprimir etiquetas',
  'Stock',
  76
)
ON CONFLICT (code) DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
CROSS JOIN permissions p
WHERE r.name = 'vendedor_avanzado'
AND p.code IN (
  'clients.view',
  'clients.create',
  'clients.edit',
  'products.view',
  'products.edit',
  'products.edit_price',
  'stock.view',
  'stock.edit',
  'orders.view',
  'pos.access',
  'pos.open_session',
  'pos.close_session',
  'pos.sell',
  'barcodes.manage'
)
ON CONFLICT (role_id, permission_id) DO NOTHING;
```

---

### 039_barcodes_manage_admin_sastre_plus.sql

```sql
-- Asignar barcodes.manage a administrador y sastre_plus
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
CROSS JOIN permissions p
WHERE p.code = 'barcodes.manage'
AND r.name IN ('administrador', 'sastre_plus')
ON CONFLICT (role_id, permission_id) DO NOTHING;
```

---

**Resumen:** Ejecuta en el SQL Editor de Supabase, en este orden, solo las que te falten:

1. **003c_pos_cash** (si no tienes tablas `cash_sessions` / `sales`).
2. **032** → **033** → **034** → **035** → **036** → **037** → **038** → **039**.

Si 003c ya está aplicada, empieza por 032. Tras aplicar 003c (y las que necesites), el dashboard debería cargar sin el error de “unexpected response” por tablas faltantes.
