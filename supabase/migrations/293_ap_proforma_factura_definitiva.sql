-- 293_ap_proforma_factura_definitiva.sql
--
-- Asociar una PROFORMA de proveedor (mig 203) a su FACTURA definitiva.
--
-- Hasta ahora, cuando llegaba la factura real se editaba la misma fila y se le
-- quitaba el flag de proforma. En la práctica se registra la factura como fila
-- nueva (otro número, otra fecha, otro PDF) y la proforma se queda huérfana. Ahora
-- la proforma apunta a su factura:
--
--   ap_supplier_invoices.final_invoice_id → la factura definitiva (solo en proformas).
--   Varias proformas pueden apuntar a la misma factura.
--
-- Las proformas se pagan a menudo por adelantado. Al asociarlas, sus pagos se
-- TRASLADAN a la factura (si no, la factura saldría pendiente y se pagaría dos
-- veces). Para poder deshacer la asociación, cada pago trasladado recuerda de qué
-- proforma venía:
--
--   ap_supplier_invoice_payments.moved_from_proforma_id → proforma de origen.
--
-- El status de las dos cabeceras lo re-deriva el trigger ap_sipay_recalc (mig 113),
-- que ya contempla el UPDATE de supplier_invoice_id (recalcula la vieja y la nueva).
--
-- Idempotente, sin bloques $$.

ALTER TABLE ap_supplier_invoices
  ADD COLUMN IF NOT EXISTS final_invoice_id uuid
    REFERENCES ap_supplier_invoices(id) ON DELETE SET NULL;

ALTER TABLE ap_supplier_invoices
  DROP CONSTRAINT IF EXISTS ap_supplier_invoices_final_invoice_chk;
ALTER TABLE ap_supplier_invoices
  ADD CONSTRAINT ap_supplier_invoices_final_invoice_chk
    CHECK (final_invoice_id IS NULL OR (is_proforma AND final_invoice_id <> id));

CREATE INDEX IF NOT EXISTS idx_ap_supplier_invoices_final_invoice
  ON ap_supplier_invoices(final_invoice_id)
  WHERE final_invoice_id IS NOT NULL;

ALTER TABLE ap_supplier_invoice_payments
  ADD COLUMN IF NOT EXISTS moved_from_proforma_id uuid
    REFERENCES ap_supplier_invoices(id) ON DELETE SET NULL;
