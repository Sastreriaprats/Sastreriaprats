-- Vincular facturas de proveedor al proveedor real + tabla intermedia factura ↔ albaranes
-- y flag anti-duplicado de stock en albaranes de proveedor.

-- 1) Proveedor real en ap_supplier_invoices (mantener supplier_name/supplier_cif como caché)
ALTER TABLE ap_supplier_invoices
  ADD COLUMN IF NOT EXISTS supplier_id UUID REFERENCES suppliers(id) ON DELETE RESTRICT;

CREATE INDEX IF NOT EXISTS idx_ap_supplier_invoices_supplier_id
  ON ap_supplier_invoices(supplier_id);

-- 2) Tabla intermedia factura ↔ albaranes de proveedor
CREATE TABLE IF NOT EXISTS ap_supplier_invoice_delivery_notes (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  supplier_invoice_id UUID NOT NULL REFERENCES ap_supplier_invoices(id) ON DELETE CASCADE,
  supplier_delivery_note_id UUID NOT NULL REFERENCES supplier_delivery_notes(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  UNIQUE (supplier_invoice_id, supplier_delivery_note_id),
  UNIQUE (supplier_delivery_note_id)
);

CREATE INDEX IF NOT EXISTS idx_ap_sidn_invoice
  ON ap_supplier_invoice_delivery_notes(supplier_invoice_id);
CREATE INDEX IF NOT EXISTS idx_ap_sidn_delivery_note
  ON ap_supplier_invoice_delivery_notes(supplier_delivery_note_id);

ALTER TABLE ap_supplier_invoice_delivery_notes ENABLE ROW LEVEL SECURITY;

CREATE POLICY ap_sidn_select ON ap_supplier_invoice_delivery_notes
  FOR SELECT USING (user_has_permission(auth.uid(), 'supplier_invoices.manage'));
CREATE POLICY ap_sidn_insert ON ap_supplier_invoice_delivery_notes
  FOR INSERT WITH CHECK (user_has_permission(auth.uid(), 'supplier_invoices.manage'));
CREATE POLICY ap_sidn_update ON ap_supplier_invoice_delivery_notes
  FOR UPDATE USING (user_has_permission(auth.uid(), 'supplier_invoices.manage'));
CREATE POLICY ap_sidn_delete ON ap_supplier_invoice_delivery_notes
  FOR DELETE USING (user_has_permission(auth.uid(), 'supplier_invoices.manage'));

-- 3) Flag anti-duplicado de stock en albaranes de proveedor
ALTER TABLE supplier_delivery_notes
  ADD COLUMN IF NOT EXISTS stock_updated_at TIMESTAMPTZ NULL;
