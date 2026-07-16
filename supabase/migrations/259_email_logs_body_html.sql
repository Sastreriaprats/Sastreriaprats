-- ========================================
-- 259: Guardar el HTML enviado en email_logs
-- ========================================
-- Para poder previsualizar desde el historial exactamente lo que recibió
-- cada destinatario. Se rellena en cada envío a partir de ahora; los logs
-- históricos quedan NULL (para campañas antiguas la vista previa se
-- regenera desde la campaña).

ALTER TABLE email_logs
  ADD COLUMN IF NOT EXISTS body_html TEXT;

COMMENT ON COLUMN email_logs.body_html IS 'HTML final enviado al destinatario (snapshot). NULL en envíos anteriores a jul-2026.';
