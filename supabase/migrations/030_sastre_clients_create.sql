-- Conceder permiso clients.create al rol sastre para poder crear clientes desde el panel /sastre/clientes
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
JOIN permissions p ON p.code = 'clients.create'
WHERE r.name = 'sastre'
ON CONFLICT (role_id, permission_id) DO NOTHING;
