-- ==========================================
-- SASTRERÍA PRATS — Migración 163
-- Estado por línea de pedido online + cancelación parcial
-- ==========================================

-- Estado individual de cada línea para soportar cancelación parcial.
-- 'active'    → línea vigente, contabiliza en el total efectivo
-- 'cancelled' → línea anulada (stock repuesto si correspondía)
-- 'refunded'  → línea reembolsada al cliente (lo deja activar fuera de stock-back)
ALTER TABLE online_order_lines
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'cancelled', 'refunded'));

ALTER TABLE online_order_lines
  ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ;

ALTER TABLE online_order_lines
  ADD COLUMN IF NOT EXISTS cancellation_reason TEXT;

-- Marca si el stock se ha devuelto al almacén (para evitar doble reposición).
ALTER TABLE online_order_lines
  ADD COLUMN IF NOT EXISTS stock_restored BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS idx_online_order_lines_status
  ON online_order_lines(status);
