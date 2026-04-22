-- ==========================================
-- SASTRERÍA PRATS — Migración 117
-- Bucket Storage para PDFs de facturas de proveedor
-- ==========================================
-- Crea el bucket `supplier-invoices` (privado) y las policies para que
-- cualquier usuario autenticado pueda subir/leer/borrar/actualizar archivos
-- dentro. Lo consume el formulario "Nueva factura proveedor" al adjuntar PDF.

-- 1. Bucket (privado: acceso por signed URL o vía backend)
INSERT INTO storage.buckets (id, name, public)
VALUES ('supplier-invoices', 'supplier-invoices', false)
ON CONFLICT (id) DO NOTHING;

-- 2. Policies
DROP POLICY IF EXISTS "Staff can upload supplier invoices" ON storage.objects;
CREATE POLICY "Staff can upload supplier invoices" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'supplier-invoices');

DROP POLICY IF EXISTS "Staff can read supplier invoices" ON storage.objects;
CREATE POLICY "Staff can read supplier invoices" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'supplier-invoices');

DROP POLICY IF EXISTS "Staff can update supplier invoices" ON storage.objects;
CREATE POLICY "Staff can update supplier invoices" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'supplier-invoices')
  WITH CHECK (bucket_id = 'supplier-invoices');

DROP POLICY IF EXISTS "Staff can delete supplier invoices" ON storage.objects;
CREATE POLICY "Staff can delete supplier invoices" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'supplier-invoices');
