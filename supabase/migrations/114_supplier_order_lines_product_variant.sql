-- Añade vínculo explícito a la variante (talla/color) en las líneas de pedido a proveedor.
-- Antes de esto, la talla solo quedaba como texto dentro de `description`, y al recepcionar
-- el stock se asignaba siempre a la primera variante creada (típicamente XS), provocando
-- movimientos de stock en tallas incorrectas.

ALTER TABLE public.supplier_order_lines
  ADD COLUMN IF NOT EXISTS product_variant_id uuid
    REFERENCES public.product_variants(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_supplier_order_lines_product_variant_id
  ON public.supplier_order_lines(product_variant_id);
