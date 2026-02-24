-- ==========================================
-- SASTRERÍA PRATS — Migración 001
-- Auth, Usuarios, Roles, Permisos, Tiendas, Almacenes, Auditoría
-- ==========================================

-- ========================================
-- 0. EXTENSIONES NECESARIAS
-- ========================================
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "pg_trgm"; -- Para búsqueda fuzzy

-- ========================================
-- 1. ENUMS
-- ========================================

-- Roles predefinidos del sistema
CREATE TYPE user_role_type AS ENUM (
  'super_admin',   -- Acceso total sin restricciones
  'admin',         -- Acceso total, puede ser restringido por super_admin
  'accountant',    -- Contabilidad, finanzas, facturación
  'tailor',        -- Sastre: pedidos sastrería, medidas, calendario
  'salesperson',   -- Vendedor: TPV, clientes, stock, ventas
  'web_manager',   -- Gestor web: CMS, tienda online, marketing
  'client'         -- Cliente final (web/app)
);

-- Estado de entidades
CREATE TYPE entity_status AS ENUM ('active', 'inactive', 'suspended');

-- Tipo de tienda
CREATE TYPE store_type AS ENUM ('physical', 'online', 'warehouse');

-- Tipo de acción de auditoría
CREATE TYPE audit_action AS ENUM (
  'create', 'read', 'update', 'delete',
  'login', 'logout', 'pin_login', 'pin_logout',
  'export', 'import', 'print',
  'approve', 'reject', 'cancel',
  'state_change', 'payment', 'refund'
);

-- Tipo de sesión
CREATE TYPE session_type AS ENUM ('web', 'admin', 'pos', 'mobile', 'api');

-- ========================================
-- 2. TABLA DE PERFILES (extiende auth.users)
-- ========================================
-- Cada usuario de Supabase Auth tiene un perfil asociado.
-- Un perfil puede tener múltiples roles (multi-rol).

CREATE TABLE profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  
  -- Datos personales
  email TEXT NOT NULL,
  full_name TEXT NOT NULL,
  first_name TEXT,
  last_name TEXT,
  avatar_url TEXT,
  phone TEXT,
  
  -- Configuración
  preferred_locale TEXT DEFAULT 'es' CHECK (preferred_locale IN ('es', 'en', 'fr', 'de', 'it')),
  dark_mode BOOLEAN DEFAULT FALSE,
  
  -- PIN para acceso rápido TPV (hash bcrypt)
  pin_hash TEXT,
  
  -- Estado
  is_active BOOLEAN DEFAULT TRUE NOT NULL,
  status entity_status DEFAULT 'active' NOT NULL,
  deactivated_at TIMESTAMPTZ,
  deactivation_reason TEXT,
  
  -- Metadata
  last_login_at TIMESTAMPTZ,
  last_login_ip TEXT,
  last_login_device TEXT,
  login_count INTEGER DEFAULT 0,
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- Índices para búsqueda rápida
CREATE INDEX idx_profiles_email ON profiles(email);
CREATE INDEX idx_profiles_full_name ON profiles USING gin(full_name gin_trgm_ops);
CREATE INDEX idx_profiles_phone ON profiles(phone);
CREATE INDEX idx_profiles_is_active ON profiles(is_active);
CREATE INDEX idx_profiles_status ON profiles(status);

-- ========================================
-- 3. TABLA DE ROLES
-- ========================================

CREATE TABLE roles (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  
  -- Identificación
  name TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  description TEXT,
  
  -- Tipo: 'system' para los predefinidos, 'custom' para los creados por admin
  role_type TEXT DEFAULT 'custom' CHECK (role_type IN ('system', 'custom')),
  
  -- Rol base del enum (para roles del sistema)
  system_role user_role_type,
  
  -- Jerarquía (0 = máximo poder, mayor número = menos permisos)
  hierarchy_level INTEGER DEFAULT 50 NOT NULL,
  
  -- Estado
  is_active BOOLEAN DEFAULT TRUE NOT NULL,
  
  -- Color para UI
  color TEXT DEFAULT '#6B7280',
  icon TEXT DEFAULT 'user',
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE INDEX idx_roles_name ON roles(name);
CREATE INDEX idx_roles_system_role ON roles(system_role);
CREATE INDEX idx_roles_is_active ON roles(is_active);

-- ========================================
-- 4. TABLA DE PERMISOS
-- ========================================

CREATE TABLE permissions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  
  -- Identificación
  code TEXT NOT NULL UNIQUE,
  module TEXT NOT NULL,
  action TEXT NOT NULL,
  display_name TEXT NOT NULL,
  description TEXT,
  
  -- Agrupación para UI
  category TEXT NOT NULL,
  sort_order INTEGER DEFAULT 0,
  
  -- Permisos sensibles requieren confirmación
  is_sensitive BOOLEAN DEFAULT FALSE,
  
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE INDEX idx_permissions_code ON permissions(code);
CREATE INDEX idx_permissions_module ON permissions(module);
CREATE INDEX idx_permissions_category ON permissions(category);

-- ========================================
-- 5. TABLA ROLE_PERMISSIONS (N:M)
-- ========================================

CREATE TABLE role_permissions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  role_id UUID NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  permission_id UUID NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,
  
  granted_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  granted_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  
  UNIQUE(role_id, permission_id)
);

CREATE INDEX idx_role_permissions_role ON role_permissions(role_id);
CREATE INDEX idx_role_permissions_permission ON role_permissions(permission_id);

-- ========================================
-- 6. TABLA USER_ROLES (N:M)
-- ========================================

CREATE TABLE user_roles (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  role_id UUID NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  
  assigned_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  assigned_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  
  valid_from TIMESTAMPTZ DEFAULT NOW(),
  valid_until TIMESTAMPTZ,
  
  UNIQUE(user_id, role_id)
);

CREATE INDEX idx_user_roles_user ON user_roles(user_id);
CREATE INDEX idx_user_roles_role ON user_roles(role_id);

-- ========================================
-- 7. TIENDAS
-- ========================================

