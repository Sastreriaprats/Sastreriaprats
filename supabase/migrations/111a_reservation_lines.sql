-- ==========================================
-- SASTRERÍA PRATS — Migración 111
-- Líneas de reserva (una reserva → varios productos)
-- ==========================================
-- Convierte product_reservations en cabecera + líneas.
-- Cada línea tiene su propio status (active/pending_stock/fulfilled/cancelled),
-- cantidad, variante y almacén. La cabecera mantiene cliente, tienda, nº,
-- total, pagos y status agregado (recalculado por trigger).
--
-- Estrategia:
--   1. Crear tabla product_reservation_lines
--   2. Migrar cada reserva existente a 1 línea
--   3. Hacer nullable los campos de línea en la cabecera (legacy)
--   4. Añadir reservation_line_id en sale_lines
--   5. Trigger que mantiene status/total agregados en cabecera

-- 1. Tabla de líneas
CREATE TABLE IF NOT EXISTS product_reservation_lines (
  id                      UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  reservation_id          UUID NOT NULL REFERENCES product_reservations(id) ON DELETE CASCADE,
  product_variant_id      UUID NOT NULL REFERENCES product_variants(id) ON DELETE RESTRICT,
  warehouse_id            UUID NOT NULL REFERENCES warehouses(id) ON DELETE RESTRICT,
  quantity                INTEGER NOT NULL CHECK (quantity > 0),
  unit_price              NUMERIC(10,2) NOT NULL DEFAULT 0 CHECK (unit_price >= 0),
  line_total              NUMERIC(12,2) NOT NULL DEFAULT 0,
  status                  reservation_status NOT NULL DEFAULT 'active',
  stock_reserved_at       TIMESTAMPTZ,
  fulfilled_sale_id       UUID REFERENCES sales(id) ON DELETE SET NULL,
  fulfilled_sale_line_id  UUID REFERENCES sale_lines(id) ON DELETE SET NULL,
  fulfilled_at            TIMESTAMPTZ,
  cancelled_at            TIMESTAMPTZ,
  cancelled_reason        TEXT,
  sort_order              INTEGER NOT NULL DEFAULT 0,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_prl_reservation     ON product_reservation_lines(reservation_id);
CREATE INDEX IF NOT EXISTS idx_prl_variant         ON product_reservation_lines(product_variant_id);
CREATE INDEX IF NOT EXISTS idx_prl_warehouse       ON product_reservation_lines(warehouse_id);
CREATE INDEX IF NOT EXISTS idx_prl_status          ON product_reservation_lines(status);
CREATE INDEX IF NOT EXISTS idx_prl_variant_active
  ON product_reservation_lines(product_variant_id, warehouse_id)
  WHERE status IN ('active', 'pending_stock');

CREATE TRIGGER trigger_product_reservation_lines_updated_at
  BEFORE UPDATE ON product_reservation_lines
  FOR EACH ROW EXECUTE PROCEDURE update_updated_at();

ALTER TABLE product_reservation_lines ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "product_reservation_lines_select" ON product_reservation_lines;
CREATE POLICY "product_reservation_lines_select" ON product_reservation_lines FOR SELECT
  USING (user_has_permission(auth.uid(), 'reservations.view'));

DROP POLICY IF EXISTS "product_reservation_lines_insert" ON product_reservation_lines;
CREATE POLICY "product_reservation_lines_insert" ON product_reservation_lines FOR INSERT
  WITH CHECK (user_has_permission(auth.uid(), 'reservations.create'));

DROP POLICY IF EXISTS "product_reservation_lines_update" ON product_reservation_lines;
CREATE POLICY "product_reservation_lines_update" ON product_reservation_lines FOR UPDATE
  USING (user_has_permission(auth.uid(), 'reservations.edit'));

DROP POLICY IF EXISTS "product_reservation_lines_delete" ON product_reservation_lines;
CREATE POLICY "product_reservation_lines_delete" ON product_reservation_lines FOR DELETE
  USING (user_has_permission(auth.uid(), 'reservations.delete'));

-- 2. Migrar datos existentes: cada reserva → 1 línea
INSERT INTO product_reservation_lines (
  reservation_id, product_variant_id, warehouse_id, quantity, unit_price,
  line_total, status, stock_reserved_at, fulfilled_sale_id, fulfilled_at,
  cancelled_at, cancelled_reason, sort_order, created_at, updated_at
)
SELECT
  r.id,
  r.product_variant_id,
  r.warehouse_id,
  r.quantity,
  COALESCE(r.unit_price, 0),
  ROUND(COALESCE(r.unit_price, 0) * r.quantity, 2),
  r.status,
  r.stock_reserved_at,
  r.fulfilled_sale_id,
  r.fulfilled_at,
  r.cancelled_at,
  r.cancelled_reason,
  0,
  r.created_at,
  r.updated_at
FROM product_reservations r
WHERE r.product_variant_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM product_reservation_lines l WHERE l.reservation_id = r.id
  );

