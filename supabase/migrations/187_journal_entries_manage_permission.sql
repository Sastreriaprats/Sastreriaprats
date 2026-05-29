-- ============================================================
-- Migración 187: permiso journal_entries.manage (asientos manuales).
--
-- Habilita crear/editar/anular asientos contables MANUALES desde la UID de
-- contabilidad. La lectura sigue con accounting.view. No crea tablas
-- (chart_of_accounts y fiscal_periods ya existen). Idempotente.
-- ============================================================

INSERT INTO permissions (code, module, action, display_name, description, category, is_sensitive)
VALUES (
  'journal_entries.manage', 'accounting', 'manage_entries', 'Gestionar asientos contables',
  'Crear, editar y anular asientos contables manuales (no afecta a asientos automáticos de ventas/compras).',
  'Contabilidad', true
)
ON CONFLICT (code) DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r CROSS JOIN permissions p
WHERE r.name = 'administrador' AND p.code = 'journal_entries.manage'
ON CONFLICT DO NOTHING;
