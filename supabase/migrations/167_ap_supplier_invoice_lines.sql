-- Multi-base imponible en facturas de proveedor.
-- Permite N líneas con base + IVA distinto por factura (caso típico:
-- transporte exento + género al 21%).
--
-- La cabecera ap_supplier_invoices mantiene amount/tax_amount como Σ de las
-- líneas (retrocompat con KPIs y listados existentes que leen los agregados).
-- Sin backfill: ap_supplier_invoices no tiene filas en producción.

CREATE TABLE ap_supplier_invoice_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_invoice_id uuid NOT NULL REFERENCES ap_supplier_invoices(id) ON DELETE CASCADE,
  description text,
  base numeric(12,2) NOT NULL,
  tax_rate numeric(5,2) NOT NULL DEFAULT 21,
  tax_amount numeric(12,2) NOT NULL,
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX ix_ap_supplier_invoice_lines_invoice ON ap_supplier_invoice_lines(supplier_invoice_id);

COMMENT ON TABLE ap_supplier_invoice_lines IS
  'Líneas con base imponible + IVA por factura de proveedor (ap_supplier_invoices). La cabecera mantiene Σ amount/tax_amount para retrocompat con KPIs.';
