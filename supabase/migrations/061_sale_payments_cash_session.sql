-- 061: Añadir cash_session_id a sale_payments
ALTER TABLE sale_payments 
ADD COLUMN IF NOT EXISTS cash_session_id UUID 
REFERENCES cash_sessions(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS sale_payments_cash_session_idx 
ON sale_payments(cash_session_id) 
WHERE cash_session_id IS NOT NULL;
