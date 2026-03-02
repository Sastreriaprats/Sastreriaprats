-- Facturas de proveedores (cuentas por pagar) - módulo contabilidad
-- Tabla independiente para gestión de facturas recibidas con vencimiento y estado de pago.

CREATE TABLE IF NOT EXISTS ap_supplier_invoices (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  store_id UUID REFERENCES stores(id) ON DELETE SET NULL,
  supplier_name VARCHAR(200) NOT NULL,
  supplier_cif VARCHAR(20),
  invoice_number VARCHAR(50) NOT NULL,
  invoice_date DATE NOT NULL,
  due_date DATE NOT NULL,
  amount DECIMAL(12,2) NOT NULL,
  tax_amount DECIMAL(12,2) DEFAULT 0,
  total_amount DECIMAL(12,2) NOT NULL,
  currency VARCHAR(3) DEFAULT 'EUR',
  status VARCHAR(20) DEFAULT 'pendiente' CHECK (status IN ('pendiente', 'pagada', 'vencida', 'parcial')),
  payment_date DATE,
  payment_method VARCHAR(50),
  notes TEXT,
  attachment_url TEXT,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_ap_supplier_invoices_due_date ON ap_supplier_invoices(due_date);
CREATE INDEX IF NOT EXISTS idx_ap_supplier_invoices_status ON ap_supplier_invoices(status);
CREATE INDEX IF NOT EXISTS idx_ap_supplier_invoices_store ON ap_supplier_invoices(store_id);
CREATE INDEX IF NOT EXISTS idx_ap_supplier_invoices_supplier_name ON ap_supplier_invoices(supplier_name);
CREATE INDEX IF NOT EXISTS idx_ap_supplier_invoices_invoice_date ON ap_supplier_invoices(invoice_date DESC);

ALTER TABLE ap_supplier_invoices ENABLE ROW LEVEL SECURITY;

CREATE POLICY ap_supplier_invoices_select ON ap_supplier_invoices FOR SELECT USING (user_has_permission(auth.uid(), 'supplier_invoices.manage'));
CREATE POLICY ap_supplier_invoices_insert ON ap_supplier_invoices FOR INSERT WITH CHECK (user_has_permission(auth.uid(), 'supplier_invoices.manage'));
CREATE POLICY ap_supplier_invoices_update ON ap_supplier_invoices FOR UPDATE USING (user_has_permission(auth.uid(), 'supplier_invoices.manage'));
CREATE POLICY ap_supplier_invoices_delete ON ap_supplier_invoices FOR DELETE USING (user_has_permission(auth.uid(), 'supplier_invoices.manage'));

-- Permiso solo para admin
INSERT INTO permissions (code, module, action, display_name, description, category, sort_order)
VALUES (
  'supplier_invoices.manage',
  'accounting',
  'manage',
  'Gestionar facturas proveedores',
  'Cuentas por pagar: facturas de proveedores, vencimientos y pagos',
  'Contabilidad',
  115
)
ON CONFLICT (code) DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
CROSS JOIN permissions p
WHERE p.code = 'supplier_invoices.manage'
AND r.name = 'administrador'
ON CONFLICT (role_id, permission_id) DO NOTHING;
