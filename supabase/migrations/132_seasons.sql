-- ============================================================================
-- Migración 132: Tabla `seasons` (temporadas con fechas y activación)
-- ============================================================================
-- Esta tabla sustituye en la práctica al uso del campo `products.season` como
-- texto libre (ss/aw/all). El slug de la temporada activa es lo que guardarán
-- los productos en `products.season` y el catálogo público filtra por las
-- temporadas activas + dentro de fechas.
--
-- NOTA: existe una tabla previa `product_seasons` (migración 127) con
-- triggers de sync por nombre. NO la tocamos. Esta tabla `seasons` es
-- independiente.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.seasons (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  start_date DATE,
  end_date DATE,
  is_active BOOLEAN NOT NULL DEFAULT true,
  sort_order INTEGER NOT NULL DEFAULT 0,
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_seasons_active_dates
  ON public.seasons (is_active, start_date, end_date);

-- updated_at automático
CREATE OR REPLACE FUNCTION public.seasons_set_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_seasons_updated_at ON public.seasons;
CREATE TRIGGER trg_seasons_updated_at
  BEFORE UPDATE ON public.seasons
  FOR EACH ROW EXECUTE FUNCTION public.seasons_set_updated_at();

-- RLS: las server actions usan service role; lectura libre a autenticados
ALTER TABLE public.seasons ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Staff can manage seasons" ON public.seasons;
CREATE POLICY "Staff can manage seasons"
  ON public.seasons FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- Datos iniciales (idempotente)
INSERT INTO public.seasons (name, slug, start_date, end_date, is_active, sort_order) VALUES
  ('Todo el año',                'all', NULL,         NULL,         true, 0),
  ('Primavera / Verano 2026',    'ss',  '2026-04-01', '2026-09-30', true, 1),
  ('Otoño / Invierno 2025-26',   'aw',  '2025-10-01', '2026-03-31', true, 2)
ON CONFLICT (slug) DO NOTHING;
