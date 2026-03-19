-- ============================================================
-- Migration 072: Reestructura campos de medidas de Camisería
--
-- Cambios en measurement_fields (group 'medidas'):
--   manga       → largo_manga    (name: "Largo de manga")
--   fren_pecho  → frente_pecho   (name: "Frente de pecho")
--   cont_pecho  → pecho          (name: "Pecho")
--   largo_cuerpo                 (name: "Largo de cuerpo") — solo actualiza name
--   p_izq, p_dch, biceps        → desactivar (is_active = false)
--   puno (nuevo)                 → sort_order 10
--   Sort orders: 1-10 según orden definido
--
-- Migración de claves JSONB en client_measurements y
-- en tailoring_order_lines.configuration
-- ============================================================

DO $$
DECLARE
  v_garment_type_id UUID;
BEGIN
  -- Obtener id del tipo camisería
  SELECT id INTO v_garment_type_id FROM garment_types WHERE code = 'camiseria';

  IF v_garment_type_id IS NULL THEN
    RAISE EXCEPTION 'garment_type camiseria not found';
  END IF;

  -- ── 1. Renombrar códigos y actualizar nombres ─────────────────

  UPDATE measurement_fields
  SET code = 'largo_manga', name = 'Largo de manga', sort_order = 3
  WHERE garment_type_id = v_garment_type_id AND code = 'manga';

  UPDATE measurement_fields
  SET code = 'frente_pecho', name = 'Frente de pecho', sort_order = 4
  WHERE garment_type_id = v_garment_type_id AND code = 'fren_pecho';

  UPDATE measurement_fields
  SET code = 'pecho', name = 'Pecho', sort_order = 5
  WHERE garment_type_id = v_garment_type_id AND code = 'cont_pecho';

  UPDATE measurement_fields
  SET name = 'Largo de cuerpo', sort_order = 8
  WHERE garment_type_id = v_garment_type_id AND code = 'largo_cuerpo';

  -- ── 2. Actualizar sort_orders de campos que no cambian de código ─

  UPDATE measurement_fields SET sort_order = 1 WHERE garment_type_id = v_garment_type_id AND code = 'cuello';
  UPDATE measurement_fields SET sort_order = 2 WHERE garment_type_id = v_garment_type_id AND code = 'canesu';
  UPDATE measurement_fields SET sort_order = 6 WHERE garment_type_id = v_garment_type_id AND code = 'cintura';
  UPDATE measurement_fields SET sort_order = 7 WHERE garment_type_id = v_garment_type_id AND code = 'cadera';
  UPDATE measurement_fields SET sort_order = 9 WHERE garment_type_id = v_garment_type_id AND code = 'hombro';

  -- ── 3. Desactivar campos que sobran ──────────────────────────────

  UPDATE measurement_fields
  SET is_active = false
  WHERE garment_type_id = v_garment_type_id AND code IN ('p_izq', 'p_dch', 'biceps');

  -- ── 4. Crear campo nuevo: puno ────────────────────────────────────

  INSERT INTO measurement_fields (
    garment_type_id, code, name, field_type, unit,
    sort_order, field_group, is_required, applies_to, is_active
  ) VALUES (
    v_garment_type_id, 'puno', 'Puño', 'number', 'cm',
    10, 'medidas', false, 'both', true
  )
  ON CONFLICT (garment_type_id, code) DO UPDATE
    SET name = 'Puño', sort_order = 10, field_group = 'medidas', is_active = true;

END $$;


-- ── 5. Migrar claves JSONB en client_measurements ──────────────────
-- Las medidas de camisería se guardan con prefijo "camiseria_"
-- Renombrar: manga→largo_manga, fren_pecho→frente_pecho, cont_pecho→pecho, largo→largo_cuerpo

UPDATE client_measurements
SET values = (
  values
  -- Renombrar camiseria_manga → camiseria_largo_manga
  - 'camiseria_manga'
  || CASE WHEN values ? 'camiseria_manga'
          THEN jsonb_build_object('camiseria_largo_manga', values -> 'camiseria_manga')
          ELSE '{}'::jsonb END
  -- Renombrar camiseria_fren_pecho → camiseria_frente_pecho
  - 'camiseria_fren_pecho'
  || CASE WHEN values ? 'camiseria_fren_pecho'
          THEN jsonb_build_object('camiseria_frente_pecho', values -> 'camiseria_fren_pecho')
          ELSE '{}'::jsonb END
  -- Renombrar camiseria_cont_pecho → camiseria_pecho
  - 'camiseria_cont_pecho'
  || CASE WHEN values ? 'camiseria_cont_pecho'
          THEN jsonb_build_object('camiseria_pecho', values -> 'camiseria_cont_pecho')
          ELSE '{}'::jsonb END
  -- Renombrar camiseria_largo → camiseria_largo_cuerpo
  - 'camiseria_largo'
  || CASE WHEN values ? 'camiseria_largo'
          THEN jsonb_build_object('camiseria_largo_cuerpo', values -> 'camiseria_largo')
          ELSE '{}'::jsonb END
)
WHERE
  values ? 'camiseria_manga'
  OR values ? 'camiseria_fren_pecho'
  OR values ? 'camiseria_cont_pecho'
  OR values ? 'camiseria_largo';


-- ── 6. Migrar claves en tailoring_order_lines.configuration ───────
-- Los pedidos de camisería guardan medidas en camelCase dentro de configuration
-- Renombrar: manga→largoManga, frenPecho→frentePecho, contPecho→pecho, largo→largoCuerpo
-- Eliminar: pIzq, pDch, biceps (campos desactivados)
--
-- Solo actualiza líneas que tengan al menos una de las claves antiguas

UPDATE tailoring_order_lines
SET configuration = (
  configuration
  -- manga → largoManga
  - 'manga'
  || CASE WHEN configuration ? 'manga'
          THEN jsonb_build_object('largoManga', configuration -> 'manga')
          ELSE '{}'::jsonb END
  -- frenPecho → frentePecho
  - 'frenPecho'
  || CASE WHEN configuration ? 'frenPecho'
          THEN jsonb_build_object('frentePecho', configuration -> 'frenPecho')
          ELSE '{}'::jsonb END
  -- contPecho → pecho
  - 'contPecho'
  || CASE WHEN configuration ? 'contPecho'
          THEN jsonb_build_object('pecho', configuration -> 'contPecho')
          ELSE '{}'::jsonb END
  -- largo → largoCuerpo
  - 'largo'
  || CASE WHEN configuration ? 'largo'
          THEN jsonb_build_object('largoCuerpo', configuration -> 'largo')
          ELSE '{}'::jsonb END
  -- Eliminar campos desactivados
  - 'pIzq'
  - 'pDch'
  - 'biceps'
)
WHERE
  configuration IS NOT NULL
  AND (
    configuration ? 'manga'
    OR configuration ? 'frenPecho'
    OR configuration ? 'contPecho'
    OR configuration ? 'largo'
    OR configuration ? 'pIzq'
    OR configuration ? 'pDch'
    OR configuration ? 'biceps'
  );
