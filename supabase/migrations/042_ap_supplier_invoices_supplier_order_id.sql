-- Enlace opcional: factura de proveedor (ap) generada desde un pedido a proveedor
ALTER TABLE ap_supplier_invoices
  ADD COLUMN IF NOT EXISTS supplier_order_id UUID REFERENCES supplier_orders(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_ap_supplier_invoices_supplier_order ON ap_supplier_invoices(supplier_order_id);
