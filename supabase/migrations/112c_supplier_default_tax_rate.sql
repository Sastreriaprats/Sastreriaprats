-- ==========================================
-- SASTRERÍA PRATS — Migración 112
-- IVA por defecto en proveedores
-- ==========================================
-- Cada proveedor tiene un tipo de IVA por defecto que se aplica
-- automáticamente al crear una factura de proveedor.

ALTER TABLE suppliers
  ADD COLUMN IF NOT EXISTS default_tax_rate NUMERIC(5,2) DEFAULT 21.00;

UPDATE suppliers
  SET default_tax_rate = 21.00
  WHERE default_tax_rate IS NULL;
