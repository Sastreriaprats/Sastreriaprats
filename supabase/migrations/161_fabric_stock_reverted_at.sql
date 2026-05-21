-- ============================================================
-- Migración 161: tracking de reposición de stock de tejido al
-- cancelar o borrar un pedido sastrería.
--
-- Hasta ahora applyFabricStockDelta solo se invocaba en alta y
-- edición de pedidos. Cancelar (status='cancelled') y borrar
-- (deleteOrder) NO devolvían los metros consumidos al stock.
--
-- Esta columna marca con timestamp el momento en que se hizo la
-- reposición para evitar doble reposición si se llama dos veces.
-- Combinado con el bloqueo de transición desde 'cancelled'
-- (cancelled es terminal), garantiza idempotencia.
-- ============================================================

ALTER TABLE tailoring_orders
  ADD COLUMN IF NOT EXISTS fabric_stock_reverted_at TIMESTAMPTZ;

COMMENT ON COLUMN tailoring_orders.fabric_stock_reverted_at IS
  'Si NOT NULL: el tejido de las líneas fue repuesto a fabrics.stock_meters '
  'tras una cancelación o borrado. Sirve para evitar doble reposición. '
  'Las entradas de reposición quedan en fabric_stock_movements con '
  'movement_type=consumption_revert y reference_id=order.id.';
