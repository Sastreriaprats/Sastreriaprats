-- ============================================================
-- Migración 188: RPCs para asientos contables MANUALES.
--
-- Por qué RPC (y no server action plano):
--  * entry_number = MAX+1 por fiscal_year (sin secuencia) -> asignación con
--    reintento ante colisión UNIQUE(fiscal_year, entry_number), atómico.
--  * No hay constraint de cuadre en BD -> se valida aquí (SUM(debit)==SUM(credit)).
--  * Cabecera + N líneas en una sola transacción.
--
-- Cuentas: account_code debe existir en chart_of_accounts con is_detail=true y
-- is_active=true (FK + validación). Cerrojos de edición/borrado: solo asientos
-- entry_type='manual', reference_type IS NULL, periodo no cerrado.
--
-- posted_by/created_by: se pasa p_user_id (las RPC se llaman con service role,
-- así que auth.uid() sería NULL).
-- ============================================================

-- ── Validación común de líneas (devuelve mensaje de error o NULL si OK) ─────
CREATE OR REPLACE FUNCTION public._validate_journal_lines(p_lines jsonb)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_bad_code text;
  v_bad      int;
  v_debit    numeric;
  v_credit   numeric;
BEGIN
  IF p_lines IS NULL OR jsonb_typeof(p_lines) <> 'array' OR jsonb_array_length(p_lines) < 2 THEN
    RETURN 'El asiento debe tener al menos 2 líneas.';
  END IF;

  -- Cuenta válida (existe + is_detail + activa)
  SELECT l->>'account_code' INTO v_bad_code
  FROM jsonb_array_elements(p_lines) l
  WHERE NOT EXISTS (
    SELECT 1 FROM chart_of_accounts c
    WHERE c.account_code = l->>'account_code' AND c.is_detail = true AND c.is_active = true
  )
  LIMIT 1;
  IF v_bad_code IS NOT NULL THEN
    RETURN 'Cuenta no válida o no admite apuntes: ' || COALESCE(v_bad_code, '(vacía)');
  END IF;

  -- Cada línea: debe/haber >= 0 y exactamente uno > 0
  SELECT count(*) INTO v_bad
  FROM jsonb_array_elements(p_lines) l
  WHERE COALESCE((l->>'debit')::numeric, 0) < 0
     OR COALESCE((l->>'credit')::numeric, 0) < 0
     OR (COALESCE((l->>'debit')::numeric, 0) > 0 AND COALESCE((l->>'credit')::numeric, 0) > 0)
     OR (COALESCE((l->>'debit')::numeric, 0) = 0 AND COALESCE((l->>'credit')::numeric, 0) = 0);
  IF v_bad > 0 THEN
    RETURN 'Cada línea debe tener importe solo en Debe o solo en Haber (no ambos, no cero).';
  END IF;

  -- Cuadre
  SELECT COALESCE(SUM((l->>'debit')::numeric), 0), COALESCE(SUM((l->>'credit')::numeric), 0)
  INTO v_debit, v_credit
  FROM jsonb_array_elements(p_lines) l;
  IF v_debit <> v_credit THEN
    RETURN 'El asiento no cuadra: Debe ' || trim(to_char(v_debit, 'FM999999990.00')) || ' € ≠ Haber ' || trim(to_char(v_credit, 'FM999999990.00')) || ' €.';
  END IF;
  IF v_debit <= 0 THEN
    RETURN 'El importe del asiento debe ser mayor que 0.';
  END IF;

  RETURN NULL;
END;
$$;

-- ── A: crear asiento manual ─────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.rpc_create_manual_journal_entry(
  p_date        date,
  p_description text,
  p_lines       jsonb,
  p_user_id     uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_err     text;
  v_year    int := EXTRACT(YEAR FROM p_date)::int;
  v_month   int := EXTRACT(MONTH FROM p_date)::int;
  v_closed  boolean;
  v_debit   numeric;
  v_credit  numeric;
  v_num     int;
  v_entry   uuid := NULL;
  v_try     int;
BEGIN
  IF p_description IS NULL OR btrim(p_description) = '' THEN
    RETURN jsonb_build_object('success', false, 'error', 'La descripción es obligatoria.');
  END IF;

  v_err := public._validate_journal_lines(p_lines);
  IF v_err IS NOT NULL THEN
    RETURN jsonb_build_object('success', false, 'error', v_err);
  END IF;

  SELECT is_closed INTO v_closed FROM fiscal_periods WHERE fiscal_year = v_year AND fiscal_month = v_month;
  IF COALESCE(v_closed, false) THEN
    RETURN jsonb_build_object('success', false, 'error', 'El periodo contable (' || v_year || '-' || lpad(v_month::text, 2, '0') || ') está cerrado.');
  END IF;

  SELECT COALESCE(SUM((l->>'debit')::numeric), 0), COALESCE(SUM((l->>'credit')::numeric), 0)
  INTO v_debit, v_credit FROM jsonb_array_elements(p_lines) l;

  -- entry_number con reintento ante colisión UNIQUE(fiscal_year, entry_number)
  FOR v_try IN 1..3 LOOP
    SELECT COALESCE(MAX(entry_number), 0) + 1 INTO v_num FROM journal_entries WHERE fiscal_year = v_year;
    BEGIN
      INSERT INTO journal_entries (
        entry_number, fiscal_year, fiscal_month, entry_date, description,
        entry_type, reference_type, reference_id, status, posted_at, posted_by,
        is_period_closed, created_by, total_debit, total_credit
      ) VALUES (
        v_num, v_year, v_month, p_date, btrim(p_description),
        'manual', NULL, NULL, 'posted', now(), p_user_id,
        false, p_user_id, v_debit, v_credit
      ) RETURNING id INTO v_entry;
      EXIT;
    EXCEPTION WHEN unique_violation THEN
      v_entry := NULL;  -- reintentar
    END;
  END LOOP;

  IF v_entry IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'No se pudo asignar número de asiento (colisión); reinténtalo.');
  END IF;

  INSERT INTO journal_entry_lines (journal_entry_id, account_code, debit, credit, description, sort_order)
  SELECT v_entry, t.l->>'account_code',
         COALESCE((t.l->>'debit')::numeric, 0), COALESCE((t.l->>'credit')::numeric, 0),
         NULLIF(btrim(COALESCE(t.l->>'description', '')), ''), (t.ord - 1)
  FROM jsonb_array_elements(p_lines) WITH ORDINALITY AS t(l, ord);

  RETURN jsonb_build_object('success', true, 'message', 'Asiento creado.', 'entry_id', v_entry, 'entry_number', v_num);
