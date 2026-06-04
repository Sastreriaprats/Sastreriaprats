-- ============================================================
-- Migración 195: precio de coste y precio de venta en arreglos.
--
-- Petición: en el módulo Arreglos (tabla `alterations`) poder registrar tanto
-- el precio de COSTE del arreglo (lo que cuesta al taller / oficial) como el
-- precio de VENTA al cliente.
--
-- Decisiones:
--  - Dos columnas nuevas dedicadas `cost_price` y `sale_price` NUMERIC(10,2).
--    NO se reutiliza la columna legacy `amount` (ligada históricamente al
--    cobro por caja, deliberadamente no expuesta en el módulo) para evitar
--    ambigüedad de semántica y conflictos con esa lógica.
--  - DEFAULT 0 + NOT NULL: el listado/exportación siempre tiene un número.
--
-- Idempotente: ADD COLUMN IF NOT EXISTS.
-- ============================================================

ALTER TABLE alterations
  ADD COLUMN IF NOT EXISTS cost_price NUMERIC(10,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS sale_price NUMERIC(10,2) NOT NULL DEFAULT 0;

COMMENT ON COLUMN alterations.cost_price IS 'Precio de coste del arreglo (taller/oficial).';
COMMENT ON COLUMN alterations.sale_price IS 'Precio de venta del arreglo al cliente.';
