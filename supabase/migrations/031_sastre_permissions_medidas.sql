-- Permisos del sastre: ver/crear/editar clientes, ver/editar medidas, pedidos, productos, stock.
-- Para verificar en SQL Editor: SELECT p.code FROM role_permissions rp JOIN roles r ON r.id = rp.role_id JOIN permissions p ON p.id = rp.permission_id WHERE r.name = 'sastre';

-- 1. Añadir permisos de medidas si no existen (la RLS de client_measurements los usa; 010 no los incluyó)
INSERT INTO permissions (code, module, action, display_name, description, category, sort_order)
VALUES
  ('clients.view_measurements', 'clients', 'read', 'Ver medidas', 'Consultar medidas del cliente', 'Clientes', 15),
  ('clients.edit_measurements', 'clients', 'update', 'Editar medidas', 'Tomar y modificar medidas del cliente', 'Clientes', 16)
ON CONFLICT (code) DO NOTHING;

-- 2. Conceder al rol sastre los permisos necesarios para el panel (clientes, medidas, pedidos, productos, stock)
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
JOIN permissions p ON p.code IN (
  'clients.view',
  'clients.create',
  'clients.edit',
  'clients.view_measurements',
  'clients.edit_measurements',
  'orders.view',
  'products.view',
  'stock.view'
)
WHERE r.name = 'sastre'
ON CONFLICT (role_id, permission_id) DO NOTHING;
