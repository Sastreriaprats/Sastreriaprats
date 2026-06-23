-- ============================================================
-- Migración 233: ampliar la vista global de Informes a más usuarios.
--
-- El usuario pidió que admin@admin.opp (Admin OPP) y pablo@pospon.es (Pablo Comas)
-- vean LO MISMO que Mónica: informe completo (KPIs + todas las pestañas) + ventas
-- y comisiones de TODOS los empleados.
--
-- Para que el rol dedicado `informes_comisiones` dé acceso global completo (no solo
-- el desglose por empleado), se le añade también `reports.view`. Así cualquiera con
-- ese rol ve el informe entero como un administrador. Luego se asigna el rol a los
-- dos usuarios (Mónica ya lo tiene). Solo DML idempotente.
-- ============================================================

-- 1) El rol global también concede reports.view (KPIs + pestañas globales)
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r CROSS JOIN permissions p
WHERE r.name = 'informes_comisiones' AND p.code = 'reports.view'
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- 2) Asignar el rol global a Admin OPP y Pablo Comas
INSERT INTO user_roles (user_id, role_id)
SELECT v.uid, r.id
FROM roles r
CROSS JOIN (VALUES
  ('e10e7bd9-8b05-4cf5-a5cd-d86b2c23c6f3'::uuid),  -- admin@admin.opp (Admin OPP)
  ('a6774724-e798-4777-9b11-5ce696ba8f23'::uuid)   -- pablo@pospon.es (Pablo Comas)
) AS v(uid)
WHERE r.name = 'informes_comisiones'
ON CONFLICT (user_id, role_id) DO NOTHING;