CREATE TABLE stores (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  
  code VARCHAR(10) NOT NULL UNIQUE,
  name TEXT NOT NULL,
  display_name TEXT,
  store_type store_type DEFAULT 'physical' NOT NULL,
  
  address TEXT,
  address_line2 TEXT,
  city TEXT DEFAULT 'Madrid',
  postal_code TEXT,
  province TEXT DEFAULT 'Madrid',
  country TEXT DEFAULT 'España',
  phone TEXT,
  email TEXT,
  
  opening_hours JSONB DEFAULT '{}'::jsonb,
  
  latitude DECIMAL(10, 8),
  longitude DECIMAL(11, 8),
  google_maps_url TEXT,
  
  default_cash_fund DECIMAL(10, 2) DEFAULT 300.00,
  
  fiscal_name TEXT,
  fiscal_nif TEXT,
  fiscal_address TEXT,
  
  invoice_prefix TEXT,
  order_prefix TEXT,
  last_order_number INTEGER DEFAULT 0,
  last_invoice_number INTEGER DEFAULT 0,
  
  slug TEXT UNIQUE,
  description TEXT,
  image_url TEXT,
  
  is_active BOOLEAN DEFAULT TRUE NOT NULL,
  status entity_status DEFAULT 'active' NOT NULL,
  
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE INDEX idx_stores_code ON stores(code);
CREATE INDEX idx_stores_type ON stores(store_type);
CREATE INDEX idx_stores_is_active ON stores(is_active);
CREATE INDEX idx_stores_slug ON stores(slug);

-- ========================================
-- 8. ALMACENES
-- ========================================

CREATE TABLE warehouses (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  
  code VARCHAR(10) NOT NULL UNIQUE,
  name TEXT NOT NULL,
  
  store_id UUID REFERENCES stores(id) ON DELETE SET NULL,
  
  address TEXT,
  city TEXT,
  
  is_main BOOLEAN DEFAULT FALSE,
  accepts_online_stock BOOLEAN DEFAULT FALSE,
  
  is_active BOOLEAN DEFAULT TRUE NOT NULL,
  
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE INDEX idx_warehouses_code ON warehouses(code);
CREATE INDEX idx_warehouses_store ON warehouses(store_id);
CREATE INDEX idx_warehouses_is_active ON warehouses(is_active);

-- ========================================
-- 9. ASIGNACIÓN USUARIO-TIENDA
-- ========================================

CREATE TABLE user_stores (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  store_id UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  
  is_primary BOOLEAN DEFAULT FALSE,
  
  assigned_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  assigned_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  
  UNIQUE(user_id, store_id)
);

CREATE INDEX idx_user_stores_user ON user_stores(user_id);
CREATE INDEX idx_user_stores_store ON user_stores(store_id);

-- ========================================
-- 10. SESIONES ACTIVAS
-- ========================================

CREATE TABLE active_sessions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  
  session_type session_type NOT NULL,
  store_id UUID REFERENCES stores(id) ON DELETE SET NULL,
  
  ip_address TEXT,
  user_agent TEXT,
  device_info TEXT,
  
  started_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  last_activity_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  
  is_active BOOLEAN DEFAULT TRUE NOT NULL
);

CREATE INDEX idx_active_sessions_user ON active_sessions(user_id);
CREATE INDEX idx_active_sessions_active ON active_sessions(is_active) WHERE is_active = TRUE;
CREATE INDEX idx_active_sessions_store ON active_sessions(store_id);

-- ========================================
-- 11. LOG DE AUDITORÍA
-- ========================================

CREATE TABLE audit_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  
  user_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  user_email TEXT,
  user_full_name TEXT,
  
  store_id UUID REFERENCES stores(id) ON DELETE SET NULL,
  session_type session_type,
  ip_address TEXT,
  user_agent TEXT,
  
  action audit_action NOT NULL,
  module TEXT NOT NULL,
  entity_type TEXT,
  entity_id UUID,
  entity_display TEXT,
  
  description TEXT,
  old_data JSONB,
  new_data JSONB,
  metadata JSONB,
  
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE INDEX idx_audit_logs_user ON audit_logs(user_id);
CREATE INDEX idx_audit_logs_action ON audit_logs(action);
CREATE INDEX idx_audit_logs_module ON audit_logs(module);
CREATE INDEX idx_audit_logs_entity ON audit_logs(entity_type, entity_id);
CREATE INDEX idx_audit_logs_created ON audit_logs(created_at DESC);
CREATE INDEX idx_audit_logs_store ON audit_logs(store_id);
CREATE INDEX idx_audit_logs_module_action ON audit_logs(module, action, created_at DESC);
-- Índice por mes en UTC (expresión inmutable; date_trunc sobre timestamptz no lo es)
CREATE INDEX idx_audit_logs_monthly ON audit_logs(date_trunc('month', (created_at AT TIME ZONE 'UTC')));

-- ========================================
-- 12. CONFIGURACIÓN GLOBAL DEL SISTEMA
-- ========================================

CREATE TABLE system_config (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  
  key TEXT NOT NULL UNIQUE,
  value JSONB NOT NULL,
  
  category TEXT NOT NULL,
  display_name TEXT NOT NULL,
  description TEXT,
  value_type TEXT NOT NULL CHECK (value_type IN ('string', 'number', 'boolean', 'json', 'array')),
  
  is_required BOOLEAN DEFAULT FALSE,
  default_value JSONB,
  
  is_sensitive BOOLEAN DEFAULT FALSE,
  requires_admin BOOLEAN DEFAULT TRUE,
  
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_by UUID REFERENCES profiles(id) ON DELETE SET NULL
);

CREATE INDEX idx_system_config_key ON system_config(key);
CREATE INDEX idx_system_config_category ON system_config(category);

-- ========================================
-- 13. NOTIFICACIONES INTERNAS
-- ========================================

CREATE TABLE notifications (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN (
    'info', 'warning', 'error', 'success',
    'order_update', 'stock_alert', 'payment_due',
    'appointment', 'system'
  )),
  
  link TEXT,
  
  module TEXT,
  entity_type TEXT,
  entity_id UUID,
  
  is_read BOOLEAN DEFAULT FALSE NOT NULL,
  read_at TIMESTAMPTZ,
  
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE INDEX idx_notifications_user ON notifications(user_id);
CREATE INDEX idx_notifications_unread ON notifications(user_id, is_read) WHERE is_read = FALSE;
CREATE INDEX idx_notifications_created ON notifications(created_at DESC);

-- ========================================
-- 14. DATOS INICIALES (SEED)
-- ========================================

INSERT INTO roles (name, display_name, description, role_type, system_role, hierarchy_level, color, icon) VALUES
  ('super_admin', 'Super Administrador', 'Acceso total sin ninguna restricción. Puede gestionar otros administradores.', 'system', 'super_admin', 0, '#DC2626', 'shield'),
  ('admin', 'Administrador', 'Acceso total a todas las funcionalidades del sistema.', 'system', 'admin', 10, '#2563EB', 'shield-check'),
  ('accountant', 'Contabilidad', 'Acceso a contabilidad, facturación, finanzas, costes y rentabilidad.', 'system', 'accountant', 20, '#059669', 'calculator'),
  ('tailor', 'Sastre', 'Gestión de pedidos de sastrería, medidas, fichas técnicas, calendario de pruebas.', 'system', 'tailor', 30, '#7C3AED', 'scissors'),
  ('salesperson', 'Vendedor', 'TPV, ventas, atención al cliente, stock, traspasos, cierre de caja.', 'system', 'salesperson', 40, '#D97706', 'shopping-cart'),
  ('web_manager', 'Gestor Web', 'Gestión de la web pública, tienda online, CMS, marketing, campañas email.', 'system', 'web_manager', 35, '#0891B2', 'globe'),
  ('client', 'Cliente', 'Cliente final. Acceso a su área personal, historial y estado de pedidos.', 'system', 'client', 100, '#6B7280', 'user');

-- Permisos (solo los INSERT de permissions - resumido en bloques)
INSERT INTO permissions (code, module, action, display_name, description, category, sort_order) VALUES
  ('dashboard.view', 'dashboard', 'read', 'Ver dashboard', 'Acceder al dashboard principal con resumen', 'Dashboard', 1),
  ('dashboard.view_all_stores', 'dashboard', 'read', 'Ver todas las tiendas', 'Ver métricas consolidadas de todas las tiendas', 'Dashboard', 2),
  ('dashboard.view_financials', 'dashboard', 'read', 'Ver datos financieros', 'Ver ingresos, márgenes y datos sensibles en dashboard', 'Dashboard', 3);

INSERT INTO permissions (code, module, action, display_name, description, category, sort_order) VALUES
  ('clients.create', 'clients', 'create', 'Crear clientes', 'Dar de alta nuevos clientes', 'Clientes', 10),
  ('clients.read', 'clients', 'read', 'Ver clientes', 'Consultar fichas de clientes', 'Clientes', 11),
  ('clients.update', 'clients', 'update', 'Editar clientes', 'Modificar datos de clientes existentes', 'Clientes', 12),
  ('clients.delete', 'clients', 'delete', 'Eliminar clientes', 'Eliminar clientes del sistema', 'Clientes', 13),
  ('clients.view_balance', 'clients', 'read', 'Ver saldo cliente', 'Ver deuda pendiente y pagos del cliente', 'Clientes', 14),
  ('clients.view_measurements', 'clients', 'read', 'Ver medidas', 'Consultar medidas corporales del cliente', 'Clientes', 15),
  ('clients.edit_measurements', 'clients', 'update', 'Editar medidas', 'Tomar y modificar medidas del cliente', 'Clientes', 16),
  ('clients.view_history', 'clients', 'read', 'Ver historial', 'Consultar historial completo de compras', 'Clientes', 17),
  ('clients.send_email', 'clients', 'create', 'Enviar email a cliente', 'Enviar emails directamente desde la ficha', 'Clientes', 18),
  ('clients.export', 'clients', 'export', 'Exportar clientes', 'Exportar datos de clientes a CSV/Excel', 'Clientes', 19),
  ('clients.import', 'clients', 'create', 'Importar clientes', 'Importar clientes masivamente desde CSV/Excel', 'Clientes', 20),
  ('clients.view_notes', 'clients', 'read', 'Ver notas internas', 'Consultar notas internas del cliente', 'Clientes', 21),
  ('clients.add_notes', 'clients', 'create', 'Añadir notas', 'Añadir notas internas a la ficha del cliente', 'Clientes', 22),
  ('clients.manage_tags', 'clients', 'update', 'Gestionar etiquetas', 'Crear, editar y asignar etiquetas a clientes', 'Clientes', 23),
  ('clients.manage_categories', 'clients', 'update', 'Gestionar categorías VIP', 'Asignar categoría VIP/premium a clientes', 'Clientes', 24);

INSERT INTO permissions (code, module, action, display_name, description, category, sort_order) VALUES
  ('orders.create', 'orders', 'create', 'Crear pedidos sastrería', 'Iniciar nuevos pedidos de sastrería', 'Pedidos Sastrería', 30),
  ('orders.read', 'orders', 'read', 'Ver pedidos', 'Consultar pedidos de sastrería', 'Pedidos Sastrería', 31),
  ('orders.update', 'orders', 'update', 'Editar pedidos', 'Modificar datos de pedidos existentes', 'Pedidos Sastrería', 32),
  ('orders.delete', 'orders', 'delete', 'Eliminar pedidos', 'Cancelar/eliminar pedidos', 'Pedidos Sastrería', 33),
  ('orders.change_state', 'orders', 'update', 'Cambiar estado', 'Avanzar o retroceder el estado de un pedido', 'Pedidos Sastrería', 34),
  ('orders.view_cost', 'orders', 'read', 'Ver costes', 'Ver precio de coste y márgenes de los pedidos', 'Pedidos Sastrería', 35),
  ('orders.generate_technical_sheet', 'orders', 'create', 'Generar ficha técnica', 'Generar y descargar ficha técnica PDF', 'Pedidos Sastrería', 36),
  ('orders.send_to_supplier', 'orders', 'create', 'Enviar a proveedor', 'Enviar pedido al proveedor por email', 'Pedidos Sastrería', 37),
  ('orders.manage_fittings', 'orders', 'update', 'Gestionar pruebas', 'Programar y registrar pruebas de sastrería', 'Pedidos Sastrería', 38),
  ('orders.attach_photos', 'orders', 'update', 'Adjuntar fotos', 'Subir fotos a pruebas y pedidos', 'Pedidos Sastrería', 39),
  ('orders.register_incident', 'orders', 'create', 'Registrar incidencia', 'Registrar errores y crear pedidos vinculados', 'Pedidos Sastrería', 40),
  ('orders.view_profitability', 'orders', 'read', 'Ver rentabilidad', 'Ver cálculo de rentabilidad del pedido', 'Pedidos Sastrería', 41),
  ('orders.modify_closed', 'orders', 'update', 'Modificar pedidos cerrados', 'Editar pedidos ya entregados (retroactivo)', 'Pedidos Sastrería', 42);

INSERT INTO permissions (code, module, action, display_name, description, category, sort_order) VALUES
  ('pos.access', 'pos', 'read', 'Acceder al TPV', 'Abrir el terminal punto de venta', 'TPV / Caja', 50),
  ('pos.sell', 'pos', 'create', 'Realizar ventas', 'Cobrar en el TPV', 'TPV / Caja', 51),
  ('pos.apply_discount', 'pos', 'update', 'Aplicar descuentos', 'Aplicar descuentos a ventas', 'TPV / Caja', 52),
  ('pos.refund', 'pos', 'create', 'Hacer devoluciones', 'Procesar cambios y generar vales', 'TPV / Caja', 53),
  ('pos.open_cash', 'pos', 'create', 'Apertura de caja', 'Realizar apertura diaria de caja', 'TPV / Caja', 54),
  ('pos.close_cash', 'pos', 'create', 'Cierre de caja', 'Realizar cierre de caja con cuadre', 'TPV / Caja', 55),
  ('pos.cash_withdrawal', 'pos', 'create', 'Retirada de efectivo', 'Retirar efectivo parcial durante el día', 'TPV / Caja', 56),
  ('pos.view_cash_history', 'pos', 'read', 'Ver historial de caja', 'Consultar movimientos de caja del día', 'TPV / Caja', 57),
  ('pos.generate_voucher', 'pos', 'create', 'Generar vales', 'Crear vales/gift cards canjeables', 'TPV / Caja', 58),
  ('pos.collect_deposit', 'pos', 'create', 'Cobrar señas', 'Registrar anticipos de pedidos sastrería', 'TPV / Caja', 59),
  ('pos.tax_free', 'pos', 'create', 'Gestionar Tax Free', 'Procesar ventas con Tax Free', 'TPV / Caja', 60),
  ('pos.generate_invoice', 'pos', 'create', 'Generar facturas', 'Emitir facturas completas desde TPV', 'TPV / Caja', 61),
  ('pos.void_ticket', 'pos', 'delete', 'Anular tickets', 'Anular tickets/ventas ya registradas', 'TPV / Caja', 62);

INSERT INTO permissions (code, module, action, display_name, description, category, sort_order) VALUES
  ('stock.create_product', 'stock', 'create', 'Crear productos', 'Dar de alta artículos en el catálogo', 'Stock', 70),
  ('stock.read', 'stock', 'read', 'Ver stock', 'Consultar stock de la tienda actual', 'Stock', 71),
  ('stock.update_product', 'stock', 'update', 'Editar productos', 'Modificar datos de productos', 'Stock', 72),
  ('stock.delete_product', 'stock', 'delete', 'Eliminar productos', 'Eliminar productos del catálogo', 'Stock', 73),
  ('stock.view_all_stores', 'stock', 'read', 'Ver stock todas las tiendas', 'Consultar stock de otras tiendas en tiempo real', 'Stock', 74),
  ('stock.transfer', 'stock', 'create', 'Traspasos entre tiendas', 'Iniciar traspasos de mercancía', 'Stock', 75),
  ('stock.approve_transfer', 'stock', 'update', 'Aprobar traspasos', 'Autorizar traspasos de stock', 'Stock', 76),
  ('stock.adjust', 'stock', 'update', 'Ajustar stock', 'Ajustar cantidades (inventario, rotura, pérdida)', 'Stock', 77),
  ('stock.inventory', 'stock', 'update', 'Realizar inventario', 'Hacer recuento de inventario', 'Stock', 78),
  ('stock.modify_price', 'stock', 'update', 'Modificar precios', 'Cambiar precios de venta de productos', 'Stock', 79),
  ('stock.view_cost', 'stock', 'read', 'Ver precios de coste', 'Ver precio de compra de los productos', 'Stock', 80),
  ('stock.generate_labels', 'stock', 'create', 'Generar etiquetas', 'Crear etiquetas con código de barras', 'Stock', 81),
  ('stock.manage_categories', 'stock', 'update', 'Gestionar categorías', 'Crear/editar categorías y subcategorías', 'Stock', 82),
  ('stock.export', 'stock', 'export', 'Exportar stock', 'Exportar datos de stock a CSV/Excel', 'Stock', 83),
  ('stock.import', 'stock', 'create', 'Importar stock', 'Importar productos masivamente', 'Stock', 84);

INSERT INTO permissions (code, module, action, display_name, description, category, sort_order) VALUES
  ('suppliers.create', 'suppliers', 'create', 'Crear proveedores', 'Dar de alta nuevos proveedores', 'Proveedores', 90),
  ('suppliers.read', 'suppliers', 'read', 'Ver proveedores', 'Consultar fichas de proveedores', 'Proveedores', 91),
  ('suppliers.update', 'suppliers', 'update', 'Editar proveedores', 'Modificar datos de proveedores', 'Proveedores', 92),
  ('suppliers.delete', 'suppliers', 'delete', 'Eliminar proveedores', 'Eliminar proveedores del sistema', 'Proveedores', 93),
  ('suppliers.create_order', 'suppliers', 'create', 'Crear pedido a proveedor', 'Generar pedidos de compra', 'Proveedores', 94),
  ('suppliers.send_order', 'suppliers', 'create', 'Enviar pedido', 'Enviar pedido por email al proveedor', 'Proveedores', 95),
  ('suppliers.receive_goods', 'suppliers', 'update', 'Recepcionar mercancía', 'Registrar entrada de mercancía', 'Proveedores', 96),
  ('suppliers.register_invoice', 'suppliers', 'create', 'Registrar factura proveedor', 'Registrar facturas recibidas', 'Proveedores', 97),
  ('suppliers.register_payment', 'suppliers', 'create', 'Registrar pago a proveedor', 'Registrar pagos realizados', 'Proveedores', 98),
  ('suppliers.view_balance', 'suppliers', 'read', 'Ver saldo proveedor', 'Consultar deuda con proveedores', 'Proveedores', 99),
  ('suppliers.modify_payment_terms', 'suppliers', 'update', 'Modificar condiciones pago', 'Cambiar condiciones de pago del proveedor', 'Proveedores', 100);

INSERT INTO permissions (code, module, action, display_name, description, category, sort_order, is_sensitive) VALUES
  ('accounting.access', 'accounting', 'read', 'Acceder a contabilidad', 'Abrir el módulo de contabilidad', 'Contabilidad', 110, TRUE),
  ('accounting.view_entries', 'accounting', 'read', 'Ver asientos', 'Consultar asientos contables', 'Contabilidad', 111, TRUE),
  ('accounting.create_entry', 'accounting', 'create', 'Crear asientos', 'Registrar asientos contables manuales', 'Contabilidad', 112, TRUE),
  ('accounting.modify_entry', 'accounting', 'update', 'Modificar asientos', 'Editar asientos contables existentes', 'Contabilidad', 113, TRUE),
  ('accounting.view_books', 'accounting', 'read', 'Ver libros contables', 'Consultar libro diario, mayor, balances', 'Contabilidad', 114, TRUE),
  ('accounting.close_period', 'accounting', 'update', 'Cerrar periodo', 'Realizar cierre contable mensual/anual', 'Contabilidad', 115, TRUE),
  ('accounting.manage_chart', 'accounting', 'update', 'Gestionar plan contable', 'Editar el árbol de cuentas', 'Contabilidad', 116, TRUE),
  ('accounting.view_profitability', 'accounting', 'read', 'Ver rentabilidad', 'Ver rentabilidad por cliente/proveedor/tienda', 'Contabilidad', 117, TRUE),
  ('accounting.manage_invoices', 'accounting', 'update', 'Gestionar facturas', 'Emitir, anular y rectificar facturas', 'Contabilidad', 118, TRUE),
  ('accounting.export', 'accounting', 'export', 'Exportar contabilidad', 'Exportar datos contables a CSV/Excel', 'Contabilidad', 119, TRUE),
  ('accounting.manage_expenses', 'accounting', 'create', 'Gestionar gastos', 'Registrar gastos internos', 'Contabilidad', 120, TRUE),
  ('accounting.view_cash_flow', 'accounting', 'read', 'Ver flujo de caja', 'Consultar entradas y salidas', 'Contabilidad', 121, TRUE);

INSERT INTO permissions (code, module, action, display_name, description, category, sort_order) VALUES
  ('calendar.view', 'calendar', 'read', 'Ver calendario', 'Consultar citas y eventos', 'Calendario', 130),
  ('calendar.create', 'calendar', 'create', 'Crear citas', 'Programar citas de pruebas y entregas', 'Calendario', 131),
  ('calendar.update', 'calendar', 'update', 'Editar citas', 'Modificar citas existentes', 'Calendario', 132),
  ('calendar.delete', 'calendar', 'delete', 'Eliminar citas', 'Cancelar citas programadas', 'Calendario', 133),
  ('calendar.view_all', 'calendar', 'read', 'Ver calendario completo', 'Ver citas de todos los sastres y tiendas', 'Calendario', 134),
  ('calendar.block_time', 'calendar', 'create', 'Bloquear horarios', 'Bloquear horas (comida, festivos)', 'Calendario', 135);

INSERT INTO permissions (code, module, action, display_name, description, category, sort_order) VALUES
  ('reporting.view', 'reporting', 'read', 'Ver informes', 'Acceder a informes y analíticas', 'Reporting', 140),
  ('reporting.view_sales', 'reporting', 'read', 'Ver informes de ventas', 'Informes de ventas por vendedor/tienda', 'Reporting', 141),
  ('reporting.view_financials', 'reporting', 'read', 'Ver informes financieros', 'Rentabilidad, márgenes, flujo caja', 'Reporting', 142),
  ('reporting.view_commissions', 'reporting', 'read', 'Ver comisiones', 'Ver comisiones de vendedores', 'Reporting', 143),
  ('reporting.export', 'reporting', 'export', 'Exportar informes', 'Descargar informes en Excel/CSV/PDF', 'Reporting', 144);

INSERT INTO permissions (code, module, action, display_name, description, category, sort_order) VALUES
  ('emails.view', 'emails', 'read', 'Ver emails', 'Consultar historial de emails enviados', 'Emails', 150),
  ('emails.send', 'emails', 'create', 'Enviar emails', 'Enviar emails individuales', 'Emails', 151),
  ('emails.manage_templates', 'emails', 'update', 'Gestionar plantillas', 'Crear y editar plantillas de email', 'Emails', 152),
  ('emails.send_campaign', 'emails', 'create', 'Enviar campañas', 'Lanzar campañas de email masivo', 'Emails', 153),
  ('emails.view_analytics', 'emails', 'read', 'Ver analíticas email', 'Ver métricas de apertura y clics', 'Emails', 154),
  ('emails.manage_lists', 'emails', 'update', 'Gestionar listas', 'Crear y segmentar listas de contactos', 'Emails', 155);

INSERT INTO permissions (code, module, action, display_name, description, category, sort_order) VALUES
  ('cms.view', 'cms', 'read', 'Ver CMS', 'Acceder al gestor de contenidos', 'Web / CMS', 160),
  ('cms.edit_pages', 'cms', 'update', 'Editar páginas', 'Modificar textos e imágenes de la web', 'Web / CMS', 161),
  ('cms.create_pages', 'cms', 'create', 'Crear páginas', 'Crear nuevas páginas en la web', 'Web / CMS', 162),
  ('cms.manage_menu', 'cms', 'update', 'Gestionar menú', 'Editar la navegación de la web', 'Web / CMS', 163),
  ('cms.manage_blog', 'cms', 'update', 'Gestionar blog', 'Crear y editar artículos del blog', 'Web / CMS', 164),
  ('cms.manage_banners', 'cms', 'update', 'Gestionar banners', 'Editar banners y popups', 'Web / CMS', 165),
  ('cms.manage_products_web', 'cms', 'update', 'Gestionar catálogo web', 'Elegir qué productos se muestran online', 'Web / CMS', 166),
  ('cms.manage_seo', 'cms', 'update', 'Gestionar SEO', 'Editar meta titles, descriptions, URLs', 'Web / CMS', 167),
  ('cms.manage_translations', 'cms', 'update', 'Gestionar traducciones', 'Editar traducciones de la web', 'Web / CMS', 168),
  ('cms.publish', 'cms', 'update', 'Publicar cambios', 'Publicar contenido en la web', 'Web / CMS', 169),
  ('cms.manage_online_orders', 'cms', 'update', 'Gestionar pedidos online', 'Procesar pedidos de la tienda online', 'Web / CMS', 170);

INSERT INTO permissions (code, module, action, display_name, description, category, sort_order, is_sensitive) VALUES
  ('config.access', 'config', 'read', 'Acceder a configuración', 'Abrir la sección de configuración', 'Configuración', 180, TRUE),
  ('config.manage_users', 'config', 'update', 'Gestionar usuarios', 'Crear, editar, desactivar usuarios', 'Configuración', 181, TRUE),
  ('config.manage_roles', 'config', 'update', 'Gestionar roles', 'Crear y editar roles con permisos', 'Configuración', 182, TRUE),
  ('config.manage_stores', 'config', 'update', 'Gestionar tiendas', 'Crear y configurar tiendas/almacenes', 'Configuración', 183, TRUE),
  ('config.manage_payment_methods', 'config', 'update', 'Gestionar métodos pago', 'Activar/desactivar métodos de pago', 'Configuración', 184, TRUE),
  ('config.manage_tax', 'config', 'update', 'Gestionar impuestos', 'Configurar tipos de IVA', 'Configuración', 185, TRUE),
  ('config.manage_invoice_series', 'config', 'update', 'Gestionar series facturación', 'Configurar series de numeración', 'Configuración', 186, TRUE),
  ('config.manage_order_states', 'config', 'update', 'Gestionar estados pedido', 'Añadir, quitar, renombrar estados', 'Configuración', 187, TRUE),
  ('config.manage_garment_types', 'config', 'update', 'Gestionar tipos prenda', 'Crear tipos de prenda con campos de medidas', 'Configuración', 188, TRUE),
  ('config.manage_measurement_fields', 'config', 'update', 'Gestionar campos medidas', 'Definir qué medidas tiene cada prenda', 'Configuración', 189, TRUE),
  ('config.view_audit_log', 'config', 'read', 'Ver log auditoría', 'Consultar registro completo de actividad', 'Configuración', 190, TRUE),
  ('config.import_export', 'config', 'update', 'Importar/Exportar datos', 'Importación y exportación masiva', 'Configuración', 191, TRUE),
  ('config.manage_alerts', 'config', 'update', 'Configurar alertas', 'Definir umbrales de stock y alertas', 'Configuración', 192, TRUE);

-- Asignar permisos a roles
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r CROSS JOIN permissions p WHERE r.name = 'super_admin';

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r CROSS JOIN permissions p WHERE r.name = 'admin';

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r CROSS JOIN permissions p WHERE r.name = 'accountant'
AND p.code IN (
  'dashboard.view', 'dashboard.view_all_stores', 'dashboard.view_financials',
  'clients.read', 'clients.view_balance', 'clients.view_history', 'clients.export',
  'orders.read', 'orders.view_cost', 'orders.view_profitability',
  'pos.view_cash_history',
  'stock.read', 'stock.view_all_stores', 'stock.view_cost', 'stock.export',
  'suppliers.read', 'suppliers.view_balance', 'suppliers.register_invoice', 'suppliers.register_payment', 'suppliers.modify_payment_terms',
  'accounting.access', 'accounting.view_entries', 'accounting.create_entry', 'accounting.modify_entry',
  'accounting.view_books', 'accounting.close_period', 'accounting.manage_chart',
  'accounting.view_profitability', 'accounting.manage_invoices', 'accounting.export',
  'accounting.manage_expenses', 'accounting.view_cash_flow',
  'reporting.view', 'reporting.view_sales', 'reporting.view_financials', 'reporting.view_commissions', 'reporting.export'
);

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r CROSS JOIN permissions p WHERE r.name = 'tailor'
AND p.code IN (
  'dashboard.view',
  'clients.create', 'clients.read', 'clients.update', 'clients.view_balance',
  'clients.view_measurements', 'clients.edit_measurements', 'clients.view_history',
  'clients.view_notes', 'clients.add_notes', 'clients.manage_tags',
  'orders.create', 'orders.read', 'orders.update', 'orders.change_state',
  'orders.view_cost', 'orders.generate_technical_sheet', 'orders.send_to_supplier',
  'orders.manage_fittings', 'orders.attach_photos', 'orders.register_incident',
  'orders.view_profitability',
  'pos.access', 'pos.sell', 'pos.apply_discount', 'pos.collect_deposit',
  'stock.read', 'stock.view_all_stores', 'stock.create_product',
  'suppliers.read', 'suppliers.create_order', 'suppliers.send_order', 'suppliers.receive_goods',
  'calendar.view', 'calendar.create', 'calendar.update', 'calendar.delete', 'calendar.view_all', 'calendar.block_time'
);

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r CROSS JOIN permissions p WHERE r.name = 'salesperson'
AND p.code IN (
  'dashboard.view',
  'clients.create', 'clients.read', 'clients.update', 'clients.view_balance',
  'clients.view_measurements', 'clients.view_history',
  'clients.view_notes', 'clients.add_notes', 'clients.manage_tags',
  'orders.read',
  'pos.access', 'pos.sell', 'pos.apply_discount', 'pos.refund',
  'pos.open_cash', 'pos.close_cash', 'pos.cash_withdrawal', 'pos.view_cash_history',
  'pos.generate_voucher', 'pos.collect_deposit', 'pos.tax_free', 'pos.generate_invoice',
  'stock.create_product', 'stock.read', 'stock.update_product', 'stock.view_all_stores',
  'stock.transfer', 'stock.modify_price', 'stock.generate_labels',
  'stock.manage_categories', 'stock.inventory',
  'reporting.view', 'reporting.view_sales'
);

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r CROSS JOIN permissions p WHERE r.name = 'web_manager'
AND p.code IN (
  'dashboard.view',
  'stock.read', 'stock.view_all_stores',
  'cms.view', 'cms.edit_pages', 'cms.create_pages', 'cms.manage_menu',
  'cms.manage_blog', 'cms.manage_banners', 'cms.manage_products_web',
  'cms.manage_seo', 'cms.manage_translations', 'cms.publish', 'cms.manage_online_orders',
  'emails.view', 'emails.send', 'emails.manage_templates', 'emails.send_campaign',
  'emails.view_analytics', 'emails.manage_lists',
  'reporting.view'
);

-- Tiendas y almacenes iniciales
INSERT INTO stores (code, name, display_name, store_type, city, postal_code, province, country, order_prefix, slug, is_active) VALUES
  ('PIN', 'Hernán Pinzón', 'Pinzón', 'physical', 'Madrid', '28006', 'Madrid', 'España', 'PIN', 'hernan-pinzon', TRUE),
  ('WEL', 'Wellington', 'Wellington', 'physical', 'Madrid', '28001', 'Madrid', 'España', 'WEL', 'wellington', TRUE),
  ('WEB', 'Tienda Online', 'Online', 'online', 'Madrid', NULL, 'Madrid', 'España', 'WEB', 'online', TRUE);

INSERT INTO warehouses (code, name, store_id, is_main, accepts_online_stock, is_active)
SELECT s.code || '-ALM', 'Almacén ' || s.name, s.id, TRUE, CASE WHEN s.store_type = 'online' THEN TRUE ELSE FALSE END, TRUE FROM stores s;

INSERT INTO warehouses (code, name, store_id, is_main, accepts_online_stock, is_active) VALUES
  ('CEN-ALM', 'Almacén Central', NULL, FALSE, TRUE, TRUE);

-- Configuración inicial
INSERT INTO system_config (key, value, category, display_name, description, value_type, is_required) VALUES
  ('company.name', '"Sastrería Prats"', 'general', 'Nombre de la empresa', 'Nombre comercial', 'string', TRUE),
  ('company.legal_name', '"Sastrería Prats S.L."', 'general', 'Razón social', 'Razón social para facturas', 'string', TRUE),
  ('company.nif', '""', 'general', 'NIF/CIF', 'Número de identificación fiscal', 'string', TRUE),
  ('company.address', '""', 'general', 'Dirección fiscal', 'Dirección para facturas', 'string', TRUE),
  ('company.phone', '""', 'general', 'Teléfono', 'Teléfono principal', 'string', FALSE),
  ('company.email', '"info@sastreriaprats.com"', 'general', 'Email', 'Email principal', 'string', TRUE),
  ('company.domain', '"sastreriaprats.com"', 'general', 'Dominio web', 'Dominio de la web', 'string', TRUE),
  ('fiscal.iva_rate', '21', 'fiscal', 'Tipo IVA general', 'Tipo de IVA general (%)', 'number', TRUE),
  ('fiscal.invoice_series', '"F"', 'fiscal', 'Serie de facturación', 'Prefijo de las facturas', 'string', TRUE),
  ('fiscal.invoice_correlative', '0', 'fiscal', 'Último nº factura', 'Último número de factura emitida', 'number', TRUE),
  ('fiscal.rectifying_series', '"R"', 'fiscal', 'Serie facturas rectificativas', 'Prefijo de facturas rectificativas', 'string', TRUE),
  ('fiscal.recargo_equivalencia', 'false', 'fiscal', 'Recargo de equivalencia', 'Aplicar recargo de equivalencia', 'boolean', FALSE),
  ('pos.default_cash_fund', '300', 'pos', 'Fondo de caja', 'Importe por defecto al abrir caja (€)', 'number', TRUE),
  ('pos.allow_mixed_payments', 'true', 'pos', 'Pagos mixtos', 'Permitir pago parte efectivo + parte tarjeta', 'boolean', FALSE),
  ('pos.ticket_printer_width', '80', 'pos', 'Ancho ticket', 'Ancho del papel térmico (mm)', 'number', FALSE),
  ('pos.voucher_expiry_days', '365', 'pos', 'Validez vale', 'Días de validez de los vales/gift cards', 'number', FALSE),
  ('web.free_shipping_threshold', '500', 'web', 'Envío gratis desde', 'Importe mínimo para envío gratis (€)', 'number', FALSE),
  ('web.return_period_days', '14', 'web', 'Plazo devolución', 'Días para devolución online', 'number', FALSE),
  ('web.google_analytics_id', '""', 'web', 'Google Analytics ID', 'ID de medición de GA4', 'string', FALSE),
  ('email.from_name', '"Sastrería Prats"', 'email', 'Nombre remitente', 'Nombre que aparece en los emails', 'string', TRUE),
  ('email.from_email', '"info@sastreriaprats.com"', 'email', 'Email remitente', 'Email desde el que se envían', 'string', TRUE),
  ('email.birthday_enabled', 'true', 'email', 'Email cumpleaños', 'Enviar felicitación de cumpleaños', 'boolean', FALSE),
  ('session.duration_hours', '8', 'security', 'Duración sesión', 'Horas antes de pedir login de nuevo', 'number', TRUE),
  ('session.pin_timeout_minutes', '30', 'security', 'Timeout PIN TPV', 'Minutos antes de pedir PIN de nuevo en TPV', 'number', TRUE);

-- ========================================
-- 15. FUNCIONES Y TRIGGERS
-- ========================================

CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_profiles_updated_at BEFORE UPDATE ON profiles FOR EACH ROW EXECUTE PROCEDURE update_updated_at();
CREATE TRIGGER trigger_roles_updated_at BEFORE UPDATE ON roles FOR EACH ROW EXECUTE PROCEDURE update_updated_at();
CREATE TRIGGER trigger_stores_updated_at BEFORE UPDATE ON stores FOR EACH ROW EXECUTE PROCEDURE update_updated_at();
CREATE TRIGGER trigger_warehouses_updated_at BEFORE UPDATE ON warehouses FOR EACH ROW EXECUTE PROCEDURE update_updated_at();
CREATE TRIGGER trigger_system_config_updated_at BEFORE UPDATE ON system_config FOR EACH ROW EXECUTE PROCEDURE update_updated_at();

CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO profiles (id, email, full_name, first_name, last_name)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email),
    NEW.raw_user_meta_data->>'first_name',
    NEW.raw_user_meta_data->>'last_name'
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE handle_new_user();

