-- ==========================================
-- 053: recepción de pedidos proveedor en stock
-- ==========================================

-- Añadir nuevo tipo de movimiento de stock para recepciones de compra
DO $$ BEGIN
  ALTER TYPE stock_movement_type ADD VALUE IF NOT EXISTS 'purchase_receipt';
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Metadatos de referencia para movimientos
ALTER TABLE stock_movements ADD COLUMN IF NOT EXISTS reference_id UUID;
ALTER TABLE stock_movements ADD COLUMN IF NOT EXISTS reference_type VARCHAR(50);

-- Marca de protección para evitar duplicar actualización de stock
ALTER TABLE supplier_orders ADD COLUMN IF NOT EXISTS stock_updated_at TIMESTAMPTZ;
