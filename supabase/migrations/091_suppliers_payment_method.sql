-- Añadir columna payment_method a suppliers
ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS payment_method TEXT DEFAULT 'transfer';
ALTER TABLE suppliers ADD CONSTRAINT suppliers_payment_method_check
  CHECK (payment_method IN ('transfer', 'direct_debit', 'check', 'cash', 'card', 'bank_draft'));
