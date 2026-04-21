-- ==========================================
-- SASTRERÍA PRATS — Migración 111
-- Doble aprobación de traspasos de stock
-- ==========================================
-- Un traspaso (stock_transfers) solo mueve stock cuando LO APRUEBEN:
--   1) Un usuario con rol admin/super_admin
--   2) Un usuario asignado a la tienda del almacén destino
-- Se guardan por separado los campos de ambas aprobaciones.
-- Las columnas legacy approved_by / approved_at se mantienen y se
-- rellenan con la aprobación FINAL (la segunda que completa).

ALTER TABLE stock_transfers
  ADD COLUMN IF NOT EXISTS admin_approved_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS admin_approved_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS destination_approved_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS destination_approved_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_stock_transfers_admin_approved
  ON stock_transfers(admin_approved_by)
  WHERE admin_approved_by IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_stock_transfers_destination_approved
  ON stock_transfers(destination_approved_by)
  WHERE destination_approved_by IS NOT NULL;
