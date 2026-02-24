-- Columna pdf_url en presupuestos (para enlazar PDF generado)
ALTER TABLE estimates ADD COLUMN IF NOT EXISTS pdf_url TEXT;

-- Bucket "documents" se crea por código (createBucket) la primera vez que se genera un PDF.
-- Si prefieres crearlo por SQL, en Supabase Dashboard: Storage > New bucket > "documents" (public).
