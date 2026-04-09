-- ============================================================
-- Migration 084: Añadir tipo de prenda "Camisería Industrial"
-- Duplica la configuración de "Camisería" existente.
-- ============================================================

-- 1. Insertar nuevo garment_type (solo si no existe)
INSERT INTO garment_types (code, name, category, sort_order, icon, has_sketch, is_active)
SELECT 'camiseria_industrial', 'Camisería Industrial', 'camiseria',
       (SELECT sort_order FROM garment_types WHERE code = 'camiseria') + 0.5,
       'shirt', false, true
WHERE NOT EXISTS (SELECT 1 FROM garment_types WHERE code = 'camiseria_industrial');

-- 2. Duplicar measurement_fields de camisería para camiseria_industrial
INSERT INTO measurement_fields (garment_type_id, code, name, field_type, unit, sort_order, field_group, is_active, is_required, applies_to)
SELECT
  (SELECT id FROM garment_types WHERE code = 'camiseria_industrial'),
  code, name, field_type, unit, sort_order, field_group, is_active, is_required, applies_to
FROM measurement_fields
WHERE garment_type_id = (SELECT id FROM garment_types WHERE code = 'camiseria')
  AND is_active = true
  AND NOT EXISTS (
    SELECT 1 FROM measurement_fields mf2
    WHERE mf2.garment_type_id = (SELECT id FROM garment_types WHERE code = 'camiseria_industrial')
      AND mf2.code = measurement_fields.code
  );
