-- Códigos de barras EAN-13 en productos: columna de fecha de generación e índice.
-- La columna barcode ya existe en 003a (TEXT). Añadimos barcode_generated_at para saber cuándo se generó.

ALTER TABLE products ADD COLUMN IF NOT EXISTS barcode_generated_at TIMESTAMPTZ;

-- Índice para búsqueda por código (el índice idx_products_barcode ya existe en 003a)
CREATE INDEX IF NOT EXISTS idx_products_barcode ON products(barcode);

-- Índice único parcial: un solo producto por barcode cuando está definido (evita duplicados al generar)
CREATE UNIQUE INDEX IF NOT EXISTS idx_products_barcode_unique ON products(barcode) WHERE barcode IS NOT NULL AND barcode != '';