-- 3. Hacer nullable las columnas de línea en la cabecera (legacy, no se usan en reservas nuevas)
ALTER TABLE product_reservations ALTER COLUMN product_variant_id DROP NOT NULL;
ALTER TABLE product_reservations ALTER COLUMN warehouse_id       DROP NOT NULL;
ALTER TABLE product_reservations ALTER COLUMN quantity           DROP NOT NULL;
ALTER TABLE product_reservations DROP CONSTRAINT IF EXISTS product_reservations_quantity_check;

-- 4. sale_lines — columna dedicada para línea de reserva (además de reservation_id legacy)
ALTER TABLE sale_lines
  ADD COLUMN IF NOT EXISTS reservation_line_id UUID REFERENCES product_reservation_lines(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_sale_lines_reservation_line ON sale_lines(reservation_line_id);

-- 5. Trigger: recalcular status/total/quantity agregados en cabecera
CREATE OR REPLACE FUNCTION public.fn_recalc_reservation_header()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_res_id      UUID;
  v_total       NUMERIC(12,2);
  v_qty         INTEGER;
  v_status      reservation_status;
  v_has_active  BOOLEAN;
  v_has_pending BOOLEAN;
  v_all_fulfilled BOOLEAN;
  v_all_cancelled BOOLEAN;
BEGIN
  v_res_id := COALESCE(NEW.reservation_id, OLD.reservation_id);

  SELECT
    COALESCE(SUM(CASE WHEN status <> 'cancelled' THEN line_total ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN status <> 'cancelled' THEN quantity   ELSE 0 END), 0),
    BOOL_OR(status = 'active'),
    BOOL_OR(status = 'pending_stock'),
    BOOL_AND(status = 'fulfilled') FILTER (WHERE TRUE),
    BOOL_AND(status = 'cancelled') FILTER (WHERE TRUE)
  INTO v_total, v_qty, v_has_active, v_has_pending, v_all_fulfilled, v_all_cancelled
  FROM product_reservation_lines
  WHERE reservation_id = v_res_id;

  -- Derivar status agregado
  IF v_all_fulfilled THEN
    v_status := 'fulfilled';
  ELSIF v_all_cancelled THEN
    v_status := 'cancelled';
  ELSIF v_has_active THEN
    v_status := 'active';
  ELSIF v_has_pending THEN
    v_status := 'pending_stock';
  ELSE
    -- Mezcla de fulfilled + cancelled → considerar fulfilled
    v_status := 'fulfilled';
  END IF;

  UPDATE product_reservations
     SET total    = v_total,
         quantity = NULLIF(v_qty, 0),
         status   = v_status,
         payment_status = CASE
           WHEN v_total <= 0 THEN 'pending'
           WHEN total_paid >= v_total THEN 'paid'
           WHEN total_paid > 0 THEN 'partial'
           ELSE 'pending'
         END,
         updated_at = NOW()
   WHERE id = v_res_id;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_reservation_lines_recalc ON product_reservation_lines;
CREATE TRIGGER trigger_reservation_lines_recalc
  AFTER INSERT OR UPDATE OF status, quantity, unit_price, line_total OR DELETE
  ON product_reservation_lines
  FOR EACH ROW EXECUTE PROCEDURE fn_recalc_reservation_header();

-- 6. Recalcular total en cabecera para las reservas migradas (por si había drift)
UPDATE product_reservations r
   SET total = sub.t
  FROM (
    SELECT reservation_id, COALESCE(SUM(line_total), 0) AS t
      FROM product_reservation_lines
     WHERE status <> 'cancelled'
     GROUP BY reservation_id
  ) sub
 WHERE sub.reservation_id = r.id;
