-- 294_colores_de_producto.sql
--
-- Catálogo de COLORES de producto con el código numérico de la tienda (sep-2026).
-- Cada centena es una familia (100 blancos y neutros, 200 grises y negros, 300
-- azules…). El informe de Productos cuenta unidades vendidas por color y por
-- familia, así que el color tiene que ser un valor cerrado: hasta ahora
-- products.color era texto libre ("VERDE", "Verde", "Marino"…) y no agrupaba.
--
--   product_colors.code  → código de la tienda (100, 302…), clave estable.
--   products.color_code  → el color del producto (se elige en Web / Tienda).
--   products.color       → se sigue rellenando con el NOMBRE, para la web y
--                          los sitios que ya lo leían como texto.
--
-- product_variants.color no se toca: los productos varían por talla, no por color.
--
-- Idempotente, sin bloques $$.

CREATE TABLE IF NOT EXISTS public.product_colors (
  code        integer PRIMARY KEY,
  name        text NOT NULL UNIQUE,
  family      text NOT NULL,
  hex         text,
  is_active   boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.product_colors IS
  'Colores de producto con el código numérico de la tienda (mig 294). La centena es la familia. products.color_code guarda el code.';

INSERT INTO public.product_colors (code, name, family, hex) VALUES
  (100, 'Blanco',        'Blancos y neutros', '#FFFFFF'),
  (101, 'Blanco roto',   'Blancos y neutros', '#F5F0E6'),
  (102, 'Marfil',        'Blancos y neutros', '#F3E5C8'),
  (103, 'Crudo',         'Blancos y neutros', '#E8D8B8'),
  (104, 'Beige',         'Blancos y neutros', '#D9C4A0'),
  (105, 'Arena',         'Blancos y neutros', '#CDB48E'),
  (106, 'Camel',         'Blancos y neutros', '#BD925F'),
  (200, 'Negro',         'Grises y negros',   '#202225'),
  (201, 'Gris claro',    'Grises y negros',   '#C8CDD0'),
  (202, 'Gris medio',    'Grises y negros',   '#8E959B'),
  (203, 'Gris oscuro',   'Grises y negros',   '#545A61'),
  (204, 'Gris marengo',  'Grises y negros',   '#3A3F46'),
  (300, 'Azul',          'Azules',            '#3A6EA5'),
  (301, 'Azul celeste',  'Azules',            '#A7CBE3'),
  (302, 'Azul marino',   'Azules',            '#1E2D52'),
  (303, 'Azul petróleo', 'Azules',            '#2E5E63'),
  (304, 'Azul denim',    'Azules',            '#557BA3'),
  (400, 'Verde',         'Verdes',            '#4A7C59'),
  (401, 'Verde oliva',   'Verdes',            '#6B7B4B'),
  (402, 'Verde botella', 'Verdes',            '#22503D'),
  (403, 'Verde menta',   'Verdes',            '#A5CFB8'),
  (500, 'Rojo',          'Rojos y rosas',     '#B83A3A'),
  (501, 'Granate',       'Rojos y rosas',     '#722C40'),
  (502, 'Burdeos',       'Rojos y rosas',     '#6B2A38'),
  (503, 'Rosa',          'Rojos y rosas',     '#D9A0B8'),
  (504, 'Rosa palo',     'Rojos y rosas',     '#CDA2A2'),
  (600, 'Marrón',        'Marrones',          '#7A5238'),
  (601, 'Marrón claro',  'Marrones',          '#A87A5C'),
  (602, 'Marrón oscuro', 'Marrones',          '#4E3426'),
  (603, 'Chocolate',     'Marrones',          '#533428'),
  (604, 'Topo',          'Marrones',          '#8C8274'),
  (700, 'Amarillo',      'Cálidos',           '#E3BE4F'),
  (701, 'Mostaza',       'Cálidos',           '#B8913A'),
  (702, 'Naranja',       'Cálidos',           '#DD7B3A'),
  (703, 'Terracota',     'Cálidos',           '#B8644A'),
  (704, 'Teja',          'Cálidos',           '#A6533C'),
  (800, 'Morado',        'Otros',             '#74577E'),
  (801, 'Lila',          'Otros',             '#B9A5CE'),
  (802, 'Multicolor',    'Otros',             NULL),
  (803, 'Dorado',        'Otros',             '#C8A551'),
  (804, 'Plateado',      'Otros',             '#AEB2B8')
ON CONFLICT (code) DO NOTHING;

ALTER TABLE public.product_colors ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS product_colors_select ON public.product_colors;
CREATE POLICY product_colors_select ON public.product_colors
  FOR SELECT USING (true);
DROP POLICY IF EXISTS product_colors_modify ON public.product_colors;
CREATE POLICY product_colors_modify ON public.product_colors
  FOR ALL USING (user_has_permission(auth.uid(), 'products.edit'));

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS color_code integer
    REFERENCES public.product_colors(code) ON UPDATE CASCADE;

CREATE INDEX IF NOT EXISTS idx_products_color_code
  ON public.products(color_code)
  WHERE color_code IS NOT NULL;

-- Los pocos productos que ya tenían el color escrito a mano pasan al catálogo
-- (y su texto queda con el nombre canónico). "Marino" a secas = Azul marino.
UPDATE public.products p
   SET color_code = pc.code,
       color = pc.name
  FROM public.product_colors pc
 WHERE p.color_code IS NULL
   AND p.color IS NOT NULL
   AND lower(trim(p.color)) = lower(pc.name);

UPDATE public.products
   SET color_code = 302,
       color = 'Azul marino'
 WHERE color_code IS NULL
   AND lower(trim(color)) = 'marino';
