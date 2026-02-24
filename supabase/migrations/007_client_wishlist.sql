-- ==========================================
-- SASTRERÍA PRATS — Migración 007
-- Wishlist / Favoritos de cliente
-- ==========================================

CREATE TABLE client_wishlist (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  UNIQUE(client_id, product_id)
);

CREATE INDEX idx_client_wishlist_client ON client_wishlist(client_id);
CREATE INDEX idx_client_wishlist_product ON client_wishlist(product_id);

ALTER TABLE client_wishlist ENABLE ROW LEVEL SECURITY;

CREATE POLICY "client_wishlist_select" ON client_wishlist FOR SELECT
  USING (client_id IN (SELECT id FROM clients WHERE profile_id = auth.uid()));
CREATE POLICY "client_wishlist_insert" ON client_wishlist FOR INSERT
  WITH CHECK (client_id IN (SELECT id FROM clients WHERE profile_id = auth.uid()));
CREATE POLICY "client_wishlist_delete" ON client_wishlist FOR DELETE
  USING (client_id IN (SELECT id FROM clients WHERE profile_id = auth.uid()));
