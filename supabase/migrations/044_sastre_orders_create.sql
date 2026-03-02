-- Conceder al rol sastre permiso para crear pedidos (panel sastre: nuevo producto industrial/artesanal)
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
JOIN permissions p ON p.code = 'orders.create'
WHERE r.name = 'sastre'
ON CONFLICT (role_id, permission_id) DO NOTHING;
