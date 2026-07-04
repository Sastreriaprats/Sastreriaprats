-- ============================================================
-- Migración 251 — Ingresos de efectivo al banco (módulo interno)
--
-- Registra depósitos bancarios de efectivo asociados a cobros concretos
-- (ventas, cobros de pedidos de sastrería o facturas cobradas en efectivo).
-- Un cobro depositado deja de contar en la capa B (efectivo) y pasa a contar
-- en el escenario C, manteniendo A = B + C.
--
-- Mismo estándar de confidencialidad que aux.entries (mig 238): el contenido
-- (qué cobro, importe, cliente, fecha) viaja CIFRADO AES-256-GCM en `payload`;
-- en la BD solo quedan blobs opacos. `dedup_tag` = HMAC(kind:item_id) UNIQUE →
-- impide depositar dos veces el mismo cobro sin revelar cuál es.
-- Acceso solo vía RPCs SECURITY DEFINER ejecutables por service_role
-- (patrón mig 239); el esquema aux sigue sin exponerse a la API.
-- ============================================================

CREATE TABLE IF NOT EXISTS aux.deposits (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  payload     bytea       NOT NULL, -- cifrado: { date, note }
  created_by  uuid        REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS aux.deposit_items (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  deposit_id  uuid        NOT NULL REFERENCES aux.deposits(id) ON DELETE CASCADE,
  payload     bytea       NOT NULL, -- cifrado: { kind, itemId, amount, ref, client, date }
  dedup_tag   bytea       NOT NULL UNIQUE, -- HMAC('kind:item_id') → anti doble depósito
  created_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE aux.deposits      ENABLE ROW LEVEL SECURITY;
ALTER TABLE aux.deposit_items ENABLE ROW LEVEL SECURITY;

-- ------------------------------------------------------------
-- RPCs puente (public → aux), SECURITY DEFINER, solo service_role
-- ------------------------------------------------------------

-- Lista de depósitos con sus items (payloads cifrados; la app descifra).
CREATE OR REPLACE FUNCTION public.fn_ops_deposits_list()
RETURNS TABLE (
  id          uuid,
  payload_b64 text,
  created_at  timestamptz,
  items       jsonb
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $list$
  SELECT d.id,
         encode(d.payload, 'base64'),
         d.created_at,
         COALESCE(
           (SELECT jsonb_agg(jsonb_build_object('id', i.id, 'payload_b64', encode(i.payload, 'base64')) ORDER BY i.created_at)
              FROM aux.deposit_items i WHERE i.deposit_id = d.id),
           '[]'::jsonb
         )
  FROM aux.deposits d
  ORDER BY d.created_at DESC;
$list$;

-- Solo las etiquetas dedup de todos los cobros ya depositados (para excluirlos
-- de la capa B al calcular, sin descifrar nada).
CREATE OR REPLACE FUNCTION public.fn_ops_deposit_tags()
RETURNS TABLE (dedup_b64 text)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $tags$
  SELECT encode(dedup_tag, 'base64') FROM aux.deposit_items;
$tags$;

-- Alta transaccional de un depósito con sus items.
-- p_items = [{ "payload_b64": "...", "dedup_b64": "..." }, ...]
-- Si algún cobro ya estaba depositado, el UNIQUE de dedup_tag aborta todo.
CREATE OR REPLACE FUNCTION public.fn_ops_deposit_create(
  p_payload_b64 text,
  p_by          uuid,
  p_items       jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $create$
DECLARE
  v_id uuid;
  v_item jsonb;
BEGIN
  IF p_items IS NULL OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'deposit_without_items';
  END IF;
  INSERT INTO aux.deposits (payload, created_by)
  VALUES (decode(p_payload_b64, 'base64'), p_by)
  RETURNING id INTO v_id;
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    INSERT INTO aux.deposit_items (deposit_id, payload, dedup_tag)
    VALUES (v_id, decode(v_item->>'payload_b64', 'base64'), decode(v_item->>'dedup_b64', 'base64'));
  END LOOP;
  RETURN v_id;
END;
$create$;

-- Deshacer un depósito (los cobros vuelven a la capa B).
CREATE OR REPLACE FUNCTION public.fn_ops_deposit_delete(p_id uuid)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $del$
  DELETE FROM aux.deposits WHERE id = p_id;
$del$;

-- Permisos: nadie salvo service_role.
DO $perm$
DECLARE
  fn text;
BEGIN
  FOREACH fn IN ARRAY ARRAY[
    'public.fn_ops_deposits_list()',
    'public.fn_ops_deposit_tags()',
    'public.fn_ops_deposit_create(text, uuid, jsonb)',
    'public.fn_ops_deposit_delete(uuid)'
  ] LOOP
    EXECUTE 'REVOKE ALL ON FUNCTION ' || fn || ' FROM PUBLIC';
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
      EXECUTE 'REVOKE ALL ON FUNCTION ' || fn || ' FROM anon';
    END IF;
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
      EXECUTE 'REVOKE ALL ON FUNCTION ' || fn || ' FROM authenticated';
    END IF;
    EXECUTE 'GRANT EXECUTE ON FUNCTION ' || fn || ' TO service_role';
  END LOOP;
END $perm$;
