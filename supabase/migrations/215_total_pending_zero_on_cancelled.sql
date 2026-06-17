-- ============================================================
-- Migración 215 — R2(B): total_pending = 0 en pedidos cancelados
--
-- total_pending era una columna GENERADA `GREATEST(total - total_paid, 0)` que no
-- contemplaba el estado cancelado → los pedidos cancelados mostraban saldo
-- pendiente fantasma (4 casos: PIN-2026-0016/0009/0010/0114, todos total_paid=0).
--
-- PG no permite cambiar la expresión de una columna generada in-place, y la vista
-- v_tailoring_orders_summary depende de la columna. Por eso, EN UNA TRANSACCIÓN:
--   DROP vista → DROP+ADD columna (nueva expresión) → recrear vista verbatim →
--   restaurar grants. Atómico: si algo falla, ROLLBACK completo (nunca queda ni
--   columna sin vista ni vista sin grants).
--
-- No toca `total` ni `total_paid`. La columna se recalcula sola tras el ADD →
-- los 4 cancelados pasan a 0 automáticamente; los vivos siguen total−total_paid.
-- ============================================================

DROP VIEW IF EXISTS v_tailoring_orders_summary;

ALTER TABLE tailoring_orders DROP COLUMN total_pending;
ALTER TABLE tailoring_orders
  ADD COLUMN total_pending numeric(12,2)
  GENERATED ALWAYS AS (
    CASE WHEN status = 'cancelled'::tailoring_order_status THEN 0
         ELSE GREATEST(total - total_paid, 0) END
  ) STORED;

CREATE VIEW v_tailoring_orders_summary AS
 SELECT o.id,
    o.order_number,
    o.order_type,
    o.status,
    o.order_date,
    o.estimated_delivery_date,
    o.total,
    o.total_paid,
    o.total_pending,
    o.total_cost,
    c.full_name AS client_name,
    c.phone AS client_phone,
    c.email AS client_email,
    c.id AS client_id,
    s.name AS store_name,
    s.code AS store_code,
    ( SELECT count(*) AS count
           FROM tailoring_order_lines l
          WHERE l.tailoring_order_id = o.id) AS garment_count,
    ( SELECT min(f.scheduled_date) AS min
           FROM tailoring_fittings f
          WHERE f.tailoring_order_id = o.id AND f.status = 'scheduled'::text) AS next_fitting_date,
    o.created_at
   FROM tailoring_orders o
     JOIN clients c ON c.id = o.client_id
     JOIN stores s ON s.id = o.store_id;

GRANT ALL ON v_tailoring_orders_summary TO anon, authenticated, service_role;