CREATE OR REPLACE FUNCTION user_has_permission(p_user_id UUID, p_permission_code TEXT)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1
    FROM user_roles ur
    JOIN role_permissions rp ON rp.role_id = ur.role_id
    JOIN permissions p ON p.id = rp.permission_id
    JOIN roles r ON r.id = ur.role_id
    WHERE ur.user_id = p_user_id
    AND p.code = p_permission_code
    AND r.is_active = TRUE
    AND (ur.valid_until IS NULL OR ur.valid_until > NOW())
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION get_user_permissions(p_user_id UUID)
RETURNS TABLE(permission_code TEXT) AS $$
BEGIN
  RETURN QUERY
  SELECT DISTINCT p.code
  FROM user_roles ur
  JOIN role_permissions rp ON rp.role_id = ur.role_id
  JOIN permissions p ON p.id = rp.permission_id
  JOIN roles r ON r.id = ur.role_id
  WHERE ur.user_id = p_user_id
  AND r.is_active = TRUE
  AND (ur.valid_until IS NULL OR ur.valid_until > NOW())
  ORDER BY p.code;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION get_user_roles(p_user_id UUID)
RETURNS TABLE(role_name TEXT, role_display_name TEXT, hierarchy_level INTEGER) AS $$
BEGIN
  RETURN QUERY
  SELECT r.name, r.display_name, r.hierarchy_level
  FROM user_roles ur
  JOIN roles r ON r.id = ur.role_id
  WHERE ur.user_id = p_user_id
  AND r.is_active = TRUE
  AND (ur.valid_until IS NULL OR ur.valid_until > NOW())
  ORDER BY r.hierarchy_level;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION get_user_stores(p_user_id UUID)
