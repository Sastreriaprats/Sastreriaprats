-- ============================================================
-- Migration 066: Asignar orders.view a roles sastre y sastre_plus
-- ============================================================

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
CROSS JOIN permissions p
WHERE r.name IN ('sastre', 'sastre_plus')
  AND p.code = 'orders.view'
  AND NOT EXISTS (
    SELECT 1 FROM role_permissions rp
    WHERE rp.role_id = r.id AND rp.permission_id = p.id
  );
