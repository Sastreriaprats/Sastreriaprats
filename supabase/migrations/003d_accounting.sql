-- ==========================================
-- SASTRERÍA PRATS — Migración 003d
-- Contabilidad Completa (PGC), Facturación, Gastos
-- ==========================================

-- 1. ENUMS
CREATE TYPE account_type AS ENUM (
  'asset', 'liability', 'equity', 'income', 'expense'
);
CREATE TYPE entry_status AS ENUM ('draft', 'posted', 'cancelled');
CREATE TYPE invoice_type AS ENUM ('issued', 'received');
CREATE TYPE invoice_status AS ENUM ('draft', 'issued', 'paid', 'partially_paid', 'overdue', 'cancelled', 'rectified');
CREATE TYPE expense_status AS ENUM ('pending', 'approved', 'paid', 'rejected');

-- 2. PLAN GENERAL CONTABLE (árbol de cuentas)
CREATE TABLE chart_of_accounts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  
  account_code VARCHAR(20) NOT NULL UNIQUE,
  name TEXT NOT NULL,
  description TEXT,
  
  parent_code VARCHAR(20) REFERENCES chart_of_accounts(account_code) ON DELETE SET NULL,
  level INTEGER NOT NULL,
  
  account_type account_type NOT NULL,
  
  normal_balance TEXT DEFAULT 'debit' CHECK (normal_balance IN ('debit', 'credit')),
  
  is_detail BOOLEAN DEFAULT FALSE,
  
  is_system BOOLEAN DEFAULT FALSE,
  
  current_balance DECIMAL(14,2) DEFAULT 0.00,
  
  is_active BOOLEAN DEFAULT TRUE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE INDEX idx_coa_code ON chart_of_accounts(account_code);
CREATE INDEX idx_coa_parent ON chart_of_accounts(parent_code);
CREATE INDEX idx_coa_type ON chart_of_accounts(account_type);
CREATE INDEX idx_coa_detail ON chart_of_accounts(is_detail) WHERE is_detail = TRUE;
CREATE INDEX idx_coa_active ON chart_of_accounts(is_active);

CREATE TRIGGER trigger_coa_updated_at
  BEFORE UPDATE ON chart_of_accounts FOR EACH ROW EXECUTE PROCEDURE update_updated_at();

-- 3. ASIENTOS CONTABLES (cabecera)
CREATE TABLE journal_entries (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  
  entry_number INTEGER NOT NULL,
  
  fiscal_year INTEGER NOT NULL,
  fiscal_month INTEGER NOT NULL CHECK (fiscal_month BETWEEN 1 AND 12),
  
  entry_date DATE NOT NULL,
  
  description TEXT NOT NULL,
  
  entry_type TEXT DEFAULT 'manual' CHECK (entry_type IN (
    'manual', 'sale', 'purchase', 'payment_received', 'payment_sent',
    'deposit', 'cash_close', 'adjustment', 'opening', 'closing'
  )),
  
  reference_type TEXT,
  reference_id UUID,
  reference_number TEXT,
  
  status entry_status DEFAULT 'draft' NOT NULL,
  posted_at TIMESTAMPTZ,
  posted_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  
  is_period_closed BOOLEAN DEFAULT FALSE,
  
  created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  
  total_debit DECIMAL(14,2) DEFAULT 0.00,
  total_credit DECIMAL(14,2) DEFAULT 0.00,
  
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  
  UNIQUE(fiscal_year, entry_number)
);

CREATE INDEX idx_journal_entries_number ON journal_entries(fiscal_year, entry_number);
CREATE INDEX idx_journal_entries_date ON journal_entries(entry_date DESC);
CREATE INDEX idx_journal_entries_type ON journal_entries(entry_type);
CREATE INDEX idx_journal_entries_status ON journal_entries(status);
CREATE INDEX idx_journal_entries_reference ON journal_entries(reference_type, reference_id);
CREATE INDEX idx_journal_entries_period ON journal_entries(fiscal_year, fiscal_month);

CREATE TRIGGER trigger_journal_entries_updated_at
  BEFORE UPDATE ON journal_entries FOR EACH ROW EXECUTE PROCEDURE update_updated_at();

