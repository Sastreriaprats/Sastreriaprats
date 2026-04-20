-- Verificación: qué líneas de pedido están mal marcadas como 'artesanal'
-- cuando su pedido es 'industrial'.
SELECT
  o.order_number,
  o.order_type AS pedido_tipo,
  l.line_type   AS linea_tipo,
  l.configuration->>'prendaLabel' AS prenda,
  l.configuration->>'tipo'        AS config_tipo
FROM tailoring_order_lines l
JOIN tailoring_orders o ON o.id = l.tailoring_order_id
WHERE o.order_type = 'industrial'
  AND l.line_type  = 'artesanal'
  AND (l.configuration->>'tipo') IS DISTINCT FROM 'camiseria'
ORDER BY o.order_number, l.sort_order;
