-- ============================================================
-- Migration 156: extender "Configuración técnica" (confXX) a
-- abrigo, levita y frac (Fase B)
-- ============================================================
-- En la Fase A (mig 154) integramos los 7 confXX en pantalón,
-- americana y chaleco. Esta migración hace lo mismo con abrigo,
-- levita y frac — los 7 campos numéricos son IDÉNTICOS a los de
-- americana: confF, confD, confFP, confFV, confHA, confHB, confVD.
-- Todos number, todos en field_group='Configuración'.
--
-- NOTA — frac NO comparte VALORES con americana: aunque los CAMPOS
-- sean los mismos siete (mismo "tipo" de medida técnica del torso),
-- el frac es una prenda con patronaje propio, por lo que sus
-- valores reales pueden diferir y se guardan bajo prefijo frac_ en
-- client_measurements.values. Mismo criterio para abrigo y levita.
--
-- Notas de inventario:
--   - 'abrigo': garment_type creado en mig 002.
--   - 'frac'  : garment_type creado en mig 070.
--   - 'levita': NO existe en ninguna migración formal. Se asume que
--               se creó manualmente en BBDD. El INSERT defensivo
--               ON CONFLICT DO NOTHING cubre entornos limpios.
--
-- Backfill idempotente: si el cliente ya tiene un registro body con
-- is_current=TRUE, sus values existentes ganan en el `||`; solo se
-- añaden las claves nuevas que falten. Si no tiene body, se crea.
-- ============================================================

BEGIN;

-- ── Parte 0: garment_type defensivo para 'levita' ──────────────
-- Si en este entorno no se creó por SQL formal, lo creamos ahora.
-- Si ya existe, ON CONFLICT no toca nada.
INSERT INTO garment_types (code, name, category, sort_order)
VALUES ('levita', 'Levita', 'sastreria', 6)
ON CONFLICT (code) DO NOTHING;


-- ── Parte 1: nuevos measurement_fields ─────────────────────────
-- 7 confXX × 3 prendas = 21 campos. sort_order desde 100 para no
-- colisionar con los campos físicos existentes. Mismo criterio que
-- la mig 154.

-- Abrigo
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
WHERE gt.code = 'abrigo'
ON CONFLICT (garment_type_id, code) DO NOTHING;

-- Levita
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
WHERE gt.code = 'levita'
ON CONFLICT (garment_type_id, code) DO NOTHING;

-- Frac
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
WHERE gt.code = 'frac'
ON CONFLICT (garment_type_id, code) DO NOTHING;


-- ── Parte 2: backfill desde tailoring_order_lines.configuration ──
-- Idéntica lógica a la 154: si una clave ya existe en values del
-- registro body actual, NO se pisa (existing values gana en `||`).

CREATE TEMP TABLE _backfill_confs_b ON COMMIT DROP AS
WITH garments AS (
  SELECT
    (SELECT id FROM garment_types WHERE code = 'body')   AS body_id,
    (SELECT id FROM garment_types WHERE code = 'abrigo') AS abrigo_id,
    (SELECT id FROM garment_types WHERE code = 'levita') AS levita_id,
    (SELECT id FROM garment_types WHERE code = 'frac')   AS frac_id
),
last_cfg AS (
  -- Última configuration por (cliente, prenda).
  SELECT DISTINCT ON (t.client_id, tl.garment_type_id)
    t.client_id,
    tl.garment_type_id,
    tl.configuration,
    CASE
      WHEN tl.garment_type_id = (SELECT abrigo_id FROM garments) THEN 'abrigo'
      WHEN tl.garment_type_id = (SELECT levita_id FROM garments) THEN 'levita'
      WHEN tl.garment_type_id = (SELECT frac_id   FROM garments) THEN 'frac'
    END AS prefix
  FROM tailoring_order_lines tl
  JOIN tailoring_orders t ON t.id = tl.tailoring_order_id
  WHERE tl.garment_type_id IN (
    (SELECT abrigo_id FROM garments),
    (SELECT levita_id FROM garments),
    (SELECT frac_id   FROM garments)
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


-- 2.2. UPDATE del registro body actual del cliente.
UPDATE client_measurements cm
SET    values     = bc.conf_values || cm.values,
       updated_at = NOW()
FROM   _backfill_confs_b bc
WHERE  cm.client_id       = bc.client_id
  AND  cm.garment_type_id = (SELECT id FROM garment_types WHERE code = 'body')
  AND  cm.is_current      = TRUE;


-- 2.3. INSERT para clientes que no tienen registro body actual.
INSERT INTO client_measurements
  (client_id, garment_type_id, measurement_type, values, taken_at)
SELECT
  bc.client_id,
  (SELECT id FROM garment_types WHERE code = 'body'),
  'artesanal'::measurement_type,
  bc.conf_values,
  NOW()
FROM _backfill_confs_b bc
WHERE NOT EXISTS (
  SELECT 1
  FROM   client_measurements cm
  WHERE  cm.client_id       = bc.client_id
    AND  cm.garment_type_id = (SELECT id FROM garment_types WHERE code = 'body')
    AND  cm.is_current      = TRUE
);

COMMIT;
