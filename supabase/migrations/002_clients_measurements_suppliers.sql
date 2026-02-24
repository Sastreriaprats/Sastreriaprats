-- ==========================================
-- SASTRERÍA PRATS — Migración 002
-- Clientes, Medidas Corporales, Proveedores, Tejidos
-- ==========================================

-- ========================================
-- 1. ENUMS ADICIONALES
-- ========================================

CREATE TYPE client_type AS ENUM ('individual', 'company');
CREATE TYPE client_category AS ENUM ('standard', 'vip', 'premium', 'gold', 'ambassador');
CREATE TYPE gender_type AS ENUM ('male', 'female', 'other', 'unspecified');
CREATE TYPE measurement_type AS ENUM ('artesanal', 'industrial');
CREATE TYPE supplier_type AS ENUM ('fabric', 'manufacturing', 'accessories', 'trimmings', 'services', 'logistics', 'other');
CREATE TYPE payment_term_type AS ENUM ('immediate', 'net_15', 'net_30', 'net_60', 'net_90', 'custom');
CREATE TYPE fabric_unit AS ENUM ('meters', 'yards', 'pieces');
CREATE TYPE fabric_status AS ENUM ('active', 'discontinued', 'seasonal', 'out_of_stock');
CREATE TYPE supplier_order_status AS ENUM (
  'draft', 'sent', 'confirmed', 'partially_received',
  'received', 'incident', 'cancelled'
);

-- ========================================
-- 2. CLIENTES
-- ========================================

CREATE TABLE clients (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  profile_id UUID UNIQUE REFERENCES profiles(id) ON DELETE SET NULL,
  client_code VARCHAR(20) UNIQUE,
  client_type client_type DEFAULT 'individual' NOT NULL,
  category client_category DEFAULT 'standard' NOT NULL,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  full_name TEXT GENERATED ALWAYS AS (first_name || ' ' || last_name) STORED,
  email TEXT,
  phone TEXT,
  phone_secondary TEXT,
  date_of_birth DATE,
  gender gender_type DEFAULT 'unspecified',
  nationality TEXT,
  document_type TEXT DEFAULT 'DNI' CHECK (document_type IN ('DNI', 'NIE', 'NIF', 'CIF', 'passport', 'other')),
  document_number TEXT,
  company_name TEXT,
  company_nif TEXT,
  company_contact_name TEXT,
  address TEXT,
  address_line2 TEXT,
  city TEXT,
  postal_code TEXT,
  province TEXT,
  country TEXT DEFAULT 'España',
  shipping_address TEXT,
  shipping_city TEXT,
  shipping_postal_code TEXT,
  shipping_province TEXT,
  shipping_country TEXT,
  standard_sizes JSONB DEFAULT '{}'::jsonb,
  preferences JSONB DEFAULT '{}'::jsonb,
  tags TEXT[] DEFAULT '{}',
  source TEXT,
  discount_percentage DECIMAL(5,2) DEFAULT 0.00,
  accepts_marketing BOOLEAN DEFAULT FALSE NOT NULL,
  marketing_consent_date TIMESTAMPTZ,
  accepts_data_storage BOOLEAN DEFAULT FALSE NOT NULL,
  data_consent_date TIMESTAMPTZ,
  newsletter_subscribed BOOLEAN DEFAULT FALSE,
  total_spent DECIMAL(12,2) DEFAULT 0.00,
  total_pending DECIMAL(12,2) DEFAULT 0.00,
  last_purchase_date TIMESTAMPTZ,
  first_purchase_date TIMESTAMPTZ,
  purchase_count INTEGER DEFAULT 0,
  average_ticket DECIMAL(10,2) DEFAULT 0.00,
  is_active BOOLEAN DEFAULT TRUE NOT NULL,
  home_store_id UUID REFERENCES stores(id) ON DELETE SET NULL,
  assigned_salesperson_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  internal_notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  created_by UUID REFERENCES profiles(id) ON DELETE SET NULL
);

CREATE INDEX idx_clients_code ON clients(client_code);
CREATE INDEX idx_clients_email ON clients(email);
CREATE INDEX idx_clients_phone ON clients(phone);
CREATE INDEX idx_clients_full_name ON clients USING gin(full_name gin_trgm_ops);
CREATE INDEX idx_clients_first_name ON clients USING gin(first_name gin_trgm_ops);
CREATE INDEX idx_clients_last_name ON clients USING gin(last_name gin_trgm_ops);
CREATE INDEX idx_clients_document ON clients(document_number);
CREATE INDEX idx_clients_company_name ON clients USING gin(company_name gin_trgm_ops);
CREATE INDEX idx_clients_type ON clients(client_type);
CREATE INDEX idx_clients_category ON clients(category);
CREATE INDEX idx_clients_tags ON clients USING gin(tags);
CREATE INDEX idx_clients_is_active ON clients(is_active);
CREATE INDEX idx_clients_home_store ON clients(home_store_id);
CREATE INDEX idx_clients_profile ON clients(profile_id);
CREATE INDEX idx_clients_birth ON clients(date_of_birth);
CREATE INDEX idx_clients_pending ON clients(total_pending) WHERE total_pending > 0;
CREATE INDEX idx_clients_salesperson ON clients(assigned_salesperson_id);

CREATE TRIGGER trigger_clients_updated_at BEFORE UPDATE ON clients FOR EACH ROW EXECUTE PROCEDURE update_updated_at();

-- ========================================
-- 3. CONTACTOS DE EMPRESA
-- ========================================

CREATE TABLE client_contacts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  position TEXT,
  email TEXT,
  phone TEXT,
  is_primary BOOLEAN DEFAULT FALSE,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE INDEX idx_client_contacts_client ON client_contacts(client_id);

-- ========================================
-- 4. NOTAS DEL CLIENTE
-- ========================================

CREATE TABLE client_notes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  note_type TEXT DEFAULT 'general' CHECK (note_type IN (
    'general', 'boutique_alteration', 'preference',
    'complaint', 'compliment', 'fitting', 'follow_up',
    'payment', 'incident'
  )),
  title TEXT,
  content TEXT NOT NULL,
  is_pinned BOOLEAN DEFAULT FALSE,
  is_private BOOLEAN DEFAULT FALSE,
  created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_by_name TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE INDEX idx_client_notes_client ON client_notes(client_id);
CREATE INDEX idx_client_notes_type ON client_notes(note_type);
CREATE INDEX idx_client_notes_pinned ON client_notes(client_id, is_pinned) WHERE is_pinned = TRUE;
CREATE INDEX idx_client_notes_created ON client_notes(created_at DESC);

