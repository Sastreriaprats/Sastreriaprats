-- Migración 120: Añadir cash_session_id a tailoring_order_payments
-- Para permitir reconciliación uniforme con sale_payments y product_reservation_payments
ALTER TABLE tailoring_order_payments
ADD COLUMN IF NOT EXISTS cash_session_id UUID REFERENCES cash_sessions(id);

CREATE INDEX IF NOT EXISTS idx_tailoring_order_payments_cash_session
ON tailoring_order_payments(cash_session_id);
