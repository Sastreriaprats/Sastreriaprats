-- ============================================================================
-- Migración 129: Guías de tallas personalizables por categoría/producto
-- ============================================================================
-- Permite al admin definir varias guías de tallas (una para americanas, otra
-- para camisas, otra para pantalones, etc.), configurar las columnas (Pecho,
-- Cintura, Cuello, Largo…) y las filas (medidas por talla), y asignarlas a
-- una o varias categorías de producto. También permite override por producto.
--
-- Resolución en frontend: producto.size_guide_id > categoría.size_guide_id
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.size_guides (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name         text NOT NULL,
  slug         text NOT NULL,
  description  text,
  -- columns: [{ "key":"size","label":"Talla ES" }, { "key":"chest","label":"Pecho (cm)" }, ...]
  columns      jsonb NOT NULL DEFAULT '[]'::jsonb,
  -- rows: [{ "size":"44", "chest":"88–92", "waist":"76–80" }, ...]
  rows         jsonb NOT NULL DEFAULT '[]'::jsonb,
  footer_note  text,
  is_active    boolean NOT NULL DEFAULT true,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT size_guides_slug_unique UNIQUE (slug)
);

CREATE INDEX IF NOT EXISTS idx_size_guides_name ON public.size_guides (name);

-- FK opcional en categorías: la guía de tallas por defecto para los productos
-- de esa categoría.
ALTER TABLE public.product_categories
  ADD COLUMN IF NOT EXISTS size_guide_id uuid
  REFERENCES public.size_guides(id) ON DELETE SET NULL;

-- FK opcional en productos: override de la guía de tallas para un producto
-- específico (por si este producto no encaja con la guía de su categoría).
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS size_guide_id uuid
  REFERENCES public.size_guides(id) ON DELETE SET NULL;

-- Trigger de updated_at
CREATE OR REPLACE FUNCTION public.size_guides_set_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_size_guides_updated_at ON public.size_guides;
CREATE TRIGGER trg_size_guides_updated_at
  BEFORE UPDATE ON public.size_guides
  FOR EACH ROW EXECUTE FUNCTION public.size_guides_set_updated_at();

-- Seed con la guía de tallas actual hardcoded en el frontend para americanas.
-- Solo la insertamos si no existe ninguna guía todavía.
INSERT INTO public.size_guides (name, slug, description, columns, rows, footer_note)
SELECT
  'Americanas',
  'americanas',
  'Guía de tallas para americanas y trajes.',
  '[
    {"key":"size","label":"Talla ES"},
    {"key":"chest","label":"Pecho (cm)"},
    {"key":"waist","label":"Cintura (cm)"},
    {"key":"hip","label":"Cadera (cm)"}
  ]'::jsonb,
  '[
    {"size":"44","chest":"88–92","waist":"76–80","hip":"94–98"},
    {"size":"46","chest":"92–96","waist":"80–84","hip":"98–102"},
    {"size":"48","chest":"96–100","waist":"84–88","hip":"102–106"},
    {"size":"50","chest":"100–104","waist":"88–92","hip":"106–110"},
    {"size":"52","chest":"104–108","waist":"92–96","hip":"110–114"},
    {"size":"54","chest":"108–112","waist":"96–100","hip":"114–118"},
    {"size":"56","chest":"112–116","waist":"100–104","hip":"118–122"}
  ]'::jsonb,
  'Las medidas son orientativas. Si tienes dudas, visítanos en cualquiera de nuestras boutiques.'
WHERE NOT EXISTS (SELECT 1 FROM public.size_guides);

-- Asignar la guía recién creada a la categoría "Americana" si existe y no tiene ya una.
UPDATE public.product_categories pc
SET size_guide_id = sg.id
FROM public.size_guides sg
WHERE sg.slug = 'americanas'
  AND pc.slug = 'americana'
  AND pc.size_guide_id IS NULL;

-- RLS: lectura pública para que el catálogo web pueda leer las guías.
ALTER TABLE public.size_guides ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS size_guides_read ON public.size_guides;
CREATE POLICY size_guides_read
  ON public.size_guides FOR SELECT
  TO anon, authenticated
  USING (true);
