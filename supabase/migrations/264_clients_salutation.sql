-- 264: Tratamiento del cliente (Sr/Sra) para personalizar los saludos de email
-- ("Estimado Sr. García" en vez de "Estimado/a Nombre").
-- Backfill inicial derivado del género ya registrado; editable en la ficha.

ALTER TABLE clients
  ADD COLUMN IF NOT EXISTS salutation text
  CHECK (salutation IN ('sr', 'sra'));

COMMENT ON COLUMN clients.salutation IS 'Tratamiento para saludos formales: sr | sra. NULL = sin especificar (se usa Estimado/a).';

UPDATE clients SET salutation = 'sr'  WHERE salutation IS NULL AND gender = 'male';
UPDATE clients SET salutation = 'sra' WHERE salutation IS NULL AND gender = 'female';
