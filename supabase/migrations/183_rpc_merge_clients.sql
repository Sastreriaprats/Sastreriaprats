-- ============================================================
-- Migración 183: permiso + RPCs para FUSIONAR clientes duplicados.
--
-- Reasigna TODO lo vinculado al cliente "source" hacia el "target" y borra el
-- source. CLAVE: la reasignación enumera las FK DINÁMICAMENTE desde pg_catalog
-- (no lista hardcodeada), porque prod tiene tablas con client_id que NO están
-- en las migraciones numeradas (drift: estimates, loyalty_points, etc.). Así
-- es imposible olvidar una tabla y dejar huérfanos.
--
-- Casos especiales (UNIQUE / semánticos) se resuelven aparte:
--  * client_wishlist UNIQUE(client_id, product_id) -> dedupe ANTES del bucle.
--  * client_measurements -> tras reasignar, 1 solo is_current por garment_type.
--  * client_companies -> tras reasignar, 1 solo is_default.
--  * invoices -> se reasigna client_id PERO el snapshot fiscal (client_name/nif)
--    NO se toca (lo hace el bucle: solo cambia client_id).
--
-- Cerrojos: source=target, inexistente, y source con profile_id (cuenta web).
-- ============================================================

-- ── Permiso ────────────────────────────────────────────────────────────────
INSERT INTO permissions (code, module, action, display_name, description, category, is_sensitive)
VALUES (
  'clients.merge', 'clients', 'merge', 'Fusionar clientes',
  'Fusionar dos fichas de cliente duplicadas: reasigna todo lo vinculado al superviviente y borra el duplicado.',
  'Clientes', true
)
ON CONFLICT (code) DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r CROSS JOIN permissions p
WHERE r.name = 'administrador' AND p.code = 'clients.merge'
ON CONFLICT DO NOTHING;

-- ── RPC A: preview (solo lectura) ───────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.rpc_preview_client_merge(
  p_source_id uuid,
  p_target_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_source   RECORD;
  v_target   RECORD;
  v_blockers text[] := '{}';
  v_warnings text[] := '{}';
  v_counts   jsonb := '{}'::jsonb;
  v_rec      RECORD;
  v_cnt      bigint;
BEGIN
  SELECT * INTO v_source FROM clients WHERE id = p_source_id;
  SELECT * INTO v_target FROM clients WHERE id = p_target_id;

  IF p_source_id = p_target_id THEN
    v_blockers := array_append(v_blockers, 'No se puede fusionar un cliente consigo mismo.');
  END IF;
  IF v_source.id IS NULL THEN
    v_blockers := array_append(v_blockers, 'El cliente a fusionar (origen) no existe.');
  END IF;
  IF v_target.id IS NULL THEN
    v_blockers := array_append(v_blockers, 'El cliente superviviente (destino) no existe.');
  END IF;
  IF v_source.id IS NOT NULL AND v_source.profile_id IS NOT NULL THEN
    v_blockers := array_append(v_blockers, 'El cliente origen tiene cuenta de usuario en la web (profile vinculado). Gestiona su cuenta antes de fusionar.');
  END IF;

  -- Conteo dinámico de lo que se reasignaría. Se enumera por COLUMNA client_id
  -- (pg_attribute), no por FK formal: prod tiene tablas con client_id SIN FK
  -- (drift). Enumerar por columna las coge TODAS y evita dejar huérfanos.
  IF v_source.id IS NOT NULL THEN
    FOR v_rec IN
      SELECT c.relname AS tbl
      FROM pg_attribute a
      JOIN pg_class c ON c.oid = a.attrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE a.attname = 'client_id' AND n.nspname = 'public' AND c.relkind = 'r'
        AND a.attnum > 0 AND NOT a.attisdropped AND c.relname <> 'clients'
    LOOP
      EXECUTE format('SELECT count(*) FROM public.%I WHERE client_id = $1', v_rec.tbl) INTO v_cnt USING p_source_id;
      IF v_cnt > 0 THEN
        v_counts := v_counts || jsonb_build_object(v_rec.tbl, v_cnt);
      END IF;
    END LOOP;

    -- Warnings de conflictos.
    IF EXISTS (
      SELECT 1 FROM client_measurements a
      JOIN client_measurements b ON b.client_id = p_target_id AND b.garment_type_id = a.garment_type_id AND b.is_current AND a.is_current
      WHERE a.client_id = p_source_id
    ) THEN
      v_warnings := array_append(v_warnings, 'Ambos clientes tienen medidas vigentes de la misma prenda; se conservará la más reciente como vigente.');
    END IF;
    IF EXISTS (
      SELECT 1 FROM client_wishlist a
      JOIN client_wishlist b ON b.client_id = p_target_id AND b.product_id = a.product_id
      WHERE a.client_id = p_source_id
    ) THEN
      v_warnings := array_append(v_warnings, 'Hay productos repetidos en la lista de deseos; se eliminarán los duplicados.');
    END IF;
    IF EXISTS (SELECT 1 FROM invoices WHERE client_id = p_source_id) THEN
      v_warnings := array_append(v_warnings, 'Las facturas del origen mantendrán su snapshot (nombre y NIF original) pero su vínculo se reasignará al cliente superviviente.');
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'source', CASE WHEN v_source.id IS NULL THEN NULL ELSE jsonb_build_object('id', v_source.id, 'full_name', v_source.full_name, 'email', v_source.email, 'phone', v_source.phone) END,
    'target', CASE WHEN v_target.id IS NULL THEN NULL ELSE jsonb_build_object('id', v_target.id, 'full_name', v_target.full_name, 'email', v_target.email, 'phone', v_target.phone) END,
    'counts', v_counts,
    'blockers', to_jsonb(v_blockers),
    'warnings', to_jsonb(v_warnings),
    'can_merge', (array_length(v_blockers, 1) IS NULL)
  );
