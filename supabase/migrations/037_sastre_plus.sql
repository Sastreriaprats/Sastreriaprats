-- Rol sastre_plus: permisos combinados de sastre + vendedor_basico (clientes, medidas, pedidos, productos, stock, TPV, cobros).
-- El rol puede existir ya en 010_roles_v2; aquí se asegura y se asignan permisos.

INSERT INTO roles (name, display_name, description)
VALUES ('sastre_plus', 'Sastre Plus', 'Sastre con acceso completo a tienda')
ON CONFLICT (name) DO UPDATE SET
  display_name = EXCLUDED.display_name,
  description = EXCLUDED.description;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
CROSS JOIN permissions p
WHERE r.name = 'sastre_plus'
AND p.code IN (
  'clients.view', 'clients.create', 'clients.edit',
  'clients.view_measurements', 'clients.edit_measurements',
  'orders.view', 'orders.create', 'orders.edit',
  'products.view', 'products.create', 'products.edit',
  'stock.view', 'stock.edit',
  'pos.access', 'pos.open_session', 'pos.close_session', 'pos.sell',
  'accounting.view'
)
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- ─── Usuario de prueba (opcional, ejecutar manualmente) ─────────────────────
-- 1. Si creaste antes sastrePlus@sastreriaprats.com: eliminarlo en Authentication → Users.
-- 2. Supabase Dashboard → Authentication → Users → Add user
--    Email: sastreplus@sastre.com, contraseña habitual del proyecto
-- 3. En SQL Editor:
--    INSERT INTO user_roles (user_id, role_id)
--    SELECT u.id, r.id FROM auth.users u
--    CROSS JOIN roles r WHERE u.email = 'sastreplus@sastre.com' AND r.name = 'sastre_plus';
