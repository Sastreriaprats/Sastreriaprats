-- ==========================================
-- SASTRERÍA PRATS — Migración 109
-- sale_lines.reservation_id
-- ==========================================
-- Añade la referencia opcional a product_reservations desde cada línea
-- de venta. Si está presente, la venta recoge una reserva (consume
-- stock ya bloqueado). La lógica vive en rpc_create_sale (migración 110).

ALTER TABLE sale_lines
  ADD COLUMN IF NOT EXISTS reservation_id UUID REFERENCES product_reservations(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_sale_lines_reservation ON sale_lines(reservation_id) WHERE reservation_id IS NOT NULL;
