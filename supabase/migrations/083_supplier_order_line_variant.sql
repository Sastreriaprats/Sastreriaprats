-- ============================================================
-- Migration 083: Añadir product_variant_id a supplier_order_lines
-- Permite vincular cada línea de pedido a una variante específica
-- para que la recepción actualice el stock de la talla correcta.
-- ============================================================

ALTER TABLE supplier_order_lines
  ADD COLUMN IF NOT EXISTS product_variant_id UUID REFERENCES product_variants(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_supplier_order_lines_variant ON supplier_order_lines(product_variant_id);
