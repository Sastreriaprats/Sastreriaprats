-- ============================================================
-- Migración 232: visibilidad del desglose "Por empleado" + comisiones.
--
-- REGLA (decisión del usuario, jun-2026): en Informes → Por empleado, las ventas
-- y comisiones de TODOS los empleados solo las ve MÓNICA MAGARIÑOS. El resto solo
-- ve SU propia fila. Los vendedores que hoy no acceden a Informes podrán entrar
-- pero viendo solo lo suyo (sin KPIs ni pestañas globales de empresa).
--
-- Permisos:
--  - reports.view_all_employees: ver el desglose completo + comisiones de todos.
--    Se comprueba SIN el bypass de administrador (checkUserExplicitPermission), así
--    que ni los admin lo tienen salvo asignación expresa. Se concede a un ROL
--    DEDICADO asignado SOLO a Mónica.
--  - reports.view_own: entrar a Informes y ver solo la propia fila de Por empleado.
--    Se concede a los roles de vendedor (acceso a su vista personal).
--  - reports.view (existente): KPIs y pestañas globales (sigue solo para admin).
--
-- Todo son inserciones idempotentes (ON CONFLICT). Mónica = c8707796.
-- ============================================================

-- 1) Permisos nuevos
INSERT INTO permissions (code, module, action, category, display_name, description, sort_order, is_sensitive)
VALUES
  ('reports.view_all_employees', 'reports', 'read', 'Informes',
   'Ver ventas y comisiones de TODOS los empleados',
   'Desglose Por empleado completo + comisiones de toda la plantilla', 121, true),
  ('reports.view_own', 'reports', 'read', 'Informes',
   'Ver mis propias ventas y comisiones',
   'Acceso a Informes limitado a la propia fila de Por empleado', 122, false)
ON CONFLICT (code) DO NOTHING;

-- 2) Rol dedicado a la vista global (lo tendrá SOLO Mónica)
INSERT INTO roles (name, display_name, description, is_active)
VALUES ('informes_comisiones', 'Informes — comisiones (global)',
        'Permite ver ventas y comisiones de todos los empleados en Informes', true)
ON CONFLICT (name) DO NOTHING;

-- 3) Conceder reports.view_all_employees al rol dedicado
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r CROSS JOIN permissions p
WHERE r.name = 'informes_comisiones' AND p.code = 'reports.view_all_employees'
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- 4) Asignar el rol SOLO a Mónica Magariños (mmagaripe@yahoo.es)
INSERT INTO user_roles (user_id, role_id)
SELECT 'c8707796-3308-4afa-aacd-d2cf81f9f602'::uuid, r.id FROM roles r
WHERE r.name = 'informes_comisiones'
ON CONFLICT (user_id, role_id) DO NOTHING;

-- 5) Conceder reports.view_own a los roles de vendedor (su vista personal)
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r CROSS JOIN permissions p
WHERE r.name IN ('vendedor_avanzado', 'vendedor_basico', 'sastre_plus')
  AND p.code = 'reports.view_own'
ON CONFLICT (role_id, permission_id) DO NOTHING;
