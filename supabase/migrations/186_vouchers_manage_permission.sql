-- ============================================================
-- Migración 186: permiso vouchers.manage (gestión avanzada de vales).
--
-- Habilita las acciones sensibles de admin sobre vales: ajustar saldo,
-- reactivar un vale cancelado y editar notas. Las acciones existentes
-- (cancelar, caducidad, reasignar cliente, crear) se quedan en pos.sell.
--
-- Sin RPCs: las operaciones son UPDATEs simples desde server actions, que
-- registran auditoría (before/after) por el wrapper protectedAction. El ajuste
-- de saldo exige reason obligatorio (se anexa a notes con timestamp). No se
-- crea tabla de auditoría dedicada (el audit log general la cubre).
--
-- Idempotente.
-- ============================================================

INSERT INTO permissions (code, module, action, display_name, description, category, is_sensitive)
VALUES (
  'vouchers.manage', 'vouchers', 'manage', 'Gestionar vales avanzado',
  'Ajustar el saldo, reactivar o editar notas de un vale (operaciones de administración sobre vales).',
  'Contabilidad', true
)
ON CONFLICT (code) DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r CROSS JOIN permissions p
WHERE r.name = 'administrador' AND p.code = 'vouchers.manage'
ON CONFLICT DO NOTHING;
