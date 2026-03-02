-- Vendedores (vendedor_basico y vendedor_avanzado) pueden ver el calendario de citas
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
JOIN permissions p ON p.code = 'calendar.view'
WHERE r.name IN ('vendedor_basico', 'vendedor_avanzado')
ON CONFLICT (role_id, permission_id) DO NOTHING;
