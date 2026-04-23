-- ==========================================
-- SASTRERÍA PRATS — Migración 122
-- Permiso stock.transfer para vendedor_basico y vendedor_avanzado
-- ==========================================
-- Habilita a los vendedores a iniciar traspasos de stock entre almacenes.
-- La aprobación en destino sigue requiriendo stock.approve_transfer
-- (admin / usuarios con ese permiso).
--
-- Idempotente: ON CONFLICT DO NOTHING en role_permissions.

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
CROSS JOIN permissions p
WHERE r.name IN ('vendedor_basico', 'vendedor_avanzado')
  AND p.code = 'stock.transfer'
ON CONFLICT (role_id, permission_id) DO NOTHING;
