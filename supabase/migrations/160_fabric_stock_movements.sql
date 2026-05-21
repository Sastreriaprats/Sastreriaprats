-- ============================================================
-- Migración 152: histórico de movimientos de stock de tejidos.
--
-- Hasta ahora fabrics.stock_meters se actualizaba por UPDATE
-- directo (applyFabricStockDelta en orders.ts) sin dejar rastro
-- de quién consumió cuántos metros por qué pedido. Tampoco había
-- forma de ajustar stock manualmente desde la UI (la nota en
-- EditFabricDialog "usa los movimientos de entrada/salida" era
-- una promesa sin implementar).
--
-- Esta migración:
--   1) crea el enum fabric_movement_type
--   2) crea la tabla fabric_stock_movements como bitácora
--   3) añade índices por fabric_id y por referencia externa
--
-- Idempotente: usa IF NOT EXISTS y DO $$ ... $$ para el enum.
-- ============================================================

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'fabric_movement_type') THEN
    CREATE TYPE fabric_movement_type AS ENUM (
      'consumption',         -- consumo automático por ficha sastrería (stock baja)
      'consumption_revert',  -- devolución al editar/cancelar ficha (stock sube)
      'reception',           -- recepción de proveedor (stock sube)
      'adjustment_positive', -- ajuste manual positivo
      'adjustment_negative', -- ajuste manual negativo
      'inventory_set'        -- recuento físico (sobreescribir cantidad exacta)
    );
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS fabric_stock_movements (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fabric_id       UUID NOT NULL REFERENCES fabrics(id) ON DELETE RESTRICT,
  movement_type   fabric_movement_type NOT NULL,
  -- Cambio aplicado al stock. POSITIVO si entró stock, NEGATIVO si salió.
  -- stock_after - stock_before === quantity_delta (invariante).
  quantity_delta  NUMERIC(10,2) NOT NULL,
  stock_before    NUMERIC(10,2) NOT NULL,
  stock_after     NUMERIC(10,2) NOT NULL,
  reason          TEXT,
  -- Origen de la operación. 'manual' para ajustes desde UI; 'tailoring_order'
  -- para consumos/devoluciones automáticas por ficha.
  reference_type  TEXT,
  reference_id    UUID,
  created_by      UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_fabric_movements_fabric
  ON fabric_stock_movements (fabric_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_fabric_movements_ref
  ON fabric_stock_movements (reference_type, reference_id);
