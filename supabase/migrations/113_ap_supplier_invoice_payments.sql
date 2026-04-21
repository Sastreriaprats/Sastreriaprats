-- Pagos de facturas de proveedor (parciales o totales).
-- Registra cada pago individual y recalcula status + payment_date en ap_supplier_invoices
-- mediante un trigger tras INSERT/UPDATE/DELETE.

CREATE TABLE IF NOT EXISTS ap_supplier_invoice_payments (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  supplier_invoice_id UUID NOT NULL REFERENCES ap_supplier_invoices(id) ON DELETE CASCADE,
  payment_date DATE NOT NULL DEFAULT CURRENT_DATE,
  payment_method VARCHAR(50) NOT NULL DEFAULT 'transfer',
  amount DECIMAL(12,2) NOT NULL CHECK (amount > 0),
  reference VARCHAR(200),
  notes TEXT,
  manual_transaction_id UUID REFERENCES manual_transactions(id) ON DELETE SET NULL,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_ap_sipay_invoice ON ap_supplier_invoice_payments(supplier_invoice_id);
CREATE INDEX IF NOT EXISTS idx_ap_sipay_date ON ap_supplier_invoice_payments(payment_date DESC);

ALTER TABLE ap_supplier_invoice_payments ENABLE ROW LEVEL SECURITY;

CREATE POLICY ap_sipay_select ON ap_supplier_invoice_payments
  FOR SELECT USING (user_has_permission(auth.uid(), 'supplier_invoices.manage'));
CREATE POLICY ap_sipay_insert ON ap_supplier_invoice_payments
  FOR INSERT WITH CHECK (user_has_permission(auth.uid(), 'supplier_invoices.manage'));
CREATE POLICY ap_sipay_update ON ap_supplier_invoice_payments
  FOR UPDATE USING (user_has_permission(auth.uid(), 'supplier_invoices.manage'));
CREATE POLICY ap_sipay_delete ON ap_supplier_invoice_payments
  FOR DELETE USING (user_has_permission(auth.uid(), 'supplier_invoices.manage'));

-- Recalcula status + payment_date en la factura según la suma de pagos registrados
CREATE OR REPLACE FUNCTION recalc_ap_supplier_invoice_payment_status(p_invoice_id UUID)
RETURNS VOID AS $$
DECLARE
  v_total DECIMAL(12,2);
  v_paid DECIMAL(12,2);
  v_last_date DATE;
  v_new_status VARCHAR(20);
  v_new_payment_date DATE;
BEGIN
  SELECT total_amount INTO v_total FROM ap_supplier_invoices WHERE id = p_invoice_id;
  IF v_total IS NULL THEN RETURN; END IF;

  SELECT COALESCE(SUM(amount), 0), MAX(payment_date)
    INTO v_paid, v_last_date
    FROM ap_supplier_invoice_payments
    WHERE supplier_invoice_id = p_invoice_id;

  IF v_paid >= v_total - 0.005 THEN
    v_new_status := 'pagada';
    v_new_payment_date := v_last_date;
  ELSIF v_paid > 0 THEN
    v_new_status := 'parcial';
    v_new_payment_date := NULL;
  ELSE
    v_new_status := 'pendiente';
    v_new_payment_date := NULL;
  END IF;

  UPDATE ap_supplier_invoices
    SET status = v_new_status,
        payment_date = v_new_payment_date,
        updated_at = NOW()
    WHERE id = p_invoice_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION trg_ap_sipay_recalc()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM recalc_ap_supplier_invoice_payment_status(OLD.supplier_invoice_id);
    RETURN OLD;
  ELSE
    PERFORM recalc_ap_supplier_invoice_payment_status(NEW.supplier_invoice_id);
    IF TG_OP = 'UPDATE' AND OLD.supplier_invoice_id <> NEW.supplier_invoice_id THEN
      PERFORM recalc_ap_supplier_invoice_payment_status(OLD.supplier_invoice_id);
    END IF;
    RETURN NEW;
  END IF;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS ap_sipay_recalc ON ap_supplier_invoice_payments;
CREATE TRIGGER ap_sipay_recalc
  AFTER INSERT OR UPDATE OR DELETE ON ap_supplier_invoice_payments
  FOR EACH ROW EXECUTE FUNCTION trg_ap_sipay_recalc();

-- Backfill: para cada factura con status='pagada' sin pagos registrados,
-- crear una fila de pago equivalente para mantener coherencia histórica.
INSERT INTO ap_supplier_invoice_payments
  (supplier_invoice_id, payment_date, payment_method, amount, notes, created_by)
SELECT
  inv.id,
  COALESCE(inv.payment_date, inv.updated_at::date),
  COALESCE(inv.payment_method, 'transfer'),
  inv.total_amount,
  'Pago migrado (factura marcada como pagada antes del módulo de pagos)',
  inv.created_by
FROM ap_supplier_invoices inv
WHERE inv.status = 'pagada'
  AND NOT EXISTS (
    SELECT 1 FROM ap_supplier_invoice_payments pay
    WHERE pay.supplier_invoice_id = inv.id
  );