RETURNS TABLE(store_id UUID, store_code VARCHAR, store_name TEXT, is_primary BOOLEAN) AS $$
BEGIN
  RETURN QUERY
  SELECT s.id, s.code, s.name, us.is_primary
  FROM user_stores us
  JOIN stores s ON s.id = us.store_id
  WHERE us.user_id = p_user_id
  AND s.is_active = TRUE
  ORDER BY us.is_primary DESC, s.name;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION log_audit(
  p_user_id UUID,
  p_action audit_action,
  p_module TEXT,
  p_entity_type TEXT DEFAULT NULL,
  p_entity_id UUID DEFAULT NULL,
  p_entity_display TEXT DEFAULT NULL,
  p_description TEXT DEFAULT NULL,
  p_old_data JSONB DEFAULT NULL,
  p_new_data JSONB DEFAULT NULL,
  p_metadata JSONB DEFAULT NULL
)
RETURNS UUID AS $$
DECLARE
  v_log_id UUID;
  v_user_email TEXT;
  v_user_name TEXT;
BEGIN
  SELECT email, full_name INTO v_user_email, v_user_name FROM profiles WHERE id = p_user_id;

  INSERT INTO audit_logs (
    user_id, user_email, user_full_name,
    action, module, entity_type, entity_id, entity_display,
    description, old_data, new_data, metadata
  ) VALUES (
    p_user_id, v_user_email, v_user_name,
    p_action, p_module, p_entity_type, p_entity_id, p_entity_display,
    p_description, p_old_data, p_new_data, p_metadata
  )
  RETURNING id INTO v_log_id;

  RETURN v_log_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ========================================
