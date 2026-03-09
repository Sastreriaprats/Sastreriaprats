-- Añadir client_email a estimates para envío por email
ALTER TABLE estimates ADD COLUMN IF NOT EXISTS client_email TEXT;
