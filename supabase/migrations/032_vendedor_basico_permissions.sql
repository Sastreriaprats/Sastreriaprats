-- Permisos del rol vendedor_basico para el panel /vendedor: clientes, productos/stock, cobros (orders.view), ventas/TPV.
-- Ejecutar en SQL Editor si se prefiere, o aplicar como migración.

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
CROSS JOIN permissions p
WHERE r.name = 'vendedor_basico'
AND p.code IN (
  'clients.view',
  'clients.create',
  'clients.edit',
  'products.view',
  'products.edit',
  'products.edit_price',
  'stock.view',
  'stock.edit',
  'orders.view',
  'pos.access',
  'pos.open_session',
  'pos.close_session',
  'pos.sell'
)
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- Verificación: listar permisos del rol vendedor_basico
-- SELECT p.code FROM role_permissions rp JOIN roles r ON r.id = rp.role_id JOIN permissions p ON p.id = rp.permission_id WHERE r.name = 'vendedor_basico' ORDER BY p.code;
