-- ============================================================
-- Migration 085: Asegurar columna alert_on_payment en ap_supplier_invoices
-- Idempotente — solo añade la columna si no existe
-- ============================================================

ALTER TABLE ap_supplier_invoices
  ADD COLUMN IF NOT EXISTS alert_on_payment BOOLEAN DEFAULT false;
