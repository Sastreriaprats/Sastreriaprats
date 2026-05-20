-- ============================================================
-- Migration 157: saneamiento de garment_types creados a mano
-- ============================================================
-- 'body' y 'levita' existen en la BBDD de producción pero no se
-- crearon por ninguna migración formal del repo. En un entorno
-- limpio (otro Supabase, deploy nuevo) faltarían y el sistema
-- rompería:
--
--   - body: aglutinador del JSONB values de client_measurements,
--     donde se almacenan las medidas físicas con prefijos por
--     prenda (pantalon_largo, americana_pecho, frac_confF, …).
--     Sin él, las migraciones 024, 070, 154 y 156 hacen
--     UPDATE/INSERT contra NULL y silencian el fallo.
--
--   - levita: usado en /sastre/medidas como tab independiente y
--     como prenda con sus propios confXX (mig 156). La 156 ya
--     incluye un INSERT defensivo de este garment_type, pero NO
--     declara sus 9 measurement_fields físicos (talle, largo,
--     encuentro, …) que se habían creado a mano.
--
-- Datos confirmados directamente en producción:
--   body   → name='Medidas base del cliente', sort_order=0
--   levita → name='Levita',                   sort_order=13
--
-- Doblemente idempotente:
--   - ON CONFLICT (code)                   en garment_types
--   - ON CONFLICT (garment_type_id, code)  en measurement_fields
--
-- En producción esta migración es NO-OP total (ambos garment_types
-- y sus 9 measurement_fields físicos de levita ya existen).
-- En un entorno limpio crea body, levita y sus 9 medidas físicas.
-- Los 7 confXX de "Configuración" de levita los añade la mig 156
-- (también con ON CONFLICT defensivo).
-- ============================================================

BEGIN;

-- ── 'body' ────────────────────────────────────────────────────
-- Aglutinador de medidas físicas del cliente con prefijos por
-- prenda (pantalon_largo, americana_pecho, frac_confF, …).
-- No tiene measurement_fields propios.
INSERT INTO garment_types (code, name, category, sort_order, icon, has_sketch, is_active)
VALUES ('body', 'Medidas base del cliente', 'sastreria', 0, 'shirt', FALSE, TRUE)
ON CONFLICT (code) DO NOTHING;


-- ── 'levita' ──────────────────────────────────────────────────
INSERT INTO garment_types (code, name, category, sort_order, icon, has_sketch, is_active)
VALUES ('levita', 'Levita', 'sastreria', 13, 'shirt', FALSE, TRUE)
ON CONFLICT (code) DO NOTHING;

INSERT INTO measurement_fields
  (garment_type_id, code, name, field_type, unit, sort_order, field_group, is_required, applies_to)
SELECT gt.id, f.code, f.name, f.field_type, f.unit, f.sort_order, f.field_group, FALSE, 'both'
FROM   garment_types gt
CROSS  JOIN (VALUES
  ('talle',       'Talle',           'number', 'cm', 1, 'medidas'),
  ('largo',       'Largo',           'number', 'cm', 2, 'medidas'),
  ('encuentro',   'Encuentro',       'number', 'cm', 3, 'medidas'),
  ('largo_manga', 'Largo Manga',     'number', 'cm', 4, 'medidas'),
  ('pecho',       'Pecho',           'number', 'cm', 5, 'medidas'),
  ('cintura',     'Cintura',         'number', 'cm', 6, 'medidas'),
  ('frente_pecho','Frente de Pecho', 'number', 'cm', 7, 'medidas'),
  ('hombro',      'Hombro',          'number', 'cm', 8, 'medidas'),
  ('cadera',      'Cadera',          'number', 'cm', 9, 'medidas')
) AS f(code, name, field_type, unit, sort_order, field_group)
WHERE  gt.code = 'levita'
ON CONFLICT (garment_type_id, code) DO NOTHING;

COMMIT;
