-- Movimientos contables manuales (ingresos y gastos)
CREATE TABLE IF NOT EXISTS manual_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  type text NOT NULL CHECK (type IN ('income', 'expense')),
  date date NOT NULL DEFAULT CURRENT_DATE,
  description text NOT NULL,
  category text NOT NULL DEFAULT 'Otros',
  amount numeric(12,2) NOT NULL,
  tax_rate numeric(5,2) NOT NULL DEFAULT 0,
  tax_amount numeric(12,2) NOT NULL DEFAULT 0,
  total numeric(12,2) NOT NULL,
  notes text,
  journal_entry_id uuid REFERENCES journal_entries(id) ON DELETE SET NULL,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS manual_transactions_type_idx ON manual_transactions(type);
CREATE INDEX IF NOT EXISTS manual_transactions_date_idx ON manual_transactions(date DESC);
CREATE INDEX IF NOT EXISTS manual_transactions_created_by_idx ON manual_transactions(created_by);

ALTER TABLE manual_transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY manual_transactions_select ON manual_transactions FOR SELECT USING (user_has_permission(auth.uid(), 'accounting.view'));
CREATE POLICY manual_transactions_insert ON manual_transactions FOR INSERT WITH CHECK (user_has_permission(auth.uid(), 'accounting.edit'));
CREATE POLICY manual_transactions_update ON manual_transactions FOR UPDATE USING (user_has_permission(auth.uid(), 'accounting.edit'));
CREATE POLICY manual_transactions_delete ON manual_transactions FOR DELETE USING (user_has_permission(auth.uid(), 'accounting.edit'));
