-- Fecha de pago en pedidos a proveedor y enlace factura AP -> pedido
ALTER TABLE supplier_orders ADD COLUMN IF NOT EXISTS payment_due_date DATE;
COMMENT ON COLUMN supplier_orders.payment_due_date IS 'Fecha de vencimiento del pago al proveedor';

ALTER TABLE ap_supplier_invoices ADD COLUMN IF NOT EXISTS supplier_order_id UUID REFERENCES supplier_orders(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_ap_supplier_invoices_supplier_order ON ap_supplier_invoices(supplier_order_id);
