-- ============================================================
-- 025 – Sistema de pagos parciales
-- ============================================================

-- 1. Tabla de pagos parciales para pedidos de sastrería
CREATE TABLE IF NOT EXISTS tailoring_order_payments (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  tailoring_order_id UUID NOT NULL REFERENCES tailoring_orders(id) ON DELETE CASCADE,
  payment_date DATE NOT NULL DEFAULT CURRENT_DATE,
  payment_method TEXT NOT NULL CHECK (payment_method IN ('cash', 'card', 'transfer', 'check')),
  amount NUMERIC(10,2) NOT NULL CHECK (amount > 0),
  reference TEXT,
  notes TEXT,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS tailoring_order_payments_order_idx ON tailoring_order_payments(tailoring_order_id);
CREATE INDEX IF NOT EXISTS tailoring_order_payments_date_idx ON tailoring_order_payments(payment_date);

-- RLS
ALTER TABLE tailoring_order_payments ENABLE ROW LEVEL SECURITY;

CREATE POLICY top_select ON tailoring_order_payments
  FOR SELECT USING (user_has_permission(auth.uid(), 'orders.view'));

CREATE POLICY top_insert ON tailoring_order_payments
  FOR INSERT WITH CHECK (user_has_permission(auth.uid(), 'orders.edit'));

CREATE POLICY top_delete ON tailoring_order_payments
  FOR DELETE USING (user_has_permission(auth.uid(), 'orders.edit'));

-- 2. Columnas de tracking de pago en sales
ALTER TABLE sales ADD COLUMN IF NOT EXISTS amount_paid NUMERIC(10,2) DEFAULT 0;
ALTER TABLE sales ADD COLUMN IF NOT EXISTS payment_status TEXT DEFAULT 'pending'
  CHECK (payment_status IN ('pending', 'partial', 'paid'));

-- 3. RLS para sale_payments (INSERT desde panel admin, no solo desde POS)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'sale_payments' AND policyname = 'sp_insert'
  ) THEN
    EXECUTE '
      CREATE POLICY sp_insert ON sale_payments
        FOR INSERT WITH CHECK (user_has_permission(auth.uid(), ''sales.edit''))
    ';
  END IF;
END $$;
