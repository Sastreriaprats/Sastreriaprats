-- ============================================================
-- Migración 258 — SUBZONAS POR CÓDIGO POSTAL en las zonas de envío
--
-- Hasta ahora el mapeo era país → UNA zona (constraint UNIQUE en
-- country_code), así que España entera compartía tarifa. Este cambio permite
-- que un mismo país esté en varias zonas diferenciadas por PREFIJO de código
-- postal (ej.: "Baleares" = ES con prefijo 07, "Madrid" = ES con prefijo 28,
-- "Península" = ES sin prefijos como respaldo del resto del país).
--
-- Resolución en computeShipping (src/lib/shipping.ts):
--   1. Filas del país cuyo prefijo case con el CP (gana el prefijo MÁS LARGO).
--   2. Si no casa ninguno (o no hay CP), la fila del país SIN prefijos.
--   3. Si tampoco, la zona catch-all (is_default).
--
-- ADITIVO: las filas existentes quedan con postal_prefixes NULL = país entero,
-- exactamente el comportamiento anterior. Sin datos nuevos no cambia nada.
-- ============================================================

-- ── 1. Columna de prefijos (NULL = el país entero) ───────────────────────────
ALTER TABLE shipping_zone_countries
  ADD COLUMN IF NOT EXISTS postal_prefixes TEXT[];

-- Nunca array vacío: o NULL (país entero) o al menos un prefijo.
ALTER TABLE shipping_zone_countries
  DROP CONSTRAINT IF EXISTS chk_szc_prefixes_not_empty;
ALTER TABLE shipping_zone_countries
  ADD CONSTRAINT chk_szc_prefixes_not_empty
  CHECK (postal_prefixes IS NULL OR array_length(postal_prefixes, 1) >= 1);

-- ── 2. Unicidad: de "un país → una zona" a "un país → una zona SIN prefijos" ─
-- Las filas con prefijos pueden repetir país (cada subzona es un trozo);
-- el solape de prefijos entre zonas se valida en la server action.
ALTER TABLE shipping_zone_countries
  DROP CONSTRAINT IF EXISTS uq_shipping_zone_countries_country;
CREATE UNIQUE INDEX IF NOT EXISTS uq_szc_country_whole
  ON shipping_zone_countries (country_code)
  WHERE postal_prefixes IS NULL;
