-- 269_invoice_multi_orders_reservations.sql
-- Relación muchos-a-muchos factura ↔ pedidos de sastrería y factura ↔ reservas.
--
-- Motivo: hoy invoices.tailoring_order_id / invoices.reservation_id son columnas
-- escalares (una factura = un origen). Se necesita facturar a un cliente VARIOS
-- pedidos (y reservas) en una sola factura (caso real F2026-0015: 2 pedidos + 1
-- reserva). Se añaden tablas puente y se mantiene la columna escalar como ESPEJO
-- (apunta a uno del puente) para no romper los informes de ingresos que clasifican
-- el origen por esa columna (accounting/dashboard/ops/reports) ni provocar doble
-- conteo con los cobros de sastrería.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Tablas puente
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS invoice_tailoring_orders (
  invoice_id         UUID NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  tailoring_order_id UUID NOT NULL REFERENCES tailoring_orders(id) ON DELETE CASCADE,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (invoice_id, tailoring_order_id)
);
CREATE INDEX IF NOT EXISTS idx_invoice_tailoring_orders_order
  ON invoice_tailoring_orders(tailoring_order_id);

CREATE TABLE IF NOT EXISTS invoice_reservations (
  invoice_id     UUID NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  reservation_id UUID NOT NULL REFERENCES product_reservations(id) ON DELETE CASCADE,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (invoice_id, reservation_id)
);
CREATE INDEX IF NOT EXISTS idx_invoice_reservations_reservation
  ON invoice_reservations(reservation_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. RLS (mismo permiso que invoices: accounting.manage_invoices)
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE invoice_tailoring_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoice_reservations     ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "invoice_tailoring_orders_select" ON invoice_tailoring_orders;
DROP POLICY IF EXISTS "invoice_tailoring_orders_modify" ON invoice_tailoring_orders;
CREATE POLICY "invoice_tailoring_orders_select" ON invoice_tailoring_orders
  FOR SELECT USING (user_has_permission(auth.uid(), 'accounting.manage_invoices'));
CREATE POLICY "invoice_tailoring_orders_modify" ON invoice_tailoring_orders
  FOR ALL USING (user_has_permission(auth.uid(), 'accounting.manage_invoices'));

DROP POLICY IF EXISTS "invoice_reservations_select" ON invoice_reservations;
DROP POLICY IF EXISTS "invoice_reservations_modify" ON invoice_reservations;
CREATE POLICY "invoice_reservations_select" ON invoice_reservations
  FOR SELECT USING (user_has_permission(auth.uid(), 'accounting.manage_invoices'));
CREATE POLICY "invoice_reservations_modify" ON invoice_reservations
  FOR ALL USING (user_has_permission(auth.uid(), 'accounting.manage_invoices'));

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Trigger de espejo escalar
--    Mantiene invoices.tailoring_order_id / reservation_id apuntando a UNO de los
--    del puente (el menor por id), o NULL si no queda ninguno. Así los informes
--    que filtran por la columna escalar siguen viendo el origen correcto.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION sync_invoice_tailoring_order_mirror()
RETURNS TRIGGER AS $$
DECLARE
  v_invoice_id UUID := COALESCE(NEW.invoice_id, OLD.invoice_id);
BEGIN
  UPDATE invoices SET tailoring_order_id = (
    SELECT tailoring_order_id FROM invoice_tailoring_orders
    WHERE invoice_id = v_invoice_id
    ORDER BY tailoring_order_id
    LIMIT 1
  )
  WHERE id = v_invoice_id;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION sync_invoice_reservation_mirror()
RETURNS TRIGGER AS $$
DECLARE
  v_invoice_id UUID := COALESCE(NEW.invoice_id, OLD.invoice_id);
BEGIN
  UPDATE invoices SET reservation_id = (
    SELECT reservation_id FROM invoice_reservations
    WHERE invoice_id = v_invoice_id
    ORDER BY reservation_id
    LIMIT 1
  )
  WHERE id = v_invoice_id;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_sync_invoice_tailoring_mirror ON invoice_tailoring_orders;
CREATE TRIGGER trg_sync_invoice_tailoring_mirror
  AFTER INSERT OR DELETE ON invoice_tailoring_orders
  FOR EACH ROW EXECUTE FUNCTION sync_invoice_tailoring_order_mirror();

DROP TRIGGER IF EXISTS trg_sync_invoice_reservation_mirror ON invoice_reservations;
CREATE TRIGGER trg_sync_invoice_reservation_mirror
  AFTER INSERT OR DELETE ON invoice_reservations
  FOR EACH ROW EXECUTE FUNCTION sync_invoice_reservation_mirror();

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Backfill: pasar los vínculos escalares existentes a las tablas puente.
--    (El trigger recalculará el escalar al valor idéntico; no lo altera.)
-- ─────────────────────────────────────────────────────────────────────────────
INSERT INTO invoice_tailoring_orders (invoice_id, tailoring_order_id)
SELECT id, tailoring_order_id FROM invoices WHERE tailoring_order_id IS NOT NULL
ON CONFLICT DO NOTHING;

INSERT INTO invoice_reservations (invoice_id, reservation_id)
SELECT id, reservation_id FROM invoices WHERE reservation_id IS NOT NULL
ON CONFLICT DO NOTHING;
