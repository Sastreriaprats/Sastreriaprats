-- ==========================================
-- SASTRERÍA PRATS — Migración 123
-- Permiso stock.approve_transfer para vendedor_basico y vendedor_avanzado
-- ==========================================
-- Habilita a los vendedores a aprobar la recepción de traspasos en destino.
-- Complementa la 122 (stock.transfer). La lógica de doble aprobación
-- (admin + destino) sigue vigente vía RLS/RPC.
--
-- Idempotente: ON CONFLICT DO NOTHING en role_permissions.

-- 1. Asegurar que el permiso existe (declarado en 001 pero puede faltar en algunas BDs).
INSERT INTO permissions (code, module, action, display_name, description, category, sort_order)
VALUES ('stock.approve_transfer', 'stock', 'update', 'Aprobar traspasos',
        'Autorizar traspasos de stock', 'Stock', 76)
ON CONFLICT (code) DO NOTHING;

-- 2. Asignar a los roles de vendedor.
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
CROSS JOIN permissions p
WHERE r.name IN ('vendedor_basico', 'vendedor_avanzado')
  AND p.code = 'stock.approve_transfer'
ON CONFLICT (role_id, permission_id) DO NOTHING;
