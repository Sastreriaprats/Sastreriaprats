-- 288 · Permiso para cambiar el PRECIO de una reserva
--
-- Petición de Teresa (sep-2026): Joaquín hace precios especiales a algunos
-- clientes y la reserva debe poder ajustarse al importe pactado. Editar la
-- reserva (notas, motivo, fecha) lo puede hacer cualquiera con
-- `reservations.edit` —incluido vendedor básico—, así que el precio va aparte
-- con su propio permiso: administrador y vendedor avanzado.
-- Para dárselo a otro rol (p. ej. sastre_plus, el rol de Joaquín) basta con
-- añadir su fila en role_permissions desde Configuración → Roles.

INSERT INTO permissions (code, module, action, display_name, description, category, sort_order, is_sensitive)
VALUES (
  'reservations.edit_price',
  'reservations',
  'update',
  'Modificar precios de reservas',
  'Cambiar el precio pactado de los artículos de una reserva',
  'Reservas',
  (SELECT COALESCE(MAX(sort_order), 0) + 1 FROM permissions WHERE module = 'reservations'),
  true
)
ON CONFLICT (code) DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
CROSS JOIN permissions p
WHERE p.code = 'reservations.edit_price'
  AND r.name IN ('administrador', 'vendedor_avanzado')
ON CONFLICT DO NOTHING;
