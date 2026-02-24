-- =========================================================
-- SASTRERÍA PRATS — Migración 010
-- Roles v2: 5 roles operativos + permisos granulares nuevos
-- Crea tabla audit_log (nueva, append-only)
-- =========================================================

-- -------------------------
-- 1. LIMPIAR SISTEMA ANTIGUO
-- -------------------------
DELETE FROM role_permissions;
DELETE FROM user_roles;

-- Borrar roles antiguos (se reemplazarán)
DELETE FROM roles WHERE name IN (
  'super_admin','admin','accountant','tailor','salesperson','web_manager','manager'
);

-- Borrar permisos anteriores (se reemplazarán con nuevos códigos)
DELETE FROM permissions;

-- -------------------------
-- 2. ROLES NUEVOS (5 + client)
-- -------------------------
INSERT INTO roles (name, display_name, description, role_type, system_role, hierarchy_level, color, icon)
VALUES
  ('administrador',   'Administrador',      'Acceso total a toda la plataforma. Puede crear y gestionar usuarios.',          'system', 'admin',        0,   '#DC2626', 'shield'),
  ('sastre',          'Sastre',             'Solo consulta: clientes, pedidos, productos y stock.',                          'system', 'tailor',       30,  '#7C3AED', 'scissors'),
  ('sastre_plus',     'Sastre Plus',        'Consulta + TPV + edición de tienda online.',                                   'system', 'tailor',       25,  '#6D28D9', 'scissors'),
  ('vendedor_basico', 'Vendedor Básico',    'TPV, consulta de stock, clientes y etiquetas.',                                'system', 'salesperson',  40,  '#D97706', 'shopping-cart'),
  ('vendedor_avanzado','Vendedor Avanzado', 'TPV + crear/editar productos + modificar stock y precios.',                    'system', 'salesperson',  35,  '#B45309', 'shopping-bag'),
  ('client',          'Cliente',            'Cliente final. Acceso a su área personal, historial y estado de pedidos.',     'system', 'client',       100, '#6B7280', 'user')
ON CONFLICT (name) DO UPDATE SET
  display_name = EXCLUDED.display_name,
  description  = EXCLUDED.description,
  color        = EXCLUDED.color;

-- -------------------------
-- 3. PERMISOS GRANULARES
-- -------------------------
INSERT INTO permissions (code, module, action, display_name, description, category, sort_order) VALUES
  -- CLIENTES
  ('clients.view',            'clients', 'read',   'Ver clientes',         'Ver listado y fichas de clientes',          'Clientes',     10),
  ('clients.create',          'clients', 'create', 'Crear clientes',       'Dar de alta nuevos clientes',               'Clientes',     11),
  ('clients.edit',            'clients', 'update', 'Editar clientes',      'Modificar datos de clientes existentes',    'Clientes',     12),
  ('clients.delete',          'clients', 'delete', 'Eliminar clientes',    'Eliminar clientes del sistema',             'Clientes',     13),
  -- PEDIDOS / SASTRERÍA
  ('orders.view',             'orders',  'read',   'Ver pedidos',          'Ver listado y detalle de pedidos',          'Pedidos',      30),
  ('orders.create',           'orders',  'create', 'Crear pedidos',        'Iniciar nuevos pedidos de sastrería',       'Pedidos',      31),
  ('orders.edit',             'orders',  'update', 'Editar pedidos',       'Editar pedidos, cambiar estado',            'Pedidos',      32),
  ('orders.delete',           'orders',  'delete', 'Eliminar pedidos',     'Cancelar/eliminar pedidos',                 'Pedidos',      33),
  -- TPV / CAJA
  ('pos.access',              'pos',     'read',   'Acceder al TPV',       'Abrir el terminal punto de venta',          'TPV',          50),
  ('pos.open_session',        'pos',     'create', 'Abrir caja',           'Realizar apertura diaria de caja',          'TPV',          51),
  ('pos.close_session',       'pos',     'create', 'Cerrar caja',          'Realizar cierre de caja con arqueo',        'TPV',          52),
  ('pos.sell',                'pos',     'create', 'Realizar ventas',      'Cobrar en el TPV',                         'TPV',          53),
  -- PRODUCTOS
  ('products.view',           'products','read',   'Ver productos',        'Ver catálogo de productos',                 'Productos',    70),
  ('products.create',         'products','create', 'Crear productos',      'Dar de alta artículos en el catálogo',      'Productos',    71),
  ('products.edit',           'products','update', 'Editar productos',     'Editar nombre, descripción, imágenes',      'Productos',    72),
  ('products.edit_price',     'products','update', 'Modificar precios',    'Cambiar precios de venta de productos',     'Productos',    73),
  ('products.delete',         'products','delete', 'Eliminar productos',   'Eliminar productos del catálogo',           'Productos',    74),
  ('products.print_labels',   'products','create', 'Imprimir etiquetas',   'Generar e imprimir etiquetas de producto',  'Productos',    75),
  -- STOCK
  ('stock.view',              'stock',   'read',   'Ver stock',            'Ver niveles de stock',                      'Stock',        80),
  ('stock.edit',              'stock',   'update', 'Modificar stock',      'Ajustar cantidades, entradas, salidas',     'Stock',        81),
  ('stock.transfer',          'stock',   'create', 'Traspasos de stock',   'Traspasar stock entre almacenes',           'Stock',        82),
  -- TIENDA ONLINE
  ('shop.view',               'shop',    'read',   'Ver tienda online',    'Ver productos de la tienda online',         'Tienda Online',90),
  ('shop.edit',               'shop',    'update', 'Editar tienda online', 'Subir, bajar y editar productos online',    'Tienda Online',91),
  -- PROVEEDORES
  ('suppliers.view',          'suppliers','read',  'Ver proveedores',      'Ver proveedores y pedidos de compra',       'Proveedores',  100),
  ('suppliers.create',        'suppliers','create','Crear proveedores',    'Crear proveedores y pedidos',              'Proveedores',  101),
  ('suppliers.edit',          'suppliers','update','Editar proveedores',   'Editar proveedores y pedidos',             'Proveedores',  102),
  -- CONTABILIDAD
  ('accounting.view',         'accounting','read', 'Ver contabilidad',     'Ver diario, balance, IVA',                 'Contabilidad', 110),
  ('accounting.edit',         'accounting','update','Editar contabilidad', 'Crear asientos, modificar',                'Contabilidad', 111),
  -- INFORMES
  ('reports.view',            'reports', 'read',   'Ver informes',         'Ver informes y dashboards avanzados',       'Informes',     120),
  ('reports.export',          'reports', 'export', 'Exportar informes',    'Exportar informes PDF/Excel',              'Informes',     121),
  -- CALENDARIO
  ('calendar.view',           'calendar','read',   'Ver calendario',       'Ver citas',                                'Calendario',   130),
  ('calendar.edit',           'calendar','update', 'Editar calendario',    'Crear, editar y borrar citas',             'Calendario',   131),
  -- CMS / WEB
  ('cms.view',                'cms',     'read',   'Ver CMS',              'Ver contenido CMS',                        'CMS',          160),
  ('cms.edit',                'cms',     'update', 'Editar CMS',           'Editar páginas, blog, contenido web',      'CMS',          161),
  -- EMAILS
  ('emails.view',             'emails',  'read',   'Ver emails',           'Ver plantillas, campañas, historial',       'Emails',       150),
  ('emails.edit',             'emails',  'update', 'Editar emails',        'Crear/editar plantillas y campañas',        'Emails',       151),
  ('emails.send',             'emails',  'create', 'Enviar emails',        'Enviar campañas',                          'Emails',       152),
  -- CONFIGURACIÓN
  ('config.view',             'config',  'read',   'Ver configuración',    'Ver configuración del sistema',            'Config',       180),
  ('config.edit',             'config',  'update', 'Editar configuración', 'Editar configuración del sistema',         'Config',       181),
  ('config.users',            'config',  'update', 'Gestionar usuarios',   'Crear, editar y desactivar usuarios',      'Config',       182),
  -- MIGRACIÓN
  ('migration.access',        'migration','read',  'Migración de datos',   'Acceder al módulo de migración',           'Migración',    190),
  -- AUDITORÍA
  ('audit.view',              'audit',   'read',   'Ver auditoría',        'Ver historial de auditoría completo',       'Auditoría',    200);

