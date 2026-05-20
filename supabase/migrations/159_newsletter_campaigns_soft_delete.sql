-- ============================================================
-- Migration 159: soft delete para campañas de email
-- ============================================================
-- Permite eliminar campañas del listado sin perder los registros
-- de auditoría (email_logs, aperturas, clics, etc.) que mantienen
-- su FK al campaign_id.
--
-- - deleted_at NULL: campaña activa, aparece en el listado.
-- - deleted_at NOT NULL: campaña eliminada, oculta del listado.
--
-- Idempotente: IF NOT EXISTS en columna e índice. Ejecutar varias
-- veces no produce cambios ni errores.
-- ============================================================

ALTER TABLE email_campaigns
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ DEFAULT NULL;

-- Índice parcial: solo indexa las campañas NO eliminadas, que es lo
-- único que se consulta normalmente (el listado filtra deleted_at IS NULL).
CREATE INDEX IF NOT EXISTS idx_email_campaigns_active
  ON email_campaigns(created_at DESC)
  WHERE deleted_at IS NULL;
