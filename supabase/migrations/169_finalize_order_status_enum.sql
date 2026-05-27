-- Finaliza el rediseño del enum tailoring_order_status.
-- Crea el enum nuevo con solo los 12 valores finales, hace ALTER USING
-- en cada columna mapeando los valores legacy y huérfanos, y elimina
-- el enum viejo.
--
-- IMPORTANTE: Toda la migración va en una transacción atómica
-- (BEGIN..COMMIT). Si una línea falla, todo se revierte.
-- ALTER TYPE bloquea la tabla unos 30s durante el switch.

BEGIN;

-- 0a. Drop de la vista v_tailoring_orders_summary que depende de la columna
-- tailoring_orders.status. Se recrea idéntica al final, después del switch
-- del enum. La vista no se consume desde src/ pero existe en BD desde
-- mig 003d y conviene preservar el contrato por si hay integraciones
-- externas (Metabase, dashboards, etc.).
DROP VIEW IF EXISTS v_tailoring_orders_summary;

-- 0b. Drop del índice parcial `idx_tailoring_orders_pending` (mig 003b).
-- Su predicate `WHERE status NOT IN ('delivered', 'cancelled')` se evalúa
-- durante el ALTER TYPE y el operador <> no existe entre el enum nuevo y
-- los literales castados al viejo. Se recrea idéntico al final.
DROP INDEX IF EXISTS idx_tailoring_orders_pending;

-- 0c. UPDATE previo en tailoring_order_lines para resolver fabric_received
-- según el order_type del padre. Postgres no permite subqueries en USING
-- (errror 0A000), así que mapeamos las líneas ANTES del switch usando los
-- valores nuevos que ya existen en el enum viejo (añadidos en mig 168).
-- Tras este UPDATE, ninguna fila de lines tendrá 'fabric_received'.
UPDATE tailoring_order_lines tol
SET status = 'fabric_received_factory'
FROM tailoring_orders t
WHERE tol.tailoring_order_id = t.id
  AND tol.status = 'fabric_received'
  AND t.order_type = 'industrial';

UPDATE tailoring_order_lines tol
SET status = 'fabric_received_store'
FROM tailoring_orders t
WHERE tol.tailoring_order_id = t.id
  AND tol.status = 'fabric_received'
  AND t.order_type = 'artesanal';

-- Fallback para líneas cuyo padre no es artesanal ni industrial (proveedor,
-- oficial, etc.) o cuyo padre fue borrado: las pocas que queden van a store.
UPDATE tailoring_order_lines
SET status = 'fabric_received_store'
WHERE status = 'fabric_received';

-- 1. Crear enum nuevo con valores finales
CREATE TYPE tailoring_order_status_new AS ENUM (
  'created',
  'fabric_ordered',
  'fabric_received_store',
  'fabric_received_factory',
  'cut',
  'in_production',
  'in_fitting',
  'received_in_store',
  'finished',
  'delivered',
  'incident',
  'cancelled'
);

-- 2. tailoring_orders: ALTER COLUMN con USING. Necesita acceder a
-- order_type de la misma fila para distinguir fabric_received en
-- artesanal vs industrial.
ALTER TABLE tailoring_orders
  ALTER COLUMN status DROP DEFAULT,
  ALTER COLUMN status TYPE tailoring_order_status_new
  USING (
    CASE
      -- Mapping principal de legacy
      WHEN status::text = 'factory_ordered' THEN 'in_production'
      WHEN status::text = 'fabric_received' AND order_type::text = 'industrial' THEN 'fabric_received_factory'
      WHEN status::text = 'fabric_received' AND order_type::text = 'artesanal' THEN 'fabric_received_store'
      WHEN status::text = 'fabric_received' THEN 'fabric_received_store'  -- fallback otros order_type
      -- Huérfanos y legacy sin uso → mapping defensivo (0 filas en prod)
      WHEN status::text = 'fitting' THEN 'in_fitting'
      WHEN status::text = 'adjustments' THEN 'in_production'
      WHEN status::text = 'in_workshop' THEN 'in_production'
      WHEN status::text = 'pending_first_fitting' THEN 'in_fitting'
      WHEN status::text = 'note_sent_factory' THEN 'fabric_ordered'
      WHEN status::text = 'fabric_ordered_supplier' THEN 'fabric_ordered'
      WHEN status::text = 'fabric_at_factory' THEN 'fabric_received_factory'
      WHEN status::text = 'shipping_to_store' THEN 'received_in_store'
      WHEN status::text = 'delivered_to_store' THEN 'received_in_store'
      WHEN status::text = 'order_requested' THEN 'created'
      WHEN status::text = 'requested' THEN 'created'
      WHEN status::text = 'supplier_delivered' THEN 'finished'
      -- Valores que mantienen su nombre
      ELSE status::text
    END::tailoring_order_status_new
  ),
  ALTER COLUMN status SET DEFAULT 'created';