-- -------------------------
-- 4. ASIGNAR PERMISOS A ROLES
-- -------------------------

-- ADMINISTRADOR: todos los permisos
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r CROSS JOIN permissions p
WHERE r.name = 'administrador';

-- SASTRE: solo consulta
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r JOIN permissions p ON TRUE
WHERE r.name = 'sastre'
AND p.code IN (
  'clients.view', 'orders.view', 'products.view', 'stock.view'
);

-- SASTRE PLUS: consulta + TPV + tienda online
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r JOIN permissions p ON TRUE
WHERE r.name = 'sastre_plus'
AND p.code IN (
  'clients.view', 'orders.view', 'products.view', 'stock.view',
  'pos.access', 'pos.open_session', 'pos.close_session', 'pos.sell',
  'products.print_labels',
  'shop.view', 'shop.edit'
);

-- VENDEDOR BÁSICO
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r JOIN permissions p ON TRUE
WHERE r.name = 'vendedor_basico'
AND p.code IN (
  'pos.access', 'pos.open_session', 'pos.close_session', 'pos.sell',
  'stock.view', 'clients.view', 'products.view', 'products.print_labels'
);

-- VENDEDOR AVANZADO
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r JOIN permissions p ON TRUE
WHERE r.name = 'vendedor_avanzado'
AND p.code IN (
  'pos.access', 'pos.open_session', 'pos.close_session', 'pos.sell',
  'stock.view', 'stock.edit', 'stock.transfer',
  'clients.view',
  'products.view', 'products.create', 'products.edit',
  'products.edit_price', 'products.print_labels'
);

-- -------------------------
-- 5. TABLA audit_log (append-only, diferente de audit_logs existente)
-- -------------------------
CREATE TABLE IF NOT EXISTS audit_log (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id      UUID REFERENCES profiles(id) ON DELETE SET NULL,
  user_name    TEXT NOT NULL DEFAULT 'Sistema',
  action       TEXT NOT NULL CHECK (action IN ('create','update','delete','login','logout')),
  entity_type  TEXT NOT NULL,
  entity_id    TEXT,
  entity_label TEXT,
  changes      JSONB,
  metadata     JSONB,
  store_id     UUID REFERENCES stores(id) ON DELETE SET NULL,
  created_at   TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_audit_log_entity ON audit_log(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_user   ON audit_log(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_date   ON audit_log(created_at DESC);

ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "audit_log_select" ON audit_log FOR SELECT
  USING (user_has_permission(auth.uid(), 'audit.view'));
CREATE POLICY "audit_log_insert" ON audit_log FOR INSERT WITH CHECK (TRUE);
