-- 203_ap_supplier_invoice_proforma.sql
--
-- Facturas PROFORMA de proveedor. El proveedor nos envía su proforma (sin validez
-- fiscal/contable) y la registramos en ap_supplier_invoices con is_proforma=true.
-- Una proforma NO debe contar para IVA soportado (modelo 303), libro de facturas
-- recibidas, deuda/pagos ni asientos. Cuando llega la factura real, se edita la
-- misma fila y se le quita el flag (pasa a contar).
--
-- Flag booleano (mismo molde que is_rectifying de la mig 199), NO un status nuevo:
-- así no tocamos el enum/CHECK de status. Las filas existentes quedan is_proforma=false
-- (correcto: las facturas ya registradas siguen contando).
--
-- Idempotente, sin bloques $$ (sin riesgo de splitter del SQL Editor).

ALTER TABLE ap_supplier_invoices
  ADD COLUMN IF NOT EXISTS is_proforma boolean NOT NULL DEFAULT false;
