-- ============================================================
-- Migración 227: resolver official_id (FK) desde configuration.oficial (R9 cimiento 2 fase 2).
--
-- La asignación de oficial confeccionador vive como TEXTO (nombre) en
-- tailoring_order_lines.configuration->>'oficial' — fuente de verdad escrita por
-- los selectores de ficha (creación) y los 2 diálogos de edición (que permiten
-- nombres libres). La fase 1 (audit 47d054e4) backfilleó la FK official_id desde
-- ese texto, pero las líneas NUEVAS/EDITADAS volvían a entrar con official_id NULL.
--
-- Este trigger cierra la brecha: official_id pasa a ser un ESPEJO de
-- configuration.oficial, resuelto por nombre normalizado (lower + btrim + colapsar
-- espacios — MISMA lógica que el backfill de la fase 1). Cubre las 3 ramas de
-- createFichaOrder + los 2 editores + cualquier ruta futura en UN solo sitio, sin
-- tocar el cliente. Hay 7 lectores del texto (informes de carga que cruzan por
-- nombre, PDF de ficha, 2 editores, etc.) → se mantiene el texto (Opción A).
--
-- Reglas:
--  - INSERT, o UPDATE cuando configuration.oficial CAMBIÓ (IS DISTINCT FROM OLD):
--    resolver official_id. UPDATE que no toca el oficial NO recalcula (idempotente).
--  - Sin match (o texto vacío/NULL) → official_id NULL (no se inventa; a revisión).
--  - El cortador (configuration.cortador) NO se toca: no genera comisión (decisión
--    de negocio), se queda como texto informativo.
--
-- Trigger SEPARADO del de finished_at (mig 226): responsabilidad distinta, campos
-- independientes, conviven (ambos BEFORE; el orden entre ellos es irrelevante).
-- ============================================================

CREATE OR REPLACE FUNCTION resolve_line_official_id() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE v_resolve boolean := false;
BEGIN
  IF TG_OP = 'INSERT' THEN
    v_resolve := true;
  ELSIF (NEW.configuration->>'oficial') IS DISTINCT FROM (OLD.configuration->>'oficial') THEN
    v_resolve := true;
  END IF;

  IF v_resolve THEN
    SELECT o.id INTO NEW.official_id
    FROM officials o
    WHERE lower(btrim(regexp_replace(o.name, '\s+', ' ', 'g')))
        = lower(btrim(regexp_replace(NULLIF(btrim(NEW.configuration->>'oficial'), ''), '\s+', ' ', 'g')));
    -- sin match o texto vacío/NULL → SELECT INTO sin filas → NEW.official_id := NULL
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_resolve_line_official_id ON tailoring_order_lines;
CREATE TRIGGER trg_resolve_line_official_id
  BEFORE INSERT OR UPDATE ON tailoring_order_lines
  FOR EACH ROW EXECUTE FUNCTION resolve_line_official_id();
