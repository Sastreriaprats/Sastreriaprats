-- ============================================================
-- Migration 069: Extensión de `alterations` con campos del módulo viejo
--
-- Conserva la semántica útil de `boutique_alterations`:
--   - link a pedido de sastrería (tailoring_order_id)
--   - link a venta POS (sale_id)
--   - tipo de arreglo (order / boutique / external)
--   - is_included (cuando va incluido en la venta sin coste extra)
--   - estimated_completion
--
-- Idempotente: ALTER TABLE … ADD COLUMN IF NOT EXISTS.
-- ============================================================

ALTER TABLE alterations
  ADD COLUMN IF NOT EXISTS tailoring_order_id   UUID REFERENCES tailoring_orders(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS sale_id              UUID REFERENCES sales(id)            ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS alteration_type      TEXT NOT NULL DEFAULT 'external'
                              CHECK (alteration_type IN ('order','boutique','external')),
  ADD COLUMN IF NOT EXISTS is_included          BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS estimated_completion DATE;

CREATE INDEX IF NOT EXISTS idx_alterations_tailoring_order
  ON alterations(tailoring_order_id);
CREATE INDEX IF NOT EXISTS idx_alterations_sale
  ON alterations(sale_id);
CREATE INDEX IF NOT EXISTS idx_alterations_type
  ON alterations(alteration_type);