-- 4. LÍNEAS DE ASIENTO (apuntes)
CREATE TABLE journal_entry_lines (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  journal_entry_id UUID NOT NULL REFERENCES journal_entries(id) ON DELETE CASCADE,
  
  account_code VARCHAR(20) NOT NULL REFERENCES chart_of_accounts(account_code) ON DELETE RESTRICT,
  
  debit DECIMAL(14,2) DEFAULT 0.00,
  credit DECIMAL(14,2) DEFAULT 0.00,
  
  description TEXT,
  
  entity_type TEXT,
  entity_id UUID,
  
  sort_order INTEGER DEFAULT 0,
  
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE INDEX idx_journal_lines_entry ON journal_entry_lines(journal_entry_id);
CREATE INDEX idx_journal_lines_account ON journal_entry_lines(account_code);
CREATE INDEX idx_journal_lines_entity ON journal_entry_lines(entity_type, entity_id);

-- 5. PERÍODOS CONTABLES
CREATE TABLE fiscal_periods (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  fiscal_year INTEGER NOT NULL,
  fiscal_month INTEGER NOT NULL CHECK (fiscal_month BETWEEN 1 AND 12),
  
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  
  is_closed BOOLEAN DEFAULT FALSE,
  closed_at TIMESTAMPTZ,
  closed_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  
  total_income DECIMAL(14,2) DEFAULT 0.00,
  total_expenses DECIMAL(14,2) DEFAULT 0.00,
  net_result DECIMAL(14,2) DEFAULT 0.00,
  
  notes TEXT,
  
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  
  UNIQUE(fiscal_year, fiscal_month)
);

CREATE INDEX idx_fiscal_periods_year ON fiscal_periods(fiscal_year);
CREATE INDEX idx_fiscal_periods_closed ON fiscal_periods(is_closed);

-- 6. FACTURAS EMITIDAS
CREATE TABLE invoices (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  
  invoice_number VARCHAR(30) NOT NULL UNIQUE,
  invoice_series TEXT DEFAULT 'F' NOT NULL,
  
  invoice_type invoice_type DEFAULT 'issued' NOT NULL,
  
  client_id UUID REFERENCES clients(id) ON DELETE SET NULL,
  client_name TEXT NOT NULL,
  client_nif TEXT,
  client_address TEXT,
  
  company_name TEXT NOT NULL,
  company_nif TEXT NOT NULL,
  company_address TEXT NOT NULL,
  
  invoice_date DATE NOT NULL,
  due_date DATE,
  
  subtotal DECIMAL(12,2) NOT NULL,
  tax_rate DECIMAL(5,2) DEFAULT 21.00,
  tax_amount DECIMAL(12,2) NOT NULL,
  irpf_rate DECIMAL(5,2) DEFAULT 0.00,
  irpf_amount DECIMAL(12,2) DEFAULT 0.00,
  recargo_rate DECIMAL(5,2) DEFAULT 0.00,
  recargo_amount DECIMAL(12,2) DEFAULT 0.00,
  total DECIMAL(12,2) NOT NULL,
  
  amount_paid DECIMAL(12,2) DEFAULT 0.00,
  is_fully_paid BOOLEAN DEFAULT FALSE,
  
  status invoice_status DEFAULT 'draft' NOT NULL,
  
  is_rectifying BOOLEAN DEFAULT FALSE,
  rectifies_invoice_id UUID REFERENCES invoices(id) ON DELETE SET NULL,
  rectification_reason TEXT,
  
  quaderno_id TEXT,
  verifactu_hash TEXT,
  verifactu_sent BOOLEAN DEFAULT FALSE,
  verifactu_sent_at TIMESTAMPTZ,
  
  pdf_url TEXT,
  sent_to_client BOOLEAN DEFAULT FALSE,
  sent_at TIMESTAMPTZ,
  
  sale_id UUID REFERENCES sales(id) ON DELETE SET NULL,
  tailoring_order_id UUID REFERENCES tailoring_orders(id) ON DELETE SET NULL,
  online_order_id UUID,
  
  store_id UUID REFERENCES stores(id) ON DELETE SET NULL,
  
  journal_entry_id UUID REFERENCES journal_entries(id) ON DELETE SET NULL,
  
  notes TEXT,
  created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE INDEX idx_invoices_number ON invoices(invoice_number);
CREATE INDEX idx_invoices_series ON invoices(invoice_series, invoice_number);
CREATE INDEX idx_invoices_client ON invoices(client_id);
CREATE INDEX idx_invoices_type ON invoices(invoice_type);
CREATE INDEX idx_invoices_status ON invoices(status);
CREATE INDEX idx_invoices_date ON invoices(invoice_date DESC);
CREATE INDEX idx_invoices_due ON invoices(due_date) WHERE is_fully_paid = FALSE;
CREATE INDEX idx_invoices_sale ON invoices(sale_id);
CREATE INDEX idx_invoices_tailoring ON invoices(tailoring_order_id);
CREATE INDEX idx_invoices_rectifying ON invoices(rectifies_invoice_id);
CREATE INDEX idx_invoices_quaderno ON invoices(quaderno_id);

CREATE TRIGGER trigger_invoices_updated_at
  BEFORE UPDATE ON invoices FOR EACH ROW EXECUTE PROCEDURE update_updated_at();

-- 7. LÍNEAS DE FACTURA
CREATE TABLE invoice_lines (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  invoice_id UUID NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  
  description TEXT NOT NULL,
  quantity DECIMAL(10,2) NOT NULL DEFAULT 1,
  unit_price DECIMAL(10,2) NOT NULL,
  discount_percentage DECIMAL(5,2) DEFAULT 0.00,
  tax_rate DECIMAL(5,2) DEFAULT 21.00,
  line_total DECIMAL(10,2) NOT NULL,
  
  product_variant_id UUID REFERENCES product_variants(id) ON DELETE SET NULL,
  
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE INDEX idx_invoice_lines_invoice ON invoice_lines(invoice_id);

-- Vincular tailoring_orders.invoice_id
ALTER TABLE tailoring_orders
  ADD CONSTRAINT fk_tailoring_orders_invoice
  FOREIGN KEY (invoice_id) REFERENCES invoices(id) ON DELETE SET NULL;

-- 8. GASTOS INTERNOS
CREATE TABLE expenses (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  
  category TEXT NOT NULL,
  subcategory TEXT,
  
  description TEXT NOT NULL,
  amount DECIMAL(12,2) NOT NULL,
  tax_rate DECIMAL(5,2) DEFAULT 21.00,
  tax_amount DECIMAL(12,2) DEFAULT 0.00,
  total DECIMAL(12,2) NOT NULL,
  
  expense_date DATE NOT NULL,
  
  is_recurring BOOLEAN DEFAULT FALSE,
  recurrence_period TEXT CHECK (recurrence_period IN ('monthly', 'quarterly', 'yearly')),
  
  supplier_id UUID REFERENCES suppliers(id) ON DELETE SET NULL,
  supplier_invoice_id UUID REFERENCES supplier_invoices(id) ON DELETE SET NULL,
  
  store_id UUID REFERENCES stores(id) ON DELETE SET NULL,
  
  status expense_status DEFAULT 'pending' NOT NULL,
  approved_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  approved_at TIMESTAMPTZ,
  
  account_code VARCHAR(20) REFERENCES chart_of_accounts(account_code) ON DELETE SET NULL,
  journal_entry_id UUID REFERENCES journal_entries(id) ON DELETE SET NULL,
  
  document_url TEXT,
  
  notes TEXT,
  created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE INDEX idx_expenses_category ON expenses(category);
CREATE INDEX idx_expenses_date ON expenses(expense_date DESC);
CREATE INDEX idx_expenses_status ON expenses(status);
CREATE INDEX idx_expenses_store ON expenses(store_id);
CREATE INDEX idx_expenses_supplier ON expenses(supplier_id);
CREATE INDEX idx_expenses_recurring ON expenses(is_recurring) WHERE is_recurring = TRUE;

CREATE TRIGGER trigger_expenses_updated_at
  BEFORE UPDATE ON expenses FOR EACH ROW EXECUTE PROCEDURE update_updated_at();

-- 9. COMISIONES DE VENDEDORES
CREATE TABLE sales_commissions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  
  salesperson_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  
  target_amount DECIMAL(12,2),
  actual_amount DECIMAL(12,2) DEFAULT 0.00,
  
  commission_rate DECIMAL(5,2) NOT NULL,
  bonus_rate DECIMAL(5,2) DEFAULT 0.00,
  commission_amount DECIMAL(12,2) DEFAULT 0.00,
  bonus_amount DECIMAL(12,2) DEFAULT 0.00,
  total_commission DECIMAL(12,2) DEFAULT 0.00,
  
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'calculated', 'approved', 'paid')),
  
  store_id UUID REFERENCES stores(id) ON DELETE SET NULL,
  
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE INDEX idx_commissions_salesperson ON sales_commissions(salesperson_id);
CREATE INDEX idx_commissions_period ON sales_commissions(period_start, period_end);
CREATE INDEX idx_commissions_status ON sales_commissions(status);

CREATE TRIGGER trigger_commissions_updated_at
  BEFORE UPDATE ON sales_commissions FOR EACH ROW EXECUTE PROCEDURE update_updated_at();

-- ==========================================
-- SEED: PLAN GENERAL CONTABLE ESPAÑOL (SIMPLIFICADO)
-- ==========================================

-- Grupo 1: Financiación básica
INSERT INTO chart_of_accounts (account_code, name, level, account_type, normal_balance, is_detail) VALUES
  ('1', 'FINANCIACIÓN BÁSICA', 1, 'equity', 'credit', FALSE),
  ('10', 'Capital', 2, 'equity', 'credit', FALSE),
  ('100', 'Capital social', 3, 'equity', 'credit', TRUE),
  ('11', 'Reservas', 2, 'equity', 'credit', FALSE),
  ('113', 'Reservas voluntarias', 3, 'equity', 'credit', TRUE),
  ('12', 'Resultados pendientes de aplicación', 2, 'equity', 'credit', FALSE),
  ('120', 'Remanente', 3, 'equity', 'credit', TRUE),
  ('129', 'Resultado del ejercicio', 3, 'equity', 'credit', TRUE),
  ('17', 'Deudas a largo plazo', 2, 'liability', 'credit', FALSE),
  ('170', 'Deudas a largo plazo con entidades de crédito', 3, 'liability', 'credit', TRUE);

-- Grupo 2: Inmovilizado
INSERT INTO chart_of_accounts (account_code, name, level, account_type, normal_balance, is_detail) VALUES
  ('2', 'INMOVILIZADO', 1, 'asset', 'debit', FALSE),
  ('21', 'Inmovilizaciones materiales', 2, 'asset', 'debit', FALSE),
  ('211', 'Construcciones', 3, 'asset', 'debit', TRUE),
  ('216', 'Mobiliario', 3, 'asset', 'debit', TRUE),
  ('217', 'Equipos proceso información', 3, 'asset', 'debit', TRUE),
  ('218', 'Elementos de transporte', 3, 'asset', 'debit', TRUE),
  ('28', 'Amortización acumulada inmovilizado', 2, 'asset', 'credit', FALSE),
  ('281', 'A.A. de inmovilizaciones materiales', 3, 'asset', 'credit', TRUE);

-- Grupo 3: Existencias
INSERT INTO chart_of_accounts (account_code, name, level, account_type, normal_balance, is_detail) VALUES
  ('3', 'EXISTENCIAS', 1, 'asset', 'debit', FALSE),
  ('30', 'Comerciales', 2, 'asset', 'debit', FALSE),
  ('300', 'Mercaderías', 3, 'asset', 'debit', TRUE),
  ('3001', 'Mercaderías boutique', 4, 'asset', 'debit', TRUE),
  ('3002', 'Tejidos', 4, 'asset', 'debit', TRUE),
  ('3003', 'Accesorios', 4, 'asset', 'debit', TRUE);

-- Grupo 4: Acreedores y deudores
INSERT INTO chart_of_accounts (account_code, name, level, account_type, normal_balance, is_detail) VALUES
  ('4', 'ACREEDORES Y DEUDORES', 1, 'liability', 'credit', FALSE),
  ('40', 'Proveedores', 2, 'liability', 'credit', FALSE),
  ('400', 'Proveedores', 3, 'liability', 'credit', TRUE),
  ('4000', 'Proveedores tejidos', 4, 'liability', 'credit', TRUE),
  ('4001', 'Proveedores confección', 4, 'liability', 'credit', TRUE),
  ('4002', 'Proveedores accesorios', 4, 'liability', 'credit', TRUE),
  ('41', 'Acreedores varios', 2, 'liability', 'credit', FALSE),
  ('410', 'Acreedores prestaciones servicios', 3, 'liability', 'credit', TRUE),
  ('43', 'Clientes', 2, 'asset', 'debit', FALSE),
  ('430', 'Clientes', 3, 'asset', 'debit', TRUE),
  ('4300', 'Clientes sastrería', 4, 'asset', 'debit', TRUE),
  ('4301', 'Clientes boutique', 4, 'asset', 'debit', TRUE),
  ('4302', 'Clientes web', 4, 'asset', 'debit', TRUE),
  ('438', 'Anticipos de clientes', 3, 'asset', 'credit', TRUE),
  ('47', 'Administraciones públicas', 2, 'liability', 'credit', FALSE),
  ('472', 'HP IVA soportado', 3, 'asset', 'debit', TRUE),
  ('477', 'HP IVA repercutido', 3, 'liability', 'credit', TRUE),
  ('475', 'HP acreedor por conceptos fiscales', 3, 'liability', 'credit', TRUE),
  ('4750', 'HP acreedor por IVA', 4, 'liability', 'credit', TRUE),
  ('4751', 'HP acreedor por retenciones', 4, 'liability', 'credit', TRUE);

-- Grupo 5: Cuentas financieras
INSERT INTO chart_of_accounts (account_code, name, level, account_type, normal_balance, is_detail, is_system) VALUES
  ('5', 'CUENTAS FINANCIERAS', 1, 'asset', 'debit', FALSE, FALSE),
  ('52', 'Deudas a corto plazo', 2, 'liability', 'credit', FALSE, FALSE),
  ('520', 'Deudas a corto plazo con entidades de crédito', 3, 'liability', 'credit', TRUE, FALSE),
  ('57', 'Tesorería', 2, 'asset', 'debit', FALSE, FALSE),
  ('570', 'Caja', 3, 'asset', 'debit', FALSE, TRUE),
  ('5700', 'Caja Pinzón', 4, 'asset', 'debit', TRUE, TRUE),
  ('5701', 'Caja Wellington', 4, 'asset', 'debit', TRUE, TRUE),
  ('572', 'Bancos', 3, 'asset', 'debit', FALSE, TRUE),
  ('5720', 'Banco Santander', 4, 'asset', 'debit', TRUE, TRUE),
  ('5721', 'Banco CaixaBank', 4, 'asset', 'debit', TRUE, TRUE),
  ('5722', 'Stripe', 4, 'asset', 'debit', TRUE, TRUE),
  ('5723', 'Bizum', 4, 'asset', 'debit', TRUE, TRUE);

-- Grupo 6: Compras y gastos
INSERT INTO chart_of_accounts (account_code, name, level, account_type, normal_balance, is_detail) VALUES
  ('6', 'COMPRAS Y GASTOS', 1, 'expense', 'debit', FALSE),
  ('60', 'Compras', 2, 'expense', 'debit', FALSE),
  ('600', 'Compras mercaderías', 3, 'expense', 'debit', TRUE),
  ('6000', 'Compras tejidos', 4, 'expense', 'debit', TRUE),
  ('6001', 'Compras boutique', 4, 'expense', 'debit', TRUE),
  ('6002', 'Compras accesorios', 4, 'expense', 'debit', TRUE),
  ('607', 'Trabajos realizados por otras empresas', 3, 'expense', 'debit', TRUE),
  ('62', 'Servicios exteriores', 2, 'expense', 'debit', FALSE),
  ('621', 'Arrendamientos', 3, 'expense', 'debit', TRUE),
  ('622', 'Reparaciones y conservación', 3, 'expense', 'debit', TRUE),
  ('623', 'Servicios profesionales independientes', 3, 'expense', 'debit', TRUE),
  ('624', 'Transportes', 3, 'expense', 'debit', TRUE),
  ('625', 'Primas de seguros', 3, 'expense', 'debit', TRUE),
  ('626', 'Servicios bancarios', 3, 'expense', 'debit', TRUE),
  ('627', 'Publicidad y marketing', 3, 'expense', 'debit', TRUE),
  ('628', 'Suministros', 3, 'expense', 'debit', TRUE),
  ('629', 'Otros servicios', 3, 'expense', 'debit', TRUE),
  ('63', 'Tributos', 2, 'expense', 'debit', FALSE),
  ('631', 'Otros tributos', 3, 'expense', 'debit', TRUE),
  ('64', 'Gastos de personal', 2, 'expense', 'debit', FALSE),
  ('640', 'Sueldos y salarios', 3, 'expense', 'debit', TRUE),
  ('642', 'Seguridad Social a cargo de la empresa', 3, 'expense', 'debit', TRUE),
  ('68', 'Dotaciones amortizaciones', 2, 'expense', 'debit', FALSE),
  ('681', 'Amortización inmovilizado material', 3, 'expense', 'debit', TRUE);

-- Grupo 7: Ventas e ingresos
INSERT INTO chart_of_accounts (account_code, name, level, account_type, normal_balance, is_detail) VALUES
  ('7', 'VENTAS E INGRESOS', 1, 'income', 'credit', FALSE),
  ('70', 'Ventas', 2, 'income', 'credit', FALSE),
  ('700', 'Ventas mercaderías', 3, 'income', 'credit', TRUE),
  ('7000', 'Ventas sastrería artesanal', 4, 'income', 'credit', TRUE),
  ('7001', 'Ventas sastrería industrial', 4, 'income', 'credit', TRUE),
  ('7002', 'Ventas boutique', 4, 'income', 'credit', TRUE),
  ('7003', 'Ventas online', 4, 'income', 'credit', TRUE),
  ('7004', 'Ventas accesorios', 4, 'income', 'credit', TRUE),
  ('708', 'Devoluciones ventas', 3, 'income', 'debit', TRUE),
  ('709', 'Rappels sobre ventas', 3, 'income', 'debit', TRUE),
  ('75', 'Otros ingresos de gestión', 2, 'income', 'credit', FALSE),
  ('759', 'Ingresos por servicios diversos', 3, 'income', 'credit', TRUE);

-- Establecer jerarquía parent_code
UPDATE chart_of_accounts SET parent_code = '1' WHERE account_code IN ('10', '11', '12', '17');
UPDATE chart_of_accounts SET parent_code = '10' WHERE account_code = '100';
UPDATE chart_of_accounts SET parent_code = '11' WHERE account_code = '113';
UPDATE chart_of_accounts SET parent_code = '12' WHERE account_code IN ('120', '129');
UPDATE chart_of_accounts SET parent_code = '17' WHERE account_code = '170';

UPDATE chart_of_accounts SET parent_code = '2' WHERE account_code IN ('21', '28');
UPDATE chart_of_accounts SET parent_code = '21' WHERE account_code IN ('211', '216', '217', '218');
UPDATE chart_of_accounts SET parent_code = '28' WHERE account_code = '281';

UPDATE chart_of_accounts SET parent_code = '3' WHERE account_code = '30';
UPDATE chart_of_accounts SET parent_code = '30' WHERE account_code = '300';
UPDATE chart_of_accounts SET parent_code = '300' WHERE account_code IN ('3001', '3002', '3003');

UPDATE chart_of_accounts SET parent_code = '4' WHERE account_code IN ('40', '41', '43', '47');
UPDATE chart_of_accounts SET parent_code = '40' WHERE account_code = '400';
UPDATE chart_of_accounts SET parent_code = '400' WHERE account_code IN ('4000', '4001', '4002');
UPDATE chart_of_accounts SET parent_code = '41' WHERE account_code = '410';
UPDATE chart_of_accounts SET parent_code = '43' WHERE account_code IN ('430', '438');
UPDATE chart_of_accounts SET parent_code = '430' WHERE account_code IN ('4300', '4301', '4302');
UPDATE chart_of_accounts SET parent_code = '47' WHERE account_code IN ('472', '477', '475');
UPDATE chart_of_accounts SET parent_code = '475' WHERE account_code IN ('4750', '4751');

UPDATE chart_of_accounts SET parent_code = '5' WHERE account_code IN ('52', '57');
UPDATE chart_of_accounts SET parent_code = '52' WHERE account_code = '520';
UPDATE chart_of_accounts SET parent_code = '57' WHERE account_code IN ('570', '572');
UPDATE chart_of_accounts SET parent_code = '570' WHERE account_code IN ('5700', '5701');
UPDATE chart_of_accounts SET parent_code = '572' WHERE account_code IN ('5720', '5721', '5722', '5723');

UPDATE chart_of_accounts SET parent_code = '6' WHERE account_code IN ('60', '62', '63', '64', '68');
UPDATE chart_of_accounts SET parent_code = '60' WHERE account_code IN ('600', '607');
UPDATE chart_of_accounts SET parent_code = '600' WHERE account_code IN ('6000', '6001', '6002');
UPDATE chart_of_accounts SET parent_code = '62' WHERE account_code IN ('621', '622', '623', '624', '625', '626', '627', '628', '629');
UPDATE chart_of_accounts SET parent_code = '63' WHERE account_code = '631';
UPDATE chart_of_accounts SET parent_code = '64' WHERE account_code IN ('640', '642');
UPDATE chart_of_accounts SET parent_code = '68' WHERE account_code = '681';

UPDATE chart_of_accounts SET parent_code = '7' WHERE account_code IN ('70', '75');
UPDATE chart_of_accounts SET parent_code = '70' WHERE account_code IN ('700', '708', '709');
UPDATE chart_of_accounts SET parent_code = '700' WHERE account_code IN ('7000', '7001', '7002', '7003', '7004');
UPDATE chart_of_accounts SET parent_code = '75' WHERE account_code = '759';

-- SEED: Períodos fiscales 2026
INSERT INTO fiscal_periods (fiscal_year, fiscal_month, start_date, end_date)
SELECT 2026, m, 
  MAKE_DATE(2026, m, 1),
  (MAKE_DATE(2026, m, 1) + INTERVAL '1 month - 1 day')::date
FROM generate_series(1, 12) AS m;

-- ==========================================
-- RLS PARA TODAS LAS TABLAS NUEVAS
-- ==========================================

-- Products & Stock
ALTER TABLE product_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_variants ENABLE ROW LEVEL SECURITY;
ALTER TABLE stock_levels ENABLE ROW LEVEL SECURITY;
ALTER TABLE stock_movements ENABLE ROW LEVEL SECURITY;
ALTER TABLE stock_transfers ENABLE ROW LEVEL SECURITY;
ALTER TABLE stock_transfer_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventories ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_lines ENABLE ROW LEVEL SECURITY;

-- Tailoring Orders
ALTER TABLE tailoring_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE tailoring_order_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE tailoring_order_state_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE tailoring_fittings ENABLE ROW LEVEL SECURITY;

-- POS
ALTER TABLE cash_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE cash_withdrawals ENABLE ROW LEVEL SECURITY;
ALTER TABLE sales ENABLE ROW LEVEL SECURITY;
ALTER TABLE sale_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE sale_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE vouchers ENABLE ROW LEVEL SECURITY;
ALTER TABLE returns ENABLE ROW LEVEL SECURITY;
ALTER TABLE discount_codes ENABLE ROW LEVEL SECURITY;

-- Accounting
ALTER TABLE chart_of_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE journal_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE journal_entry_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE fiscal_periods ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoice_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE sales_commissions ENABLE ROW LEVEL SECURITY;

-- === POLICIES ===

-- Product categories: lectura pública (tienda online), escritura admin
CREATE POLICY "product_categories_select" ON product_categories FOR SELECT USING (TRUE);
CREATE POLICY "product_categories_modify" ON product_categories FOR ALL USING (user_has_permission(auth.uid(), 'stock.manage_categories'));

-- Products
CREATE POLICY "products_select_staff" ON products FOR SELECT USING (user_has_permission(auth.uid(), 'stock.read'));
CREATE POLICY "products_select_web" ON products FOR SELECT USING (is_visible_web = TRUE AND is_active = TRUE);
CREATE POLICY "products_insert" ON products FOR INSERT WITH CHECK (user_has_permission(auth.uid(), 'stock.create_product'));
CREATE POLICY "products_update" ON products FOR UPDATE USING (user_has_permission(auth.uid(), 'stock.update_product'));
CREATE POLICY "products_delete" ON products FOR DELETE USING (user_has_permission(auth.uid(), 'stock.delete_product'));

-- Product variants
CREATE POLICY "variants_select_staff" ON product_variants FOR SELECT USING (user_has_permission(auth.uid(), 'stock.read'));
CREATE POLICY "variants_select_web" ON product_variants FOR SELECT USING (
  product_id IN (SELECT id FROM products WHERE is_visible_web = TRUE AND is_active = TRUE)
);
CREATE POLICY "variants_modify" ON product_variants FOR ALL USING (user_has_permission(auth.uid(), 'stock.create_product'));

-- Stock levels
CREATE POLICY "stock_select" ON stock_levels FOR SELECT USING (user_has_permission(auth.uid(), 'stock.read'));
CREATE POLICY "stock_modify" ON stock_levels FOR ALL USING (user_has_permission(auth.uid(), 'stock.adjust'));

-- Stock movements
CREATE POLICY "movements_select" ON stock_movements FOR SELECT USING (user_has_permission(auth.uid(), 'stock.read'));
CREATE POLICY "movements_insert" ON stock_movements FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

-- Transfers
CREATE POLICY "transfers_select" ON stock_transfers FOR SELECT USING (user_has_permission(auth.uid(), 'stock.read'));
CREATE POLICY "transfers_create" ON stock_transfers FOR INSERT WITH CHECK (user_has_permission(auth.uid(), 'stock.transfer'));
CREATE POLICY "transfers_update" ON stock_transfers FOR UPDATE USING (user_has_permission(auth.uid(), 'stock.approve_transfer'));
CREATE POLICY "transfer_lines_select" ON stock_transfer_lines FOR SELECT USING (user_has_permission(auth.uid(), 'stock.read'));
CREATE POLICY "transfer_lines_modify" ON stock_transfer_lines FOR ALL USING (user_has_permission(auth.uid(), 'stock.transfer'));

-- Inventories
CREATE POLICY "inventories_select" ON inventories FOR SELECT USING (user_has_permission(auth.uid(), 'stock.read'));
CREATE POLICY "inventories_modify" ON inventories FOR ALL USING (user_has_permission(auth.uid(), 'stock.inventory'));
CREATE POLICY "inventory_lines_select" ON inventory_lines FOR SELECT USING (user_has_permission(auth.uid(), 'stock.read'));
CREATE POLICY "inventory_lines_modify" ON inventory_lines FOR ALL USING (user_has_permission(auth.uid(), 'stock.inventory'));

-- Tailoring orders
CREATE POLICY "tailoring_orders_select" ON tailoring_orders FOR SELECT USING (user_has_permission(auth.uid(), 'orders.read'));
CREATE POLICY "tailoring_orders_select_client" ON tailoring_orders FOR SELECT USING (
  client_id IN (SELECT id FROM clients WHERE profile_id = auth.uid())
);
CREATE POLICY "tailoring_orders_insert" ON tailoring_orders FOR INSERT WITH CHECK (user_has_permission(auth.uid(), 'orders.create'));
CREATE POLICY "tailoring_orders_update" ON tailoring_orders FOR UPDATE USING (user_has_permission(auth.uid(), 'orders.update'));

CREATE POLICY "tailoring_lines_select" ON tailoring_order_lines FOR SELECT USING (user_has_permission(auth.uid(), 'orders.read'));
CREATE POLICY "tailoring_lines_modify" ON tailoring_order_lines FOR ALL USING (user_has_permission(auth.uid(), 'orders.update'));

CREATE POLICY "state_history_select" ON tailoring_order_state_history FOR SELECT USING (user_has_permission(auth.uid(), 'orders.read'));
CREATE POLICY "state_history_insert" ON tailoring_order_state_history FOR INSERT WITH CHECK (user_has_permission(auth.uid(), 'orders.change_state'));

CREATE POLICY "fittings_select" ON tailoring_fittings FOR SELECT USING (user_has_permission(auth.uid(), 'orders.read'));
CREATE POLICY "fittings_modify" ON tailoring_fittings FOR ALL USING (user_has_permission(auth.uid(), 'orders.manage_fittings'));

-- Cash & POS
CREATE POLICY "cash_sessions_select" ON cash_sessions FOR SELECT USING (user_has_permission(auth.uid(), 'pos.access'));
CREATE POLICY "cash_sessions_insert" ON cash_sessions FOR INSERT WITH CHECK (user_has_permission(auth.uid(), 'pos.open_cash'));
CREATE POLICY "cash_sessions_update" ON cash_sessions FOR UPDATE USING (user_has_permission(auth.uid(), 'pos.close_cash'));

CREATE POLICY "cash_withdrawals_select" ON cash_withdrawals FOR SELECT USING (user_has_permission(auth.uid(), 'pos.view_cash_history'));
CREATE POLICY "cash_withdrawals_insert" ON cash_withdrawals FOR INSERT WITH CHECK (user_has_permission(auth.uid(), 'pos.cash_withdrawal'));

CREATE POLICY "sales_select" ON sales FOR SELECT USING (user_has_permission(auth.uid(), 'pos.access'));
CREATE POLICY "sales_select_client" ON sales FOR SELECT USING (
  client_id IN (SELECT id FROM clients WHERE profile_id = auth.uid())
);
CREATE POLICY "sales_insert" ON sales FOR INSERT WITH CHECK (user_has_permission(auth.uid(), 'pos.sell'));
CREATE POLICY "sales_update" ON sales FOR UPDATE USING (user_has_permission(auth.uid(), 'pos.access'));

CREATE POLICY "sale_lines_select" ON sale_lines FOR SELECT USING (user_has_permission(auth.uid(), 'pos.access'));
CREATE POLICY "sale_lines_insert" ON sale_lines FOR INSERT WITH CHECK (user_has_permission(auth.uid(), 'pos.sell'));

CREATE POLICY "sale_payments_select" ON sale_payments FOR SELECT USING (user_has_permission(auth.uid(), 'pos.access'));
CREATE POLICY "sale_payments_insert" ON sale_payments FOR INSERT WITH CHECK (user_has_permission(auth.uid(), 'pos.sell'));

CREATE POLICY "vouchers_select" ON vouchers FOR SELECT USING (user_has_permission(auth.uid(), 'pos.access'));
CREATE POLICY "vouchers_select_client" ON vouchers FOR SELECT USING (
  client_id IN (SELECT id FROM clients WHERE profile_id = auth.uid())
);
CREATE POLICY "vouchers_modify" ON vouchers FOR ALL USING (user_has_permission(auth.uid(), 'pos.generate_voucher'));

CREATE POLICY "returns_select" ON returns FOR SELECT USING (user_has_permission(auth.uid(), 'pos.access'));
CREATE POLICY "returns_insert" ON returns FOR INSERT WITH CHECK (user_has_permission(auth.uid(), 'pos.refund'));

CREATE POLICY "discount_codes_select" ON discount_codes FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "discount_codes_modify" ON discount_codes FOR ALL USING (user_has_permission(auth.uid(), 'pos.apply_discount'));

-- Accounting
CREATE POLICY "coa_select" ON chart_of_accounts FOR SELECT USING (user_has_permission(auth.uid(), 'accounting.access'));
CREATE POLICY "coa_modify" ON chart_of_accounts FOR ALL USING (user_has_permission(auth.uid(), 'accounting.manage_chart'));

CREATE POLICY "journal_select" ON journal_entries FOR SELECT USING (user_has_permission(auth.uid(), 'accounting.view_entries'));
CREATE POLICY "journal_insert" ON journal_entries FOR INSERT WITH CHECK (user_has_permission(auth.uid(), 'accounting.create_entry'));
CREATE POLICY "journal_update" ON journal_entries FOR UPDATE USING (user_has_permission(auth.uid(), 'accounting.modify_entry'));

CREATE POLICY "journal_lines_select" ON journal_entry_lines FOR SELECT USING (user_has_permission(auth.uid(), 'accounting.view_entries'));
CREATE POLICY "journal_lines_modify" ON journal_entry_lines FOR ALL USING (user_has_permission(auth.uid(), 'accounting.create_entry'));

CREATE POLICY "fiscal_periods_select" ON fiscal_periods FOR SELECT USING (user_has_permission(auth.uid(), 'accounting.access'));
CREATE POLICY "fiscal_periods_modify" ON fiscal_periods FOR ALL USING (user_has_permission(auth.uid(), 'accounting.close_period'));

CREATE POLICY "invoices_select" ON invoices FOR SELECT USING (user_has_permission(auth.uid(), 'accounting.manage_invoices'));
CREATE POLICY "invoices_select_client" ON invoices FOR SELECT USING (
  client_id IN (SELECT id FROM clients WHERE profile_id = auth.uid())
);
CREATE POLICY "invoices_modify" ON invoices FOR ALL USING (user_has_permission(auth.uid(), 'accounting.manage_invoices'));

CREATE POLICY "invoice_lines_select" ON invoice_lines FOR SELECT USING (user_has_permission(auth.uid(), 'accounting.manage_invoices'));
CREATE POLICY "invoice_lines_modify" ON invoice_lines FOR ALL USING (user_has_permission(auth.uid(), 'accounting.manage_invoices'));

CREATE POLICY "expenses_select" ON expenses FOR SELECT USING (user_has_permission(auth.uid(), 'accounting.manage_expenses'));
CREATE POLICY "expenses_modify" ON expenses FOR ALL USING (user_has_permission(auth.uid(), 'accounting.manage_expenses'));

CREATE POLICY "commissions_select" ON sales_commissions FOR SELECT USING (
  user_has_permission(auth.uid(), 'reporting.view_commissions') OR salesperson_id = auth.uid()
);
CREATE POLICY "commissions_modify" ON sales_commissions FOR ALL USING (user_has_permission(auth.uid(), 'reporting.view_commissions'));

-- ==========================================
-- VISTAS ÚTILES
-- ==========================================

-- Vista: Productos con stock total
CREATE OR REPLACE VIEW v_products_with_stock AS
SELECT 
  p.id,
  p.sku,
  p.name,
  p.product_type,
  p.brand,
  p.base_price,
  p.price_with_tax,
  p.cost_price,
  p.main_image_url,
  p.is_visible_web,
  p.is_active,
  pc.name AS category_name,
  pc.slug AS category_slug,
  s.name AS supplier_name,
  COALESCE(stock.total_quantity, 0) AS total_stock,
  COALESCE(stock.total_available, 0) AS total_available,
  COALESCE(stock.variant_count, 0) AS variant_count,
  COALESCE(stock.store_count, 0) AS store_count
FROM products p
LEFT JOIN product_categories pc ON pc.id = p.category_id
LEFT JOIN suppliers s ON s.id = p.supplier_id
LEFT JOIN LATERAL (
  SELECT 
    SUM(sl.quantity) AS total_quantity,
    SUM(sl.available) AS total_available,
    COUNT(DISTINCT pv.id) AS variant_count,
    COUNT(DISTINCT sl.warehouse_id) AS store_count
  FROM product_variants pv
  JOIN stock_levels sl ON sl.product_variant_id = pv.id
  WHERE pv.product_id = p.id AND pv.is_active = TRUE
) stock ON TRUE;

-- Vista: Pedidos sastrería con resumen
CREATE OR REPLACE VIEW v_tailoring_orders_summary AS
SELECT 
  o.id,
  o.order_number,
  o.order_type,
  o.status,
  o.order_date,
  o.estimated_delivery_date,
  o.total,
  o.total_paid,
  o.total_pending,
  o.total_cost,
  c.full_name AS client_name,
  c.phone AS client_phone,
  c.email AS client_email,
  c.id AS client_id,
  s.name AS store_name,
  s.code AS store_code,
  (SELECT COUNT(*) FROM tailoring_order_lines l WHERE l.tailoring_order_id = o.id) AS garment_count,
  (SELECT MIN(f.scheduled_date) 
   FROM tailoring_fittings f 
   WHERE f.tailoring_order_id = o.id AND f.status = 'scheduled') AS next_fitting_date,
  o.created_at
FROM tailoring_orders o
JOIN clients c ON c.id = o.client_id
JOIN stores s ON s.id = o.store_id;

-- Vista: Ventas del día con detalles
CREATE OR REPLACE VIEW v_daily_sales AS
SELECT 
  s.id,
  s.ticket_number,
  s.sale_type,
  s.total,
  s.payment_method,
  s.status,
  s.is_tax_free,
  s.created_at,
  c.full_name AS client_name,
  p.full_name AS salesperson_name,
  st.name AS store_name,
  cs.id AS cash_session_id
FROM sales s
LEFT JOIN clients c ON c.id = s.client_id
JOIN profiles p ON p.id = s.salesperson_id
JOIN stores st ON st.id = s.store_id
JOIN cash_sessions cs ON cs.id = s.cash_session_id;

-- Vista: Balance contable simplificado
CREATE OR REPLACE VIEW v_account_balances AS
SELECT 
  coa.account_code,
  coa.name,
  coa.account_type,
  coa.level,
  coa.is_detail,
  COALESCE(SUM(jel.debit), 0) AS total_debit,
  COALESCE(SUM(jel.credit), 0) AS total_credit,
  CASE 
    WHEN coa.normal_balance = 'debit' THEN COALESCE(SUM(jel.debit), 0) - COALESCE(SUM(jel.credit), 0)
    ELSE COALESCE(SUM(jel.credit), 0) - COALESCE(SUM(jel.debit), 0)
  END AS balance
FROM chart_of_accounts coa
LEFT JOIN journal_entry_lines jel ON jel.account_code = coa.account_code
LEFT JOIN journal_entries je ON je.id = jel.journal_entry_id AND je.status = 'posted'
WHERE coa.is_detail = TRUE
GROUP BY coa.account_code, coa.name, coa.account_type, coa.level, coa.is_detail, coa.normal_balance;
