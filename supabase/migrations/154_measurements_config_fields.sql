-- ============================================================
-- Migration 154: integrar campos "Configuración técnica" (confXX)
-- en las medidas del cliente
-- ============================================================
-- Hasta ahora los campos numéricos del bloque "Configuración" de
-- cada ficha de confección (FM, FT, PT, F, D, FP, FV, HA, HB, VD,
-- Muslo, Rodal trasero, Bajada delantero, Altura trasero, FV con
-- salida y el flag Forma gemelo) vivían en
-- `tailoring_order_lines.configuration` (JSONB por venta). Eso obliga
-- al sastre a re-teclearlos en cada venta nueva del mismo cliente.
--
-- Los movemos a `client_measurements` (versionado por cliente). El
-- registro existente del garment_type 'body' del cliente (que ya
-- almacena las medidas físicas con prefijo: pantalon_, americana_,
-- chaleco_, …) se enriquece con las nuevas claves prefijadas
-- (pantalon_confFM, americana_confF, chaleco_confF, …).
--
-- Esta migración:
--   1) Inserta los nuevos `measurement_fields` con
--      field_group = 'Configuración' en los garment_types pantalon,
--      americana y chaleco.
--   2) Hace BACKFILL idempotente leyendo la última
--      tailoring_order_lines.configuration por (cliente, prenda) y
--      sembrando esas claves prefijadas en client_measurements del
--      garment_type 'body' (UPDATE sin crear versión nueva si ya
--      hay registro is_current; INSERT con version=1 si no).
--      Las claves ya presentes en values NO se pisan (existing wins).
--
-- field_type usado:
--   - 'number' para los confXX numéricos (coherente con los demás
--      campos de medidas que ya están en la tabla y respetando el
--      CHECK constraint actual: number|text|select|boolean|note).
--   - 'boolean' para confFormaGemelo.
-- ============================================================

BEGIN;

-- ── Parte 1: nuevos measurement_fields ─────────────────────────
-- Pantalón: 8 numéricos + 1 booleano. Sort order desde 100 para
-- dejarlos al final del orden actual sin colisionar.
INSERT INTO measurement_fields
  (garment_type_id, code, name, field_type, unit, sort_order, is_required, field_group, is_active)
SELECT gt.id, v.code, v.name, v.field_type, v.unit, v.sort_order, FALSE, 'Configuración', TRUE
FROM garment_types gt,
  (VALUES
    ('confFM',              'FM',                 'number',  'cm',   100),
    ('confFT',              'FT',                 'number',  'cm',   101),
    ('confPT',              'PT',                 'number',  'cm',   102),
    ('confMuslo',           'Muslo',              'number',  'cm',   103),
    ('confRodalTrasero',    'Rodal trasero',      'number',  'cm',   104),
    ('confBajadaDelantero', 'Bajada delantero',   'number',  'cm',   105),
    ('confAlturaTrasero',   'Altura trasero',     'number',  'cm',   106),
    ('confFVSalida',        'FV con salida',      'number',  'cm',   107),
    ('confFormaGemelo',     'Forma gemelo',       'boolean', 'none', 108)
  ) AS v(code, name, field_type, unit, sort_order)
WHERE gt.code = 'pantalon'
ON CONFLICT (garment_type_id, code) DO NOTHING;

-- Americana: 7 numéricos.
INSERT INTO measurement_fields
  (garment_type_id, code, name, field_type, unit, sort_order, is_required, field_group, is_active)
SELECT gt.id, v.code, v.name, 'number', 'cm', v.sort_order, FALSE, 'Configuración', TRUE
FROM garment_types gt,
  (VALUES
    ('confF',  'F',  100),
    ('confD',  'D',  101),
    ('confFP', 'FP', 102),
    ('confFV', 'FV', 103),
    ('confHA', 'HA', 104),
    ('confHB', 'HB', 105),
    ('confVD', 'VD', 106)
  ) AS v(code, name, sort_order)
WHERE gt.code = 'americana'
ON CONFLICT (garment_type_id, code) DO NOTHING;

-- Chaleco: idénticos 7 a americana (cada cliente puede tener valores
-- distintos para americana y chaleco aunque coincidan los nombres).
INSERT INTO measurement_fields
  (garment_type_id, code, name, field_type, unit, sort_order, is_required, field_group, is_active)
