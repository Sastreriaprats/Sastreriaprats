-- ============================================================
-- Migración 239 — función puente para el control de acceso en edge
--
-- Devuelve las capas del usuario leyendo aux.access (que NO está expuesto a la
-- API). SECURITY DEFINER + solo ejecutable por service_role → el middleware la
-- llama por REST con la service key para decidir el 404; anon/authenticated no
-- pueden invocarla ni ven la tabla.
-- ============================================================

CREATE OR REPLACE FUNCTION public.fn_view_scopes(p_uid uuid)
RETURNS text[]
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(array_agg(scope), '{}')
  FROM aux.access
  WHERE user_id = p_uid;
$$;

REVOKE ALL ON FUNCTION public.fn_view_scopes(uuid) FROM PUBLIC;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    EXECUTE 'REVOKE ALL ON FUNCTION public.fn_view_scopes(uuid) FROM anon';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    EXECUTE 'REVOKE ALL ON FUNCTION public.fn_view_scopes(uuid) FROM authenticated';
  END IF;
END $$;
GRANT EXECUTE ON FUNCTION public.fn_view_scopes(uuid) TO service_role;
