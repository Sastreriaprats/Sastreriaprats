-- 198_backfill_line_status_forward_only.sql
--
-- Sincroniza el estado de cada línea (prenda) con el de su pedido aplicando la
-- regla FORWARD-ONLY que a partir de ahora usan changeOrderStatus (admin) y
-- updateOrderStatus (sastre):
--   - las líneas estrictamente POR DETRÁS del estado del pedido suben a ese estado;
--   - las líneas que ya están AL MISMO nivel o MÁS ADELANTADAS se respetan;
--   - las líneas en 'incident'/'cancelled' (transversales) no se tocan;
--   - los pedidos en 'incident'/'cancelled' se excluyen (no se propaga por rank).
--
-- El "rank" es canónico (válido para todos los order_type, porque cada pipeline
-- por tipo es una subsecuencia monótona de este orden). Equivale al índice por
-- tipo que usa el helper TS classifyLinesForForwardPropagation para los datos
-- reales (mismo tipo); solo divergiría en líneas con estado ajeno a su tipo,
-- que aquí se tratan igual (subir si van por detrás), lo cual es correcto.
--
-- IDEMPOTENTE: en una segunda ejecución no quedan líneas "por detrás", el UPDATE
-- afecta 0 filas y no se inserta historial nuevo.

DO $$
DECLARE
  v_changed integer := 0;
  v_actor   uuid;
BEGIN
  -- changed_by es NOT NULL: usamos la cuenta admin del sistema como autor del
  -- backfill, con fallback a cualquier perfil con rol administrador.
  SELECT COALESCE(
    (SELECT p.id FROM profiles p WHERE p.email = 'admin@sastreriaprats.com' LIMIT 1),
    (SELECT ur.user_id FROM user_roles ur JOIN roles r ON r.id = ur.role_id
       WHERE r.name = 'administrador' ORDER BY ur.user_id LIMIT 1)
  ) INTO v_actor;
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'mig 198: no se encontró un perfil administrador para changed_by';
  END IF;

  WITH rank_map(status, rank) AS (
    VALUES
      ('created', 0), ('fabric_ordered', 1),
      ('fabric_received_store', 2), ('fabric_received_factory', 2),
      ('cut', 3), ('in_production', 4),
      ('in_fitting', 5), ('received_in_store', 5),
      ('finished', 6), ('delivered', 7)
  ),
  candidates AS (
    SELECT l.id AS line_id,
           l.tailoring_order_id,
           l.status  AS from_status,
           o.status  AS to_status
    FROM tailoring_order_lines l
    JOIN tailoring_orders o ON o.id = l.tailoring_order_id
    JOIN rank_map rl ON rl.status = l.status::text   -- líneas incident/cancelled quedan fuera (no están en rank_map)
    JOIN rank_map ro ON ro.status = o.status::text   -- pedidos incident/cancelled quedan fuera
    WHERE rl.rank < ro.rank                     -- forward-only: solo las rezagadas
  ),
  upd AS (
    UPDATE tailoring_order_lines t
    SET status = c.to_status,
        updated_at = now()
    FROM candidates c
    WHERE t.id = c.line_id
    RETURNING t.id, c.tailoring_order_id, c.from_status, c.to_status
  ),
  hist AS (
    INSERT INTO tailoring_order_state_history
      (tailoring_order_id, tailoring_order_line_id, from_status, to_status, notes, changed_by, changed_by_name)
    SELECT u.tailoring_order_id, u.id, u.from_status, u.to_status,
           'Backfill mig 198 — sincronización forward-only', v_actor, 'Backfill mig 198'
    FROM upd u
    RETURNING 1
  )
  SELECT count(*) INTO v_changed FROM upd;

  RAISE NOTICE 'Backfill mig 198: % líneas sincronizadas forward-only.', v_changed;
END $$;
