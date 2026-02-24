-- ==========================================
-- SASTRERÍA PRATS — Migración 003b
-- Pedidos de Sastrería
-- ==========================================

-- 1. ENUMS
CREATE TYPE tailoring_order_type AS ENUM ('artesanal', 'industrial');
CREATE TYPE tailoring_order_status AS ENUM (
  'created', 'fabric_ordered', 'fabric_received', 'factory_ordered',
  'in_production', 'fitting', 'adjustments', 'finished',
  'delivered', 'incident', 'cancelled'
);

-- 2. PEDIDO DE SASTRERÍA (cabecera)
CREATE TABLE tailoring_orders (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  order_number VARCHAR(30) NOT NULL UNIQUE,
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE RESTRICT,
  order_type tailoring_order_type NOT NULL,
  status tailoring_order_status DEFAULT 'created' NOT NULL,
  store_id UUID NOT NULL REFERENCES stores(id) ON DELETE RESTRICT,
  
  order_date DATE DEFAULT CURRENT_DATE NOT NULL,
  estimated_delivery_date DATE,
  actual_delivery_date DATE,
  
  delivery_method TEXT DEFAULT 'store' CHECK (delivery_method IN ('store', 'home')),
  delivery_address TEXT,
  delivery_city TEXT,
  delivery_postal_code TEXT,
  
  subtotal DECIMAL(12,2) DEFAULT 0.00,
  discount_amount DECIMAL(12,2) DEFAULT 0.00,
  discount_percentage DECIMAL(5,2) DEFAULT 0.00,
  tax_amount DECIMAL(12,2) DEFAULT 0.00,
  total DECIMAL(12,2) DEFAULT 0.00,
  
  total_paid DECIMAL(12,2) DEFAULT 0.00,
  total_pending DECIMAL(12,2) GENERATED ALWAYS AS (GREATEST(total - total_paid, 0)) STORED,
  
  total_material_cost DECIMAL(12,2) DEFAULT 0.00,
  total_labor_cost DECIMAL(12,2) DEFAULT 0.00,
  total_factory_cost DECIMAL(12,2) DEFAULT 0.00,
  total_cost DECIMAL(12,2) GENERATED ALWAYS AS (total_material_cost + total_labor_cost + total_factory_cost) STORED,
  
  signature_url TEXT,
  signed_at TIMESTAMPTZ,
  
  parent_order_id UUID REFERENCES tailoring_orders(id) ON DELETE SET NULL,
  incident_reason TEXT,
  incident_responsible UUID REFERENCES profiles(id) ON DELETE SET NULL,
  incident_cost DECIMAL(10,2),
  
  invoice_id UUID,
  
  internal_notes TEXT,
  client_notes TEXT,
  
  created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE INDEX idx_tailoring_orders_number ON tailoring_orders(order_number);
CREATE INDEX idx_tailoring_orders_client ON tailoring_orders(client_id);
CREATE INDEX idx_tailoring_orders_status ON tailoring_orders(status);
CREATE INDEX idx_tailoring_orders_store ON tailoring_orders(store_id);
CREATE INDEX idx_tailoring_orders_date ON tailoring_orders(order_date DESC);
CREATE INDEX idx_tailoring_orders_delivery ON tailoring_orders(estimated_delivery_date);
CREATE INDEX idx_tailoring_orders_parent ON tailoring_orders(parent_order_id);
CREATE INDEX idx_tailoring_orders_pending ON tailoring_orders(status) WHERE status NOT IN ('delivered', 'cancelled');

CREATE TRIGGER trigger_tailoring_orders_updated_at
  BEFORE UPDATE ON tailoring_orders FOR EACH ROW EXECUTE PROCEDURE update_updated_at();

-- 3. LÍNEAS DE PEDIDO (una por prenda)
CREATE TABLE tailoring_order_lines (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tailoring_order_id UUID NOT NULL REFERENCES tailoring_orders(id) ON DELETE CASCADE,
  garment_type_id UUID NOT NULL REFERENCES garment_types(id) ON DELETE RESTRICT,
  status tailoring_order_status DEFAULT 'created' NOT NULL,
  line_type tailoring_order_type NOT NULL,
  
  measurement_id UUID REFERENCES client_measurements(id) ON DELETE SET NULL,
  
  configuration JSONB DEFAULT '{}'::jsonb,
  
  fabric_id UUID REFERENCES fabrics(id) ON DELETE SET NULL,
  fabric_description TEXT,
  fabric_meters DECIMAL(8,2),
  
  supplier_id UUID REFERENCES suppliers(id) ON DELETE SET NULL,
  supplier_order_id UUID REFERENCES supplier_orders(id) ON DELETE SET NULL,
  
  unit_price DECIMAL(10,2) NOT NULL,
  discount_percentage DECIMAL(5,2) DEFAULT 0.00,
  discount_amount DECIMAL(10,2) DEFAULT 0.00,
  tax_rate DECIMAL(5,2) DEFAULT 21.00,
  line_total DECIMAL(10,2),
  
  material_cost DECIMAL(10,2) DEFAULT 0.00,
  labor_cost DECIMAL(10,2) DEFAULT 0.00,
  factory_cost DECIMAL(10,2) DEFAULT 0.00,
  
  model_name TEXT,
  model_size TEXT,
  
  finishing_notes TEXT,
  
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE INDEX idx_tailoring_order_lines_order ON tailoring_order_lines(tailoring_order_id);
CREATE INDEX idx_tailoring_order_lines_garment ON tailoring_order_lines(garment_type_id);
CREATE INDEX idx_tailoring_order_lines_status ON tailoring_order_lines(status);
CREATE INDEX idx_tailoring_order_lines_fabric ON tailoring_order_lines(fabric_id);

CREATE TRIGGER trigger_tailoring_order_lines_updated_at
  BEFORE UPDATE ON tailoring_order_lines FOR EACH ROW EXECUTE PROCEDURE update_updated_at();

-- 4. HISTORIAL DE ESTADOS
CREATE TABLE tailoring_order_state_history (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tailoring_order_id UUID NOT NULL REFERENCES tailoring_orders(id) ON DELETE CASCADE,
  tailoring_order_line_id UUID REFERENCES tailoring_order_lines(id) ON DELETE CASCADE,
  from_status tailoring_order_status,
  to_status tailoring_order_status NOT NULL,
  description TEXT,
  notes TEXT,
  changed_by UUID NOT NULL REFERENCES profiles(id) ON DELETE SET NULL,
  changed_by_name TEXT,
  changed_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE INDEX idx_order_state_history_order ON tailoring_order_state_history(tailoring_order_id);
CREATE INDEX idx_order_state_history_line ON tailoring_order_state_history(tailoring_order_line_id);
CREATE INDEX idx_order_state_history_date ON tailoring_order_state_history(changed_at DESC);

-- 5. PRUEBAS DE SASTRERÍA
CREATE TABLE tailoring_fittings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tailoring_order_id UUID NOT NULL REFERENCES tailoring_orders(id) ON DELETE CASCADE,
  tailoring_order_line_id UUID REFERENCES tailoring_order_lines(id) ON DELETE CASCADE,
  fitting_number INTEGER NOT NULL DEFAULT 1,
  scheduled_date DATE,
  scheduled_time TIME,
  duration_minutes INTEGER DEFAULT 30,
  status TEXT DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'completed', 'no_show', 'cancelled', 'rescheduled')),
  adjustments_needed TEXT,
  adjustment_details JSONB,
  photos JSONB DEFAULT '[]'::jsonb,
  store_id UUID REFERENCES stores(id) ON DELETE SET NULL,
  tailor_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE INDEX idx_tailoring_fittings_order ON tailoring_fittings(tailoring_order_id);
CREATE INDEX idx_tailoring_fittings_date ON tailoring_fittings(scheduled_date);
CREATE INDEX idx_tailoring_fittings_status ON tailoring_fittings(status);
CREATE INDEX idx_tailoring_fittings_store ON tailoring_fittings(store_id);

CREATE TRIGGER trigger_tailoring_fittings_updated_at
  BEFORE UPDATE ON tailoring_fittings FOR EACH ROW EXECUTE PROCEDURE update_updated_at();

-- Vincular client_measurements.order_id ahora que la tabla existe
ALTER TABLE client_measurements
  ADD CONSTRAINT fk_measurements_order
  FOREIGN KEY (order_id) REFERENCES tailoring_orders(id) ON DELETE SET NULL;
