-- Vincular ventas con asiento contable
ALTER TABLE sales
  ADD COLUMN IF NOT EXISTS journal_entry_id uuid REFERENCES journal_entries(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS sales_journal_entry_id_idx ON sales(journal_entry_id) WHERE journal_entry_id IS NOT NULL;
