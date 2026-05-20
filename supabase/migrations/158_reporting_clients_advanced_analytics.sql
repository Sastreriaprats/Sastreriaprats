-- ============================================================
-- Migration 158: RPC analítico para tab "Clientes" del reporting
-- ============================================================
-- Devuelve en un solo round-trip las métricas avanzadas que necesita
-- la pantalla /admin/reporting, tab "Clientes":
--
--   - with_purchases: clientes únicos con compra en el periodo
--     (UNION de sales + tailoring_orders, descartando consumidor final)
--   - by_store: clientes únicos por tienda donde compraron
--   - by_day: serie temporal de clientes únicos por bucket
--     (granularidad automática: day ≤ 31 días, week ≤ 90 días, mes >)
--   - granularity: el bucket usado, para que el frontend ponga la etiqueta
--   - new_vs_returning: nuevos (sin compras previas a p_start) vs antiguos
--
-- Sustituye el cálculo erróneo basado en clients.total_spent (histórico
-- acumulativo y NO mantenido desde tailoring_orders).
--
-- STABLE: solo lectura. No usa SECURITY DEFINER — el caller llega vía
-- service_role desde server actions y bypassa RLS. GRANT a authenticated
-- por si en el futuro se invoca desde el JS cliente normal.
-- ============================================================

BEGIN;

CREATE OR REPLACE FUNCTION clients_advanced_analytics(
  p_start TIMESTAMPTZ,
  p_end   TIMESTAMPTZ,
  p_store UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
DECLARE
  v_days              INT;
  v_granularity       TEXT;
  v_step              INTERVAL;
  v_with_purchases    BIGINT;
  v_by_store          JSONB;
  v_by_day            JSONB;
  v_new_vs_returning  JSONB;
BEGIN
  -- ── Granularidad temporal según el rango ────────────────────────
  v_days := GREATEST(1, EXTRACT(DAY FROM (p_end - p_start))::INT + 1);
  v_granularity := CASE
    WHEN v_days <= 31 THEN 'day'
    WHEN v_days <= 90 THEN 'week'
    ELSE                   'month'
  END;
  v_step := CASE v_granularity
    WHEN 'day'   THEN '1 day'::interval
    WHEN 'week'  THEN '1 week'::interval
    ELSE              '1 month'::interval
  END;

  -- ── 1) Clientes únicos con compra en el periodo ─────────────────
  SELECT COUNT(DISTINCT client_id) INTO v_with_purchases
  FROM (
    SELECT client_id FROM sales
    WHERE created_at >= p_start AND created_at <= p_end
      AND client_id IS NOT NULL
      AND (p_store IS NULL OR store_id = p_store)
    UNION ALL
    SELECT client_id FROM tailoring_orders
    WHERE created_at >= p_start AND created_at <= p_end
      AND client_id IS NOT NULL
      AND (p_store IS NULL OR store_id = p_store)
  ) c;

  -- ── 2) Clientes únicos por tienda ───────────────────────────────
  SELECT COALESCE(jsonb_agg(row_to_json(t)::jsonb ORDER BY t.clients_count DESC), '[]'::jsonb)
    INTO v_by_store
  FROM (
    SELECT s.id AS store_id, s.name AS store_name, COUNT(DISTINCT c.client_id) AS clients_count
    FROM   stores s
    LEFT   JOIN (
      SELECT client_id, store_id FROM sales
      WHERE  created_at >= p_start AND created_at <= p_end AND client_id IS NOT NULL
      UNION ALL
      SELECT client_id, store_id FROM tailoring_orders
      WHERE  created_at >= p_start AND created_at <= p_end AND client_id IS NOT NULL
    ) c ON c.store_id = s.id
    WHERE  s.is_active = TRUE
      AND (p_store IS NULL OR s.id = p_store)
    GROUP  BY s.id, s.name
    HAVING COUNT(DISTINCT c.client_id) > 0
  ) t;

  -- ── 3) Clientes únicos por bucket temporal ──────────────────────
  SELECT COALESCE(jsonb_agg(row_to_json(t)::jsonb ORDER BY t.day), '[]'::jsonb)
    INTO v_by_day
  FROM (
    SELECT b.day_bucket::DATE AS day, COUNT(DISTINCT c.client_id) AS clients_count
    FROM   (
      SELECT generate_series(
               date_trunc(v_granularity, p_start),
               date_trunc(v_granularity, p_end),
               v_step
             ) AS day_bucket
    ) b
    LEFT   JOIN (
      SELECT client_id, created_at, store_id FROM sales
      WHERE  created_at >= p_start AND created_at <= p_end AND client_id IS NOT NULL
      UNION ALL
      SELECT client_id, created_at, store_id FROM tailoring_orders
      WHERE  created_at >= p_start AND created_at <= p_end AND client_id IS NOT NULL
    ) c
      ON   date_trunc(v_granularity, c.created_at) = b.day_bucket
      AND  (p_store IS NULL OR c.store_id = p_store)
    GROUP  BY b.day_bucket
  ) t;

  -- ── 4) Nuevos vs antiguos ───────────────────────────────────────
  -- "Antiguos" = clientes que TAMBIÉN tienen alguna compra anterior
  --   al inicio del periodo (en cualquier tienda — el primer historial
  --   del cliente NO debe restringirse al store seleccionado, eso
  --   produciría falsos positivos: "nuevo en Madrid" cuando ya compró
  --   antes en Barcelona).
  -- "Nuevos" = compraron en el periodo pero NO antes.
  WITH compras_periodo AS (
    SELECT DISTINCT client_id FROM sales
    WHERE  created_at >= p_start AND created_at <= p_end
      AND  client_id IS NOT NULL
      AND  (p_store IS NULL OR store_id = p_store)
    UNION
    SELECT DISTINCT client_id FROM tailoring_orders
    WHERE  created_at >= p_start AND created_at <= p_end
      AND  client_id IS NOT NULL
      AND  (p_store IS NULL OR store_id = p_store)
  ),
  compras_previas AS (
    SELECT DISTINCT client_id FROM sales
    WHERE  created_at < p_start AND client_id IS NOT NULL
    UNION
    SELECT DISTINCT client_id FROM tailoring_orders
    WHERE  created_at < p_start AND client_id IS NOT NULL
  )
  SELECT jsonb_build_object(
    'new_count',       COUNT(*) FILTER (WHERE cp.client_id IS NULL),
    'returning_count', COUNT(*) FILTER (WHERE cp.client_id IS NOT NULL),
    'total',           COUNT(*)
  )
  INTO   v_new_vs_returning
  FROM   compras_periodo c
  LEFT   JOIN compras_previas cp ON cp.client_id = c.client_id;

  -- ── Resultado agregado ──────────────────────────────────────────
  RETURN jsonb_build_object(
    'with_purchases',   v_with_purchases,
    'granularity',      v_granularity,
    'by_store',         v_by_store,
    'by_day',           v_by_day,
    'new_vs_returning', v_new_vs_returning
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.clients_advanced_analytics(TIMESTAMPTZ, TIMESTAMPTZ, UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public.clients_advanced_analytics(TIMESTAMPTZ, TIMESTAMPTZ, UUID) TO authenticated;

COMMIT;
