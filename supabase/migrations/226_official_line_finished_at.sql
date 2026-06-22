-- ============================================================
-- Migración 226: sello temporal de devengo del oficial (R9 cimiento 1).
--
-- R9 = comisiones de oficiales (lo que gana cada oficial por prenda). El devengo
-- (decidido por Álvaro) es al "rank >= finished" — es decir, cuando la línea
-- alcanza 'finished' O 'delivered'. Motivo: la propagación forward MASIVA fija las
-- líneas rezagadas DIRECTO al estado destino, así que 82/97 líneas 'delivered' se
-- saltaron 'finished' (nunca pasaron por ese estado). 'delivered' implica que el
-- oficial la terminó → también devenga.
--
-- El estado de línea se cambia en >=3 sitios (changeOrderStatus admin por-línea,
-- la ruta MASIVA .update().in() de "avanzar todas las prendas", updateOrderStatus
-- del sastre, y backfills SQL). En vez de parchear todos, un TRIGGER en la tabla
-- captura TODAS las rutas (incluida la masiva, que es por donde pasan la mayoría).
--
-- Idempotente: guard `finished_at IS NULL` (no se vuelve a pisar una vez sellado);
-- NO se borra si la línea retrocede de estado o se cancela (el informe filtra por
-- el `status` actual, no por la fecha). NO se hace backfill de históricas: hoy
-- 0/638 líneas tienen official_id → ninguna histórica es comisionable, y fabricar
-- fechas (de updated_at o del historial incompleto) sería falso.
-- ============================================================

-- 1) Columna
ALTER TABLE tailoring_order_lines ADD COLUMN IF NOT EXISTS finished_at TIMESTAMPTZ NULL;

-- 2) Función del trigger
CREATE OR REPLACE FUNCTION seal_line_finished_at() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.status IN ('finished','delivered') AND NEW.finished_at IS NULL THEN
    NEW.finished_at := now();
  END IF;
  RETURN NEW;
END;
$$;

-- 3) Trigger BEFORE INSERT OR UPDATE (captura todas las rutas, incl. la masiva .in())
DROP TRIGGER IF EXISTS trg_seal_line_finished_at ON tailoring_order_lines;
CREATE TRIGGER trg_seal_line_finished_at
  BEFORE INSERT OR UPDATE ON tailoring_order_lines
  FOR EACH ROW EXECUTE FUNCTION seal_line_finished_at();
