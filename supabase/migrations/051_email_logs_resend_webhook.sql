-- ==========================================
-- 051: email_logs — columnas para webhook Resend (delivered_at, bounced_at, opens_count, clicks_count, status 'complained')
-- ==========================================

-- Columnas para tracking de eventos Resend
ALTER TABLE email_logs ADD COLUMN IF NOT EXISTS delivered_at TIMESTAMPTZ;
ALTER TABLE email_logs ADD COLUMN IF NOT EXISTS bounced_at TIMESTAMPTZ;
ALTER TABLE email_logs ADD COLUMN IF NOT EXISTS opens_count INTEGER DEFAULT 0 NOT NULL;
ALTER TABLE email_logs ADD COLUMN IF NOT EXISTS clicks_count INTEGER DEFAULT 0 NOT NULL;

-- Permitir status 'complained' en el CHECK (drop + add con nuevo valor)
ALTER TABLE email_logs DROP CONSTRAINT IF EXISTS email_logs_status_check;
ALTER TABLE email_logs ADD CONSTRAINT email_logs_status_check
  CHECK (status IN ('sent', 'delivered', 'opened', 'clicked', 'bounced', 'failed', 'complained'));
