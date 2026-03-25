-- Empresas asociadas a clientes (para facturación)
CREATE TABLE IF NOT EXISTS client_companies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  company_name TEXT NOT NULL,
  nif TEXT,
  address TEXT,
  city TEXT,
  postal_code TEXT,
  province TEXT,
  country TEXT DEFAULT 'España',
  contact_name TEXT,
  contact_email TEXT,
  contact_phone TEXT,
  notes TEXT,
  is_default BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_client_companies_client ON client_companies(client_id);

-- RLS
ALTER TABLE client_companies ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view client companies"
  ON client_companies FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated users can insert client companies"
  ON client_companies FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Authenticated users can update client companies"
  ON client_companies FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Authenticated users can delete client companies"
  ON client_companies FOR DELETE TO authenticated USING (true);
