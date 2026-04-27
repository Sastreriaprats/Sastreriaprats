-- Añade retención IRPF a las facturas de proveedor.
--
-- Algunos proveedores aplican retención (típico 7/15/19%) que se descuenta
-- del total de la factura. Antes el formulario no lo soportaba y el campo
-- "transporte" (shipping_amount) se queda como legado: la usuaria lo suma
-- en la base imponible, así que ya no se expone en el formulario.

ALTER TABLE ap_supplier_invoices
  ADD COLUMN IF NOT EXISTS retention_rate   DECIMAL(5,2)  DEFAULT 0,
  ADD COLUMN IF NOT EXISTS retention_amount DECIMAL(12,2) DEFAULT 0;

COMMENT ON COLUMN ap_supplier_invoices.retention_rate
  IS 'Porcentaje de retención IRPF aplicado a la base imponible (ej: 7, 15, 19)';
COMMENT ON COLUMN ap_supplier_invoices.retention_amount
  IS 'Importe de la retención IRPF en euros (= amount * retention_rate / 100)';
