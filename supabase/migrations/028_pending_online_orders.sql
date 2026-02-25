-- Intenciones de pago Redsys: se guarda el carrito hasta que el pago se confirme.
-- Al redirigir a URLOK (éxito) se crea el pedido desde aquí y se borra la fila.
CREATE TABLE IF NOT EXISTS pending_online_orders (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  token VARCHAR(64) NOT NULL UNIQUE,
  order_number VARCHAR(30) NOT NULL,
  client_id UUID REFERENCES clients(id) ON DELETE SET NULL,
  customer JSONB NOT NULL,
  order_lines JSONB NOT NULL,
  subtotal DECIMAL(10,2) NOT NULL,
  tax_amount DECIMAL(10,2) NOT NULL,
  shipping_cost DECIMAL(10,2) NOT NULL DEFAULT 0,
  total DECIMAL(10,2) NOT NULL,
  locale TEXT DEFAULT 'es',
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE INDEX idx_pending_online_orders_token ON pending_online_orders(token);
CREATE INDEX idx_pending_online_orders_created ON pending_online_orders(created_at);

ALTER TABLE pending_online_orders ENABLE ROW LEVEL SECURITY;
CREATE POLICY "pending_online_orders_all" ON pending_online_orders FOR ALL USING (true) WITH CHECK (true);
