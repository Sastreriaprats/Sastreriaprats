-- ==========================================
-- SASTRERÍA PRATS — Migración 244
-- Vínculo factura ↔ reserva de producto
-- ==========================================
-- Permite emitir una factura directamente desde una reserva
-- (product_reservations) sin tener que pasar antes por una venta.
-- Mismo patrón que invoices.sale_id / invoices.tailoring_order_id:
-- la factura "recuerda" de qué reserva nació para evitar duplicados
-- y dar trazabilidad en Contabilidad.

ALTER TABLE invoices
  ADD COLUMN IF NOT EXISTS reservation_id UUID
    REFERENCES product_reservations(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_invoices_reservation_id
  ON invoices(reservation_id)
  WHERE reservation_id IS NOT NULL;

COMMENT ON COLUMN invoices.reservation_id IS
  'Reserva de producto de la que nació la factura (createInvoiceFromReservationAction). NULL en facturas no originadas en reserva.';
