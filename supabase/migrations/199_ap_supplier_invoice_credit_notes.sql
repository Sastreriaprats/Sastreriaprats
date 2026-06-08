-- 199_ap_supplier_invoice_credit_notes.sql
--
-- Fase 1 de "abonos recibidos" (rectificativas de proveedor): permitir registrar
-- una factura recibida en negativo que rectifica a otra. El IVA soportado del
-- modelo 303 se deriva directamente de ap_supplier_invoices (suma con signo),
-- así que un abono negativo corrige el 303 automáticamente.
--
-- NO incluye el asiento contable 608 (Fase 2, pendiente de abordar el desacople
-- entre el IVA soportado de facturas y los asientos de compra de supplier_orders).

ALTER TABLE ap_supplier_invoices
  ADD COLUMN IF NOT EXISTS is_rectifying        BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS rectifies_invoice_id UUID REFERENCES ap_supplier_invoices(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS rectification_reason TEXT;

CREATE INDEX IF NOT EXISTS idx_ap_supplier_invoices_rectifies
  ON ap_supplier_invoices(rectifies_invoice_id);

COMMENT ON COLUMN ap_supplier_invoices.is_rectifying IS 'TRUE si la factura es un abono/rectificativa recibida del proveedor (importes negativos).';
COMMENT ON COLUMN ap_supplier_invoices.rectifies_invoice_id IS 'Factura recibida original a la que rectifica este abono.';
COMMENT ON COLUMN ap_supplier_invoices.rectification_reason IS 'Motivo del abono (obligatorio al registrar la rectificativa).';
