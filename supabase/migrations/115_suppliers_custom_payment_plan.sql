-- ==========================================
-- SASTRERÍA PRATS — Migración 115
-- Plan de pagos personalizado por proveedor
-- ==========================================
-- Añade columna JSONB `custom_payment_plan` a `suppliers` para guardar
-- cuotas del proveedor cuando payment_terms = 'custom'.
-- Formato: [{ amount: number, days?: number }]

ALTER TABLE suppliers
  ADD COLUMN IF NOT EXISTS custom_payment_plan JSONB NOT NULL DEFAULT '[]'::JSONB;
