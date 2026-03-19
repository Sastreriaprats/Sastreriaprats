-- ============================================================
-- 070: Reestructurar medidas sastre
-- Americana, Chaleco, Pantalón, Abrigo + nuevo tipo Frac
-- ============================================================

-- ── AMERICANA: sort_order + field_type + field_group ────────

UPDATE measurement_fields
SET sort_order = 1, field_group = 'medidas', is_active = TRUE
WHERE garment_type_id = (SELECT id FROM garment_types WHERE code = 'americana')
  AND code = 'talle';

UPDATE measurement_fields
SET sort_order = 2, field_type = 'number', field_group = 'medidas', is_required = TRUE, is_active = TRUE
WHERE garment_type_id = (SELECT id FROM garment_types WHERE code = 'americana')
  AND code = 'largo';

UPDATE measurement_fields
SET sort_order = 3, field_group = 'medidas', is_active = TRUE
WHERE garment_type_id = (SELECT id FROM garment_types WHERE code = 'americana')
  AND code = 'encuentro';

UPDATE measurement_fields
SET sort_order = 4, field_type = 'number', field_group = 'medidas', is_active = TRUE
WHERE garment_type_id = (SELECT id FROM garment_types WHERE code = 'americana')
  AND code = 'largo_manga';

UPDATE measurement_fields
SET sort_order = 5, field_group = 'medidas', is_active = TRUE
WHERE garment_type_id = (SELECT id FROM garment_types WHERE code = 'americana')
  AND code = 'pecho';

UPDATE measurement_fields
SET sort_order = 6, field_group = 'medidas', is_active = TRUE
WHERE garment_type_id = (SELECT id FROM garment_types WHERE code = 'americana')
  AND code = 'cintura';

UPDATE measurement_fields
SET sort_order = 7, field_group = 'medidas', is_active = TRUE
WHERE garment_type_id = (SELECT id FROM garment_types WHERE code = 'americana')
  AND code = 'frente_pecho';

UPDATE measurement_fields
SET sort_order = 8, field_group = 'medidas', is_active = TRUE
WHERE garment_type_id = (SELECT id FROM garment_types WHERE code = 'americana')
  AND code = 'hombro';

UPDATE measurement_fields
SET sort_order = 9, field_group = 'medidas', is_active = TRUE
WHERE garment_type_id = (SELECT id FROM garment_types WHERE code = 'americana')
  AND code = 'cadera';

-- Desactivar campos no usados de americana
UPDATE measurement_fields SET is_active = FALSE
WHERE garment_type_id = (SELECT id FROM garment_types WHERE code = 'americana')
  AND code IN ('frente', 'espalda', 'largo_espalda', 'bocamanga',
               'largo_delantero', 'solapa', 'cargado', 'escote');

-- ── CHALECO: crear campos + actualizar + desactivar ─────────

INSERT INTO measurement_fields
  (garment_type_id, code, name, field_type, unit, sort_order, field_group, is_required, applies_to)
SELECT gt.id, f.code, f.name, f.field_type, f.unit, f.sort_order, f.field_group, FALSE, 'both'
FROM garment_types gt
CROSS JOIN (VALUES
  ('talle',          'Talle',          'number', 'cm', 1, 'medidas'),
  ('largo_delantero','Largo Delantero', 'number', 'cm', 4, 'medidas')
) AS f(code, name, field_type, unit, sort_order, field_group)
WHERE gt.code = 'chaleco'
ON CONFLICT (garment_type_id, code) DO NOTHING;

UPDATE measurement_fields SET sort_order = 2, field_group = 'medidas', is_active = TRUE
WHERE garment_type_id = (SELECT id FROM garment_types WHERE code = 'chaleco') AND code = 'largo';

UPDATE measurement_fields SET sort_order = 3, field_group = 'medidas', is_active = TRUE
WHERE garment_type_id = (SELECT id FROM garment_types WHERE code = 'chaleco') AND code = 'escote';

UPDATE measurement_fields SET sort_order = 5, field_group = 'medidas', is_active = TRUE
WHERE garment_type_id = (SELECT id FROM garment_types WHERE code = 'chaleco') AND code = 'pecho';

UPDATE measurement_fields SET sort_order = 6, field_group = 'medidas', is_active = TRUE
WHERE garment_type_id = (SELECT id FROM garment_types WHERE code = 'chaleco') AND code = 'cintura';

UPDATE measurement_fields SET is_active = FALSE
WHERE garment_type_id = (SELECT id FROM garment_types WHERE code = 'chaleco')
  AND code IN ('cadera', 'hombro', 'espalda');

-- ── PANTALÓN: renombrar códigos + actualizar + desactivar ────

-- largo_total → largo (sort 1)
UPDATE measurement_fields
SET code = 'largo', name = 'Largo', sort_order = 1, field_group = 'medidas', is_active = TRUE
WHERE garment_type_id = (SELECT id FROM garment_types WHERE code = 'pantalon')
  AND code = 'largo_total';

-- entrepiernas → tiro (sort 2)
UPDATE measurement_fields
SET code = 'tiro', name = 'Tiro', sort_order = 2, field_group = 'medidas', is_active = TRUE
WHERE garment_type_id = (SELECT id FROM garment_types WHERE code = 'pantalon')
  AND code = 'entrepiernas';

UPDATE measurement_fields SET sort_order = 3, field_group = 'medidas', is_active = TRUE
WHERE garment_type_id = (SELECT id FROM garment_types WHERE code = 'pantalon') AND code = 'cintura';

