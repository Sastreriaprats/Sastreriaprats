-- 202_client_error_log.sql
--
-- Tabla genérica de log de errores de cliente (telemetría). Se usa para capturar
-- fallos que solo ocurren en el navegador y hoy se tragan (p.ej. impresión de
-- tickets: rama de fallback ejecutada + error real de getBlob + navegador), pero
-- es genérica y vale para cualquier error de cliente futuro.
--
-- Acceso SOLO vía server actions (service role bypassa RLS): escribir con
-- logClientError (cualquier autenticado), leer con getClientErrors (solo admin).
-- RLS habilitada sin políticas permisivas -> cliente/anon no acceden directamente.
--
-- Sin bloques $$ ni funciones -> sin riesgo del splitter del SQL Editor.

CREATE TABLE IF NOT EXISTS client_error_log (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at    timestamptz NOT NULL DEFAULT now(),
  user_id       uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  source        text NOT NULL,
  error_message text,
  user_agent    text,
  context       jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_client_error_log_created ON client_error_log (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_client_error_log_source  ON client_error_log (source);

ALTER TABLE client_error_log ENABLE ROW LEVEL SECURITY;
