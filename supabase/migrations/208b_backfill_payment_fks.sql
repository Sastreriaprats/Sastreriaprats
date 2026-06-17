-- ============================================================
-- Migración 208b — Fase B: backfill de las FK de espejos (mig 208)
--
-- Pobla las FK nuevas en los espejos EXISTENTES de manual_transactions, SOLO con
-- enlaces verificados (nº resuelve a entidad viva Y el importe casa con un único
-- pago). Los ambiguos / sin-match-de-importe / huérfanos quedan FK NULL (no se
-- inventa ningún enlace). Idempotente: solo toca filas con la FK aún NULL.
--
-- Aplicado en prod el 2026-06-17: 292 sale_id + 80 tailoring_order_payment_id +
-- 4 product_reservation_payment_id = 376; 16 quedan NULL (7 huérfanos reales +
-- 9 sastrería con fallback por texto). Total de filas sin cambios.
-- ============================================================

-- TPV: enlace por ticket exacto (ticket_number es único).
UPDATE manual_transactions mt
SET sale_id = s.id
FROM sales s
WHERE mt.category = 'tpv' AND mt.sale_id IS NULL
  AND mt.description = 'Venta TPV - ' || s.ticket_number;

-- SASTRERÍA: enlace al pago ÚNICO cuyo importe casa (n=1 → excluye ambiguos).
WITH parsed AS (
  SELECT mt.id AS mt_id, COALESCE(mt.total, mt.amount) AS mt_total,
         trim(regexp_replace(mt.description, '^.*- ', '')) AS ordnum
  FROM manual_transactions mt
  WHERE mt.category = 'sastreria' AND mt.tailoring_order_payment_id IS NULL
), cand AS (
  SELECT p.mt_id, tp.id AS payment_id, count(*) OVER (PARTITION BY p.mt_id) AS n
  FROM parsed p
  JOIN tailoring_orders o ON o.order_number = p.ordnum
  JOIN tailoring_order_payments tp ON tp.tailoring_order_id = o.id
    AND abs(tp.amount - p.mt_total) < 0.005
)
UPDATE manual_transactions mt
SET tailoring_order_payment_id = c.payment_id
FROM cand c
WHERE mt.id = c.mt_id AND c.n = 1;

-- RESERVAS: mismo patrón (pago único por importe).
WITH parsed AS (
  SELECT mt.id AS mt_id, COALESCE(mt.total, mt.amount) AS mt_total,
         trim(regexp_replace(mt.description, '^.*- ', '')) AS resnum
  FROM manual_transactions mt
  WHERE mt.category = 'reservas' AND mt.product_reservation_payment_id IS NULL
), cand AS (
  SELECT p.mt_id, rp.id AS payment_id, count(*) OVER (PARTITION BY p.mt_id) AS n
  FROM parsed p
  JOIN product_reservations r ON r.reservation_number = p.resnum
  JOIN product_reservation_payments rp ON rp.product_reservation_id = r.id
    AND abs(rp.amount - p.mt_total) < 0.005
)
UPDATE manual_transactions mt
SET product_reservation_payment_id = c.payment_id
FROM cand c
WHERE mt.id = c.mt_id AND c.n = 1;
