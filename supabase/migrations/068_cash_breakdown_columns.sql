-- Añade columnas de desglose de denominaciones a cash_sessions
ALTER TABLE cash_sessions ADD COLUMN IF NOT EXISTS opening_breakdown JSONB DEFAULT NULL;
ALTER TABLE cash_sessions ADD COLUMN IF NOT EXISTS closing_breakdown JSONB DEFAULT NULL;
