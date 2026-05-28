-- ============================================================
-- Migración 184: permiso returns.view (listado de devoluciones en admin).
--
-- Solo lectura: habilita la vista global de devoluciones (/admin/devoluciones).
-- No crea RPCs ni muta nada. Granular y separable del resto de permisos de TPV.
-- Idempotente.
-- ============================================================

INSERT INTO permissions (code, module, action, display_name, description, category, is_sensitive)
VALUES (
  'returns.view', 'returns', 'view', 'Ver devoluciones',
  'Consultar el historial de devoluciones (tickets, vales, cambios) desde el panel de administración.',
  'Contabilidad', false
)
ON CONFLICT (code) DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r CROSS JOIN permissions p
WHERE r.name = 'administrador' AND p.code = 'returns.view'
ON CONFLICT DO NOTHING;
