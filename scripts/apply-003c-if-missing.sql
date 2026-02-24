-- ==========================================
-- 003c: Aplicar solo lo que falta (tipos/tablas ya existen)
-- Ejecutar en Supabase SQL Editor si 003c falla por "already exists"
-- ==========================================

-- 1. Tipos: crear solo si no existen
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'cash_session_status') THEN
    CREATE TYPE cash_session_status AS ENUM ('open', 'closed');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'sale_status') THEN
    CREATE TYPE sale_status AS ENUM ('completed', 'partially_returned', 'fully_returned', 'voided');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'payment_method_type') THEN
    CREATE TYPE payment_method_type AS ENUM ('cash', 'card', 'bizum', 'transfer', 'voucher', 'mixed');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'voucher_status') THEN
    CREATE TYPE voucher_status AS ENUM ('active', 'partially_used', 'used', 'expired', 'cancelled');
  END IF;
END $$;

-- 2. Tablas (IF NOT EXISTS)
CREATE TABLE IF NOT EXISTS cash_sessions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  store_id UUID NOT NULL REFERENCES stores(id) ON DELETE RESTRICT,
  opened_by UUID NOT NULL REFERENCES profiles(id) ON DELETE SET NULL,
  opened_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  opening_amount DECIMAL(12,2) NOT NULL,
  closed_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  closed_at TIMESTAMPTZ,
  total_cash_sales DECIMAL(12,2) DEFAULT 0.00,
  total_card_sales DECIMAL(12,2) DEFAULT 0.00,
  total_bizum_sales DECIMAL(12,2) DEFAULT 0.00,
  total_transfer_sales DECIMAL(12,2) DEFAULT 0.00,
  total_voucher_sales DECIMAL(12,2) DEFAULT 0.00,
  total_sales DECIMAL(12,2) DEFAULT 0.00,
  total_returns DECIMAL(12,2) DEFAULT 0.00,
  total_withdrawals DECIMAL(12,2) DEFAULT 0.00,
  total_deposits_collected DECIMAL(12,2) DEFAULT 0.00,
  expected_cash DECIMAL(12,2),
  counted_cash DECIMAL(12,2),
  cash_difference DECIMAL(12,2),
  status cash_session_status DEFAULT 'open' NOT NULL,
  closing_notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_cash_sessions_store ON cash_sessions(store_id);
CREATE INDEX IF NOT EXISTS idx_cash_sessions_status ON cash_sessions(status);
CREATE INDEX IF NOT EXISTS idx_cash_sessions_opened ON cash_sessions(opened_at DESC);
CREATE INDEX IF NOT EXISTS idx_cash_sessions_open ON cash_sessions(store_id, status) WHERE status = 'open';

DROP TRIGGER IF EXISTS trigger_cash_sessions_updated_at ON cash_sessions;
CREATE TRIGGER trigger_cash_sessions_updated_at
  BEFORE UPDATE ON cash_sessions FOR EACH ROW EXECUTE PROCEDURE update_updated_at();

