-- ============================================================
-- Migration 065: Índices faltantes para queries frecuentes
-- ============================================================

-- manual_transactions: filtros por fecha en contabilidad y reporting
CREATE INDEX IF NOT EXISTS idx_manual_transactions_date
ON manual_transactions (date DESC);

-- manual_transactions: filtro por created_by en reporting
CREATE INDEX IF NOT EXISTS idx_manual_transactions_created_by
ON manual_transactions (created_by);

-- tailoring_order_payments: JOIN frecuente por tailoring_order_id (usado en addOrderPayment RPC)
CREATE INDEX IF NOT EXISTS idx_tailoring_order_payments_order_id
ON tailoring_order_payments (tailoring_order_id);

-- clients: búsqueda por client_code en listTickets (ilike)
CREATE INDEX IF NOT EXISTS idx_clients_client_code_trgm
ON clients USING GIN (client_code gin_trgm_ops);

-- tailoring_orders: compuesto para getSalesByStore (filtro fecha + status)
CREATE INDEX IF NOT EXISTS idx_tailoring_orders_created_status
ON tailoring_orders (created_at DESC, status);

-- sales: compuesto para getSalesByStore y listTickets (fecha + status)
CREATE INDEX IF NOT EXISTS idx_sales_created_status
ON sales (created_at DESC, status);