SELECT gt.id, v.code, v.name, 'number', 'cm', v.sort_order, FALSE, 'Configuración', TRUE
FROM garment_types gt,
  (VALUES
    ('confF',  'F',  100),
    ('confD',  'D',  101),
    ('confFP', 'FP', 102),
    ('confFV', 'FV', 103),
    ('confHA', 'HA', 104),
    ('confHB', 'HB', 105),
    ('confVD', 'VD', 106)
  ) AS v(code, name, sort_order)
WHERE gt.code = 'chaleco'
ON CONFLICT (garment_type_id, code) DO NOTHING;


-- ── Parte 2: backfill desde tailoring_order_lines.configuration ──
-- Idempotente: si una clave ya existe en values del registro body
-- actual, NO se pisa (existing values gana en `||`).

-- 2.1. Materializa por cliente el conjunto de claves prefijadas a
--      sembrar (de la última configuration por prenda+cliente).
CREATE TEMP TABLE _backfill_confs ON COMMIT DROP AS
WITH garments AS (
  SELECT
    (SELECT id FROM garment_types WHERE code = 'body')      AS body_id,
    (SELECT id FROM garment_types WHERE code = 'pantalon')  AS pantalon_id,
    (SELECT id FROM garment_types WHERE code = 'americana') AS americana_id,
    (SELECT id FROM garment_types WHERE code = 'chaleco')   AS chaleco_id
),
last_cfg AS (
  -- Última configuration por (cliente, prenda) en pedidos artesanales.
  SELECT DISTINCT ON (t.client_id, tl.garment_type_id)
    t.client_id,
    tl.garment_type_id,
    tl.configuration,
    CASE
      WHEN tl.garment_type_id = (SELECT pantalon_id  FROM garments) THEN 'pantalon'
      WHEN tl.garment_type_id = (SELECT americana_id FROM garments) THEN 'americana'
      WHEN tl.garment_type_id = (SELECT chaleco_id   FROM garments) THEN 'chaleco'
    END AS prefix
  FROM tailoring_order_lines tl
  JOIN tailoring_orders t ON t.id = tl.tailoring_order_id
  WHERE tl.garment_type_id IN (
    (SELECT pantalon_id  FROM garments),
    (SELECT americana_id FROM garments),
    (SELECT chaleco_id   FROM garments)
  )
  ORDER BY t.client_id, tl.garment_type_id, t.created_at DESC
),
conf_kv AS (
  SELECT
    lc.client_id,
    lc.prefix,
    kv.k,
    kv.v
  FROM last_cfg lc,
       jsonb_each(COALESCE(lc.configuration, '{}'::jsonb)) AS kv(k, v)
  WHERE lc.prefix IS NOT NULL
    AND kv.k LIKE 'conf%'
    AND kv.v IS NOT NULL
    AND kv.v::text NOT IN ('""', 'null', 'false')
)
SELECT
  client_id,
  jsonb_object_agg(prefix || '_' || k, v) AS conf_values
FROM conf_kv
GROUP BY client_id;


-- 2.2. UPDATE del registro body actual del cliente: añade claves que
--      falten sin pisar las existentes.
--      `conf_values || values` ⇒ los valores ya guardados ganan.
UPDATE client_measurements cm
SET    values     = bc.conf_values || cm.values,
       updated_at = NOW()
FROM   _backfill_confs bc
WHERE  cm.client_id       = bc.client_id
  AND  cm.garment_type_id = (SELECT id FROM garment_types WHERE code = 'body')
  AND  cm.is_current      = TRUE;


-- 2.3. INSERT para clientes que no tienen registro body actual.
--      El trigger set_measurement_version asigna version=MAX+1 y
--      marca is_current=TRUE automáticamente.
INSERT INTO client_measurements
  (client_id, garment_type_id, measurement_type, values, taken_at)
SELECT
  bc.client_id,
  (SELECT id FROM garment_types WHERE code = 'body'),
  'artesanal'::measurement_type,
  bc.conf_values,
  NOW()
FROM _backfill_confs bc
WHERE NOT EXISTS (
  SELECT 1
  FROM   client_measurements cm
  WHERE  cm.client_id       = bc.client_id
    AND  cm.garment_type_id = (SELECT id FROM garment_types WHERE code = 'body')
    AND  cm.is_current      = TRUE
);

COMMIT;