-- 3. tailoring_order_lines: el split de fabric_received según order_type del
-- padre ya se aplicó en el UPDATE previo (paso 0c). Aquí solo dejamos un
-- fallback defensivo por si quedara alguna fila huérfana.
ALTER TABLE tailoring_order_lines
  ALTER COLUMN status DROP DEFAULT,
  ALTER COLUMN status TYPE tailoring_order_status_new
  USING (
    CASE
      WHEN status::text = 'factory_ordered' THEN 'in_production'
      WHEN status::text = 'fabric_received' THEN 'fabric_received_store'
      WHEN status::text = 'fitting' THEN 'in_fitting'
      WHEN status::text = 'adjustments' THEN 'in_production'
      WHEN status::text = 'in_workshop' THEN 'in_production'
      WHEN status::text = 'pending_first_fitting' THEN 'in_fitting'
      WHEN status::text = 'note_sent_factory' THEN 'fabric_ordered'
      WHEN status::text = 'fabric_ordered_supplier' THEN 'fabric_ordered'
      WHEN status::text = 'fabric_at_factory' THEN 'fabric_received_factory'
      WHEN status::text = 'shipping_to_store' THEN 'received_in_store'
      WHEN status::text = 'delivered_to_store' THEN 'received_in_store'
      WHEN status::text = 'order_requested' THEN 'created'
      WHEN status::text = 'requested' THEN 'created'
      WHEN status::text = 'supplier_delivered' THEN 'finished'
      ELSE status::text
    END::tailoring_order_status_new
  ),
  ALTER COLUMN status SET DEFAULT 'created';

-- 4. tailoring_order_state_history: from_status y to_status, ambos del enum.
-- Sin acceso a order_type → fabric_received se mapea por defecto a
-- fabric_received_store (mayoría artesanal; el history es informacional).
ALTER TABLE tailoring_order_state_history
  ALTER COLUMN from_status TYPE tailoring_order_status_new
  USING (
    CASE
      WHEN from_status::text = 'factory_ordered' THEN 'in_production'
      WHEN from_status::text = 'fabric_received' THEN 'fabric_received_store'
      WHEN from_status::text = 'fitting' THEN 'in_fitting'
      WHEN from_status::text = 'adjustments' THEN 'in_production'
      WHEN from_status::text = 'in_workshop' THEN 'in_production'
      WHEN from_status::text = 'pending_first_fitting' THEN 'in_fitting'
      WHEN from_status::text = 'note_sent_factory' THEN 'fabric_ordered'
      WHEN from_status::text = 'fabric_ordered_supplier' THEN 'fabric_ordered'
      WHEN from_status::text = 'fabric_at_factory' THEN 'fabric_received_factory'
      WHEN from_status::text = 'shipping_to_store' THEN 'received_in_store'
      WHEN from_status::text = 'delivered_to_store' THEN 'received_in_store'
      WHEN from_status::text = 'order_requested' THEN 'created'
      WHEN from_status::text = 'requested' THEN 'created'
      WHEN from_status::text = 'supplier_delivered' THEN 'finished'
      ELSE from_status::text
    END::tailoring_order_status_new
  );

ALTER TABLE tailoring_order_state_history
  ALTER COLUMN to_status TYPE tailoring_order_status_new
  USING (
    CASE
      WHEN to_status::text = 'factory_ordered' THEN 'in_production'
      WHEN to_status::text = 'fabric_received' THEN 'fabric_received_store'
      WHEN to_status::text = 'fitting' THEN 'in_fitting'
      WHEN to_status::text = 'adjustments' THEN 'in_production'
      WHEN to_status::text = 'in_workshop' THEN 'in_production'
      WHEN to_status::text = 'pending_first_fitting' THEN 'in_fitting'
      WHEN to_status::text = 'note_sent_factory' THEN 'fabric_ordered'
      WHEN to_status::text = 'fabric_ordered_supplier' THEN 'fabric_ordered'
      WHEN to_status::text = 'fabric_at_factory' THEN 'fabric_received_factory'
      WHEN to_status::text = 'shipping_to_store' THEN 'received_in_store'
      WHEN to_status::text = 'delivered_to_store' THEN 'received_in_store'
      WHEN to_status::text = 'order_requested' THEN 'created'
      WHEN to_status::text = 'requested' THEN 'created'
      WHEN to_status::text = 'supplier_delivered' THEN 'finished'
      ELSE to_status::text
    END::tailoring_order_status_new
  );

-- 5. DROP del enum viejo y RENAME del nuevo
DROP TYPE tailoring_order_status;
ALTER TYPE tailoring_order_status_new RENAME TO tailoring_order_status;

-- 6a. Recrear el índice parcial `idx_tailoring_orders_pending` idéntico a
-- su definición original en mig 003b. El predicate ahora se evalúa contra
-- el enum nuevo (mismos literales 'delivered'/'cancelled' que sí existen).
CREATE INDEX idx_tailoring_orders_pending ON tailoring_orders(status)
  WHERE status NOT IN ('delivered', 'cancelled');

-- 6b. Recrear la vista v_tailoring_orders_summary idéntica a su definición
-- original en mig 003d_accounting.sql. La columna `status` ahora referencia
-- el enum nuevo (mismo nombre, valores distintos).
CREATE VIEW v_tailoring_orders_summary AS
SELECT
  o.id,
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
  (SELECT COUNT(*) FROM tailoring_order_lines l WHERE l.tailoring_order_id = o.id) AS garment_count,
  (SELECT MIN(f.scheduled_date)
   FROM tailoring_fittings f
   WHERE f.tailoring_order_id = o.id AND f.status = 'scheduled') AS next_fitting_date,
  o.created_at
FROM tailoring_orders o
JOIN clients c ON c.id = o.client_id
JOIN stores s ON s.id = o.store_id;

COMMIT;
