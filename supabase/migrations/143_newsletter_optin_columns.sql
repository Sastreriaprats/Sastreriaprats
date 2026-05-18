ALTER TABLE clients
  ADD COLUMN IF NOT EXISTS marketing_consent_ip      TEXT,
  ADD COLUMN IF NOT EXISTS opt_in_token              TEXT,
  ADD COLUMN IF NOT EXISTS opt_in_token_created_at   TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS opt_in_sent_at            TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS unsubscribed_at           TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS unsubscribe_reason        TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_clients_opt_in_token
  ON clients(opt_in_token) WHERE opt_in_token IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_clients_marketing_eligible
  ON clients(accepts_marketing, newsletter_subscribed, email_bounced)
  WHERE accepts_marketing = true
    AND newsletter_subscribed = true
    AND email_bounced = false
    AND unsubscribed_at IS NULL;

COMMENT ON COLUMN clients.marketing_consent_ip IS 'IP desde la que se confirmó el consentimiento (RGPD)';
COMMENT ON COLUMN clients.opt_in_token IS 'Token único firmado para confirmar suscripción por clic';
COMMENT ON COLUMN clients.opt_in_token_created_at IS 'Cuándo se generó el token (expira a los 30 días)';
COMMENT ON COLUMN clients.opt_in_sent_at IS 'Cuándo se envió el email de opt-in (para no re-enviarlo a quien ya lo recibió)';
COMMENT ON COLUMN clients.unsubscribed_at IS 'Cuándo se dio de baja de newsletter (para auditoría)';
COMMENT ON COLUMN clients.unsubscribe_reason IS 'Razón opcional de la baja';
