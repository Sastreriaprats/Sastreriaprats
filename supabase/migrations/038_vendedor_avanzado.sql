-- Rol vendedor_avanzado y permiso barcodes.manage para etiquetas/códigos de barras.
-- vendedor_avanzado: mismos permisos que vendedor_basico + barcodes.manage (solo él ve/imprime etiquetas).

-- 1. Asegurar rol vendedor_avanzado (puede existir ya en 010_roles_v2)
INSERT INTO roles (name, display_name, description, role_type, system_role, hierarchy_level, color, icon)
VALUES (
  'vendedor_avanzado',
  'Vendedor Avanzado',
  'Vendedor con acceso a etiquetas y códigos de barras',
  'system',
  'salesperson',
  35,
  '#B45309',
  'shopping-bag'
)
ON CONFLICT (name) DO UPDATE SET
  display_name = EXCLUDED.display_name,
  description  = EXCLUDED.description,
  color        = EXCLUDED.color;

-- 2. Permiso para gestionar códigos de barras e imprimir etiquetas
INSERT INTO permissions (code, module, action, display_name, description, category, sort_order)
VALUES (
  'barcodes.manage',
  'stock',
  'update',
  'Gestionar códigos de barras',
  'Gestionar códigos de barras e imprimir etiquetas',
  'Stock',
  76
)
ON CONFLICT (code) DO NOTHING;

-- 3. vendedor_avanzado = permisos de vendedor_basico + barcodes.manage
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
CROSS JOIN permissions p
WHERE r.name = 'vendedor_avanzado'
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
  'pos.sell',
  'barcodes.manage'
)
ON CONFLICT (role_id, permission_id) DO NOTHING;
