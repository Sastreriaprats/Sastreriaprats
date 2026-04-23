-- ============================================================================
-- Migración 127: Catálogos maestros de Colecciones y Temporadas
-- ============================================================================
-- Hasta ahora `products.collection` y `products.season` eran texto libre.
-- Con esta migración el admin gestiona las listas desde un panel y los
-- campos de producto se alimentan de esas listas.
--
-- Diseño: mantenemos `products.collection` y `products.season` como TEXT
-- (sigue siendo la "fuente de verdad" para filtros y retrocompat con fabrics),
-- pero ahora los valores provienen de las tablas maestras y se sincronizan
-- por nombre. Al renombrar una colección/temporada se actualizan los
-- productos en cascada por trigger.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Tabla: product_collections
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.product_collections (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name         text NOT NULL,
  description  text,
  is_active    boolean NOT NULL DEFAULT true,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT product_collections_name_unique UNIQUE (name)
);

CREATE INDEX IF NOT EXISTS idx_product_collections_name
  ON public.product_collections (name);

-- ---------------------------------------------------------------------------
-- Tabla: product_seasons
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.product_seasons (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name         text NOT NULL,
  description  text,
  is_active    boolean NOT NULL DEFAULT true,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT product_seasons_name_unique UNIQUE (name)
);

CREATE INDEX IF NOT EXISTS idx_product_seasons_name
  ON public.product_seasons (name);

-- ---------------------------------------------------------------------------
-- Trigger genérico de updated_at
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.product_collections_set_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_product_collections_updated_at ON public.product_collections;
CREATE TRIGGER trg_product_collections_updated_at
  BEFORE UPDATE ON public.product_collections
  FOR EACH ROW EXECUTE FUNCTION public.product_collections_set_updated_at();

DROP TRIGGER IF EXISTS trg_product_seasons_updated_at ON public.product_seasons;
CREATE TRIGGER trg_product_seasons_updated_at
  BEFORE UPDATE ON public.product_seasons
  FOR EACH ROW EXECUTE FUNCTION public.product_collections_set_updated_at();

-- ---------------------------------------------------------------------------
-- Poblar con los valores distintos que ya existen en products
-- ---------------------------------------------------------------------------
INSERT INTO public.product_collections (name)
SELECT DISTINCT TRIM(collection)
FROM public.products
WHERE collection IS NOT NULL AND TRIM(collection) <> ''
ON CONFLICT (name) DO NOTHING;

INSERT INTO public.product_seasons (name)
SELECT DISTINCT TRIM(season)
FROM public.products
WHERE season IS NOT NULL AND TRIM(season) <> ''
ON CONFLICT (name) DO NOTHING;

-- También tomar valores de fabrics (usan los mismos campos)
INSERT INTO public.product_collections (name)
SELECT DISTINCT TRIM(collection)
FROM public.fabrics
WHERE collection IS NOT NULL AND TRIM(collection) <> ''
ON CONFLICT (name) DO NOTHING;

INSERT INTO public.product_seasons (name)
SELECT DISTINCT TRIM(season)
FROM public.fabrics
WHERE season IS NOT NULL AND TRIM(season) <> ''
ON CONFLICT (name) DO NOTHING;

-- ---------------------------------------------------------------------------
-- Triggers de sincronización: al renombrar una colección/temporada,
-- actualizar automáticamente los productos y telas que la usan.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.product_collections_sync_rename()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.name IS DISTINCT FROM OLD.name THEN
    UPDATE public.products  SET collection = NEW.name WHERE collection = OLD.name;
    UPDATE public.fabrics   SET collection = NEW.name WHERE collection = OLD.name;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_product_collections_sync_rename ON public.product_collections;
CREATE TRIGGER trg_product_collections_sync_rename
  AFTER UPDATE ON public.product_collections
  FOR EACH ROW EXECUTE FUNCTION public.product_collections_sync_rename();

CREATE OR REPLACE FUNCTION public.product_seasons_sync_rename()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.name IS DISTINCT FROM OLD.name THEN
    UPDATE public.products  SET season = NEW.name WHERE season = OLD.name;
    UPDATE public.fabrics   SET season = NEW.name WHERE season = OLD.name;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_product_seasons_sync_rename ON public.product_seasons;
CREATE TRIGGER trg_product_seasons_sync_rename
  AFTER UPDATE ON public.product_seasons
  FOR EACH ROW EXECUTE FUNCTION public.product_seasons_sync_rename();

-- Al eliminar una colección/temporada, limpiamos el campo en productos/telas.
CREATE OR REPLACE FUNCTION public.product_collections_sync_delete()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  UPDATE public.products  SET collection = NULL WHERE collection = OLD.name;
  UPDATE public.fabrics   SET collection = NULL WHERE collection = OLD.name;
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trg_product_collections_sync_delete ON public.product_collections;
CREATE TRIGGER trg_product_collections_sync_delete
  BEFORE DELETE ON public.product_collections
  FOR EACH ROW EXECUTE FUNCTION public.product_collections_sync_delete();

CREATE OR REPLACE FUNCTION public.product_seasons_sync_delete()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  UPDATE public.products  SET season = NULL WHERE season = OLD.name;
  UPDATE public.fabrics   SET season = NULL WHERE season = OLD.name;
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trg_product_seasons_sync_delete ON public.product_seasons;
CREATE TRIGGER trg_product_seasons_sync_delete
  BEFORE DELETE ON public.product_seasons
  FOR EACH ROW EXECUTE FUNCTION public.product_seasons_sync_delete();

-- ---------------------------------------------------------------------------
-- RLS — las server actions usan service role; lectura libre a autenticados
-- ---------------------------------------------------------------------------
ALTER TABLE public.product_collections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_seasons     ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS product_collections_read ON public.product_collections;
CREATE POLICY product_collections_read
  ON public.product_collections FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS product_seasons_read ON public.product_seasons;
CREATE POLICY product_seasons_read
  ON public.product_seasons FOR SELECT
  TO authenticated
  USING (true);
