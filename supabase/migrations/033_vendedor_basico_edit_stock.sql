-- vendedor_basico: permitir editar productos y modificar stock (no solo ver).
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
JOIN permissions p ON p.code IN ('products.edit', 'products.edit_price', 'stock.edit')
WHERE r.name = 'vendedor_basico'
ON CONFLICT (role_id, permission_id) DO NOTHING;
