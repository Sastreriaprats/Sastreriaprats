-- Calendario de citas: sastre y sastre_plus pueden ver y crear citas
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
JOIN permissions p ON p.code IN ('calendar.view', 'calendar.edit', 'calendar.create')
WHERE r.name IN ('sastre', 'sastre_plus')
ON CONFLICT (role_id, permission_id) DO NOTHING;
