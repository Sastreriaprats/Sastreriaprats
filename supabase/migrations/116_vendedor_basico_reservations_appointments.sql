-- ==========================================
-- SASTRERÍA PRATS — Migración 116
-- Permisos de vendedor_basico: reservas + citas
-- ==========================================
-- Añade a vendedor_basico los permisos necesarios para:
--   · Crear/editar reservas de producto (createReservation)
--   · Crear/editar/mover/cancelar citas (createAppointment, updateAppointment,
--     moveAppointment, cancelAppointment)
--
-- Idempotente: se puede ejecutar varias veces sin duplicar filas.
-- Refuerza también los permisos de reservas que debería haber aplicado la
-- migración 100 (por si el rol estaba inactivo cuando se aplicó y ese INSERT
-- no encontró el role_id).

-- 1. Asegurar que los permisos de calendario existen (vienen de 001 + 010).
--    Los redefinimos con ON CONFLICT DO NOTHING por si alguna BD no los tiene.
INSERT INTO permissions (code, module, action, display_name, category)
VALUES
  ('calendar.view',   'calendar', 'view',   'Ver calendario',           'Calendario'),
  ('calendar.create', 'calendar', 'create', 'Crear citas',              'Calendario'),
  ('calendar.edit',   'calendar', 'edit',   'Editar calendario',        'Calendario'),
  ('calendar.update', 'calendar', 'update', 'Editar citas',             'Calendario'),
  ('calendar.delete', 'calendar', 'delete', 'Eliminar/cancelar citas',  'Calendario')
ON CONFLICT (code) DO NOTHING;

-- 2. Asegurar que los permisos de reservas existen (vienen de 100).
INSERT INTO permissions (code, module, action, display_name, category)
VALUES
  ('reservations.view',   'reservations', 'view',   'Ver reservas',     'Reservas'),
  ('reservations.create', 'reservations', 'create', 'Crear reservas',   'Reservas'),
  ('reservations.edit',   'reservations', 'edit',   'Editar reservas',  'Reservas')
ON CONFLICT (code) DO NOTHING;

-- 3. Asignar a vendedor_basico los permisos que le faltan.
--    Permisos de citas: calendar.create, calendar.edit, calendar.update, calendar.delete
--    Permisos de reservas: reservations.view, reservations.create, reservations.edit
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
CROSS JOIN permissions p
WHERE r.name = 'vendedor_basico'
  AND p.code IN (
    'calendar.create',
    'calendar.edit',
    'calendar.update',
    'calendar.delete',
    'reservations.view',
    'reservations.create',
    'reservations.edit'
  )
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- Verificación manual (descomenta para comprobar tras aplicar):
-- SELECT p.code
-- FROM role_permissions rp
-- JOIN roles r ON r.id = rp.role_id
-- JOIN permissions p ON p.id = rp.permission_id
-- WHERE r.name = 'vendedor_basico'
-- ORDER BY p.code;
