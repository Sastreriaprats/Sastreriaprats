-- ==========================================
-- SASTRERÍA PRATS — Migración 243
-- Nombre de invitado en citas (cliente aún no dado de alta)
-- ==========================================
-- Permite crear una cita anotando solo el nombre de quien llama,
-- sin necesidad de tener al cliente dado de alta. Se rellena cuando
-- client_id es NULL. Al dar de alta al cliente luego, se puede
-- enlazar editando la cita.

ALTER TABLE appointments
  ADD COLUMN IF NOT EXISTS client_name TEXT;

COMMENT ON COLUMN appointments.client_name IS
  'Nombre libre del contacto cuando NO hay client_id (cliente sin dar de alta todavía).';
