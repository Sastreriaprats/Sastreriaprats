-- Tickets: número formato TICK-YYYY-NNNN y URL de PDF (opcional)
-- La tabla sales ya tiene ticket_number; se usa prefijo 'TICK' desde la app para formato TICK-2026-0001
ALTER TABLE sales ADD COLUMN IF NOT EXISTS ticket_pdf_url TEXT;

COMMENT ON COLUMN sales.ticket_pdf_url IS 'URL del PDF del ticket si se ha generado y subido a storage.';
