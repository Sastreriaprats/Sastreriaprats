-- ============================================================
-- 060 – Vincular cobros a sesión de caja
-- ============================================================

-- Vincular cobros a sesión de caja
ALTER TABLE manual_transactions
ADD COLUMN IF NOT EXISTS cash_session_id UUID REFERENCES cash_sessions(id) ON DELETE SET NULL;

ALTER TABLE tailoring_order_payments
ADD COLUMN IF NOT EXISTS cash_session_id UUID REFERENCES cash_sessions(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS manual_transactions_cash_session_idx
ON manual_transactions(cash_session_id) WHERE cash_session_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS tailoring_order_payments_cash_session_idx
ON tailoring_order_payments(cash_session_id) WHERE cash_session_id IS NOT NULL;
