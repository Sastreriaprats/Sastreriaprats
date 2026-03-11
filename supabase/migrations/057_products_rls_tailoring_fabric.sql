-- RLS: permitir SELECT en products cuando product_type = 'tailoring_fabric'
CREATE POLICY "products_select_tailoring_fabric"
ON products FOR SELECT
USING (product_type = 'tailoring_fabric');
