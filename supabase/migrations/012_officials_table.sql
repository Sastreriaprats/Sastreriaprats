-- Tabla officials (oficiales / sastres externos)
CREATE TABLE IF NOT EXISTS officials (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  legal_name TEXT,
  nif_cif TEXT,
  phone TEXT,
  email TEXT,
  specialty TEXT,
  price_per_garment DECIMAL(10,2),
  address TEXT,
  city TEXT,
  postal_code TEXT,
  province TEXT,
  country TEXT DEFAULT 'España',
  bank_iban TEXT,
  payment_terms TEXT,
  internal_notes TEXT,
  is_active BOOLEAN DEFAULT TRUE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE INDEX idx_officials_name ON officials(name);
CREATE INDEX idx_officials_active ON officials(is_active);

CREATE TRIGGER trigger_officials_updated_at
  BEFORE UPDATE ON officials FOR EACH ROW
  EXECUTE PROCEDURE update_updated_at();

ALTER TABLE officials ENABLE ROW LEVEL SECURITY;

CREATE POLICY "officials_select" ON officials FOR SELECT USING (user_has_permission(auth.uid(), 'officials.view'));
CREATE POLICY "officials_insert" ON officials FOR INSERT WITH CHECK (user_has_permission(auth.uid(), 'officials.create'));
CREATE POLICY "officials_update" ON officials FOR UPDATE USING (user_has_permission(auth.uid(), 'officials.edit'));
CREATE POLICY "officials_delete" ON officials FOR DELETE USING (user_has_permission(auth.uid(), 'officials.edit'));
