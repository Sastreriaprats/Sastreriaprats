-- ==========================================
-- SASTRERÍA PRATS — Migración 015
-- Sincronización de schema real con migraciones
-- Documenta columnas y enum values añadidos directamente en Supabase
-- ==========================================

-- tailoring_orders: columnas añadidas fuera de migraciones
ALTER TABLE tailoring_orders
  ADD COLUMN IF NOT EXISTS client_id UUID REFERENCES clients(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS recipient_type TEXT,
  ADD COLUMN IF NOT EXISTS recipient_name TEXT,
  ADD COLUMN IF NOT EXISTS alert_on_delivery BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS official_id UUID REFERENCES officials(id) ON DELETE SET NULL;

-- tailoring_order_lines: official_id añadido fuera de migraciones
ALTER TABLE tailoring_order_lines
  ADD COLUMN IF NOT EXISTS official_id UUID REFERENCES officials(id) ON DELETE SET NULL;

-- tailoring_order_type: valores añadidos fuera de migraciones
DO $$ BEGIN
  ALTER TYPE tailoring_order_type ADD VALUE 'proveedor';
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TYPE tailoring_order_type ADD VALUE 'oficial';
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- tailoring_order_status: valores pendientes de añadir
DO $$ BEGIN
  ALTER TYPE tailoring_order_status ADD VALUE 'requested';
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TYPE tailoring_order_status ADD VALUE 'supplier_delivered';
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
