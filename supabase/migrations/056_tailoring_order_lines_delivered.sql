-- delivered_at y delivered_by en líneas de pedido (marcar pieza entregada)
ALTER TABLE tailoring_order_lines
  ADD COLUMN IF NOT EXISTS delivered_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS delivered_by UUID REFERENCES profiles(id) ON DELETE SET NULL;

COMMENT ON COLUMN tailoring_order_lines.delivered_at IS 'Fecha/hora en que se marcó la pieza como entregada';
COMMENT ON COLUMN tailoring_order_lines.delivered_by IS 'Usuario que marcó la pieza como entregada';
