-- ============================================================
-- Migración 251: memoria de conversación del bot de Telegram.
--
-- El webhook procesa cada mensaje de forma aislada (serverless). Para que el bot
-- entienda preguntas de seguimiento ("¿y en la otra tienda?", "¿y el mes pasado?")
-- guardamos el historial por chat aquí y lo reinyectamos a Kimi en cada turno.
--
-- Guardamos solo el texto de usuario y la respuesta final del asistente (no los
-- round-trips de SQL): es lo que da contexto conversacional sin inflar tokens.
-- Acceso solo service_role (RLS activa sin políticas => anon/authenticated fuera).
-- ============================================================

CREATE TABLE public.telegram_chat_history (
  id         bigserial PRIMARY KEY,
  chat_id    bigint NOT NULL,
  role       text   NOT NULL CHECK (role IN ('user', 'assistant')),
  content    text   NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_tch_chat_created ON public.telegram_chat_history (chat_id, created_at DESC);

ALTER TABLE public.telegram_chat_history ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.telegram_chat_history FROM anon, authenticated;
GRANT ALL ON public.telegram_chat_history TO service_role;
GRANT USAGE, SELECT ON SEQUENCE telegram_chat_history_id_seq TO service_role;

COMMENT ON TABLE public.telegram_chat_history IS
  'Historial de conversación por chat del bot de Telegram (contexto para Kimi). Solo service_role.';
