-- ============================================================
-- Migración 170: permiso sales.delete (Fase 0 del botón "Eliminar ticket")
--
-- Borrado físico total de un ticket de TPV (venta + líneas + pagos + stock
-- devuelto + ajuste de caja + asientos + factura). Operación irreversible.
-- Solo se concede a 'administrador'; la server action exigirá además isFullAdmin.
--
-- Esta migración NO crea ningún borrado: solo el permiso. La RPC de PREVIEW
-- (sin mutaciones) va en la 171. El borrado real será una fase posterior.
--
-- Idempotente: ON CONFLICT DO NOTHING.
-- ============================================================

INSERT INTO permissions (code, module, action, display_name, description, category, is_sensitive)
VALUES (
  'sales.delete',
  'sales',
  'delete',
  'Eliminar ventas',
  'Borrado físico total de un ticket de TPV (venta, líneas, pagos, stock, caja y contabilidad). Irreversible.',
  'Contabilidad',
  true
)
ON CONFLICT (code) DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
CROSS JOIN permissions p
WHERE r.name = 'administrador'
  AND p.code = 'sales.delete'
ON CONFLICT DO NOTHING;
