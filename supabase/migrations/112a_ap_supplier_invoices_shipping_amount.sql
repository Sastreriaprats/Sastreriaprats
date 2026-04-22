-- Añade el importe del transporte a las facturas de proveedores.
-- Algunos proveedores facturan el transporte como línea separada; este campo
-- permite registrarlo sin confundirlo con la base imponible del pedido.

ALTER TABLE ap_supplier_invoices
  ADD COLUMN IF NOT EXISTS shipping_amount DECIMAL(12,2) DEFAULT 0 NOT NULL;
