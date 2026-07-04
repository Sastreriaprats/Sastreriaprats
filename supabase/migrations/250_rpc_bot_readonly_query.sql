-- ============================================================
-- Migración 250: RPC de consulta SOLO LECTURA para el bot de Telegram.
--
-- El bot de Telegram traduce preguntas en lenguaje natural a SQL (vía Kimi) y
-- necesita ejecutarlo contra la BD. Para que eso sea seguro NO ejecutamos SQL
-- arbitrario desde el servidor: lo canalizamos por esta función, que aplica
-- varias capas de defensa antes de correr la consulta generada por la IA:
--
--   1. Solo se admite un único SELECT o WITH (CTE). Se rechaza cualquier otra
--      cosa por prefijo.
--   2. Se prohíbe el apilado de sentencias (";") y palabras clave de escritura /
--      DDL / administración (insert, update, delete, drop, create, grant, copy,
--      pg_read_file, dblink, ...). Filtro por palabra completa.
--   3. La transacción se marca READ ONLY (set_config local): aunque un patrón se
--      colara, Postgres aborta cualquier intento de escritura. Esta es la red de
--      seguridad real; el filtro de texto es solo la primera línea.
--   4. statement_timeout corto (8s) para evitar consultas colgadas / DoS.
--   5. La salida se limita a 500 filas y se devuelve como jsonb.
--
-- La ejecuta el service_role (cliente admin desde /api/telegram/webhook). Se
-- revoca a public/anon/authenticated para que la anon key NO pueda invocarla.
-- ============================================================

CREATE OR REPLACE FUNCTION public.rpc_bot_readonly_query(p_sql text)
RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
  v_sql    text;
  v_result jsonb;
BEGIN
  -- Normalizar: recortar TODO espacio (incl. saltos de línea/tabs) y un ';' final.
  v_sql := regexp_replace(coalesce(p_sql, ''), '^\s+|\s+$', '', 'g');
  v_sql := regexp_replace(v_sql, ';+\s*$', '');
  v_sql := regexp_replace(v_sql, '^\s+|\s+$', '', 'g');

  IF v_sql = '' THEN
    RAISE EXCEPTION 'Consulta vacía';
  END IF;

  -- Solo un SELECT / WITH.
  IF v_sql !~* '^(select|with)\s' THEN
    RAISE EXCEPTION 'Solo se permiten consultas de lectura (SELECT / WITH)';
  END IF;

  -- Sin apilado de sentencias.
  IF v_sql ~ ';' THEN
    RAISE EXCEPTION 'No se permite más de una sentencia';
  END IF;

  -- Sin palabras clave de escritura / DDL / administración (palabra completa).
  IF v_sql ~* '\y(insert|update|delete|drop|alter|create|truncate|grant|revoke|copy|call|merge|vacuum|reindex|refresh|comment|into|nextval|setval|lo_import|lo_export|dblink|pg_read_file|pg_read_binary_file|pg_ls_dir|pg_sleep|set_config|pg_terminate_backend|pg_cancel_backend)\y' THEN
    RAISE EXCEPTION 'La consulta contiene una palabra clave no permitida';
  END IF;

  -- Red de seguridad: transacción de solo lectura + timeout corto.
  PERFORM set_config('transaction_read_only', 'on', true);
  PERFORM set_config('statement_timeout', '8000', true);

  -- Ejecutar limitando a 500 filas antes de agregar a jsonb.
  EXECUTE format(
    'SELECT COALESCE(jsonb_agg(t), ''[]''::jsonb) FROM (SELECT * FROM (%s) AS _q LIMIT 500) AS t',
    v_sql
  ) INTO v_result;

  RETURN v_result;
END;
$$;

-- Solo el service_role (cliente admin del servidor) puede invocarla.
REVOKE ALL ON FUNCTION public.rpc_bot_readonly_query(text) FROM public;
REVOKE ALL ON FUNCTION public.rpc_bot_readonly_query(text) FROM anon;
REVOKE ALL ON FUNCTION public.rpc_bot_readonly_query(text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_bot_readonly_query(text) TO service_role;

COMMENT ON FUNCTION public.rpc_bot_readonly_query(text) IS
  'Ejecuta un único SELECT/WITH en transacción read-only (bot Telegram). Máx 500 filas, timeout 8s. Solo service_role.';
