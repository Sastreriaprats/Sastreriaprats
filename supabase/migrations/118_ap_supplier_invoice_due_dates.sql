-- ==========================================
-- SASTRERÍA PRATS — Migración 118
-- Cuotas de vencimiento de facturas de proveedor (AP)
-- ==========================================
-- Una factura puede dividirse en varias cuotas si el proveedor tiene
-- payment_terms = 'custom' + custom_payment_plan con varios pagos.
-- Si las condiciones son simples (net_X, immediate), se crea una sola
-- cuota con el total de la factura.
--
-- Nota: si ya tenías una tabla `ap_supplier_invoice_due_dates` con otra
-- estructura, esta migración la elimina y la recrea con el shape que el
-- código espera. DROP TABLE borra las filas — ejecuta solo si la tabla
-- está vacía o aceptas perder esos datos. El backfill al final regenera
-- una cuota por cada factura existente.

DROP TABLE IF EXISTS ap_supplier_invoice_due_dates CASCADE;

CREATE TABLE ap_supplier_invoice_due_dates (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  supplier_invoice_id UUID NOT NULL REFERENCES ap_supplier_invoices(id) ON DELETE CASCADE,
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

CREATE INDEX idx_ap_sidd_invoice ON ap_supplier_invoice_due_dates(supplier_invoice_id);
CREATE INDEX idx_ap_sidd_due_date ON ap_supplier_invoice_due_dates(due_date);
CREATE INDEX idx_ap_sidd_unpaid ON ap_supplier_invoice_due_dates(is_paid) WHERE is_paid = FALSE;

ALTER TABLE ap_supplier_invoice_due_dates ENABLE ROW LEVEL SECURITY;

CREATE POLICY ap_sidd_select ON ap_supplier_invoice_due_dates FOR SELECT
  USING (user_has_permission(auth.uid(), 'supplier_invoices.manage'));

CREATE POLICY ap_sidd_insert ON ap_supplier_invoice_due_dates FOR INSERT
  WITH CHECK (user_has_permission(auth.uid(), 'supplier_invoices.manage'));

CREATE POLICY ap_sidd_update ON ap_supplier_invoice_due_dates FOR UPDATE
  USING (user_has_permission(auth.uid(), 'supplier_invoices.manage'));

CREATE POLICY ap_sidd_delete ON ap_supplier_invoice_due_dates FOR DELETE
  USING (user_has_permission(auth.uid(), 'supplier_invoices.manage'));

-- Trigger de updated_at
CREATE TRIGGER trg_ap_sidd_updated_at
  BEFORE UPDATE ON ap_supplier_invoice_due_dates
  FOR EACH ROW EXECUTE PROCEDURE update_updated_at();

-- Backfill: crear 1 cuota por cada factura existente
INSERT INTO ap_supplier_invoice_due_dates (supplier_invoice_id, due_date, amount, sort_order, is_paid, paid_at)
SELECT
  inv.id,
  inv.due_date,
  inv.total_amount,
  0,
  (inv.status = 'pagada'),
  CASE WHEN inv.status = 'pagada' THEN inv.payment_date ELSE NULL END
FROM ap_supplier_invoices inv;
