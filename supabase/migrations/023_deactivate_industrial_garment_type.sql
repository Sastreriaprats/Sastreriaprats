-- Desactivar el tipo de prenda "Industrial" (no se usa como prenda a medida)
UPDATE garment_types
SET is_active = FALSE, updated_at = NOW()
WHERE code = 'industrial';