-- 16. ROW LEVEL SECURITY (RLS)
-- ========================================

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE role_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE stores ENABLE ROW LEVEL SECURITY;
ALTER TABLE warehouses ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_stores ENABLE ROW LEVEL SECURITY;
ALTER TABLE active_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE system_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "profiles_select_own" ON profiles FOR SELECT USING (auth.uid() = id);
CREATE POLICY "profiles_select_all" ON profiles FOR SELECT USING (user_has_permission(auth.uid(), 'clients.read') OR user_has_permission(auth.uid(), 'config.manage_users'));
CREATE POLICY "profiles_update_own" ON profiles FOR UPDATE USING (auth.uid() = id);
CREATE POLICY "profiles_update_admin" ON profiles FOR UPDATE USING (user_has_permission(auth.uid(), 'config.manage_users'));

CREATE POLICY "roles_select" ON roles FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "roles_modify" ON roles FOR ALL USING (user_has_permission(auth.uid(), 'config.manage_roles'));

CREATE POLICY "permissions_select" ON permissions FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE POLICY "role_permissions_select" ON role_permissions FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "role_permissions_modify" ON role_permissions FOR ALL USING (user_has_permission(auth.uid(), 'config.manage_roles'));

CREATE POLICY "user_roles_select_own" ON user_roles FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "user_roles_select_admin" ON user_roles FOR SELECT USING (user_has_permission(auth.uid(), 'config.manage_users'));
CREATE POLICY "user_roles_modify" ON user_roles FOR ALL USING (user_has_permission(auth.uid(), 'config.manage_users'));

