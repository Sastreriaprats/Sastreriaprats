-- ============================================================
-- Migration 139: añadir orders.create y orders.edit a vendedor_avanzado
-- Permite que el vendedor avanzado cree y edite pedidos de sastrería
-- desde /admin/pedidos. La página y la action ya están protegidas con
-- estos permisos; solo falta concedérselos al rol.
-- ============================================================

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
CROSS JOIN permissions p
WHERE r.name = 'vendedor_avanzado'
  AND p.code IN ('orders.create', 'orders.edit')
ON CONFLICT (role_id, permission_id) DO NOTHING;
