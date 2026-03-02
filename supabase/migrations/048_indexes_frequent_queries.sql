-- =============================================
-- ÍNDICES PARA QUERIES FRECUENTES
-- Solo crea los que no existan ya (IF NOT EXISTS)
-- =============================================

-- Extensión para búsqueda trigram (clients full_name). Ya existe en 001; por si acaso.
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Sales: filtros por created_at, status, store_id (dashboard, reporting, contabilidad)
CREATE INDEX IF NOT EXISTS idx_sales_created_at ON sales(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_sales_status ON sales(status);
CREATE INDEX IF NOT EXISTS idx_sales_store_id ON sales(store_id);

-- Tailoring orders: filtros por status, created_at, delivery_date
CREATE INDEX IF NOT EXISTS idx_tailoring_orders_status ON tailoring_orders(status);
CREATE INDEX IF NOT EXISTS idx_tailoring_orders_created_at ON tailoring_orders(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_tailoring_orders_delivery_date ON tailoring_orders(estimated_delivery_date);

-- Clients: búsquedas por full_name, email, phone, profile_id
CREATE INDEX IF NOT EXISTS idx_clients_profile_id ON clients(profile_id);
CREATE INDEX IF NOT EXISTS idx_clients_full_name_trgm ON clients USING gin(full_name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_clients_email ON clients(email);

-- Audit log (tabla audit_log de 010_roles_v2): filtros por user_id, entity_type, action, created_at
CREATE INDEX IF NOT EXISTS idx_audit_log_created_at ON audit_log(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_log_user_id ON audit_log(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_entity_type ON audit_log(entity_type);

-- Stock levels: filtros por product_variant_id, warehouse_id (índice compuesto)
CREATE INDEX IF NOT EXISTS idx_stock_levels_variant_warehouse ON stock_levels(product_variant_id, warehouse_id);

-- Product variants: búsqueda por barcode, sku (columna en schema: variant_sku)
CREATE INDEX IF NOT EXISTS idx_product_variants_barcode ON product_variants(barcode);
CREATE INDEX IF NOT EXISTS idx_product_variants_sku ON product_variants(variant_sku);

-- Products: búsqueda por barcode
CREATE INDEX IF NOT EXISTS idx_products_barcode ON products(barcode);

-- User roles: filtro por user_id (se consulta en cada petición)
CREATE INDEX IF NOT EXISTS idx_user_roles_user_id ON user_roles(user_id);

-- Notifications: filtro por user_id
CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON notifications(user_id);

-- Journal entries: filtros por fiscal_year, entry_date
CREATE INDEX IF NOT EXISTS idx_journal_entries_fiscal_year ON journal_entries(fiscal_year);
CREATE INDEX IF NOT EXISTS idx_journal_entries_entry_date ON journal_entries(entry_date DESC);

-- CMS pages: filtro por slug
CREATE INDEX IF NOT EXISTS idx_cms_pages_slug ON cms_pages(slug);

-- Online orders: filtro por client_id
CREATE INDEX IF NOT EXISTS idx_online_orders_client_id ON online_orders(client_id);
