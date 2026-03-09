-- ==========================================
-- 052: módulo de albaranes (propios + proveedor)
-- ==========================================

-- Albaranes propios (traspasos, movimientos de stock)
CREATE TABLE IF NOT EXISTS delivery_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID REFERENCES stores(id) ON DELETE SET NULL,
  number VARCHAR(20) UNIQUE NOT NULL, -- ALB-2026-XXXX
  type VARCHAR(30) NOT NULL CHECK (type IN ('traspaso', 'entrada_stock', 'salida_stock', 'ajuste')),
  status VARCHAR(20) DEFAULT 'borrador' CHECK (status IN ('borrador', 'confirmado', 'anulado')),
  from_warehouse_id UUID REFERENCES warehouses(id) ON DELETE SET NULL,
  to_warehouse_id UUID REFERENCES warehouses(id) ON DELETE SET NULL,
  stock_transfer_id UUID REFERENCES stock_transfers(id) ON DELETE SET NULL, -- vínculo con traspaso existente
  notes TEXT,
  confirmed_at TIMESTAMPTZ,
  created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS delivery_note_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  delivery_note_id UUID REFERENCES delivery_notes(id) ON DELETE CASCADE,
  product_variant_id UUID REFERENCES product_variants(id) ON DELETE SET NULL,
  product_name VARCHAR(200),
  sku VARCHAR(100),
  quantity INTEGER NOT NULL,
  unit_price DECIMAL(10,2),
  notes TEXT,
  sort_order INTEGER DEFAULT 0
);

-- Albaranes recibidos de proveedor
CREATE TABLE IF NOT EXISTS supplier_delivery_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID REFERENCES stores(id) ON DELETE SET NULL,
  supplier_id UUID REFERENCES suppliers(id) ON DELETE SET NULL,
  supplier_order_id UUID REFERENCES supplier_orders(id) ON DELETE SET NULL, -- vínculo con pedido existente
  supplier_reference VARCHAR(50), -- número que pone el proveedor
  delivery_date DATE,
  status VARCHAR(20) DEFAULT 'pendiente' CHECK (status IN ('pendiente', 'recibido', 'incidencia')),
  attachment_url TEXT, -- PDF subido por nosotros
  notes TEXT,
  created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS supplier_delivery_note_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_delivery_note_id UUID REFERENCES supplier_delivery_notes(id) ON DELETE CASCADE,
  product_id UUID REFERENCES products(id) ON DELETE SET NULL,
  fabric_id UUID REFERENCES fabrics(id) ON DELETE SET NULL,
  product_name VARCHAR(200),
  reference VARCHAR(100),
  quantity_ordered INTEGER,
  quantity_received INTEGER,
  unit_price DECIMAL(10,2),
  notes TEXT
);

-- Índices útiles
CREATE INDEX IF NOT EXISTS idx_delivery_notes_number ON delivery_notes(number);
CREATE INDEX IF NOT EXISTS idx_delivery_notes_status ON delivery_notes(status);
CREATE INDEX IF NOT EXISTS idx_delivery_notes_type ON delivery_notes(type);
CREATE INDEX IF NOT EXISTS idx_delivery_notes_transfer ON delivery_notes(stock_transfer_id);
CREATE INDEX IF NOT EXISTS idx_delivery_note_lines_note_id ON delivery_note_lines(delivery_note_id);
CREATE INDEX IF NOT EXISTS idx_supplier_delivery_notes_order_id ON supplier_delivery_notes(supplier_order_id);
CREATE INDEX IF NOT EXISTS idx_supplier_delivery_notes_supplier_id ON supplier_delivery_notes(supplier_id);
CREATE INDEX IF NOT EXISTS idx_supplier_delivery_notes_status ON supplier_delivery_notes(status);
CREATE INDEX IF NOT EXISTS idx_supplier_delivery_note_lines_note_id ON supplier_delivery_note_lines(supplier_delivery_note_id);

-- Bucket de storage para PDFs de albaranes
INSERT INTO storage.buckets (id, name, public)
VALUES ('albaranes', 'albaranes', false)
ON CONFLICT (id) DO NOTHING;

-- Numeración correlativa albaranes propios
CREATE SEQUENCE IF NOT EXISTS delivery_note_number_seq START 1;

-- Función para generar número ALB-YYYY-XXXX
CREATE OR REPLACE FUNCTION generate_delivery_note_number()
RETURNS TEXT AS $$
BEGIN
  RETURN 'ALB-' || EXTRACT(YEAR FROM NOW())::TEXT || '-' ||
         LPAD(nextval('delivery_note_number_seq')::TEXT, 4, '0');
END;
$$ LANGUAGE plpgsql;

-- updated_at automático
DROP TRIGGER IF EXISTS trigger_delivery_notes_updated_at ON delivery_notes;
CREATE TRIGGER trigger_delivery_notes_updated_at
  BEFORE UPDATE ON delivery_notes
  FOR EACH ROW
  EXECUTE PROCEDURE update_updated_at();

DROP TRIGGER IF EXISTS trigger_supplier_delivery_notes_updated_at ON supplier_delivery_notes;
CREATE TRIGGER trigger_supplier_delivery_notes_updated_at
  BEFORE UPDATE ON supplier_delivery_notes
  FOR EACH ROW
  EXECUTE PROCEDURE update_updated_at();
