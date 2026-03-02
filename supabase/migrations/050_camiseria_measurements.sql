-- ==========================================
-- 050: Camisería — tipo de prenda y campos de medidas (cuadrícula física)
-- ==========================================

-- Añadir tipo Camisería (nombre mostrado en panel sastre y admin)
INSERT INTO garment_types (code, name, category, sort_order)
VALUES ('camiseria', 'Camisería', 'camiseria', 0)
ON CONFLICT (code) DO NOTHING;

-- Campos de medidas específicos de camisería (code/name según schema existente)
INSERT INTO measurement_fields (garment_type_id, code, name, field_type, unit, sort_order, field_group, is_required, applies_to)
SELECT g.id, f.code, f.name, f.field_type, f.unit, f.sort_order, f.field_group, false, 'both'
FROM garment_types g
CROSS JOIN (VALUES
  ('cuello', 'Cuello', 'number', 'cm', 1, 'medidas'),
  ('canesu', 'Canesú', 'number', 'cm', 2, 'medidas'),
  ('manga', 'Manga', 'number', 'cm', 3, 'medidas'),
  ('fren_pecho', 'Fren. Pecho', 'number', 'cm', 4, 'medidas'),
  ('cont_pecho', 'Cont. Pecho', 'number', 'cm', 5, 'medidas'),
  ('cintura', 'Cintura', 'number', 'cm', 6, 'medidas'),
  ('cadera', 'Cadera', 'number', 'cm', 7, 'medidas'),
  ('largo_cuerpo', 'Largo Cuerpo', 'number', 'cm', 8, 'medidas'),
  ('p_izq', 'P. Izquierdo', 'number', 'cm', 9, 'medidas'),
  ('p_dch', 'P. Derecho', 'number', 'cm', 10, 'medidas'),
  ('hombro', 'Hombro', 'number', 'cm', 11, 'medidas'),
  ('biceps', 'Bíceps', 'number', 'cm', 12, 'medidas'),
  ('jareton', 'Jaretón', 'boolean', 'none', 1, 'caracteristicas'),
  ('bolsillo', 'Bolsillo', 'boolean', 'none', 2, 'caracteristicas'),
  ('hombro_caido', 'Hombro Caído', 'boolean', 'none', 3, 'caracteristicas'),
  ('hombros_altos', 'Hombros Altos', 'boolean', 'none', 4, 'caracteristicas'),
  ('hombros_bajos', 'Hombros Bajos', 'boolean', 'none', 5, 'caracteristicas'),
  ('erguido', 'Erguido', 'boolean', 'none', 6, 'caracteristicas'),
  ('cargado', 'Cargado', 'boolean', 'none', 7, 'caracteristicas'),
  ('espalda_lisa', 'Espalda Lisa', 'boolean', 'none', 8, 'caracteristicas'),
  ('esp_pliegues', 'Esp. Pliegues', 'boolean', 'none', 9, 'caracteristicas'),
  ('esp_tablon_centr', 'Esp. Tablón Centr.', 'boolean', 'none', 10, 'caracteristicas'),
  ('esp_pinzas', 'Esp. Pinzas', 'boolean', 'none', 11, 'caracteristicas'),
  ('iniciales', 'Iniciales', 'text', 'none', 12, 'caracteristicas'),
  ('mod_cuello', 'Mod. Cuello', 'text', 'none', 13, 'caracteristicas'),
  ('puno_sencillo', 'Puño Sencillo', 'boolean', 'none', 1, 'puno'),
  ('puno_gemelo', 'Puño Gemelo', 'boolean', 'none', 2, 'puno'),
  ('puno_mixto', 'Puño Mixto', 'boolean', 'none', 3, 'puno'),
  ('puno_mosquetero', 'Puño Mosquetero', 'boolean', 'none', 4, 'puno'),
  ('puno_otro', 'Puño Otro', 'boolean', 'none', 5, 'puno'),
  ('tejido', 'Tejido', 'text', 'none', 1, 'tejido'),
  ('derecho', 'Derecho', 'boolean', 'none', 2, 'tejido'),
  ('izquierdo', 'Izquierdo', 'boolean', 'none', 3, 'tejido')
) AS f(code, name, field_type, unit, sort_order, field_group)
WHERE g.code = 'camiseria'
ON CONFLICT (garment_type_id, code) DO NOTHING;
