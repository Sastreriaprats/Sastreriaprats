ALTER TABLE email_logs
  ADD COLUMN IF NOT EXISTS delivered_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS bounced_at   TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS opens_count  INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS clicks_count INT NOT NULL DEFAULT 0;

COMMENT ON COLUMN email_logs.delivered_at IS 'Cuándo Resend confirmó entrega (webhook email.delivered)';
COMMENT ON COLUMN email_logs.bounced_at   IS 'Cuándo Resend reportó rebote (webhook email.bounced)';
COMMENT ON COLUMN email_logs.opens_count  IS 'Número de aperturas registradas (se incrementa con cada email.opened)';
COMMENT ON COLUMN email_logs.clicks_count IS 'Número de clics registrados (se incrementa con cada email.clicked)';
