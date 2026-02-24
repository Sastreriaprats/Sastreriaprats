-- ==========================================
-- Migration system for Power Shop data import
-- ==========================================

CREATE TABLE IF NOT EXISTS migration_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id TEXT NOT NULL UNIQUE,
  entity_type TEXT NOT NULL CHECK (entity_type IN ('clients', 'products', 'orders', 'measurements')),
  total_rows INTEGER DEFAULT 0,
  imported INTEGER DEFAULT 0,
  updated INTEGER DEFAULT 0,
  skipped INTEGER DEFAULT 0,
  errors JSONB DEFAULT '[]',
  rolled_back BOOLEAN DEFAULT FALSE,
  rolled_back_at TIMESTAMPTZ,
  created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE migration_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "migration_logs_select" ON migration_logs
  FOR SELECT USING (user_has_permission(auth.uid(), 'config.access'));

CREATE POLICY "migration_logs_insert" ON migration_logs
  FOR INSERT WITH CHECK (user_has_permission(auth.uid(), 'config.access'));

CREATE POLICY "migration_logs_update" ON migration_logs
  FOR UPDATE USING (user_has_permission(auth.uid(), 'config.access'));

-- Add migration tracking columns to entities
ALTER TABLE clients ADD COLUMN IF NOT EXISTS migration_batch TEXT;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS migration_original_id TEXT;
ALTER TABLE products ADD COLUMN IF NOT EXISTS migration_batch TEXT;
ALTER TABLE products ADD COLUMN IF NOT EXISTS migration_original_id TEXT;
ALTER TABLE tailoring_orders ADD COLUMN IF NOT EXISTS migration_batch TEXT;
ALTER TABLE tailoring_orders ADD COLUMN IF NOT EXISTS migration_original_id TEXT;
ALTER TABLE client_measurements ADD COLUMN IF NOT EXISTS migration_batch TEXT;

-- Indexes for fast rollback
CREATE INDEX IF NOT EXISTS idx_clients_migration ON clients(migration_batch) WHERE migration_batch IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_products_migration ON products(migration_batch) WHERE migration_batch IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_orders_migration ON tailoring_orders(migration_batch) WHERE migration_batch IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_measurements_migration ON client_measurements(migration_batch) WHERE migration_batch IS NOT NULL;
