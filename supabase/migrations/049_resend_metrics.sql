-- ========================================
-- 049: Métricas Resend (delivered_count, email_bounced, índice resend_id)
-- ========================================

-- email_campaigns: contador de entregados para métricas en UI
ALTER TABLE email_campaigns ADD COLUMN IF NOT EXISTS delivered_count INTEGER DEFAULT 0 NOT NULL;

-- clients: marcar email rebotado para no volver a enviar
ALTER TABLE clients ADD COLUMN IF NOT EXISTS email_bounced BOOLEAN DEFAULT FALSE NOT NULL;

-- Índice para buscar email_logs por resend_id en el webhook
CREATE INDEX IF NOT EXISTS idx_email_logs_resend_id ON email_logs(resend_id);
