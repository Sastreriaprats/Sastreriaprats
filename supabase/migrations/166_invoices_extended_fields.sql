-- ============================================================
-- Migración 166: ampliar invoices con email, teléfono y forma de pago
--
-- Motivo: el modal de edición de factura solo dejaba editar nombre/
-- NIF/dirección. Mónica pidió poder añadir y editar también email,
-- teléfono y forma de pago (snapshot fiscal, no toca la ficha del
-- cliente).
--
-- Las 3 columnas son TEXT libres y NULLABLE. payment_method NO es
-- ENUM para permitir cualquier descripción ("Bizum", "Transferencia
-- + tarjeta", "Aplazado 30 días", etc.).
--
-- Idempotente: IF NOT EXISTS en cada ADD COLUMN.
-- ============================================================

ALTER TABLE invoices
  ADD COLUMN IF NOT EXISTS client_email TEXT,
  ADD COLUMN IF NOT EXISTS client_phone TEXT,
  ADD COLUMN IF NOT EXISTS payment_method TEXT;

COMMENT ON COLUMN invoices.client_email   IS 'Email del cliente impreso en la factura (snapshot, no se sincroniza con clients.email)';
COMMENT ON COLUMN invoices.client_phone   IS 'Teléfono del cliente impreso en la factura (snapshot)';
COMMENT ON COLUMN invoices.payment_method IS 'Forma de pago indicada en el cuerpo de la factura (texto libre: Efectivo, Transferencia, Tarjeta, Bizum, Cheque, Mixto, etc.)';
