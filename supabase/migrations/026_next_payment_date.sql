-- ============================================================
-- 026 – Columna next_payment_date en pagos parciales
-- ============================================================

ALTER TABLE tailoring_order_payments
  ADD COLUMN IF NOT EXISTS next_payment_date DATE;

ALTER TABLE sale_payments
  ADD COLUMN IF NOT EXISTS next_payment_date DATE;

CREATE INDEX IF NOT EXISTS tailoring_order_payments_next_payment_idx
  ON tailoring_order_payments(next_payment_date)
  WHERE next_payment_date IS NOT NULL;

CREATE INDEX IF NOT EXISTS sale_payments_next_payment_idx
  ON sale_payments(next_payment_date)
  WHERE next_payment_date IS NOT NULL;
