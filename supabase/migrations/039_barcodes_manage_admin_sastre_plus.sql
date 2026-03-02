-- Asignar barcodes.manage a administrador y sastre_plus para que puedan acceder a etiquetas/códigos de barras.
-- (vendedor_avanzado ya lo tiene desde 038.)

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
CROSS JOIN permissions p
WHERE p.code = 'barcodes.manage'
AND r.name IN ('administrador', 'sastre_plus')
ON CONFLICT (role_id, permission_id) DO NOTHING;
