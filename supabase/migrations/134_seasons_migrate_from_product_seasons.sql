-- ============================================================================
-- Migración 134: Portar temporadas legadas de `product_seasons` a `seasons`
-- ============================================================================
-- Antes existían dos tablas paralelas:
--   - `product_seasons` (mig. 127): registros con sólo `name`, sin slug.
--   - `seasons`         (mig. 132): tabla nueva con slug, fechas y orden.
--
-- El formulario de producto siempre leyó de `seasons`, pero el panel de
-- Configuración insertaba en `product_seasons`. Resultado: las temporadas
-- que el admin creaba ahí no aparecían en el desplegable y el contador de
-- productos siempre marcaba 0.
--
-- Esta migración:
--   1. Copia a `seasons` cada nombre presente en `product_seasons` que aún
--      no exista en `seasons`, generando un slug único derivado del nombre.
--   2. Para cada producto con `season = <name antiguo>`, lo reasigna al slug
--      correspondiente en `seasons`. Así no se pierden asignaciones.
--   3. Es idempotente: si se ejecuta dos veces no duplica datos.
-- ============================================================================

-- ─── Helper: slugify reproducible ───────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.__seasons_migrate_slugify(input text)
RETURNS text LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE
  s text;
BEGIN
  IF input IS NULL THEN RETURN NULL; END IF;
  s := lower(unaccent(input));
  s := regexp_replace(s, '[^a-z0-9]+', '-', 'g');
  s := regexp_replace(s, '^-+|-+$', '', 'g');
  RETURN substr(s, 1, 80);
END;
$$;

-- Si la extensión `unaccent` no estuviera instalada, instálala. La mayoría
-- de instalaciones de Supabase ya la traen activa.
CREATE EXTENSION IF NOT EXISTS unaccent;

-- ─── Paso 1 + 2 — copiar y reasignar productos ──────────────────────────────
DO $$
DECLARE
  ps RECORD;
  base_slug text;
  new_slug text;
  candidate text;
  n integer;
  next_sort integer;
BEGIN
  -- Si la tabla legada no existe (entornos limpios), salimos sin error.
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'product_seasons'
  ) THEN
    RAISE NOTICE 'product_seasons no existe; nada que migrar';
    RETURN;
  END IF;

  -- sort_order inicial = (max existente) + 1
  SELECT COALESCE(MAX(sort_order), 0) + 1 INTO next_sort FROM public.seasons;

  FOR ps IN
    SELECT id, name, description, is_active, created_at, updated_at
    FROM public.product_seasons
    ORDER BY name
  LOOP
    -- ¿Ya existe una temporada en `seasons` con el mismo nombre?
    IF EXISTS (SELECT 1 FROM public.seasons WHERE name = ps.name) THEN
      CONTINUE;
    END IF;

    base_slug := public.__seasons_migrate_slugify(ps.name);
    IF base_slug IS NULL OR base_slug = '' THEN
      base_slug := 'temporada';
    END IF;

    -- Asegurar slug único añadiendo sufijo numérico si hace falta.
    candidate := base_slug;
    n := 2;
    WHILE EXISTS (SELECT 1 FROM public.seasons WHERE slug = candidate) LOOP
      candidate := base_slug || '-' || n;
      n := n + 1;
      IF n > 100 THEN
        RAISE EXCEPTION 'No se pudo generar un slug único para %', ps.name;
      END IF;
    END LOOP;
    new_slug := candidate;

    INSERT INTO public.seasons
      (name, slug, description, is_active, sort_order, created_at, updated_at)
    VALUES
      (ps.name, new_slug, ps.description, COALESCE(ps.is_active, true),
       next_sort, COALESCE(ps.created_at, NOW()), COALESCE(ps.updated_at, NOW()));

    next_sort := next_sort + 1;

    -- Reasignar productos que tenían `season = <name antiguo>`.
    UPDATE public.products
       SET season = new_slug
     WHERE season = ps.name;

    -- Idem para fabrics (la mig. 127 las trataba juntas).
    UPDATE public.fabrics
       SET season = new_slug
     WHERE season = ps.name;
  END LOOP;
END
$$;

-- Limpieza del helper
DROP FUNCTION IF EXISTS public.__seasons_migrate_slugify(text);
