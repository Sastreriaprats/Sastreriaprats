-- ============================================================
-- Migration 068: Módulo Arreglos (NUEVO)
--
-- NOTA: esta migración se ejecutó manualmente en Supabase Dashboard antes
-- de añadirla al repo. Este archivo la reconstruye para mantener el repo
-- sincronizado con el estado real de la BBDD.
--
-- Reemplaza el módulo viejo `boutique_alterations` (mig. 002+075), que
-- queda obsoleto. El drop de la tabla vieja se hace en la migración 071.
--
-- Crea:
--   - alterations: ficha de arreglo con numeración pública (ARR-YYYY-NNNN)
--   - función next_alteration_number(): genera el siguiente número
--   - RPC rpc_create_alteration: crea un arreglo asignando número en transacción
--
-- El campo `official_id` referencia la tabla `officials` (mig. 012),
-- compartida con sastrería y pedidos a proveedor. Inicialmente este módulo
-- introdujo una tabla paralela `alteration_officials`; se eliminó en la
-- mig. 070 por ser duplicación pura.
-- ============================================================

-- ── alterations ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS alterations (
  id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  alteration_number     TEXT NOT NULL UNIQUE,
  client_id             UUID NOT NULL REFERENCES clients(id) ON DELETE RESTRICT,
  phone                 TEXT,
  garment_type          TEXT,
  official_id           UUID REFERENCES officials(id) ON DELETE SET NULL,
  official_name         TEXT,
  description           TEXT,
  amount                NUMERIC(10,2) NOT NULL DEFAULT 0.00,
  alteration_date       DATE NOT NULL DEFAULT CURRENT_DATE,
  workshop_sent_date    DATE,
  client_delivery_date  DATE,
  status                TEXT NOT NULL DEFAULT 'pending'
                          CHECK (status IN ('pending','sent','ready','delivered','cancelled')),
  payment_method        TEXT CHECK (payment_method IS NULL OR payment_method IN ('cash','card','transfer','bizum')),
  notes                 TEXT,
  store_id              UUID REFERENCES stores(id) ON DELETE SET NULL,
  created_by            UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_alterations_client  ON alterations(client_id);
CREATE INDEX IF NOT EXISTS idx_alterations_status  ON alterations(status);
CREATE INDEX IF NOT EXISTS idx_alterations_date    ON alterations(alteration_date DESC);
CREATE INDEX IF NOT EXISTS idx_alterations_official ON alterations(official_id);
CREATE INDEX IF NOT EXISTS idx_alterations_store   ON alterations(store_id);

DROP TRIGGER IF EXISTS trigger_alterations_updated_at ON alterations;
CREATE TRIGGER trigger_alterations_updated_at
  BEFORE UPDATE ON alterations
  FOR EACH ROW EXECUTE PROCEDURE update_updated_at();

-- ── next_alteration_number() ────────────────────────────────────────
-- Genera el siguiente número con formato ARR-YYYY-NNNN.
CREATE OR REPLACE FUNCTION public.next_alteration_number()
  RETURNS TEXT
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public
AS $$
DECLARE
  v_year  INTEGER := EXTRACT(YEAR FROM CURRENT_DATE)::INTEGER;
  v_last  INTEGER;
  v_next  INTEGER;
BEGIN
  SELECT COALESCE(MAX(
    NULLIF(SUBSTRING(alteration_number FROM 'ARR-' || v_year || '-(\d+)'), '')::INTEGER
  ), 0)
  INTO v_last
  FROM alterations
  WHERE alteration_number LIKE ('ARR-' || v_year || '-%');

  v_next := COALESCE(v_last, 0) + 1;
  RETURN 'ARR-' || v_year || '-' || LPAD(v_next::TEXT, 4, '0');
END;
$$;

GRANT EXECUTE ON FUNCTION public.next_alteration_number() TO authenticated, service_role;

-- ── rpc_create_alteration ───────────────────────────────────────────
-- Crea un arreglo asignando alteration_number atómicamente.
CREATE OR REPLACE FUNCTION public.rpc_create_alteration(
  p_client_id            UUID,
  p_phone                TEXT,
  p_garment_type         TEXT,
  p_official_id          UUID,
  p_description          TEXT,
  p_amount               NUMERIC,
  p_alteration_date      DATE,
  p_payment_method       TEXT,
  p_notes                TEXT,
  p_store_id             UUID,
  p_user_id              UUID,
  p_alteration_type      TEXT     DEFAULT 'external',
  p_tailoring_order_id   UUID     DEFAULT NULL,
  p_sale_id              UUID     DEFAULT NULL,
  p_is_included          BOOLEAN  DEFAULT FALSE,
  p_estimated_completion DATE     DEFAULT NULL,
  p_official_name        TEXT     DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_number TEXT;
  v_name   TEXT;
  v_id     UUID;
BEGIN
  v_number := public.next_alteration_number();

  -- Si no se pasa official_name, lo obtenemos del registro del oficial (officials).
  IF p_official_name IS NULL AND p_official_id IS NOT NULL THEN
    SELECT name INTO v_name FROM officials WHERE id = p_official_id;
  ELSE
    v_name := p_official_name;
  END IF;

  INSERT INTO alterations (
    alteration_number, client_id, phone, garment_type,
    official_id, official_name, description, amount,
    alteration_date, payment_method, notes,
    store_id, created_by,
    alteration_type, tailoring_order_id, sale_id,
    is_included, estimated_completion
  ) VALUES (
    v_number, p_client_id, p_phone, p_garment_type,
    p_official_id, v_name, p_description, COALESCE(p_amount, 0),
    COALESCE(p_alteration_date, CURRENT_DATE), p_payment_method, p_notes,
    p_store_id, p_user_id,
    COALESCE(p_alteration_type, 'external'), p_tailoring_order_id, p_sale_id,
    COALESCE(p_is_included, FALSE), p_estimated_completion
  )
  RETURNING id INTO v_id;

  RETURN jsonb_build_object('id', v_id, 'alteration_number', v_number);
END;
$$;

GRANT EXECUTE ON FUNCTION public.rpc_create_alteration(
  UUID, TEXT, TEXT, UUID, TEXT, NUMERIC, DATE, TEXT, TEXT, UUID, UUID,
  TEXT, UUID, UUID, BOOLEAN, DATE, TEXT
) TO authenticated, service_role;