UPDATE measurement_fields SET sort_order = 4, field_group = 'medidas', is_active = TRUE
WHERE garment_type_id = (SELECT id FROM garment_types WHERE code = 'pantalon') AND code = 'cadera';

UPDATE measurement_fields SET sort_order = 5, field_group = 'medidas', is_active = TRUE
WHERE garment_type_id = (SELECT id FROM garment_types WHERE code = 'pantalon') AND code = 'rodilla';

UPDATE measurement_fields SET sort_order = 6, field_group = 'medidas', is_active = TRUE
WHERE garment_type_id = (SELECT id FROM garment_types WHERE code = 'pantalon') AND code = 'bajo';

UPDATE measurement_fields SET is_active = FALSE
WHERE garment_type_id = (SELECT id FROM garment_types WHERE code = 'pantalon')
  AND code IN ('muslo', 'vuelta', 'cremallera', 'pliegues', 'pasadores',
               'bolsillos', 'bolsillo_trasero', 'num_bolsillo_trasero');

-- Migrar claves JSONB: pantalon_largo_total → pantalon_largo
UPDATE client_measurements
SET values = (values - 'pantalon_largo_total')
             || jsonb_build_object('pantalon_largo', values -> 'pantalon_largo_total')
WHERE garment_type_id = (SELECT id FROM garment_types WHERE code = 'body')
  AND values ? 'pantalon_largo_total';

-- Migrar claves JSONB: pantalon_entrepiernas → pantalon_tiro
UPDATE client_measurements
SET values = (values - 'pantalon_entrepiernas')
             || jsonb_build_object('pantalon_tiro', values -> 'pantalon_entrepiernas')
WHERE garment_type_id = (SELECT id FROM garment_types WHERE code = 'body')
  AND values ? 'pantalon_entrepiernas';

-- ── ABRIGO: sort_order 5→6 + crear campos + actualizar + desactivar ──────────

UPDATE garment_types SET sort_order = 6 WHERE code = 'abrigo';

INSERT INTO measurement_fields
  (garment_type_id, code, name, field_type, unit, sort_order, field_group, is_required, applies_to)
SELECT gt.id, f.code, f.name, f.field_type, f.unit, f.sort_order, f.field_group, FALSE, 'both'
FROM garment_types gt
CROSS JOIN (VALUES
  ('talle',       'Talle',          'number', 'cm', 1, 'medidas'),
  ('encuentro',   'Encuentro',      'number', 'cm', 3, 'medidas'),
  ('largo_manga', 'Largo Manga',    'number', 'cm', 4, 'medidas'),
  ('frente_pecho','Frente de Pecho','number', 'cm', 7, 'medidas')
) AS f(code, name, field_type, unit, sort_order, field_group)
WHERE gt.code = 'abrigo'
ON CONFLICT (garment_type_id, code) DO NOTHING;

UPDATE measurement_fields SET sort_order = 2, field_group = 'medidas', is_active = TRUE
WHERE garment_type_id = (SELECT id FROM garment_types WHERE code = 'abrigo') AND code = 'largo';

UPDATE measurement_fields SET sort_order = 5, field_group = 'medidas', is_active = TRUE
WHERE garment_type_id = (SELECT id FROM garment_types WHERE code = 'abrigo') AND code = 'pecho';

UPDATE measurement_fields SET sort_order = 6, field_group = 'medidas', is_active = TRUE
WHERE garment_type_id = (SELECT id FROM garment_types WHERE code = 'abrigo') AND code = 'cintura';

UPDATE measurement_fields SET sort_order = 8, field_group = 'medidas', is_active = TRUE
WHERE garment_type_id = (SELECT id FROM garment_types WHERE code = 'abrigo') AND code = 'hombro';

UPDATE measurement_fields SET sort_order = 9, field_group = 'medidas', is_active = TRUE
WHERE garment_type_id = (SELECT id FROM garment_types WHERE code = 'abrigo') AND code = 'cadera';

UPDATE measurement_fields SET is_active = FALSE
WHERE garment_type_id = (SELECT id FROM garment_types WHERE code = 'abrigo')
  AND code IN ('manga', 'espalda');

-- ── FRAC: nuevo garment_type + 9 campos ──────────────────────────────────────

INSERT INTO garment_types (code, name, category, sort_order)
VALUES ('frac', 'Frac', 'sastreria', 5)
ON CONFLICT (code) DO NOTHING;

INSERT INTO measurement_fields
  (garment_type_id, code, name, field_type, unit, sort_order, field_group, is_required, applies_to)
SELECT gt.id, f.code, f.name, f.field_type, f.unit, f.sort_order, f.field_group, FALSE, 'both'
FROM garment_types gt
CROSS JOIN (VALUES
  ('talle',       'Talle',          'number', 'cm', 1, 'medidas'),
  ('largo',       'Largo',          'number', 'cm', 2, 'medidas'),
  ('encuentro',   'Encuentro',      'number', 'cm', 3, 'medidas'),
  ('largo_manga', 'Largo Manga',    'number', 'cm', 4, 'medidas'),
  ('pecho',       'Pecho',          'number', 'cm', 5, 'medidas'),
  ('cintura',     'Cintura',        'number', 'cm', 6, 'medidas'),
  ('frente_pecho','Frente de Pecho','number', 'cm', 7, 'medidas'),
  ('hombro',      'Hombro',         'number', 'cm', 8, 'medidas'),
  ('cadera',      'Cadera',         'number', 'cm', 9, 'medidas')
) AS f(code, name, field_type, unit, sort_order, field_group)
WHERE gt.code = 'frac'
ON CONFLICT (garment_type_id, code) DO NOTHING;
