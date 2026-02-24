-- ==========================================
-- SASTRERÍA PRATS — Migración 006
-- Pedidos Online: orders + líneas
-- ==========================================

CREATE TABLE online_orders (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  order_number VARCHAR(30) NOT NULL UNIQUE,
  client_id UUID REFERENCES clients(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'pending_payment' CHECK (status IN (
    'pending_payment', 'paid', 'processing', 'shipped', 'delivered', 'cancelled', 'refunded'
  )),
  subtotal DECIMAL(10,2) NOT NULL DEFAULT 0,
  tax_amount DECIMAL(10,2) NOT NULL DEFAULT 0,
  shipping_cost DECIMAL(10,2) NOT NULL DEFAULT 0,
  total DECIMAL(10,2) NOT NULL DEFAULT 0,
  payment_method TEXT CHECK (payment_method IN ('stripe', 'redsys')),
  stripe_session_id TEXT,
  stripe_payment_intent TEXT,
  redsys_order_code TEXT,
  paid_at TIMESTAMPTZ,
  shipping_address JSONB,
  shipping_tracking_number TEXT,
  shipping_carrier TEXT,
  shipped_at TIMESTAMPTZ,
  delivered_at TIMESTAMPTZ,
  cancelled_at TIMESTAMPTZ,
  cancellation_reason TEXT,
  locale TEXT DEFAULT 'es',
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE TABLE online_order_lines (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  order_id UUID NOT NULL REFERENCES online_orders(id) ON DELETE CASCADE,
  variant_id UUID REFERENCES product_variants(id) ON DELETE SET NULL,
  product_name TEXT NOT NULL,
  variant_sku TEXT,
  quantity INTEGER NOT NULL DEFAULT 1,
  unit_price DECIMAL(10,2) NOT NULL,
  total DECIMAL(10,2) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE INDEX idx_online_orders_number ON online_orders(order_number);
CREATE INDEX idx_online_orders_client ON online_orders(client_id);
CREATE INDEX idx_online_orders_status ON online_orders(status);
CREATE INDEX idx_online_orders_created ON online_orders(created_at DESC);
CREATE INDEX idx_online_orders_stripe ON online_orders(stripe_session_id) WHERE stripe_session_id IS NOT NULL;
CREATE INDEX idx_online_order_lines_order ON online_order_lines(order_id);

CREATE TRIGGER trigger_online_orders_updated_at
  BEFORE UPDATE ON online_orders FOR EACH ROW EXECUTE PROCEDURE update_updated_at();

ALTER TABLE online_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE online_order_lines ENABLE ROW LEVEL SECURITY;

CREATE POLICY "online_orders_select" ON online_orders FOR SELECT
  USING (user_has_permission(auth.uid(), 'cms.manage_online_orders') OR client_id IN (
    SELECT id FROM clients WHERE profile_id = auth.uid()
  ));
CREATE POLICY "online_orders_modify" ON online_orders FOR ALL
  USING (user_has_permission(auth.uid(), 'cms.manage_online_orders'));
CREATE POLICY "online_orders_insert" ON online_orders FOR INSERT WITH CHECK (TRUE);

CREATE POLICY "online_order_lines_select" ON online_order_lines FOR SELECT USING (TRUE);
CREATE POLICY "online_order_lines_insert" ON online_order_lines FOR INSERT WITH CHECK (TRUE);
CREATE POLICY "online_order_lines_modify" ON online_order_lines FOR ALL
  USING (user_has_permission(auth.uid(), 'cms.manage_online_orders'));
