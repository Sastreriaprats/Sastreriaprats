-- ============================================================
-- Migración 257 — Facturas de la TIENDA ONLINE (serie W)
--
-- Cada pedido online pagado emite factura automática (serie W2026-xxxx,
-- webhook redsys/stripe). Estas facturas entran solas en el escenario C
-- (criterio existente: emitidas sin sale_id ni tailoring_order_id) y en
-- Contabilidad A vía online_order_id (nuevo criterio en getAccountingSummary).
--
-- Piezas:
--   1. invoices.client_country: país ISO-2 del comprador (control fiscal
--      nacional/UE/extra-UE de cara al OSS; el país ya se captura en checkout).
--   2. FK real de invoices.online_order_id (columna que existía desde 003d
--      pero sin FK y sin uso).
--   3. UNA factura vigente por pedido online: índice único parcial (excluye
--      anuladas, para permitir re-facturar tras una anulación). También
--      protege de webhooks duplicados (Redsys/Stripe reintentan).
-- ============================================================

ALTER TABLE invoices ADD COLUMN IF NOT EXISTS client_country TEXT;

-- FK (la columna existe desde 003d pero sin restricción; no hay datos que
-- violen porque ningún código la escribía hasta hoy).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'invoices_online_order_id_fkey'
  ) THEN
    ALTER TABLE invoices
      ADD CONSTRAINT invoices_online_order_id_fkey
      FOREIGN KEY (online_order_id) REFERENCES online_orders(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS uq_invoices_online_order_active
  ON invoices (online_order_id)
  WHERE online_order_id IS NOT NULL AND status <> 'cancelled';

CREATE INDEX IF NOT EXISTS idx_invoices_online_order
  ON invoices (online_order_id) WHERE online_order_id IS NOT NULL;
