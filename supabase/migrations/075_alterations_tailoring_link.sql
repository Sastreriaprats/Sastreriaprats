-- Vincular arreglos a pedidos de sastrería y añadir campos de gestión
ALTER TABLE boutique_alterations ADD COLUMN IF NOT EXISTS tailoring_order_id UUID REFERENCES tailoring_orders(id) ON DELETE SET NULL;
ALTER TABLE boutique_alterations ADD COLUMN IF NOT EXISTS alteration_type TEXT DEFAULT 'external';
-- alteration_type: 'order' (sobre pedido sastrería) | 'boutique' (sobre venta boutique) | 'external' (prenda externa)
ALTER TABLE boutique_alterations ADD COLUMN IF NOT EXISTS garment_type TEXT;
-- garment_type: texto libre describiendo la prenda (ej: "Pantalón", "Americana", "Vestido externo")
ALTER TABLE boutique_alterations ADD COLUMN IF NOT EXISTS assigned_to UUID REFERENCES profiles(id) ON DELETE SET NULL;
-- assigned_to: oficial/sastre que hace el arreglo

CREATE INDEX IF NOT EXISTS idx_alterations_tailoring_order ON boutique_alterations(tailoring_order_id);
CREATE INDEX IF NOT EXISTS idx_alterations_type ON boutique_alterations(alteration_type);
CREATE INDEX IF NOT EXISTS idx_alterations_assigned ON boutique_alterations(assigned_to);
