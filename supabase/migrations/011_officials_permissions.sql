-- Permisos del módulo Oficiales
INSERT INTO permissions (code, module, action, display_name, category)
VALUES ('officials.view', 'officials', 'view', 'Ver oficiales', 'Oficiales'),
       ('officials.edit', 'officials', 'edit', 'Editar oficiales', 'Oficiales'),
       ('officials.create', 'officials', 'create', 'Crear oficiales', 'Oficiales');

-- Asignar permisos a administrador y sastre_plus
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r, permissions p
WHERE r.name IN ('administrador', 'sastre_plus')
AND p.code IN ('officials.view', 'officials.edit', 'officials.create');
