-- ============================================================================
-- 295 · CATEGORÍAS DE GASTO EN LAS FACTURAS DE PROVEEDOR
-- ----------------------------------------------------------------------------
-- Petición de David (28-sep-2026): en el informe para socios, ver las facturas
-- de gasto del mes y poder ponerles categoría, para que los gastos salgan
-- desglosados (tejidos, confección, alquiler…) y no solo por tienda/proveedor.
--
-- · `expense_categories`: catálogo editable desde Configuración, mismo patrón
--   que `client_categories` (mig 285): `code` estable, `name` renombrable.
-- · `ap_supplier_invoices.expense_category`: la categoría de CADA factura. Nula
--   = "Sin categoría". Por factura y no por proveedor porque hay proveedores que
--   facturan cosas distintas (Amazon, El Corte Inglés…).
-- · `suppliers.default_expense_category`: la que se aplica sola a las facturas
--   NUEVAS de ese proveedor (trigger BEFORE INSERT). Se rellena desde el informe
--   con "aplicar a todas las de este proveedor". No toca `suppliers.expense_type`
--   (general/alquiler/compras, mig 205), que sigue siendo del informe de Gastos.
--
-- Aditiva: columnas nulas y sin backfill. El código desplegado antes no las lee.
-- ============================================================================

-- 1. Catálogo -----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.expense_categories (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code        text NOT NULL UNIQUE,
  name        text NOT NULL,
  sort_order  integer NOT NULL DEFAULT 0,
  is_active   boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.expense_categories IS
  'Categorías de gasto editables desde Configuración (mig 295). ap_supplier_invoices.expense_category guarda el code.';

INSERT INTO public.expense_categories (code, name, sort_order) VALUES
  ('tejidos',            'Tejidos',                          1),
  ('confeccion',         'Confección y taller externo',      2),
  ('genero_boutique',    'Género de boutique',               3),
  ('fornituras',         'Fornituras y avíos',               4),
  ('alquiler',           'Alquiler',                         5),
  ('suministros',        'Suministros',                      6),
  ('publicidad',         'Publicidad y marketing',           7),
  ('asesoria',           'Asesoría y servicios profesionales', 8),
  ('transporte',         'Transporte y mensajería',          9),
  ('bancos',             'Bancos y comisiones',              10),
  ('software',           'Software y suscripciones',         11),
  ('otros',              'Otros gastos',                     12)
ON CONFLICT (code) DO NOTHING;

ALTER TABLE public.expense_categories ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS expense_categories_select ON public.expense_categories;
CREATE POLICY expense_categories_select ON public.expense_categories
  FOR SELECT USING (true);
DROP POLICY IF EXISTS expense_categories_modify ON public.expense_categories;
CREATE POLICY expense_categories_modify ON public.expense_categories
  FOR ALL USING (user_has_permission(auth.uid(), 'supplier_invoices.manage'));

-- 2. Categoría de cada factura ------------------------------------------------
ALTER TABLE public.ap_supplier_invoices
  ADD COLUMN IF NOT EXISTS expense_category text;
ALTER TABLE public.ap_supplier_invoices DROP CONSTRAINT IF EXISTS ap_supplier_invoices_expense_category_fkey;
ALTER TABLE public.ap_supplier_invoices
  ADD CONSTRAINT ap_supplier_invoices_expense_category_fkey
  FOREIGN KEY (expense_category) REFERENCES public.expense_categories(code)
  ON UPDATE CASCADE;
CREATE INDEX IF NOT EXISTS idx_ap_supplier_invoices_expense_category
  ON public.ap_supplier_invoices (expense_category);

-- 3. Categoría por defecto del proveedor --------------------------------------
ALTER TABLE public.suppliers
  ADD COLUMN IF NOT EXISTS default_expense_category text;
ALTER TABLE public.suppliers DROP CONSTRAINT IF EXISTS suppliers_default_expense_category_fkey;
ALTER TABLE public.suppliers
  ADD CONSTRAINT suppliers_default_expense_category_fkey
  FOREIGN KEY (default_expense_category) REFERENCES public.expense_categories(code)
  ON UPDATE CASCADE ON DELETE SET NULL;

-- 4. Las facturas nuevas heredan la del proveedor -----------------------------
CREATE OR REPLACE FUNCTION public.fn_ap_invoice_default_expense_category()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.expense_category IS NULL AND NEW.supplier_id IS NOT NULL THEN
    SELECT s.default_expense_category INTO NEW.expense_category
    FROM public.suppliers s
    WHERE s.id = NEW.supplier_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_ap_invoice_default_expense_category ON public.ap_supplier_invoices;
CREATE TRIGGER trg_ap_invoice_default_expense_category
  BEFORE INSERT ON public.ap_supplier_invoices
  FOR EACH ROW EXECUTE FUNCTION public.fn_ap_invoice_default_expense_category();
