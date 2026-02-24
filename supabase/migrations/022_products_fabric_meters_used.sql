-- Metros gastados para productos tipo tejido
ALTER TABLE products
  ADD COLUMN IF NOT EXISTS fabric_meters_used DECIMAL(10,2) DEFAULT 0;

COMMENT ON COLUMN products.fabric_meters_used IS 'Metros de tejido consumidos/gastados (solo producto tipo tailoring_fabric)';