CREATE POLICY "stores_select" ON stores FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "stores_modify" ON stores FOR ALL USING (user_has_permission(auth.uid(), 'config.manage_stores'));

CREATE POLICY "warehouses_select" ON warehouses FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "warehouses_modify" ON warehouses FOR ALL USING (user_has_permission(auth.uid(), 'config.manage_stores'));

CREATE POLICY "user_stores_select_own" ON user_stores FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "user_stores_select_admin" ON user_stores FOR SELECT USING (user_has_permission(auth.uid(), 'config.manage_users'));
CREATE POLICY "user_stores_modify" ON user_stores FOR ALL USING (user_has_permission(auth.uid(), 'config.manage_users'));

CREATE POLICY "sessions_select_own" ON active_sessions FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "sessions_select_admin" ON active_sessions FOR SELECT USING (user_has_permission(auth.uid(), 'config.access'));
CREATE POLICY "sessions_insert" ON active_sessions FOR INSERT WITH CHECK (user_id = auth.uid());
CREATE POLICY "sessions_update_own" ON active_sessions FOR UPDATE USING (user_id = auth.uid());

CREATE POLICY "audit_select" ON audit_logs FOR SELECT USING (user_has_permission(auth.uid(), 'config.view_audit_log'));
CREATE POLICY "audit_insert" ON audit_logs FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "config_select" ON system_config FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "config_modify" ON system_config FOR ALL USING (user_has_permission(auth.uid(), 'config.access'));

