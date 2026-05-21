-- ============================================================
-- Migración 151: permisos granulares para ocultar coste/margen
--                a todos los roles excepto administrador.
--
-- Motivo: vendedor_avanzado puede entrar a /admin/pedidos/[id]
-- y /admin/stock/productos/[id]; el detalle mostraba coste,
-- margen %, precio coste, etc. Si el cliente está delante de la
-- pantalla, lee info financiera interna.
--
-- Tras esta migración, el código (UI + server actions) gatea con
--   can('orders.view_costs')   → pedido sastrería
--   can('products.view_costs') → producto stock
-- Solo se asignan a 'administrador' y 'super_admin'.
--
-- Idempotente: ON CONFLICT DO NOTHING en ambos INSERT.
-- ============================================================

INSERT INTO permissions (code, module, action, display_name, description, category, sort_order, is_sensitive)
VALUES
  ('orders.view_costs',   'orders',   'view_costs', 'Ver coste y margen de pedidos sastrería',
   'Permite ver los importes de coste (material, mano de obra, fabricación) y margen € / % en el detalle del pedido sastrería, edición y wizard de creación. Información financiera interna.',
   'Pedidos', 1000, true),
  ('products.view_costs', 'products', 'view_costs', 'Ver coste y margen de productos',
   'Permite ver el precio de coste y el margen bruto / % / multiplicador en el detalle del producto y en el formulario de alta/edición.',
   'Productos', 1001, true)
ON CONFLICT (code) DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
CROSS JOIN permissions p
WHERE r.name IN ('administrador', 'super_admin')
  AND p.code IN ('orders.view_costs', 'products.view_costs')
ON CONFLICT DO NOTHING;
