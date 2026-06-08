-- 201_order_line_photos.sql
--
-- Fase 1 (infra) de "fotos por prenda". Permite documentar tejido/detalles/
-- resultado de cada línea (prenda) de un pedido de sastrería con hasta 2 fotos.
--
-- Decisiones:
--  - Almacenamiento: columna jsonb `photos` en tailoring_order_lines con un array
--    de PATHS (no URLs) del bucket privado. Máx 2 (CHECK + defensa en app).
--  - Bucket NUEVO y PRIVADO (public=false): son fotos de cliente (RGPD). La
--    lectura se hace con signed URLs (createSignedUrl) desde el servidor.
--  - Mismo patrón que el bucket privado supplier-invoices (mig 117).
--
-- Sin UI en esta fase (fase 2). Sin tocar rpc_create_sale ni el cálculo de líneas.
-- Tags de dollar-quote distintas ($do$) para no romper el splitter de $$ del
-- SQL Editor de Supabase.

-- ── 1) Columna photos (array de paths, default vacío) ──────────────────────────
ALTER TABLE tailoring_order_lines
  ADD COLUMN IF NOT EXISTS photos jsonb NOT NULL DEFAULT '[]'::jsonb;

-- CHECK de máximo 2 fotos (idempotente: solo si la constraint no existe aún).
DO $do$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'tailoring_order_lines_photos_max2'
  ) THEN
    ALTER TABLE tailoring_order_lines
      ADD CONSTRAINT tailoring_order_lines_photos_max2
      CHECK (jsonb_array_length(photos) <= 2);
  END IF;
END $do$;

-- ── 2) Bucket privado (mismo patrón que mig 117 supplier-invoices) ─────────────
INSERT INTO storage.buckets (id, name, public)
VALUES ('order-line-photos', 'order-line-photos', false)
ON CONFLICT (id) DO NOTHING;

-- Policies para usuarios autenticados (paridad con 117). El acceso real de las
-- server actions va por service role, pero dejamos las policies para coherencia
-- y por si en el futuro se accede desde el cliente.
DROP POLICY IF EXISTS "Staff can upload order line photos" ON storage.objects;
CREATE POLICY "Staff can upload order line photos" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'order-line-photos');

DROP POLICY IF EXISTS "Staff can read order line photos" ON storage.objects;
CREATE POLICY "Staff can read order line photos" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'order-line-photos');

DROP POLICY IF EXISTS "Staff can update order line photos" ON storage.objects;
CREATE POLICY "Staff can update order line photos" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'order-line-photos')
  WITH CHECK (bucket_id = 'order-line-photos');

DROP POLICY IF EXISTS "Staff can delete order line photos" ON storage.objects;
CREATE POLICY "Staff can delete order line photos" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'order-line-photos');
