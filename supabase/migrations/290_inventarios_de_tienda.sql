-- 290 · Inventarios de tienda (recuento físico con pistola)
--
-- Petición de Mónica (22-sep-2026): «Vamos a tener que hacer inventario de las
-- tiendas y no vemos dónde lo podemos hacer. Del inventario, que nos diga qué
-- es lo que había y qué es lo que hemos contado, para saber por qué está
-- fallando el stock.»
--
-- Las tablas `inventories` / `inventory_lines` existen desde la migración 003a
-- pero NUNCA tuvieron pantalla ni server actions (no hay una sola fila). Aquí se
-- completan para poder usarlas: referencia legible, filtros del recuento,
-- coste unitario congelado para valorar la diferencia, y el control de si el
-- recuento llegó a ajustar el stock.

-- ── Cabecera ────────────────────────────────────────────────────────────────
ALTER TABLE inventories
  ADD COLUMN IF NOT EXISTS reference            VARCHAR(30),
  ADD COLUMN IF NOT EXISTS season_filter        TEXT,
  ADD COLUMN IF NOT EXISTS brand_filter         TEXT,
  ADD COLUMN IF NOT EXISTS total_units_expected INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_units_counted  INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS applied_at           TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS applied_by           UUID REFERENCES profiles(id) ON DELETE SET NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_inventories_reference ON inventories(reference);

-- status: 'in_progress' | 'completed' | 'cancelled'
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'inventories_status_check') THEN
    ALTER TABLE inventories
      ADD CONSTRAINT inventories_status_check
      CHECK (status IN ('in_progress', 'completed', 'cancelled'));
  END IF;
END $$;

-- ── Líneas ──────────────────────────────────────────────────────────────────
ALTER TABLE inventory_lines
  ADD COLUMN IF NOT EXISTS unit_cost  NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS was_extra  BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

ALTER TABLE inventory_lines ALTER COLUMN expected_quantity SET DEFAULT 0;

-- Una variante aparece UNA vez por inventario: el escaneo suma sobre su fila.
CREATE UNIQUE INDEX IF NOT EXISTS idx_inventory_lines_unique
  ON inventory_lines(inventory_id, product_variant_id);

CREATE INDEX IF NOT EXISTS idx_inventory_lines_counted_at
  ON inventory_lines(inventory_id, counted_at DESC);

-- ── Referencia legible INV-AAAA-NNNN ────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.generate_inventory_reference()
 RETURNS text
 LANGUAGE plpgsql
AS $function$
DECLARE
  v_year INTEGER := EXTRACT(YEAR FROM CURRENT_DATE);
  v_next INTEGER;
BEGIN
  SELECT COALESCE(
    MAX(NULLIF(SPLIT_PART(reference, '-', 3), '')::INTEGER),
    0
  ) + 1
  INTO v_next
  FROM inventories
  WHERE reference LIKE 'INV-' || v_year || '-%';

  RETURN 'INV-' || v_year || '-' || LPAD(v_next::TEXT, 4, '0');
END;
$function$;

-- ── Permiso propio ──────────────────────────────────────────────────────────
-- Ya existe en las políticas RLS de la 003d (`user_has_permission(..., 'stock.inventory')`)
-- pero nunca se dio de alta la fila, así que NADIE lo tenía.
INSERT INTO permissions (code, module, action, display_name, description, category, sort_order, is_sensitive)
VALUES (
  'stock.inventory',
  'stock',
  'update',
  'Hacer inventarios',
  'Crear recuentos físicos de almacén, contar con pistola y ajustar el stock a lo contado',
  'Stock',
  (SELECT COALESCE(MAX(sort_order), 0) + 1 FROM permissions WHERE module = 'stock'),
  true
)
ON CONFLICT (code) DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
CROSS JOIN permissions p
WHERE p.code = 'stock.inventory'
  AND r.name IN ('administrador', 'vendedor_avanzado', 'sastre_plus')
ON CONFLICT DO NOTHING;

-- Trigger de updated_at en las líneas (la cabecera ya lo tenía de la 003a).
DROP TRIGGER IF EXISTS trigger_inventory_lines_updated_at ON inventory_lines;
CREATE TRIGGER trigger_inventory_lines_updated_at
  BEFORE UPDATE ON inventory_lines FOR EACH ROW EXECUTE PROCEDURE update_updated_at();
