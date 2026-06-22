-- ============================================================
-- Migración 230: rpc_settle_official — liquidar comisiones de un oficial (R9b pieza 2).
--
-- Registra el PAGO a un oficial de forma ATÓMICA (todo o nada): inserta el snapshot
-- inmutable en official_settlements, marca las líneas pagadas con settlement_id y
-- actualiza officials.total_paid. La tarifa se resuelve en TS (única fuente, mapBase);
-- la RPC recibe ya las line_ids + total + garments y garantiza la integridad con guards.
--
-- GUARDS (anti-doble-pago / anti-carrera / cross-oficial): el UPDATE solo marca líneas
-- de ESE oficial y NO liquidadas (settlement_id IS NULL); si el nº de filas marcadas no
-- coincide con el nº de line_ids → RAISE y se revierte TODO (no settlement huérfano, no
-- líneas marcadas, totales sin tocar). Cero pago a medias.
--
-- total_paid se RECOMPUTA = SUM(settlements pagados) (sin drift, auto-sanador).
-- total_pending se decrementa (informativo; el pendiente autoritativo es el informe R9a
-- en vivo, porque el lado de devengo no incrementa esta columna).
-- ============================================================

CREATE OR REPLACE FUNCTION rpc_settle_official(
  p_official_id uuid, p_line_ids uuid[], p_total numeric, p_garments int,
  p_period_start date, p_period_end date, p_paid_at date,
  p_payment_method text, p_reference text, p_notes text, p_user uuid
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_settlement uuid; v_updated int; v_expected int;
BEGIN
  IF p_official_id IS NULL THEN RAISE EXCEPTION 'official_id requerido'; END IF;
  v_expected := array_length(p_line_ids,1);
  IF p_line_ids IS NULL OR v_expected IS NULL OR v_expected = 0 THEN RAISE EXCEPTION 'No hay lineas que liquidar'; END IF;
  IF NOT EXISTS (SELECT 1 FROM officials WHERE id = p_official_id) THEN RAISE EXCEPTION 'Oficial no encontrado: %', p_official_id; END IF;
  IF COALESCE(p_total,0) <= 0 THEN RAISE EXCEPTION 'El total a liquidar debe ser mayor que 0'; END IF;

  INSERT INTO official_settlements (official_id, period_start, period_end, garments_count, total_amount,
                                    paid_at, payment_method, reference, notes, status, created_by)
  VALUES (p_official_id, p_period_start, p_period_end, p_garments, p_total,
          p_paid_at, p_payment_method, p_reference, p_notes, 'paid', p_user)
  RETURNING id INTO v_settlement;

  UPDATE tailoring_order_lines SET settlement_id = v_settlement
   WHERE id = ANY(p_line_ids)
     AND official_id = p_official_id           -- GUARD: solo líneas de ESE oficial
     AND settlement_id IS NULL;                -- GUARD: solo NO liquidadas (anti-doble-pago/carrera)
  GET DIAGNOSTICS v_updated = ROW_COUNT;

  IF v_updated <> v_expected THEN
    RAISE EXCEPTION 'Conflicto: % de % lineas marcables (alguna ya liquidada o de otro oficial); liquidacion abortada', v_updated, v_expected;
  END IF;

  UPDATE officials SET
    total_paid    = (SELECT COALESCE(SUM(total_amount),0) FROM official_settlements WHERE official_id = p_official_id AND status = 'paid'),
    total_pending = GREATEST(COALESCE(total_pending,0) - p_total, 0),
    updated_at    = now()
  WHERE id = p_official_id;

  RETURN jsonb_build_object('settlement_id', v_settlement, 'garments_count', p_garments, 'total_amount', p_total, 'lines_settled', v_updated);
END;
$$;

GRANT EXECUTE ON FUNCTION rpc_settle_official(uuid,uuid[],numeric,int,date,date,date,text,text,text,uuid) TO service_role, authenticated;
