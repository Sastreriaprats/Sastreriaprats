-- ============================================================
-- Migration 155: desactivar 6 measurement_fields legacy de pantalón
-- ============================================================
-- La migración 070 ya intentó desactivar estos campos (creados en
-- la 002 con field_group='Configuración'), pero por algún motivo en
-- el entorno actual quedaron con is_active=TRUE. Tras la Fase A
-- (migración 154), el campo `num_bolsillo_trasero` (field_type=number)
-- se cuela en el nuevo sub-bloque "Configuración técnica" de la
-- pantalla /sastre/medidas/[id]. Los otros 5 son `select`, que el
-- filtro de UI ya descarta, pero por higiene los desactivamos todos.
--
-- Estos 6 campos representan decisiones de estilo POR VENTA (cremallera,
-- pliegues, pasadores, bolsillos, bolsillo trasero, nº bolsillo
-- trasero) y NO medidas técnicas del cliente. El estilo por venta se
-- captura en la ficha de confección (radios/checkboxes hardcoded en
-- ficha-pantalon-config.tsx), no en measurement_fields.
--
-- NO se borran los registros: los valores históricos que pudieran
-- existir en client_measurements.values se conservan intactos.
--
-- Idempotente: re-ejecutar no produce cambios (los campos ya están
-- inactivos tras la primera pasada). Usa code='pantalon' (el slug
-- interno) en lugar de name='Pantalón' para ser inmune a encoding
-- Unicode del fichero.
-- ============================================================

BEGIN;

UPDATE measurement_fields mf
SET    is_active = FALSE
FROM   garment_types gt
WHERE  mf.garment_type_id = gt.id
  AND  gt.code = 'pantalon'
  AND  mf.code IN (
    'cremallera',
    'pliegues',
    'pasadores',
    'bolsillos',
    'bolsillo_trasero',
    'num_bolsillo_trasero'
  )
  AND  mf.is_active = TRUE;

COMMENT ON COLUMN measurement_fields.is_active IS
  'Si false, el campo no se muestra en la UI de toma de medidas. Los valores históricos en client_measurements.values se conservan.';

COMMIT;
