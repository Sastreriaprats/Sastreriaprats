-- ============================================================
-- Migration 137: cache de total devuelto en sales.total_returned
-- Añade una columna NUMERIC(12,2) NOT NULL DEFAULT 0 que se mantiene en
-- sincronía con SUM(returns.total_returned) WHERE original_sale_id = sales.id.
-- El backfill recalcula los valores actuales para ventas con devoluciones
-- ya existentes. La 138 actualiza el RPC para incrementar este cache en
-- cada nueva devolución.
-- ============================================================

ALTER TABLE sales ADD COLUMN IF NOT EXISTS total_returned NUMERIC(12,2) NOT NULL DEFAULT 0;

-- Backfill: calcular total_returned para ventas con devoluciones
UPDATE sales s
SET total_returned = COALESCE(sub.sum_returned, 0)
FROM (
  SELECT original_sale_id, SUM(total_returned) AS sum_returned
  FROM returns
  GROUP BY original_sale_id
) sub
WHERE s.id = sub.original_sale_id;
