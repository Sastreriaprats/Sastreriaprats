-- Plazos de pago de pedidos a proveedores.
-- Permite dividir el pago de un pedido en hasta N vencimientos (fecha + importe).
-- El calendario de pagos lee de esta tabla además de ap_supplier_invoices.

CREATE TABLE IF NOT EXISTS supplier_order_payment_schedule (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  supplier_order_id UUID NOT NULL REFERENCES supplier_orders(id) ON DELETE CASCADE,
  due_date DATE NOT NULL,
  amount DECIMAL(12,2) NOT NULL CHECK (amount >= 0),
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_paid BOOLEAN NOT NULL DEFAULT FALSE,
  paid_at DATE,
  payment_method VARCHAR(50),
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_sops_supplier_order ON supplier_order_payment_schedule(supplier_order_id);
CREATE INDEX IF NOT EXISTS idx_sops_due_date ON supplier_order_payment_schedule(due_date);
CREATE INDEX IF NOT EXISTS idx_sops_unpaid ON supplier_order_payment_schedule(is_paid) WHERE is_paid = FALSE;

ALTER TABLE supplier_order_payment_schedule ENABLE ROW LEVEL SECURITY;

-- Select: cualquiera con permiso sobre proveedores o facturas
CREATE POLICY sops_select ON supplier_order_payment_schedule FOR SELECT USING (
  user_has_permission(auth.uid(), 'suppliers.view')
  OR user_has_permission(auth.uid(), 'supplier_invoices.manage')
);
-- Insert/Update/Delete: alineado con supplier_orders
CREATE POLICY sops_insert ON supplier_order_payment_schedule FOR INSERT WITH CHECK (
  user_has_permission(auth.uid(), 'suppliers.create_order')
);
CREATE POLICY sops_update ON supplier_order_payment_schedule FOR UPDATE USING (
  user_has_permission(auth.uid(), 'suppliers.create_order')
  OR user_has_permission(auth.uid(), 'supplier_invoices.manage')
);
CREATE POLICY sops_delete ON supplier_order_payment_schedule FOR DELETE USING (
  user_has_permission(auth.uid(), 'suppliers.create_order')
);

-- Trigger updated_at
CREATE OR REPLACE FUNCTION tg_sops_set_updated_at() RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS tg_sops_updated_at ON supplier_order_payment_schedule;
CREATE TRIGGER tg_sops_updated_at
  BEFORE UPDATE ON supplier_order_payment_schedule
  FOR EACH ROW EXECUTE FUNCTION tg_sops_set_updated_at();

-- Backfill: por cada pedido con payment_due_date, crear 1 plazo con total del pedido.
INSERT INTO supplier_order_payment_schedule (supplier_order_id, due_date, amount, sort_order)
SELECT so.id, so.payment_due_date, COALESCE(so.total, 0), 0
FROM supplier_orders so
WHERE so.payment_due_date IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM supplier_order_payment_schedule s
    WHERE s.supplier_order_id = so.id
  );
