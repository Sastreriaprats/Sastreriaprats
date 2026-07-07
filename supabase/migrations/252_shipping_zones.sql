-- ============================================================
-- Migración 252 — Modelo de ZONAS DE ENVÍO (tienda online internacional)
--
-- PIEZA 1 de la feature. SOLO tablas + seed de la zona "Nacional" (el valor
-- actual 9,90€ / gratis ≥500€). ES **ADITIVO E INERTE**: nadie lee estas tablas
-- todavía — el checkout sigue calculando el envío con el 9,90€/500€ HARDCODEADO
-- (checkout-content.tsx) hasta la pieza 3 (cálculo server-side). No cambia el
-- comportamiento de la tienda.
-- ============================================================

-- ── 1. shipping_zones ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS shipping_zones (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name                    TEXT NOT NULL,
  shipping_cost           NUMERIC(10,2) NOT NULL DEFAULT 0,
  free_shipping_threshold NUMERIC(10,2),                 -- NULL = nunca gratis por importe
  is_active               BOOLEAN NOT NULL DEFAULT TRUE,
  is_default              BOOLEAN NOT NULL DEFAULT FALSE, -- catch-all para países no mapeados
  sort_order              INTEGER NOT NULL DEFAULT 0,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Garantía de UNA sola zona por defecto (catch-all): índice único parcial.
-- Permite N filas is_default=false, pero como mucho 1 con is_default=true.
CREATE UNIQUE INDEX IF NOT EXISTS uq_shipping_zones_single_default
  ON shipping_zones (is_default) WHERE is_default = TRUE;

-- ── 2. shipping_zone_countries (mapeo país → zona) ──────────────────────────
CREATE TABLE IF NOT EXISTS shipping_zone_countries (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  zone_id      UUID NOT NULL REFERENCES shipping_zones(id) ON DELETE CASCADE,
  country_code TEXT NOT NULL,                            -- ISO-2 en MAYÚSCULAS ('ES','FR'…)
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_shipping_zone_countries_country UNIQUE (country_code)  -- un país → UNA zona
);
CREATE INDEX IF NOT EXISTS idx_shipping_zone_countries_zone
  ON shipping_zone_countries (zone_id);

-- ── 3. RLS ───────────────────────────────────────────────────────────────────
-- Escritura Y lectura SOLO con permiso config.edit (defensa en profundidad).
-- El cálculo de envío (pieza 3) y la UI de gestión leen server-side con
-- service-role, que BYPASSA RLS. No hay lectura ni escritura client-side de
-- estas tablas. Mismo criterio que discount_codes/stores/warehouses (mig 225).
ALTER TABLE shipping_zones          ENABLE ROW LEVEL SECURITY;
ALTER TABLE shipping_zone_countries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "shipping_zones_all" ON shipping_zones;
CREATE POLICY "shipping_zones_all" ON shipping_zones
  FOR ALL TO authenticated
  USING      (user_has_permission(auth.uid(), 'config.edit'))
  WITH CHECK (user_has_permission(auth.uid(), 'config.edit'));

DROP POLICY IF EXISTS "shipping_zone_countries_all" ON shipping_zone_countries;
CREATE POLICY "shipping_zone_countries_all" ON shipping_zone_countries
  FOR ALL TO authenticated
  USING      (user_has_permission(auth.uid(), 'config.edit'))
  WITH CHECK (user_has_permission(auth.uid(), 'config.edit'));

-- ── 4. SEED: zona "Nacional" con el valor actual + ES mapeado ────────────────
-- Idempotente. NO se crea ninguna zona internacional ni is_default (los define
-- Ismael tras confirmar IVA/OSS con su gestoría).
INSERT INTO shipping_zones (name, shipping_cost, free_shipping_threshold, is_active, is_default, sort_order)
SELECT 'Nacional', 9.90, 500, TRUE, FALSE, 0
WHERE NOT EXISTS (SELECT 1 FROM shipping_zones WHERE name = 'Nacional');

INSERT INTO shipping_zone_countries (zone_id, country_code)
SELECT z.id, 'ES'
  FROM shipping_zones z
 WHERE z.name = 'Nacional'
   AND NOT EXISTS (SELECT 1 FROM shipping_zone_countries WHERE country_code = 'ES');
