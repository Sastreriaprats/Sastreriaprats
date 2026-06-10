-- 206_manual_transaction_invoice_link.sql
--
-- Enlace estructural (FK) entre el gasto y la factura de proveedor que paga.
-- Hasta ahora el vínculo era solo por TEXTO en la descripción ("Pago factura
-- <nº> · <PROVEEDOR>"). Esta FK permite desglosar la categoría "proveedores" del
-- informe de gastos por tipo de proveedor (suppliers.expense_type) y por factura,
-- y arregla la deuda del acoplamiento por texto para los pagos a proveedor.
--
-- ON DELETE SET NULL: si se borra una factura, el gasto NO se borra; solo pierde
-- el enlace. Idempotente, sin bloques $$.

ALTER TABLE manual_transactions
  ADD COLUMN IF NOT EXISTS ap_supplier_invoice_id uuid
  REFERENCES ap_supplier_invoices(id) ON DELETE SET NULL;
