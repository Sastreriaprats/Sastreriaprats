-- ============================================================
-- Migración 228: refinar seal_line_finished_at() — sellar SOLO en la transición.
--
-- Fix de raíz de un footgun ACTIVO: la versión original (mig 226) sellaba
-- finished_at = now() en CUALQUIER UPDATE de una línea finished/delivered con
-- finished_at NULL (guard solo IS NULL). Consecuencia: editar la ficha (medida,
-- oficial…) de una prenda ya terminada/entregada le FABRICABA finished_at = now()
-- (fecha de edición, no de confección). Afectaba al flujo EditFichaDialog/
-- updateOrderAction y obligaba a desactivar el trigger en backfills.
--
-- Refinado: sellar finished_at SOLO cuando la línea LLEGA a finished/delivered:
--   - INSERT directamente en finished/delivered, o
--   - UPDATE donde NEW.status IN (finished,delivered) Y OLD.status NO estaba ya
--     en finished/delivered (la transición real = devengo).
-- Editar una línea que YA estaba finished/delivered no toca finished_at.
-- Mantiene el guard IS NULL (idempotente) y NO borra al retroceder de estado.
--
-- Solo cambia la FUNCIÓN; el trigger trg_seal_line_finished_at queda igual.
-- CREATE OR REPLACE no re-procesa filas existentes (finished_at intacto).
-- ============================================================

CREATE OR REPLACE FUNCTION seal_line_finished_at() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE v_seal boolean := false;
BEGIN
  IF NEW.finished_at IS NULL AND NEW.status IN ('finished','delivered') THEN
    IF TG_OP = 'INSERT' THEN
      v_seal := true;                                  -- alta directa en finished/delivered
    ELSIF OLD.status NOT IN ('finished','delivered') THEN
      v_seal := true;                                  -- TRANSICIÓN: la prenda llega a finished/delivered
    END IF;
  END IF;
  IF v_seal THEN NEW.finished_at := now(); END IF;
  RETURN NEW;
END;
$$;