END;
$$;

-- ── B: editar asiento manual ────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.rpc_update_manual_journal_entry(
  p_id          uuid,
  p_date        date,
  p_description text,
  p_lines       jsonb,
  p_user_id     uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_e       RECORD;
  v_err     text;
  v_year    int := EXTRACT(YEAR FROM p_date)::int;
  v_month   int := EXTRACT(MONTH FROM p_date)::int;
  v_closed  boolean;
  v_debit   numeric;
  v_credit  numeric;
BEGIN
  SELECT * INTO v_e FROM journal_entries WHERE id = p_id;
  IF v_e.id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Asiento no encontrado.');
  END IF;
  IF v_e.entry_type <> 'manual' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Solo se pueden editar asientos manuales.');
  END IF;
  IF v_e.reference_type IS NOT NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'El asiento está vinculado a otra entidad (' || v_e.reference_type || ').');
  END IF;
  IF COALESCE(v_e.is_period_closed, false) THEN
    RETURN jsonb_build_object('success', false, 'error', 'El periodo contable del asiento está cerrado.');
  END IF;

  IF p_description IS NULL OR btrim(p_description) = '' THEN
    RETURN jsonb_build_object('success', false, 'error', 'La descripción es obligatoria.');
  END IF;
  v_err := public._validate_journal_lines(p_lines);
  IF v_err IS NOT NULL THEN
    RETURN jsonb_build_object('success', false, 'error', v_err);
  END IF;

  -- Periodo NUEVO (de la nueva fecha) no cerrado
  SELECT is_closed INTO v_closed FROM fiscal_periods WHERE fiscal_year = v_year AND fiscal_month = v_month;
  IF COALESCE(v_closed, false) THEN
    RETURN jsonb_build_object('success', false, 'error', 'El periodo de destino (' || v_year || '-' || lpad(v_month::text, 2, '0') || ') está cerrado.');
  END IF;

  SELECT COALESCE(SUM((l->>'debit')::numeric), 0), COALESCE(SUM((l->>'credit')::numeric), 0)
  INTO v_debit, v_credit FROM jsonb_array_elements(p_lines) l;

  DELETE FROM journal_entry_lines WHERE journal_entry_id = p_id;
  INSERT INTO journal_entry_lines (journal_entry_id, account_code, debit, credit, description, sort_order)
  SELECT p_id, t.l->>'account_code',
         COALESCE((t.l->>'debit')::numeric, 0), COALESCE((t.l->>'credit')::numeric, 0),
         NULLIF(btrim(COALESCE(t.l->>'description', '')), ''), (t.ord - 1)
  FROM jsonb_array_elements(p_lines) WITH ORDINALITY AS t(l, ord);

  UPDATE journal_entries SET
    entry_date = p_date, fiscal_year = v_year, fiscal_month = v_month,
    description = btrim(p_description), total_debit = v_debit, total_credit = v_credit,
    updated_at = now()
  WHERE id = p_id;

  RETURN jsonb_build_object('success', true, 'message', 'Asiento actualizado.');
END;
$$;

-- ── C: borrar asiento manual ────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.rpc_delete_journal_entry(
  p_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_e      RECORD;
  v_closed boolean;
BEGIN
  SELECT * INTO v_e FROM journal_entries WHERE id = p_id;
  IF v_e.id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Asiento no encontrado.');
  END IF;
  IF v_e.entry_type <> 'manual' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Solo se pueden anular asientos manuales.');
  END IF;
  IF v_e.reference_type IS NOT NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'El asiento está vinculado a otra entidad (' || v_e.reference_type || ').');
  END IF;
  IF COALESCE(v_e.is_period_closed, false) THEN
    RETURN jsonb_build_object('success', false, 'error', 'El periodo contable del asiento está cerrado.');
  END IF;
  SELECT is_closed INTO v_closed FROM fiscal_periods WHERE fiscal_year = v_e.fiscal_year AND fiscal_month = v_e.fiscal_month;
  IF COALESCE(v_closed, false) THEN
    RETURN jsonb_build_object('success', false, 'error', 'El periodo contable del asiento está cerrado.');
  END IF;

  DELETE FROM journal_entry_lines WHERE journal_entry_id = p_id;
  DELETE FROM journal_entries WHERE id = p_id;

  RETURN jsonb_build_object('success', true, 'message', 'Asiento anulado.', 'entry_number', v_e.entry_number);
END;
$$;

GRANT EXECUTE ON FUNCTION public._validate_journal_lines(jsonb) TO service_role, authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_create_manual_journal_entry(date, text, jsonb, uuid) TO service_role, authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_update_manual_journal_entry(uuid, date, text, jsonb, uuid) TO service_role, authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_delete_journal_entry(uuid) TO service_role, authenticated;