CREATE TRIGGER trigger_client_notes_updated_at BEFORE UPDATE ON client_notes FOR EACH ROW EXECUTE PROCEDURE update_updated_at();

-- ========================================
-- 5. TIPOS DE PRENDA
-- ========================================

CREATE TABLE garment_types (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  code VARCHAR(30) NOT NULL UNIQUE,
  name TEXT NOT NULL,
  category TEXT DEFAULT 'sastreria' CHECK (category IN ('sastreria', 'camiseria', 'complemento')),
  sort_order INTEGER DEFAULT 0,
  icon TEXT DEFAULT 'shirt',
  has_sketch BOOLEAN DEFAULT FALSE,
  sketch_url TEXT,
  is_active BOOLEAN DEFAULT TRUE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE INDEX idx_garment_types_code ON garment_types(code);
CREATE INDEX idx_garment_types_active ON garment_types(is_active);

CREATE TRIGGER trigger_garment_types_updated_at BEFORE UPDATE ON garment_types FOR EACH ROW EXECUTE PROCEDURE update_updated_at();

-- ========================================
-- 6. CAMPOS DE MEDIDAS POR TIPO DE PRENDA
-- ========================================

CREATE TABLE measurement_fields (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  garment_type_id UUID NOT NULL REFERENCES garment_types(id) ON DELETE CASCADE,
  code VARCHAR(50) NOT NULL,
  name TEXT NOT NULL,
  field_type TEXT DEFAULT 'number' CHECK (field_type IN ('number', 'text', 'select', 'boolean', 'note')),
  options JSONB,
  unit TEXT DEFAULT 'cm' CHECK (unit IN ('cm', 'inch', 'mm', 'none')),
  min_value DECIMAL(8,2),
  max_value DECIMAL(8,2),
  applies_to TEXT DEFAULT 'both' CHECK (applies_to IN ('both', 'artesanal', 'industrial')),
  sort_order INTEGER DEFAULT 0,
  is_required BOOLEAN DEFAULT FALSE,
  help_text TEXT,
  field_group TEXT,
  is_active BOOLEAN DEFAULT TRUE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  UNIQUE(garment_type_id, code)
);

CREATE INDEX idx_measurement_fields_garment ON measurement_fields(garment_type_id);
CREATE INDEX idx_measurement_fields_active ON measurement_fields(is_active);

-- ========================================
-- 7. MEDIDAS DEL CLIENTE
-- ========================================

CREATE TABLE client_measurements (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  garment_type_id UUID NOT NULL REFERENCES garment_types(id) ON DELETE RESTRICT,
  measurement_type measurement_type NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  is_current BOOLEAN DEFAULT TRUE NOT NULL,
  order_id UUID,
  values JSONB NOT NULL DEFAULT '{}'::jsonb,
  body_observations TEXT,
  taken_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  taken_by_name TEXT,
  taken_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  store_id UUID REFERENCES stores(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE INDEX idx_client_measurements_client ON client_measurements(client_id);
CREATE INDEX idx_client_measurements_garment ON client_measurements(garment_type_id);
CREATE INDEX idx_client_measurements_current ON client_measurements(client_id, garment_type_id, is_current) WHERE is_current = TRUE;
CREATE INDEX idx_client_measurements_type ON client_measurements(measurement_type);
CREATE INDEX idx_client_measurements_order ON client_measurements(order_id);
CREATE INDEX idx_client_measurements_taken_at ON client_measurements(taken_at DESC);

CREATE TRIGGER trigger_client_measurements_updated_at BEFORE UPDATE ON client_measurements FOR EACH ROW EXECUTE PROCEDURE update_updated_at();

CREATE OR REPLACE FUNCTION set_measurement_version()
RETURNS TRIGGER AS $$
DECLARE
  v_max_version INTEGER;
BEGIN
  SELECT COALESCE(MAX(version), 0) INTO v_max_version
  FROM client_measurements
  WHERE client_id = NEW.client_id
  AND garment_type_id = NEW.garment_type_id
  AND measurement_type = NEW.measurement_type;

  NEW.version := v_max_version + 1;

  UPDATE client_measurements
  SET is_current = FALSE, updated_at = NOW()
  WHERE client_id = NEW.client_id
  AND garment_type_id = NEW.garment_type_id
  AND measurement_type = NEW.measurement_type
  AND is_current = TRUE;

  NEW.is_current := TRUE;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_measurement_version
  BEFORE INSERT ON client_measurements
  FOR EACH ROW EXECUTE PROCEDURE set_measurement_version();

-- ========================================
-- 8. OPCIONES DE CONFIGURACIÓN DE PRENDA
-- ========================================

CREATE TABLE garment_config_options (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  garment_type_id UUID NOT NULL REFERENCES garment_types(id) ON DELETE CASCADE,
  code VARCHAR(50) NOT NULL,
  name TEXT NOT NULL,
  option_type TEXT DEFAULT 'select' CHECK (option_type IN ('select', 'multiselect', 'boolean', 'text', 'number')),
  available_options JSONB DEFAULT '[]'::jsonb,
  default_value TEXT,
  sort_order INTEGER DEFAULT 0,
  field_group TEXT,
  is_required BOOLEAN DEFAULT FALSE,
  help_text TEXT,
  is_active BOOLEAN DEFAULT TRUE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  UNIQUE(garment_type_id, code)
);

CREATE INDEX idx_garment_config_garment ON garment_config_options(garment_type_id);
CREATE INDEX idx_garment_config_active ON garment_config_options(is_active);

-- ========================================
-- 9. ARREGLOS DE BOUTIQUE
-- ========================================

CREATE TABLE boutique_alterations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  description TEXT NOT NULL,
  garment_description TEXT,
  alteration_details TEXT,
  has_cost BOOLEAN DEFAULT FALSE,
  cost DECIMAL(10,2) DEFAULT 0.00,
  is_included BOOLEAN DEFAULT FALSE,
  sale_id UUID,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'completed', 'delivered')),
  requested_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  estimated_completion DATE,
  completed_at TIMESTAMPTZ,
  delivered_at TIMESTAMPTZ,
  registered_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  store_id UUID REFERENCES stores(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE INDEX idx_boutique_alterations_client ON boutique_alterations(client_id);
CREATE INDEX idx_boutique_alterations_status ON boutique_alterations(status);
CREATE INDEX idx_boutique_alterations_store ON boutique_alterations(store_id);

CREATE TRIGGER trigger_boutique_alterations_updated_at BEFORE UPDATE ON boutique_alterations FOR EACH ROW EXECUTE PROCEDURE update_updated_at();

-- ========================================
-- 10. ETIQUETAS (TAGS) DE CLIENTE
-- ========================================

CREATE TABLE client_tags (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL UNIQUE,
  color TEXT DEFAULT '#6B7280',
  description TEXT,
  sort_order INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT TRUE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE INDEX idx_client_tags_name ON client_tags(name);
CREATE INDEX idx_client_tags_active ON client_tags(is_active);

-- ========================================
-- 11. HISTORIAL DE EMAILS AL CLIENTE
-- ========================================

CREATE TABLE client_email_history (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  subject TEXT NOT NULL,
  template_name TEXT,
  to_email TEXT NOT NULL,
  from_email TEXT,
  status TEXT DEFAULT 'sent' CHECK (status IN ('sent', 'delivered', 'opened', 'clicked', 'bounced', 'failed')),
  resend_id TEXT,
  opened_at TIMESTAMPTZ,
  clicked_at TIMESTAMPTZ,
  sent_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE INDEX idx_client_emails_client ON client_email_history(client_id);
CREATE INDEX idx_client_emails_status ON client_email_history(status);
CREATE INDEX idx_client_emails_created ON client_email_history(created_at DESC);

-- ========================================
-- 12. PROVEEDORES
-- ========================================

CREATE TABLE suppliers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  supplier_code VARCHAR(20) UNIQUE,
  name TEXT NOT NULL,
  legal_name TEXT,
  nif_cif TEXT,
  supplier_types supplier_type[] DEFAULT '{}',
  tags TEXT[] DEFAULT '{}',
  contact_name TEXT,
  contact_email TEXT,
  contact_phone TEXT,
  address TEXT,
  city TEXT,
  postal_code TEXT,
  province TEXT,
  country TEXT DEFAULT 'España',
  bank_name TEXT,
  bank_iban TEXT,
  bank_swift TEXT,
  payment_terms payment_term_type DEFAULT 'net_30',
  payment_days INTEGER DEFAULT 30,
  minimum_order DECIMAL(10,2),
  shipping_included BOOLEAN DEFAULT FALSE,
  shipping_cost DECIMAL(10,2),
  email_template TEXT,
  preferred_language TEXT DEFAULT 'es',
  delivery_address TEXT,
  delivery_notes TEXT,
  is_active BOOLEAN DEFAULT TRUE NOT NULL,
  total_debt DECIMAL(12,2) DEFAULT 0.00,
  total_paid DECIMAL(12,2) DEFAULT 0.00,
  internal_notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  created_by UUID REFERENCES profiles(id) ON DELETE SET NULL
);

CREATE INDEX idx_suppliers_code ON suppliers(supplier_code);
CREATE INDEX idx_suppliers_name ON suppliers USING gin(name gin_trgm_ops);
CREATE INDEX idx_suppliers_types ON suppliers USING gin(supplier_types);
CREATE INDEX idx_suppliers_nif ON suppliers(nif_cif);
CREATE INDEX idx_suppliers_active ON suppliers(is_active);
CREATE INDEX idx_suppliers_tags ON suppliers USING gin(tags);
CREATE INDEX idx_suppliers_debt ON suppliers(total_debt) WHERE total_debt > 0;

CREATE TRIGGER trigger_suppliers_updated_at BEFORE UPDATE ON suppliers FOR EACH ROW EXECUTE PROCEDURE update_updated_at();

-- ========================================
-- 13. CONTACTOS DE PROVEEDOR
-- ========================================

CREATE TABLE supplier_contacts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  supplier_id UUID NOT NULL REFERENCES suppliers(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  position TEXT,
  department TEXT,
  email TEXT,
  phone TEXT,
  is_primary BOOLEAN DEFAULT FALSE,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE INDEX idx_supplier_contacts_supplier ON supplier_contacts(supplier_id);

-- ========================================
-- 14. CATEGORÍAS DE TEJIDO
-- ========================================

CREATE TABLE fabric_categories (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL UNIQUE,
  description TEXT,
  sort_order INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT TRUE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE INDEX idx_fabric_categories_active ON fabric_categories(is_active);

-- ========================================
-- 15. TEJIDOS / TELAS
-- ========================================

CREATE TABLE fabrics (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  fabric_code VARCHAR(30) UNIQUE,
  name TEXT NOT NULL,
  description TEXT,
  supplier_id UUID NOT NULL REFERENCES suppliers(id) ON DELETE RESTRICT,
  supplier_reference TEXT,
  category_id UUID REFERENCES fabric_categories(id) ON DELETE SET NULL,
  composition TEXT,
  weight_gsm INTEGER,
  width_cm INTEGER,
  color_name TEXT,
  color_hex TEXT,
  pattern TEXT,
  season TEXT,
  collection TEXT,
  year INTEGER,
  is_permanent BOOLEAN DEFAULT FALSE,
  price_per_meter DECIMAL(10,2),
  unit fabric_unit DEFAULT 'meters',
  currency TEXT DEFAULT 'EUR',
  stock_meters DECIMAL(10,2) DEFAULT 0.00,
  reserved_meters DECIMAL(10,2) DEFAULT 0.00,
  min_stock_meters DECIMAL(10,2),
  warehouse_id UUID REFERENCES warehouses(id) ON DELETE SET NULL,
  image_url TEXT,
  swatch_url TEXT,
  status fabric_status DEFAULT 'active' NOT NULL,
  is_active BOOLEAN DEFAULT TRUE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE INDEX idx_fabrics_code ON fabrics(fabric_code);
CREATE INDEX idx_fabrics_name ON fabrics USING gin(name gin_trgm_ops);
CREATE INDEX idx_fabrics_supplier ON fabrics(supplier_id);
CREATE INDEX idx_fabrics_category ON fabrics(category_id);
CREATE INDEX idx_fabrics_season ON fabrics(season);
CREATE INDEX idx_fabrics_status ON fabrics(status);
CREATE INDEX idx_fabrics_active ON fabrics(is_active);
CREATE INDEX idx_fabrics_warehouse ON fabrics(warehouse_id);
CREATE INDEX idx_fabrics_stock_alert ON fabrics(stock_meters, min_stock_meters) WHERE min_stock_meters IS NOT NULL AND stock_meters <= min_stock_meters;
CREATE INDEX idx_fabrics_color ON fabrics(color_name);
CREATE INDEX idx_fabrics_pattern ON fabrics(pattern);

CREATE TRIGGER trigger_fabrics_updated_at BEFORE UPDATE ON fabrics FOR EACH ROW EXECUTE PROCEDURE update_updated_at();

-- ========================================
-- 16. PEDIDOS A PROVEEDORES
-- ========================================

CREATE TABLE supplier_orders (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  order_number VARCHAR(30) NOT NULL UNIQUE,
  supplier_id UUID NOT NULL REFERENCES suppliers(id) ON DELETE RESTRICT,
  status supplier_order_status DEFAULT 'draft' NOT NULL,
  destination_store_id UUID REFERENCES stores(id) ON DELETE SET NULL,
  destination_warehouse_id UUID REFERENCES warehouses(id) ON DELETE SET NULL,
  order_date DATE DEFAULT CURRENT_DATE,
  estimated_delivery_date DATE,
  actual_delivery_date DATE,
  subtotal DECIMAL(12,2) DEFAULT 0.00,
  tax_amount DECIMAL(12,2) DEFAULT 0.00,
  shipping_cost DECIMAL(10,2) DEFAULT 0.00,
  total DECIMAL(12,2) DEFAULT 0.00,
  sent_by_email BOOLEAN DEFAULT FALSE,
  sent_at TIMESTAMPTZ,
  email_confirmed BOOLEAN DEFAULT FALSE,
  email_confirmed_at TIMESTAMPTZ,
  internal_notes TEXT,
  supplier_notes TEXT,
  tailoring_order_id UUID,
  created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE INDEX idx_supplier_orders_number ON supplier_orders(order_number);
CREATE INDEX idx_supplier_orders_supplier ON supplier_orders(supplier_id);
CREATE INDEX idx_supplier_orders_status ON supplier_orders(status);
CREATE INDEX idx_supplier_orders_date ON supplier_orders(order_date DESC);
CREATE INDEX idx_supplier_orders_delivery ON supplier_orders(estimated_delivery_date);
CREATE INDEX idx_supplier_orders_tailoring ON supplier_orders(tailoring_order_id);

CREATE TRIGGER trigger_supplier_orders_updated_at BEFORE UPDATE ON supplier_orders FOR EACH ROW EXECUTE PROCEDURE update_updated_at();

-- ========================================
-- 17. LÍNEAS DE PEDIDO A PROVEEDOR
-- ========================================

CREATE TABLE supplier_order_lines (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  supplier_order_id UUID NOT NULL REFERENCES supplier_orders(id) ON DELETE CASCADE,
  fabric_id UUID REFERENCES fabrics(id) ON DELETE SET NULL,
  product_id UUID,
  description TEXT NOT NULL,
  reference TEXT,
  quantity DECIMAL(10,2) NOT NULL,
  unit TEXT DEFAULT 'meters',
  unit_price DECIMAL(10,2) NOT NULL,
  total_price DECIMAL(12,2) GENERATED ALWAYS AS (quantity * unit_price) STORED,
  quantity_received DECIMAL(10,2) DEFAULT 0.00,
  is_fully_received BOOLEAN DEFAULT FALSE,
  received_at TIMESTAMPTZ,
  received_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  has_incident BOOLEAN DEFAULT FALSE,
  incident_description TEXT,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE INDEX idx_supplier_order_lines_order ON supplier_order_lines(supplier_order_id);
CREATE INDEX idx_supplier_order_lines_fabric ON supplier_order_lines(fabric_id);

-- ========================================
-- 18. FACTURAS DE PROVEEDOR
-- ========================================

CREATE TABLE supplier_invoices (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  supplier_id UUID NOT NULL REFERENCES suppliers(id) ON DELETE RESTRICT,
  invoice_number TEXT NOT NULL,
  invoice_date DATE NOT NULL,
  due_date DATE,
  subtotal DECIMAL(12,2) NOT NULL,
  tax_rate DECIMAL(5,2) DEFAULT 21.00,
  tax_amount DECIMAL(12,2),
  total DECIMAL(12,2) NOT NULL,
  amount_paid DECIMAL(12,2) DEFAULT 0.00,
  is_fully_paid BOOLEAN DEFAULT FALSE,
  supplier_order_id UUID REFERENCES supplier_orders(id) ON DELETE SET NULL,
  document_url TEXT,
  notes TEXT,
  registered_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  UNIQUE(supplier_id, invoice_number)
);

CREATE INDEX idx_supplier_invoices_supplier ON supplier_invoices(supplier_id);
CREATE INDEX idx_supplier_invoices_date ON supplier_invoices(invoice_date DESC);
CREATE INDEX idx_supplier_invoices_due ON supplier_invoices(due_date) WHERE is_fully_paid = FALSE;
CREATE INDEX idx_supplier_invoices_unpaid ON supplier_invoices(supplier_id) WHERE is_fully_paid = FALSE;
CREATE INDEX idx_supplier_invoices_order ON supplier_invoices(supplier_order_id);

CREATE TRIGGER trigger_supplier_invoices_updated_at BEFORE UPDATE ON supplier_invoices FOR EACH ROW EXECUTE PROCEDURE update_updated_at();

-- ========================================
-- 19. PAGOS A PROVEEDORES
-- ========================================

CREATE TABLE supplier_payments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  supplier_id UUID NOT NULL REFERENCES suppliers(id) ON DELETE RESTRICT,
  supplier_invoice_id UUID REFERENCES supplier_invoices(id) ON DELETE SET NULL,
  amount DECIMAL(12,2) NOT NULL,
  payment_date DATE NOT NULL,
  payment_method TEXT DEFAULT 'transfer' CHECK (payment_method IN ('transfer', 'cash', 'check', 'other')),
  bank_reference TEXT,
  notes TEXT,
  registered_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE INDEX idx_supplier_payments_supplier ON supplier_payments(supplier_id);
CREATE INDEX idx_supplier_payments_invoice ON supplier_payments(supplier_invoice_id);
CREATE INDEX idx_supplier_payments_date ON supplier_payments(payment_date DESC);

-- ========================================
-- 20. VENCIMIENTOS DE PROVEEDORES
-- ========================================

CREATE TABLE supplier_due_dates (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  supplier_id UUID NOT NULL REFERENCES suppliers(id) ON DELETE CASCADE,
  supplier_invoice_id UUID REFERENCES supplier_invoices(id) ON DELETE CASCADE,
  due_date DATE NOT NULL,
  amount DECIMAL(12,2) NOT NULL,
  is_paid BOOLEAN DEFAULT FALSE,
  paid_at TIMESTAMPTZ,
  payment_id UUID REFERENCES supplier_payments(id) ON DELETE SET NULL,
  alert_sent BOOLEAN DEFAULT FALSE,
  alert_days_before INTEGER DEFAULT 7,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE INDEX idx_supplier_due_dates_supplier ON supplier_due_dates(supplier_id);
CREATE INDEX idx_supplier_due_dates_due ON supplier_due_dates(due_date) WHERE is_paid = FALSE;
CREATE INDEX idx_supplier_due_dates_unpaid ON supplier_due_dates(is_paid) WHERE is_paid = FALSE;

-- ========================================
-- 21. DATOS INICIALES (SEED)
-- ========================================

INSERT INTO garment_types (code, name, category, sort_order, icon, has_sketch) VALUES
  ('americana', 'Americana', 'sastreria', 1, 'shirt', TRUE),
  ('chaleco', 'Chaleco', 'sastreria', 2, 'shirt', TRUE),
  ('pantalon', 'Pantalón', 'sastreria', 3, 'shirt', TRUE),
  ('camisa', 'Camisa', 'camiseria', 4, 'shirt', TRUE),
  ('abrigo', 'Abrigo', 'sastreria', 5, 'shirt', TRUE),
  ('chaquet', 'Chaqué', 'sastreria', 6, 'shirt', TRUE),
  ('smoking_jacket', 'Chaqueta Smoking', 'sastreria', 7, 'shirt', TRUE),
  ('smoking_trouser', 'Pantalón Smoking', 'sastreria', 8, 'shirt', FALSE),
  ('bata', 'Bata', 'sastreria', 9, 'shirt', FALSE),
  ('falda', 'Falda', 'sastreria', 10, 'shirt', FALSE),
  ('pijama', 'Pijama', 'sastreria', 11, 'shirt', FALSE),
  ('industrial', 'Industrial', 'sastreria', 12, 'shirt', FALSE);

INSERT INTO measurement_fields (garment_type_id, code, name, field_type, unit, sort_order, field_group, is_required, applies_to)
SELECT gt.id, f.code, f.name, f.field_type, f.unit, f.sort_order, f.field_group, f.is_required, f.applies_to
FROM garment_types gt
CROSS JOIN (VALUES
  ('talle', 'Talle', 'number', 'cm', 1, 'Cuerpo', TRUE, 'both'),
  ('pecho', 'Pecho', 'number', 'cm', 2, 'Cuerpo', TRUE, 'both'),
  ('cintura', 'Cintura', 'number', 'cm', 3, 'Cuerpo', TRUE, 'both'),
  ('cadera', 'Cadera', 'number', 'cm', 4, 'Cuerpo', FALSE, 'both'),
  ('largo', 'Largo', 'text', 'cm', 5, 'Cuerpo', TRUE, 'both'),
  ('encuentro', 'Encuentro', 'number', 'cm', 6, 'Cuerpo', FALSE, 'both'),
  ('frente', 'Frente', 'number', 'cm', 7, 'Cuerpo', FALSE, 'both'),
  ('frente_pecho', 'Frente de pecho', 'number', 'cm', 8, 'Cuerpo', FALSE, 'both'),
  ('hombro', 'Hombro', 'number', 'cm', 9, 'Espalda', TRUE, 'both'),
  ('espalda', 'Ancho de media-espalda', 'number', 'cm', 10, 'Espalda', FALSE, 'both'),
  ('largo_espalda', 'Largo de espalda (sin cuello)', 'number', 'cm', 11, 'Espalda', FALSE, 'both'),
  ('largo_manga', 'Largo de manga', 'text', 'cm', 12, 'Mangas', TRUE, 'both'),
  ('bocamanga', 'Bocamanga', 'number', 'cm', 13, 'Mangas', FALSE, 'both'),
  ('largo_delantero', 'Largo delantero', 'number', 'cm', 14, 'Cuerpo', FALSE, 'both'),
  ('solapa', 'Solapa', 'number', 'cm', 15, 'Acabados', FALSE, 'artesanal'),
  ('cargado', 'Cargado', 'text', 'cm', 16, 'Acabados', FALSE, 'artesanal'),
  ('escote', 'Escote', 'text', 'cm', 17, 'Acabados', FALSE, 'artesanal')
) AS f(code, name, field_type, unit, sort_order, field_group, is_required, applies_to)
WHERE gt.code = 'americana';

INSERT INTO measurement_fields (garment_type_id, code, name, field_type, unit, sort_order, field_group, is_required, applies_to)
SELECT gt.id, f.code, f.name, f.field_type, f.unit, f.sort_order, f.field_group, f.is_required, f.applies_to
FROM garment_types gt
CROSS JOIN (VALUES
  ('cintura', 'Ancho de cintura', 'number', 'cm', 1, 'Cintura', TRUE, 'both'),
  ('cadera', 'Ancho de cadera', 'number', 'cm', 2, 'Cadera', TRUE, 'both'),
  ('muslo', 'Ancho de muslo', 'text', 'cm', 3, 'Pierna', FALSE, 'both'),
  ('rodilla', 'Ancho de rodilla', 'number', 'cm', 4, 'Pierna', FALSE, 'both'),
  ('largo_total', 'Largo total (sin cinturilla)', 'number', 'cm', 5, 'Largo', TRUE, 'both'),
  ('entrepiernas', 'Largo de entrepiernas', 'number', 'cm', 6, 'Largo', FALSE, 'both'),
  ('bajo', 'Ancho de bajos', 'number', 'cm', 7, 'Bajo', FALSE, 'both'),
  ('vuelta', 'Vuelta', 'text', 'cm', 8, 'Bajo', FALSE, 'both'),
  ('cremallera', 'Cremallera', 'select', 'none', 9, 'Configuración', FALSE, 'both'),
  ('pliegues', 'Nº pliegues', 'select', 'none', 10, 'Configuración', FALSE, 'both'),
  ('pasadores', 'Pasadores', 'select', 'none', 11, 'Configuración', FALSE, 'both'),
  ('bolsillos', 'Bolsillos', 'select', 'none', 12, 'Configuración', FALSE, 'both'),
  ('bolsillo_trasero', 'Bolsillo trasero', 'select', 'none', 13, 'Configuración', FALSE, 'both'),
  ('num_bolsillo_trasero', 'Nº bolsillo trasero', 'number', 'none', 14, 'Configuración', FALSE, 'both')
) AS f(code, name, field_type, unit, sort_order, field_group, is_required, applies_to)
WHERE gt.code = 'pantalon';

UPDATE measurement_fields SET options = '["Cremallera", "Botones"]'::jsonb WHERE code = 'cremallera' AND garment_type_id = (SELECT id FROM garment_types WHERE code = 'pantalon');
UPDATE measurement_fields SET options = '["Sin pliegue", "1 pliegue", "2 pliegues"]'::jsonb WHERE code = 'pliegues' AND garment_type_id = (SELECT id FROM garment_types WHERE code = 'pantalon');
UPDATE measurement_fields SET options = '["Sí", "No"]'::jsonb WHERE code = 'pasadores' AND garment_type_id = (SELECT id FROM garment_types WHERE code = 'pantalon');
UPDATE measurement_fields SET options = '["Bolsillo francés", "Bolsillo americano", "Bolsillo italiano", "Sin bolsillos"]'::jsonb WHERE code = 'bolsillos' AND garment_type_id = (SELECT id FROM garment_types WHERE code = 'pantalon');
UPDATE measurement_fields SET options = '["Con ojal", "Sin ojal", "Con botón", "Sin botón"]'::jsonb WHERE code = 'bolsillo_trasero' AND garment_type_id = (SELECT id FROM garment_types WHERE code = 'pantalon');

INSERT INTO measurement_fields (garment_type_id, code, name, field_type, unit, sort_order, field_group, is_required, applies_to)
SELECT gt.id, f.code, f.name, f.field_type, f.unit, f.sort_order, f.field_group, f.is_required, f.applies_to
FROM garment_types gt
CROSS JOIN (VALUES
  ('cuello', 'Cuello', 'number', 'cm', 1, 'Cuello', TRUE, 'both'),
  ('pecho', 'Pecho', 'number', 'cm', 2, 'Cuerpo', TRUE, 'both'),
  ('cintura', 'Cintura', 'number', 'cm', 3, 'Cuerpo', TRUE, 'both'),
  ('cadera', 'Cadera', 'number', 'cm', 4, 'Cuerpo', FALSE, 'both'),
  ('hombro', 'Hombro', 'number', 'cm', 5, 'Cuerpo', TRUE, 'both'),
  ('canesu', 'Canesú', 'number', 'cm', 6, 'Espalda', FALSE, 'both'),
  ('largo_manga', 'Largo manga', 'number', 'cm', 7, 'Mangas', TRUE, 'both'),
  ('largo_camisa', 'Largo camisa', 'number', 'cm', 8, 'Cuerpo', TRUE, 'both'),
  ('biceps', 'Bíceps', 'number', 'cm', 9, 'Mangas', FALSE, 'both'),
  ('muneca_izquierda', 'Muñeca izquierda', 'number', 'cm', 10, 'Mangas', FALSE, 'both'),
  ('muneca_derecha', 'Muñeca derecha', 'number', 'cm', 11, 'Mangas', FALSE, 'both')
) AS f(code, name, field_type, unit, sort_order, field_group, is_required, applies_to)
WHERE gt.code = 'camisa';

INSERT INTO measurement_fields (garment_type_id, code, name, field_type, unit, sort_order, field_group, is_required, applies_to)
SELECT gt.id, f.code, f.name, f.field_type, f.unit, f.sort_order, f.field_group, f.is_required, f.applies_to
FROM garment_types gt
CROSS JOIN (VALUES
  ('pecho', 'Pecho', 'number', 'cm', 1, 'Cuerpo', TRUE, 'both'),
  ('cintura', 'Cintura', 'number', 'cm', 2, 'Cuerpo', TRUE, 'both'),
  ('cadera', 'Cadera', 'number', 'cm', 3, 'Cuerpo', FALSE, 'both'),
  ('largo', 'Largo', 'number', 'cm', 4, 'Cuerpo', TRUE, 'both'),
  ('hombro', 'Hombro', 'number', 'cm', 5, 'Espalda', FALSE, 'both'),
  ('espalda', 'Espalda', 'number', 'cm', 6, 'Espalda', FALSE, 'both'),
  ('escote', 'Escote', 'number', 'cm', 7, 'Acabados', FALSE, 'artesanal')
) AS f(code, name, field_type, unit, sort_order, field_group, is_required, applies_to)
WHERE gt.code = 'chaleco';

INSERT INTO measurement_fields (garment_type_id, code, name, field_type, unit, sort_order, field_group, is_required, applies_to)
SELECT gt.id, f.code, f.name, f.field_type, f.unit, f.sort_order, f.field_group, f.is_required, f.applies_to
FROM garment_types gt
CROSS JOIN (VALUES
  ('pecho', 'Pecho', 'number', 'cm', 1, 'Cuerpo', TRUE, 'both'),
  ('cintura', 'Cintura', 'number', 'cm', 2, 'Cuerpo', TRUE, 'both'),
  ('cadera', 'Cadera', 'number', 'cm', 3, 'Cuerpo', FALSE, 'both'),
  ('largo', 'Largo', 'number', 'cm', 4, 'Cuerpo', TRUE, 'both'),
  ('manga', 'Manga', 'number', 'cm', 5, 'Mangas', TRUE, 'both'),
  ('hombro', 'Hombro', 'number', 'cm', 6, 'Espalda', TRUE, 'both'),
  ('espalda', 'Espalda', 'number', 'cm', 7, 'Espalda', FALSE, 'both')
) AS f(code, name, field_type, unit, sort_order, field_group, is_required, applies_to)
WHERE gt.code = 'abrigo';

INSERT INTO garment_config_options (garment_type_id, code, name, option_type, available_options, default_value, sort_order, field_group)
SELECT gt.id, f.code, f.name, f.option_type, f.available_options::jsonb, f.default_value, f.sort_order, f.field_group
FROM garment_types gt
CROSS JOIN (VALUES
  ('tipo_solapa', 'Tipo de solapa', 'select', '["Muesca", "Pico", "Manteca", "Chal"]', 'Muesca', 1, 'Solapa'),
  ('num_botones', 'Nº de botones', 'select', '["1", "2", "3", "Cruzado 4", "Cruzado 6"]', '2', 2, 'Botonadura'),
  ('tipo_bolsillo', 'Tipo de bolsillo', 'select', '["De vivo", "De parche", "De tapeta", "Sin bolsillos"]', 'De vivo', 3, 'Bolsillos'),
  ('bolsillos_rectos', 'Bolsillos rectos', 'boolean', NULL, NULL, 4, 'Bolsillos'),
  ('abertura', 'Abertura trasera', 'select', '["Sin abertura", "Abertura central", "Aberturas laterales"]', 'Aberturas laterales', 5, 'Espalda'),
  ('ojales', 'Ojales en manga', 'select', '["Falsos", "Abiertos", "Sin ojales"]', 'Falsos', 6, 'Mangas'),
  ('forro', 'Forro', 'select', '["Completo", "Medio forro", "Sin forro"]', 'Completo', 7, 'Interior'),
  ('hombreras', 'Hombreras', 'select', '["Con hombreras", "Sin hombreras", "Media hombrera"]', 'Con hombreras', 8, 'Interior'),
  ('ticket_pocket', 'Bolsillo ticket', 'boolean', NULL, NULL, 9, 'Bolsillos'),
  ('pick_stitch', 'Pick stitch', 'boolean', NULL, NULL, 10, 'Acabados')
) AS f(code, name, option_type, available_options, default_value, sort_order, field_group)
WHERE gt.code = 'americana';

INSERT INTO garment_config_options (garment_type_id, code, name, option_type, available_options, default_value, sort_order, field_group)
SELECT gt.id, f.code, f.name, f.option_type, f.available_options::jsonb, f.default_value, f.sort_order, f.field_group
FROM garment_types gt
CROSS JOIN (VALUES
  ('pinza', 'Pinza', 'select', '["Sin pinza", "Con pinza", "2 pinzas"]', 'Sin pinza', 1, 'Cintura'),
  ('tipo_cierre', 'Tipo de cierre', 'select', '["Cremallera", "Botones"]', 'Cremallera', 2, 'Cintura'),
  ('tipo_bajo', 'Tipo de bajo', 'select', '["Sin vuelta", "Con vuelta", "Terminado"]', 'Sin vuelta', 3, 'Bajos'),
  ('bolsillo_lateral', 'Bolsillo lateral', 'select', '["Francés", "Americano", "Italiano", "Sin bolsillo"]', 'Francés', 4, 'Bolsillos'),
  ('acabado', 'Acabado', 'select', '["Foto 16T", "Foto 17T", "Foto 18T", "Estándar"]', 'Estándar', 5, 'Acabados'),
  ('cenidor', 'Ceñidor trasero', 'boolean', NULL, NULL, 6, 'Cintura')
) AS f(code, name, option_type, available_options, default_value, sort_order, field_group)
WHERE gt.code = 'pantalon';

INSERT INTO fabric_categories (name, description, sort_order) VALUES
  ('Lana', 'Tejidos de lana pura o mezcla de lana', 1),
  ('Algodón', 'Tejidos de algodón puro o mezcla', 2),
  ('Seda', 'Tejidos de seda', 3),
  ('Lino', 'Tejidos de lino puro o mezcla', 4),
  ('Cachemira', 'Tejidos de cachemira pura o mezcla', 5),
  ('Mezcla', 'Tejidos de composición mixta', 6),
  ('Sintético', 'Tejidos sintéticos o técnicos', 7),
  ('Terciopelo', 'Terciopelo y pana', 8),
  ('Tweed', 'Tejidos tipo tweed', 9);

INSERT INTO client_tags (name, color, description, sort_order) VALUES
  ('VIP', '#DC2626', 'Cliente VIP con trato preferente', 1),
  ('Novio', '#EC4899', 'Cliente con pedido de ceremonia/boda', 2),
  ('Ceremonia', '#8B5CF6', 'Pedidos de ceremonia (padrinos, invitados)', 3),
  ('Ejecutivo', '#2563EB', 'Perfil ejecutivo/profesional', 4),
  ('Uniforme', '#059669', 'Pedidos de uniformes de empresa', 5),
  ('Internacional', '#F59E0B', 'Cliente internacional (Tax Free)', 6),
  ('Boutique', '#0891B2', 'Cliente principalmente de boutique', 7),
  ('Sastrería', '#7C3AED', 'Cliente principalmente de sastrería', 8),
  ('Referido', '#84CC16', 'Llegó por referencia de otro cliente', 9),
  ('Primer pedido', '#64748B', 'Primera compra, pendiente de fidelizar', 10);

-- ========================================
-- 22. ROW LEVEL SECURITY (RLS)
-- ========================================

ALTER TABLE clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE client_contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE client_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE garment_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE measurement_fields ENABLE ROW LEVEL SECURITY;
ALTER TABLE client_measurements ENABLE ROW LEVEL SECURITY;
ALTER TABLE garment_config_options ENABLE ROW LEVEL SECURITY;
ALTER TABLE boutique_alterations ENABLE ROW LEVEL SECURITY;
ALTER TABLE client_tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE client_email_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE suppliers ENABLE ROW LEVEL SECURITY;
ALTER TABLE supplier_contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE fabric_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE fabrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE supplier_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE supplier_order_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE supplier_invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE supplier_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE supplier_due_dates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "clients_select" ON clients FOR SELECT USING (user_has_permission(auth.uid(), 'clients.read'));
CREATE POLICY "clients_select_own" ON clients FOR SELECT USING (profile_id = auth.uid());
CREATE POLICY "clients_insert" ON clients FOR INSERT WITH CHECK (user_has_permission(auth.uid(), 'clients.create'));
CREATE POLICY "clients_update" ON clients FOR UPDATE USING (user_has_permission(auth.uid(), 'clients.update') OR profile_id = auth.uid());
CREATE POLICY "clients_delete" ON clients FOR DELETE USING (user_has_permission(auth.uid(), 'clients.delete'));

CREATE POLICY "client_contacts_select" ON client_contacts FOR SELECT USING (user_has_permission(auth.uid(), 'clients.read'));
CREATE POLICY "client_contacts_modify" ON client_contacts FOR ALL USING (user_has_permission(auth.uid(), 'clients.update'));

CREATE POLICY "client_notes_select" ON client_notes FOR SELECT USING (user_has_permission(auth.uid(), 'clients.view_notes'));
CREATE POLICY "client_notes_insert" ON client_notes FOR INSERT WITH CHECK (user_has_permission(auth.uid(), 'clients.add_notes'));
CREATE POLICY "client_notes_modify" ON client_notes FOR UPDATE USING (user_has_permission(auth.uid(), 'clients.add_notes'));

CREATE POLICY "garment_types_select" ON garment_types FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "garment_types_modify" ON garment_types FOR ALL USING (user_has_permission(auth.uid(), 'config.manage_garment_types'));

CREATE POLICY "measurement_fields_select" ON measurement_fields FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "measurement_fields_modify" ON measurement_fields FOR ALL USING (user_has_permission(auth.uid(), 'config.manage_measurement_fields'));

CREATE POLICY "garment_config_select" ON garment_config_options FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "garment_config_modify" ON garment_config_options FOR ALL USING (user_has_permission(auth.uid(), 'config.manage_garment_types'));

CREATE POLICY "measurements_select" ON client_measurements FOR SELECT USING (user_has_permission(auth.uid(), 'clients.view_measurements'));
CREATE POLICY "measurements_select_own" ON client_measurements FOR SELECT USING (client_id IN (SELECT id FROM clients WHERE profile_id = auth.uid()));
CREATE POLICY "measurements_insert" ON client_measurements FOR INSERT WITH CHECK (user_has_permission(auth.uid(), 'clients.edit_measurements'));
CREATE POLICY "measurements_update" ON client_measurements FOR UPDATE USING (user_has_permission(auth.uid(), 'clients.edit_measurements'));

CREATE POLICY "alterations_select" ON boutique_alterations FOR SELECT USING (user_has_permission(auth.uid(), 'clients.read'));
CREATE POLICY "alterations_modify" ON boutique_alterations FOR ALL USING (user_has_permission(auth.uid(), 'clients.update'));

CREATE POLICY "client_tags_select" ON client_tags FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "client_tags_modify" ON client_tags FOR ALL USING (user_has_permission(auth.uid(), 'clients.manage_tags'));

CREATE POLICY "client_emails_select" ON client_email_history FOR SELECT USING (user_has_permission(auth.uid(), 'clients.view_history'));
CREATE POLICY "client_emails_insert" ON client_email_history FOR INSERT WITH CHECK (user_has_permission(auth.uid(), 'clients.send_email'));

CREATE POLICY "suppliers_select" ON suppliers FOR SELECT USING (user_has_permission(auth.uid(), 'suppliers.read'));
CREATE POLICY "suppliers_insert" ON suppliers FOR INSERT WITH CHECK (user_has_permission(auth.uid(), 'suppliers.create'));
CREATE POLICY "suppliers_update" ON suppliers FOR UPDATE USING (user_has_permission(auth.uid(), 'suppliers.update'));
CREATE POLICY "suppliers_delete" ON suppliers FOR DELETE USING (user_has_permission(auth.uid(), 'suppliers.delete'));

CREATE POLICY "supplier_contacts_select" ON supplier_contacts FOR SELECT USING (user_has_permission(auth.uid(), 'suppliers.read'));
CREATE POLICY "supplier_contacts_modify" ON supplier_contacts FOR ALL USING (user_has_permission(auth.uid(), 'suppliers.update'));

CREATE POLICY "fabric_categories_select" ON fabric_categories FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "fabric_categories_modify" ON fabric_categories FOR ALL USING (user_has_permission(auth.uid(), 'stock.manage_categories'));

CREATE POLICY "fabrics_select" ON fabrics FOR SELECT USING (user_has_permission(auth.uid(), 'stock.read'));
CREATE POLICY "fabrics_modify" ON fabrics FOR ALL USING (user_has_permission(auth.uid(), 'stock.create_product'));

CREATE POLICY "supplier_orders_select" ON supplier_orders FOR SELECT USING (user_has_permission(auth.uid(), 'suppliers.read'));
CREATE POLICY "supplier_orders_modify" ON supplier_orders FOR ALL USING (user_has_permission(auth.uid(), 'suppliers.create_order'));

CREATE POLICY "supplier_order_lines_select" ON supplier_order_lines FOR SELECT USING (user_has_permission(auth.uid(), 'suppliers.read'));
CREATE POLICY "supplier_order_lines_modify" ON supplier_order_lines FOR ALL USING (user_has_permission(auth.uid(), 'suppliers.create_order'));

CREATE POLICY "supplier_invoices_select" ON supplier_invoices FOR SELECT USING (user_has_permission(auth.uid(), 'suppliers.view_balance'));
CREATE POLICY "supplier_invoices_modify" ON supplier_invoices FOR ALL USING (user_has_permission(auth.uid(), 'suppliers.register_invoice'));

CREATE POLICY "supplier_payments_select" ON supplier_payments FOR SELECT USING (user_has_permission(auth.uid(), 'suppliers.view_balance'));
CREATE POLICY "supplier_payments_modify" ON supplier_payments FOR ALL USING (user_has_permission(auth.uid(), 'suppliers.register_payment'));

CREATE POLICY "supplier_due_dates_select" ON supplier_due_dates FOR SELECT USING (user_has_permission(auth.uid(), 'suppliers.view_balance'));
CREATE POLICY "supplier_due_dates_modify" ON supplier_due_dates FOR ALL USING (user_has_permission(auth.uid(), 'suppliers.register_payment'));

-- ========================================
-- 23. VISTAS ÚTILES
-- ========================================

CREATE OR REPLACE VIEW v_clients_summary AS
SELECT
  c.id,
  c.client_code,
  c.full_name,
  c.email,
  c.phone,
  c.client_type,
  c.category,
  c.tags,
  c.total_spent,
  c.total_pending,
  c.last_purchase_date,
  c.purchase_count,
  c.average_ticket,
  c.is_active,
  c.home_store_id,
  s.name AS home_store_name,
  CASE WHEN c.total_pending = 0 THEN 'paid' WHEN c.total_pending > 0 THEN 'pending' ELSE 'paid' END AS payment_status,
  c.created_at
FROM clients c
LEFT JOIN stores s ON s.id = c.home_store_id;

CREATE OR REPLACE VIEW v_suppliers_summary AS
SELECT
  s.id,
  s.supplier_code,
  s.name,
  s.supplier_types,
  s.contact_name,
  s.contact_email,
  s.contact_phone,
  s.payment_terms,
  s.total_debt,
  s.is_active,
  (SELECT MIN(dd.due_date) FROM supplier_due_dates dd WHERE dd.supplier_id = s.id AND dd.is_paid = FALSE) AS next_due_date,
  (SELECT COUNT(*) FROM supplier_orders so WHERE so.supplier_id = s.id AND so.status NOT IN ('received', 'cancelled')) AS active_orders,
  s.created_at
FROM suppliers s;

CREATE OR REPLACE VIEW v_fabrics_stock AS
SELECT
  f.id,
  f.fabric_code,
  f.name,
  f.color_name,
  f.pattern,
  f.composition,
  f.price_per_meter,
  f.stock_meters,
  f.reserved_meters,
  f.stock_meters - f.reserved_meters AS available_meters,
  f.min_stock_meters,
  f.status,
  f.season,
  f.is_permanent,
  s.name AS supplier_name,
  s.id AS supplier_id,
  fc.name AS category_name,
  w.name AS warehouse_name,
  CASE WHEN f.min_stock_meters IS NOT NULL AND f.stock_meters <= f.min_stock_meters THEN TRUE ELSE FALSE END AS low_stock_alert
FROM fabrics f
LEFT JOIN suppliers s ON s.id = f.supplier_id
LEFT JOIN fabric_categories fc ON fc.id = f.category_id
LEFT JOIN warehouses w ON w.id = f.warehouse_id
WHERE f.is_active = TRUE;