CREATE POLICY "notifications_select" ON notifications FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "notifications_update" ON notifications FOR UPDATE USING (user_id = auth.uid());
CREATE POLICY "notifications_insert_service" ON notifications FOR INSERT WITH CHECK (TRUE);

-- ========================================
-- 17. VISTAS
-- ========================================

CREATE OR REPLACE VIEW v_users_with_roles AS
SELECT 
  p.id,
  p.email,
  p.full_name,
  p.phone,
  p.is_active,
  p.status,
  p.last_login_at,
  p.created_at,
  COALESCE(
    json_agg(
      json_build_object(
        'role_id', r.id,
        'role_name', r.name,
        'display_name', r.display_name,
        'color', r.color,
        'icon', r.icon
      )
    ) FILTER (WHERE r.id IS NOT NULL),
    '[]'
  ) AS roles,
  COALESCE(
    json_agg(DISTINCT s.name) FILTER (WHERE s.id IS NOT NULL),
    '[]'
  ) AS stores
FROM profiles p
LEFT JOIN user_roles ur ON ur.user_id = p.id AND (ur.valid_until IS NULL OR ur.valid_until > NOW())
LEFT JOIN roles r ON r.id = ur.role_id AND r.is_active = TRUE
LEFT JOIN user_stores us ON us.user_id = p.id
LEFT JOIN stores s ON s.id = us.store_id AND s.is_active = TRUE
GROUP BY p.id;

CREATE OR REPLACE VIEW v_stores_with_warehouses AS
SELECT 
  s.*,
  COALESCE(
    json_agg(
      json_build_object(
        'warehouse_id', w.id,
        'warehouse_code', w.code,
        'warehouse_name', w.name,
        'is_main', w.is_main
      )
    ) FILTER (WHERE w.id IS NOT NULL),
    '[]'
  ) AS warehouses
FROM stores s
LEFT JOIN warehouses w ON w.store_id = s.id AND w.is_active = TRUE
GROUP BY s.id;
