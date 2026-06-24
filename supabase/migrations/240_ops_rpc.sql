-- ============================================================
-- Migración 240 — funciones puente para el módulo interno (vía API)
--
-- El serverless de Vercel no abre conexión directa a la BD; solo PostgREST.
-- Estas funciones (SECURITY DEFINER, solo service_role) permiten operar sobre
-- el esquema aislado 'aux' desde supabase-js, sin exponer las tablas. El
-- contenido del ledger sigue cifrado (se pasa/recibe en base64).
-- ============================================================

-- ---- ledger cifrado (pagos en efectivo de control) ----
CREATE OR REPLACE FUNCTION public.fn_ops_entries_list()
RETURNS TABLE (id uuid, payload_b64 text, created_at timestamptz)
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT id, encode(payload, 'base64'), created_at FROM aux.entries ORDER BY created_at DESC;
$$;

CREATE OR REPLACE FUNCTION public.fn_ops_entry_insert(p_payload_b64 text)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_id uuid;
BEGIN
  INSERT INTO aux.entries (payload) VALUES (decode(p_payload_b64, 'base64')) RETURNING id INTO v_id;
  RETURN v_id;
END; $$;

CREATE OR REPLACE FUNCTION public.fn_ops_entry_delete(p_id uuid)
RETURNS void
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  DELETE FROM aux.entries WHERE id = p_id;
$$;

-- ---- gestión de accesos ----
CREATE OR REPLACE FUNCTION public.fn_ops_access_list()
RETURNS TABLE (user_id uuid, email text, full_name text, scope text, created_at timestamptz)
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT a.user_id, lower(p.email), p.full_name, a.scope::text, a.created_at
  FROM aux.access a JOIN public.profiles p ON p.id = a.user_id
  ORDER BY p.full_name, a.scope;
$$;

CREATE OR REPLACE FUNCTION public.fn_ops_access_grant(p_uid uuid, p_scope text, p_by uuid)
RETURNS void
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  INSERT INTO aux.access (user_id, scope, granted_by) VALUES (p_uid, p_scope, p_by)
  ON CONFLICT (user_id, scope) DO NOTHING;
$$;

CREATE OR REPLACE FUNCTION public.fn_ops_access_revoke(p_uid uuid, p_scope text)
RETURNS void
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  DELETE FROM aux.access WHERE user_id = p_uid AND scope = p_scope;
$$;

-- Solo service_role (el resto, revocado)
DO $$
DECLARE fn text;
BEGIN
  FOR fn IN SELECT unnest(ARRAY[
    'public.fn_ops_entries_list()',
    'public.fn_ops_entry_insert(text)',
    'public.fn_ops_entry_delete(uuid)',
    'public.fn_ops_access_list()',
    'public.fn_ops_access_grant(uuid,text,uuid)',
    'public.fn_ops_access_revoke(uuid,text)'
  ])
  LOOP
    EXECUTE 'REVOKE ALL ON FUNCTION ' || fn || ' FROM PUBLIC';
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='anon') THEN EXECUTE 'REVOKE ALL ON FUNCTION ' || fn || ' FROM anon'; END IF;
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN EXECUTE 'REVOKE ALL ON FUNCTION ' || fn || ' FROM authenticated'; END IF;
    EXECUTE 'GRANT EXECUTE ON FUNCTION ' || fn || ' TO service_role';
  END LOOP;
END $$;