END;
$$;

-- ── RPC B: fusión atómica ───────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.rpc_merge_clients(
  p_source_id  uuid,
  p_target_id  uuid,
  p_fill_empty boolean DEFAULT true
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_source  RECORD;
  v_target  RECORD;
  v_rec     RECORD;
  v_cnt     bigint;
  v_counts  jsonb := '{}'::jsonb;
  v_filled  text[] := '{}';
BEGIN
  SELECT * INTO v_source FROM clients WHERE id = p_source_id;
  SELECT * INTO v_target FROM clients WHERE id = p_target_id;

  -- Re-validación de cerrojos (no se confía en el preview).
  IF p_source_id = p_target_id THEN
    RETURN jsonb_build_object('success', false, 'error', 'No se puede fusionar un cliente consigo mismo.');
  END IF;
  IF v_source.id IS NULL OR v_target.id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Cliente no encontrado.');
  END IF;
  IF v_source.profile_id IS NOT NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'El cliente origen tiene cuenta de usuario en la web. Gestiona su cuenta antes de fusionar.');
  END IF;

  -- 1) Rellenar campos vacíos del target con los del source (sin sobrescribir).
  IF p_fill_empty THEN
    UPDATE clients t SET
      email           = COALESCE(NULLIF(btrim(t.email), ''), v_source.email),
      phone           = COALESCE(NULLIF(btrim(t.phone), ''), v_source.phone),
      phone_secondary = COALESCE(NULLIF(btrim(t.phone_secondary), ''), v_source.phone_secondary),
      document_number = COALESCE(NULLIF(btrim(t.document_number), ''), v_source.document_number),
      address         = COALESCE(NULLIF(btrim(t.address), ''), v_source.address),
      postal_code     = COALESCE(NULLIF(btrim(t.postal_code), ''), v_source.postal_code),
      city            = COALESCE(NULLIF(btrim(t.city), ''), v_source.city),
      province        = COALESCE(NULLIF(btrim(t.province), ''), v_source.province),
      country         = COALESCE(NULLIF(btrim(t.country), ''), v_source.country),
      company_name    = COALESCE(NULLIF(btrim(t.company_name), ''), v_source.company_name),
      company_nif     = COALESCE(NULLIF(btrim(t.company_nif), ''), v_source.company_nif),
      internal_notes  = COALESCE(NULLIF(btrim(t.internal_notes), ''), v_source.internal_notes),
      updated_at      = now()
    WHERE t.id = p_target_id;
    v_filled := ARRAY['campos vacíos completados desde el origen'];
  END IF;

  -- 2) Dedupe de tablas con UNIQUE(client_id, X) ANTES del bucle (evita violar
  --    la constraint al reasignar). client_wishlist: UNIQUE(client_id, product_id).
  DELETE FROM client_wishlist a
  WHERE a.client_id = p_source_id
    AND EXISTS (SELECT 1 FROM client_wishlist b WHERE b.client_id = p_target_id AND b.product_id = a.product_id);

  -- 3) BUCLE DINÁMICO: reasignar TODA tabla con columna client_id (pg_attribute,
  -- NO solo FK formales) -> coge también las tablas de drift sin FK. Imposible
  -- dejar huérfanos por una FK olvidada.
  FOR v_rec IN
    SELECT c.relname AS tbl
    FROM pg_attribute a
    JOIN pg_class c ON c.oid = a.attrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE a.attname = 'client_id' AND n.nspname = 'public' AND c.relkind = 'r'
      AND a.attnum > 0 AND NOT a.attisdropped AND c.relname <> 'clients'
  LOOP
    EXECUTE format('UPDATE public.%I SET client_id = $1 WHERE client_id = $2', v_rec.tbl)
      USING p_target_id, p_source_id;
    GET DIAGNOSTICS v_cnt = ROW_COUNT;
    IF v_cnt > 0 THEN
      v_counts := v_counts || jsonb_build_object(v_rec.tbl, v_cnt);
    END IF;
  END LOOP;

  -- 4) Post-proceso de conflictos semánticos en el target.
  -- 4a) client_measurements: 1 solo is_current por garment_type (la más reciente).
  UPDATE client_measurements m SET is_current = false
  WHERE m.client_id = p_target_id AND m.is_current = true
    AND m.id <> (
      SELECT id FROM client_measurements x
      WHERE x.client_id = p_target_id AND x.garment_type_id = m.garment_type_id AND x.is_current = true
      ORDER BY x.version DESC NULLS LAST, x.taken_at DESC NULLS LAST, x.created_at DESC
      LIMIT 1
    );

  -- 4b) client_companies: 1 solo is_default (el más reciente).
  UPDATE client_companies c SET is_default = false
  WHERE c.client_id = p_target_id AND c.is_default = true
    AND c.id <> (
      SELECT id FROM client_companies x
      WHERE x.client_id = p_target_id AND x.is_default = true
      ORDER BY x.created_at DESC
      LIMIT 1
    );

  -- 5) Borrar el cliente origen (ya sin dependientes -> no salta RESTRICT).
  DELETE FROM clients WHERE id = p_source_id;

  RETURN jsonb_build_object(
    'success', true,
    'message', 'Clientes fusionados.',
    'source_id', p_source_id,
    'target_id', p_target_id,
    'counts', v_counts,
    'fields_filled', to_jsonb(v_filled)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.rpc_preview_client_merge(uuid, uuid) TO service_role, authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_merge_clients(uuid, uuid, boolean) TO service_role, authenticated;
