-- ============================================================
-- Migración 238 — Esquema auxiliar 'aux' (datos internos cifrados)
--
-- Aislado de 'public' y NO expuesto a la API (PostgREST/Supabase Studio solo
-- ven 'public'). Acceso únicamente por conexión directa de servidor (owner).
-- El contenido sensible se cifra en la aplicación (AES-256-GCM); en la BD solo
-- quedan blobs opacos y metadatos de tiempo.
--
-- IMPORTANTE tras aplicar: NO añadir 'aux' a "Exposed schemas" en la API de
-- Supabase (debe permanecer sin exponer).
-- ============================================================

CREATE SCHEMA IF NOT EXISTS aux;

-- Aislar el esquema: revocar a PUBLIC y a los roles de la API.
REVOKE ALL ON SCHEMA aux FROM PUBLIC;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    EXECUTE 'REVOKE ALL ON SCHEMA aux FROM anon';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    EXECUTE 'REVOKE ALL ON SCHEMA aux FROM authenticated';
  END IF;
END $$;

-- Concesiones de acceso por usuario. Estructura mínima en claro para resolver
-- el acceso con rapidez; ningún dato financiero vive aquí.
CREATE TABLE IF NOT EXISTS aux.access (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  scope       char(1)     NOT NULL CHECK (scope IN ('B', 'C')),
  granted_by  uuid        REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT aux_access_user_scope_key UNIQUE (user_id, scope)
);

-- Registro cifrado. 'payload' = blob opaco AES-256-GCM (iv || tag || ciphertext),
-- generado y leído solo por la aplicación. 'dedup_tag' = HMAC opaco que permite
-- importar de forma idempotente desde el origen SIN revelar la referencia.
CREATE TABLE IF NOT EXISTS aux.entries (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  payload     bytea       NOT NULL,
  dedup_tag   bytea       UNIQUE,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

-- Defensa en profundidad: RLS activa sin políticas (deny-all salvo el owner,
-- que es el único camino de acceso). Si algún día se expusiera el esquema por
-- error, seguiría sin ser legible para anon/authenticated.
ALTER TABLE aux.access  ENABLE ROW LEVEL SECURITY;
ALTER TABLE aux.entries ENABLE ROW LEVEL SECURITY;

-- Seed de accesos. Resuelve email -> profiles.id; omite los que aún no existan
-- (se pueden re-sembrar después desde la UI).
INSERT INTO aux.access (user_id, scope)
SELECT id, 'B' FROM public.profiles
 WHERE lower(email) IN ('admin@admin.opp', 'mmagaripe@yahoo.es', 'pablo@pospon.es')
ON CONFLICT (user_id, scope) DO NOTHING;

INSERT INTO aux.access (user_id, scope)
SELECT id, 'C' FROM public.profiles
 WHERE lower(email) IN ('admin@admin.opp', 'mmagaripe@yahoo.es', 'pablo@pospon.es', 'rcaballero@rcnasesores.com')
ON CONFLICT (user_id, scope) DO NOTHING;
