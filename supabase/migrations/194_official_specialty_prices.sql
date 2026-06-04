-- ============================================================
-- Migración 194: precio por especialidad en oficiales.
--
-- Petición de Ismael: hoy cada oficial tiene UN único price_per_garment que
-- aplica a todas sus especialidades. Hay oficiales que hacen varias prendas
-- (Americana, Chaqué, Abrigo, Frac...) con precio distinto por prenda. Se
-- introduce una tabla relacional con una fila por (oficial, especialidad).
--
-- Decisiones:
--  - Opción A (tabla nueva), no JSONB: limpio relacionalmente y preparado para
--    futuros cálculos/agregaciones de coste por oficial.
--  - UNIQUE(official_id, specialty): integridad real, sin precios duplicados.
--  - La columna vieja officials.price_per_garment NO se borra (respaldo del
--    backfill y rollback). Se deja de leer/escribir desde la UI.
--  - RLS espejo de `officials` (view/create/edit/edit).
--  - RPC upsert_official_specialty_prices: borra+inserta en transacción para
--    que el guardado de precios sea atómico desde el cliente.
--
-- Idempotente: CREATE TABLE/INDEX IF NOT EXISTS, DROP+CREATE de trigger y
-- políticas, backfill con ON CONFLICT DO NOTHING, RPC con CREATE OR REPLACE.
-- ============================================================

-- ── 1) Tabla ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS official_specialty_prices (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  official_id UUID NOT NULL REFERENCES officials(id) ON DELETE CASCADE,
  specialty   TEXT NOT NULL,
  price       NUMERIC(10,2) NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at  TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  UNIQUE (official_id, specialty)
);

CREATE INDEX IF NOT EXISTS idx_osp_official ON official_specialty_prices(official_id);

DROP TRIGGER IF EXISTS trigger_osp_updated_at ON official_specialty_prices;
CREATE TRIGGER trigger_osp_updated_at
  BEFORE UPDATE ON official_specialty_prices FOR EACH ROW
  EXECUTE PROCEDURE update_updated_at();

-- ── 2) RLS (espejo de officials) ─────────────────────────────────────────────
ALTER TABLE official_specialty_prices ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "osp_select" ON official_specialty_prices;
CREATE POLICY "osp_select" ON official_specialty_prices
  FOR SELECT USING (user_has_permission(auth.uid(), 'officials.view'));

DROP POLICY IF EXISTS "osp_insert" ON official_specialty_prices;
CREATE POLICY "osp_insert" ON official_specialty_prices
  FOR INSERT WITH CHECK (user_has_permission(auth.uid(), 'officials.create'));

DROP POLICY IF EXISTS "osp_update" ON official_specialty_prices;
CREATE POLICY "osp_update" ON official_specialty_prices
  FOR UPDATE USING (user_has_permission(auth.uid(), 'officials.edit'));

DROP POLICY IF EXISTS "osp_delete" ON official_specialty_prices;
CREATE POLICY "osp_delete" ON official_specialty_prices
  FOR DELETE USING (user_has_permission(auth.uid(), 'officials.edit'));

-- ── 3) Backfill: replicar price_per_garment a cada especialidad del oficial ──
-- Hoy en producción genera 2 filas (Harold/Pantalón=145, Kevin/Camisería=42):
-- son los únicos 2 oficiales con price_per_garment > 0, ambos de 1 especialidad.
-- ON CONFLICT DO NOTHING -> re-ejecutar no pisa ediciones manuales posteriores.
INSERT INTO official_specialty_prices (official_id, specialty, price)
SELECT o.id, trim(s) AS specialty, o.price_per_garment
FROM officials o,
     LATERAL unnest(string_to_array(o.specialty, ',')) AS s
WHERE o.price_per_garment IS NOT NULL
  AND o.price_per_garment > 0
  AND o.specialty IS NOT NULL
  AND trim(s) <> ''
ON CONFLICT (official_id, specialty) DO NOTHING;

-- ── 4) RPC upsert atómico ────────────────────────────────────────────────────
-- Recibe el id del oficial y un JSONB {"Americana": 50, "Chaqué": 80}.
-- Borra TODAS las filas del oficial y reinserta las del JSONB en la misma
-- transacción de la función. Devuelve las filas resultantes.
CREATE OR REPLACE FUNCTION public.upsert_official_specialty_prices(
  p_official_id UUID,
  p_prices      JSONB
)
RETURNS SETOF official_specialty_prices
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_official_id IS NULL THEN
    RAISE EXCEPTION 'official_id requerido';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM officials WHERE id = p_official_id) THEN
    RAISE EXCEPTION 'Oficial no encontrado: %', p_official_id;
  END IF;

  -- Defensa en profundidad: ningún precio negativo (la validación principal vive
  -- en la server action, pero la RPC también lo rechaza).
  IF p_prices IS NOT NULL AND jsonb_typeof(p_prices) = 'object' THEN
    IF EXISTS (
      SELECT 1 FROM jsonb_each_text(p_prices) AS e(key, value)
      WHERE (e.value)::numeric < 0
    ) THEN
      RAISE EXCEPTION 'Los precios no pueden ser negativos';
    END IF;
  END IF;

  -- Borrar el set actual del oficial.
  DELETE FROM official_specialty_prices WHERE official_id = p_official_id;

  -- Reinsertar desde el JSONB (claves vacías ignoradas).
  IF p_prices IS NOT NULL AND jsonb_typeof(p_prices) = 'object' THEN
    INSERT INTO official_specialty_prices (official_id, specialty, price)
    SELECT p_official_id, e.key, (e.value)::numeric
    FROM jsonb_each_text(p_prices) AS e(key, value)
    WHERE trim(e.key) <> '';
  END IF;

  RETURN QUERY
    SELECT * FROM official_specialty_prices
    WHERE official_id = p_official_id
    ORDER BY specialty;
END;
$$;

GRANT EXECUTE ON FUNCTION public.upsert_official_specialty_prices(UUID, JSONB) TO service_role;
GRANT EXECUTE ON FUNCTION public.upsert_official_specialty_prices(UUID, JSONB) TO authenticated;
