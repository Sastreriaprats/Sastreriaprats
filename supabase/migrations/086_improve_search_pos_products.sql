-- Mejorar búsqueda TPV: añadir marca, mejorar ordenamiento (coincidencias exactas primero)
CREATE OR REPLACE FUNCTION search_pos_products(
  p_query text,
  p_warehouse_id uuid,
  p_limit int DEFAULT 20
)
RETURNS SETOF jsonb
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'id', v.id,
    'variant_sku', v.variant_sku,
    'size', v.size,
    'color', v.color,
    'barcode', v.barcode,
    'price_override', v.price_override,
    'is_active', v.is_active,
    'products', jsonb_build_object(
      'id', p.id,
      'sku', p.sku,
      'name', p.name,
      'base_price', p.base_price,
      'price_with_tax', p.price_with_tax,
      'tax_rate', p.tax_rate,
      'main_image_url', p.main_image_url,
      'product_type', p.product_type,
      'brand', p.brand,
      'cost_price', p.cost_price
    ),
    'stock_levels', COALESCE(
      (
        SELECT jsonb_agg(jsonb_build_object(
          'quantity', sl.quantity,
          'available', sl.available,
          'warehouse_id', sl.warehouse_id
        ))
        FROM stock_levels sl
        WHERE sl.product_variant_id = v.id AND sl.warehouse_id = p_warehouse_id
      ),
      '[]'::jsonb
    )
  )
  FROM product_variants v
  JOIN products p ON p.id = v.product_id
  WHERE v.is_active = true
    AND EXISTS (
      SELECT 1 FROM stock_levels sl2
      WHERE sl2.product_variant_id = v.id AND sl2.warehouse_id = p_warehouse_id
    )
    AND (
      v.variant_sku ILIKE '%' || p_query || '%'
      OR v.barcode ILIKE '%' || p_query || '%'
      OR p.name ILIKE '%' || p_query || '%'
      OR p.sku ILIKE '%' || p_query || '%'
      OR p.brand ILIKE '%' || p_query || '%'
    )
  ORDER BY
    -- Coincidencias exactas de barcode o SKU primero
    CASE
      WHEN v.barcode = p_query THEN 0
      WHEN p.sku = p_query OR v.variant_sku = p_query THEN 1
      WHEN v.barcode ILIKE p_query || '%' THEN 2
      WHEN p.sku ILIKE p_query || '%' OR v.variant_sku ILIKE p_query || '%' THEN 3
      ELSE 4
    END,
    p.name,
    v.variant_sku
  LIMIT p_limit;
$$;

COMMENT ON FUNCTION search_pos_products(text, uuid, int) IS 'Búsqueda de variantes para TPV por texto (nombre, SKU, EAN, marca) en el almacén dado. Prioriza coincidencias exactas.';
