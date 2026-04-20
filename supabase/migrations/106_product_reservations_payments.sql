-- ==========================================
-- SASTRERÍA PRATS — Migración 106
-- Pagos sobre reservas de producto
-- ==========================================
-- Añade precio y estado de pago a `product_reservations` y crea la tabla
-- `product_reservation_payments` para registrar pagos sucesivos
-- (efectivo, tarjeta, bizum, transferencia...).

-- 1. Columnas nuevas en product_reservations
ALTER TABLE product_reservations
  ADD COLUMN IF NOT EXISTS unit_price  NUMERIC(10,2) DEFAULT 0    NOT NULL,
  ADD COLUMN IF NOT EXISTS total       NUMERIC(12,2) DEFAULT 0    NOT NULL,
  ADD COLUMN IF NOT EXISTS total_paid  NUMERIC(12,2) DEFAULT 0    NOT NULL,
  ADD COLUMN IF NOT EXISTS payment_status TEXT DEFAULT 'pending'   NOT NULL
    CHECK (payment_status IN ('pending', 'partial', 'paid'));

CREATE INDEX IF NOT EXISTS idx_prod_res_payment_status ON product_reservations(payment_status);

-- 2. Tabla de pagos
CREATE TABLE IF NOT EXISTS product_reservation_payments (
  id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  product_reservation_id UUID NOT NULL REFERENCES product_reservations(id) ON DELETE CASCADE,
  payment_date          DATE NOT NULL DEFAULT CURRENT_DATE,
  payment_method        TEXT NOT NULL CHECK (payment_method IN ('cash', 'card', 'bizum', 'transfer', 'voucher')),
  amount                NUMERIC(10,2) NOT NULL CHECK (amount > 0),
  reference             TEXT,
  notes                 TEXT,
  cash_session_id       UUID REFERENCES cash_sessions(id) ON DELETE SET NULL,
  created_by            UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_prod_res_payments_reservation ON product_reservation_payments(product_reservation_id);
CREATE INDEX IF NOT EXISTS idx_prod_res_payments_session     ON product_reservation_payments(cash_session_id);
CREATE INDEX IF NOT EXISTS idx_prod_res_payments_date        ON product_reservation_payments(payment_date);

-- 3. RLS (mismo criterio que product_reservations)
ALTER TABLE product_reservation_payments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "reservation_payments_select" ON product_reservation_payments;
CREATE POLICY "reservation_payments_select" ON product_reservation_payments FOR SELECT
  USING (user_has_permission(auth.uid(), 'reservations.view'));

DROP POLICY IF EXISTS "reservation_payments_insert" ON product_reservation_payments;
CREATE POLICY "reservation_payments_insert" ON product_reservation_payments FOR INSERT
  WITH CHECK (user_has_permission(auth.uid(), 'reservations.edit'));

DROP POLICY IF EXISTS "reservation_payments_update" ON product_reservation_payments;
CREATE POLICY "reservation_payments_update" ON product_reservation_payments FOR UPDATE
  USING (user_has_permission(auth.uid(), 'reservations.edit'));

DROP POLICY IF EXISTS "reservation_payments_delete" ON product_reservation_payments;
CREATE POLICY "reservation_payments_delete" ON product_reservation_payments FOR DELETE
  USING (user_has_permission(auth.uid(), 'reservations.delete'));