CREATE TABLE IF NOT EXISTS cash_withdrawals (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  cash_session_id UUID NOT NULL REFERENCES cash_sessions(id) ON DELETE CASCADE,
  amount DECIMAL(12,2) NOT NULL,
  reason TEXT NOT NULL,
  withdrawn_by UUID NOT NULL REFERENCES profiles(id) ON DELETE SET NULL,
  withdrawn_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_cash_withdrawals_session ON cash_withdrawals(cash_session_id);

CREATE TABLE IF NOT EXISTS sales (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  ticket_number VARCHAR(30) NOT NULL UNIQUE,
  cash_session_id UUID NOT NULL REFERENCES cash_sessions(id) ON DELETE RESTRICT,
  store_id UUID NOT NULL REFERENCES stores(id) ON DELETE RESTRICT,
  client_id UUID REFERENCES clients(id) ON DELETE SET NULL,
  salesperson_id UUID NOT NULL REFERENCES profiles(id) ON DELETE SET NULL,
  sale_type TEXT DEFAULT 'boutique' CHECK (sale_type IN ('boutique', 'tailoring_deposit', 'tailoring_final', 'alteration', 'online')),
  subtotal DECIMAL(12,2) NOT NULL,
  discount_amount DECIMAL(12,2) DEFAULT 0.00,
  discount_percentage DECIMAL(5,2) DEFAULT 0.00,
  discount_code TEXT,
  tax_amount DECIMAL(12,2) NOT NULL,
  total DECIMAL(12,2) NOT NULL,
  payment_method payment_method_type NOT NULL,
  is_tax_free BOOLEAN DEFAULT FALSE,
  tax_free_provider TEXT,
  tax_free_document_number TEXT,
  status sale_status DEFAULT 'completed' NOT NULL,
  tailoring_order_id UUID REFERENCES tailoring_orders(id) ON DELETE SET NULL,
  online_order_id UUID,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_sales_ticket ON sales(ticket_number);
CREATE INDEX IF NOT EXISTS idx_sales_session ON sales(cash_session_id);
CREATE INDEX IF NOT EXISTS idx_sales_store ON sales(store_id);
CREATE INDEX IF NOT EXISTS idx_sales_client ON sales(client_id);
CREATE INDEX IF NOT EXISTS idx_sales_salesperson ON sales(salesperson_id);
CREATE INDEX IF NOT EXISTS idx_sales_status ON sales(status);
CREATE INDEX IF NOT EXISTS idx_sales_type ON sales(sale_type);
CREATE INDEX IF NOT EXISTS idx_sales_tailoring ON sales(tailoring_order_id);
CREATE INDEX IF NOT EXISTS idx_sales_date ON sales(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_sales_tax_free ON sales(is_tax_free) WHERE is_tax_free = TRUE;

DROP TRIGGER IF EXISTS trigger_sales_updated_at ON sales;
CREATE TRIGGER trigger_sales_updated_at
  BEFORE UPDATE ON sales FOR EACH ROW EXECUTE PROCEDURE update_updated_at();

CREATE TABLE IF NOT EXISTS sale_lines (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  sale_id UUID NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
  product_variant_id UUID REFERENCES product_variants(id) ON DELETE SET NULL,
  description TEXT NOT NULL,
  sku TEXT,
  quantity INTEGER NOT NULL DEFAULT 1,
  unit_price DECIMAL(10,2) NOT NULL,
  discount_percentage DECIMAL(5,2) DEFAULT 0.00,
  discount_amount DECIMAL(10,2) DEFAULT 0.00,
  tax_rate DECIMAL(5,2) DEFAULT 21.00,
  line_total DECIMAL(10,2) NOT NULL,
  cost_price DECIMAL(10,2),
  quantity_returned INTEGER DEFAULT 0,
  returned_at TIMESTAMPTZ,
  return_reason TEXT,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sale_lines_sale ON sale_lines(sale_id);
CREATE INDEX IF NOT EXISTS idx_sale_lines_variant ON sale_lines(product_variant_id);

CREATE TABLE IF NOT EXISTS sale_payments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  sale_id UUID NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
  payment_method payment_method_type NOT NULL,
  amount DECIMAL(12,2) NOT NULL,
  reference TEXT,
  voucher_id UUID,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sale_payments_sale ON sale_payments(sale_id);
CREATE INDEX IF NOT EXISTS idx_sale_payments_method ON sale_payments(payment_method);

CREATE TABLE IF NOT EXISTS vouchers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  code VARCHAR(20) NOT NULL UNIQUE,
  voucher_type TEXT DEFAULT 'fixed' CHECK (voucher_type IN ('fixed', 'percentage')),
  original_amount DECIMAL(10,2) NOT NULL,
  remaining_amount DECIMAL(10,2) NOT NULL,
  percentage DECIMAL(5,2),
  origin_sale_id UUID REFERENCES sales(id) ON DELETE SET NULL,
  client_id UUID REFERENCES clients(id) ON DELETE SET NULL,
  issued_date DATE DEFAULT CURRENT_DATE NOT NULL,
  expiry_date DATE NOT NULL,
  status voucher_status DEFAULT 'active' NOT NULL,
  issued_by_store_id UUID REFERENCES stores(id) ON DELETE SET NULL,
  issued_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_vouchers_code ON vouchers(code);
CREATE INDEX IF NOT EXISTS idx_vouchers_client ON vouchers(client_id);
CREATE INDEX IF NOT EXISTS idx_vouchers_status ON vouchers(status);
CREATE INDEX IF NOT EXISTS idx_vouchers_expiry ON vouchers(expiry_date) WHERE status = 'active';

DROP TRIGGER IF EXISTS trigger_vouchers_updated_at ON vouchers;
CREATE TRIGGER trigger_vouchers_updated_at
  BEFORE UPDATE ON vouchers FOR EACH ROW EXECUTE PROCEDURE update_updated_at();

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_sale_payments_voucher') THEN
    ALTER TABLE sale_payments
      ADD CONSTRAINT fk_sale_payments_voucher
      FOREIGN KEY (voucher_id) REFERENCES vouchers(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS returns (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  original_sale_id UUID NOT NULL REFERENCES sales(id) ON DELETE RESTRICT,
  return_type TEXT DEFAULT 'exchange' CHECK (return_type IN ('exchange', 'voucher')),
  total_returned DECIMAL(12,2) NOT NULL,
  voucher_id UUID REFERENCES vouchers(id) ON DELETE SET NULL,
  exchange_sale_id UUID REFERENCES sales(id) ON DELETE SET NULL,
  reason TEXT NOT NULL,
  processed_by UUID NOT NULL REFERENCES profiles(id) ON DELETE SET NULL,
  store_id UUID NOT NULL REFERENCES stores(id) ON DELETE RESTRICT,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_returns_original_sale ON returns(original_sale_id);
CREATE INDEX IF NOT EXISTS idx_returns_type ON returns(return_type);
CREATE INDEX IF NOT EXISTS idx_returns_store ON returns(store_id);
CREATE INDEX IF NOT EXISTS idx_returns_date ON returns(created_at DESC);

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'boutique_alterations')
     AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_alterations_sale') THEN
    ALTER TABLE boutique_alterations
      ADD CONSTRAINT fk_alterations_sale
      FOREIGN KEY (sale_id) REFERENCES sales(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS discount_codes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  code VARCHAR(30) NOT NULL UNIQUE,
  description TEXT,
  discount_type TEXT DEFAULT 'percentage' CHECK (discount_type IN ('percentage', 'fixed')),
  discount_value DECIMAL(10,2) NOT NULL,
  min_purchase DECIMAL(10,2),
  max_uses INTEGER,
  current_uses INTEGER DEFAULT 0,
  valid_from DATE DEFAULT CURRENT_DATE,
  valid_until DATE,
  applies_to TEXT DEFAULT 'all' CHECK (applies_to IN ('all', 'boutique', 'tailoring', 'online')),
  category_ids UUID[] DEFAULT '{}',
  is_active BOOLEAN DEFAULT TRUE NOT NULL,
  created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_discount_codes_code ON discount_codes(code);
CREATE INDEX IF NOT EXISTS idx_discount_codes_active ON discount_codes(is_active, valid_until);

DROP TRIGGER IF EXISTS trigger_discount_codes_updated_at ON discount_codes;
CREATE TRIGGER trigger_discount_codes_updated_at
  BEFORE UPDATE ON discount_codes FOR EACH ROW EXECUTE PROCEDURE update_updated_at();
