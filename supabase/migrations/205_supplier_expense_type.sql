-- 205_supplier_expense_type.sql
--
-- Tipo de gasto del proveedor, para desglosar la categoría "proveedores" del
-- informe de gastos: 'general' | 'alquiler' | 'compras'. Default 'general'
-- (los proveedores existentes quedan 'general'; se reclasifican desde la UI).
--
-- Campo NUEVO (no reutilizar suppliers.supplier_types, que es fabric/services).
-- Idempotente, sin bloques $$.

ALTER TABLE suppliers
  ADD COLUMN IF NOT EXISTS expense_type text NOT NULL DEFAULT 'general';
