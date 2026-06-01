-- ============================================================
-- Migración 193: fix line_total en rpc_create_credit_note (mig 192).
--
-- BUG en la 192: al construir las líneas de la rectificativa, line_total se
-- almacenaba como base sin IVA:
--
--   'line_total', -v_line_base
--
-- La convención del resto del código (createInvoiceAction, edición de
-- facturas) es que invoice_lines.line_total = base × (1 + tax_rate/100),
-- es decir CON IVA. Esto se descubrió en la prueba controlada de la 192:
-- la rectificativa de "1 ud × 50 € al 21%" guardaba line_total=-50 en vez
-- de -60.50.
--
-- IMPACTO en prod: ninguno (ninguna rectificativa real se llegó a emitir
-- entre la aplicación de 192 y este fix). El total/subtotal/tax_amount de
-- la cabecera de la rectificativa SÍ eran correctos; solo el line_total
-- de cada invoice_line individual divergía → el PDF mostraba la columna
-- TOTAL de la línea como -50 en vez de -60.50, pero la suma final de la
-- factura era correcta.
--
-- FIX: cambiar la única línea del cálculo en el JSON acumulado:
--
--   'line_total', -(v_line_base + v_line_tax)
--
-- Idempotente: CREATE OR REPLACE FUNCTION.
-- ============================================================

CREATE OR REPLACE FUNCTION public.rpc_create_credit_note(
  p_invoice_id UUID,
  p_lines      JSONB,
  p_reason     TEXT,
  p_user_id    UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_inv             RECORD;
  v_orig            RECORD;
  v_elem            JSONB;
  v_orig_line_id    UUID;
  v_qty_to_rect     NUMERIC(10,2);
  v_qty_already     NUMERIC(10,2);
  v_qty_max         NUMERIC(10,2);
  v_line_base       NUMERIC(12,2);
  v_line_tax        NUMERIC(12,2);
  v_subtotal        NUMERIC(12,2) := 0;
  v_tax_amount      NUMERIC(12,2) := 0;
  v_irpf_amount     NUMERIC(12,2) := 0;
  v_total           NUMERIC(12,2);
  v_lines_data      JSONB := '[]'::jsonb;
  v_at_least_one    BOOLEAN := FALSE;
  v_period_closed   BOOLEAN;
  v_year            INT;
  v_fiscal_month    INT;
  v_seq             INT;
  v_credit_note_id  UUID;
  v_credit_note_num TEXT;
  v_entry_id        UUID;
  v_entry_number    INT;
  v_all_full        BOOLEAN;
  v_max_retries     INT := 5;
  v_try             INT;
BEGIN
  -- ── A) Validaciones de entrada ────────────────────────────────────────────
  IF p_invoice_id IS NULL THEN
    RAISE EXCEPTION 'Falta el identificador de la factura';
  END IF;
  IF p_reason IS NULL OR length(trim(p_reason)) < 10 THEN
    RAISE EXCEPTION 'El motivo es obligatorio (mínimo 10 caracteres)';
  END IF;
  IF p_lines IS NULL OR jsonb_typeof(p_lines) <> 'array' OR jsonb_array_length(p_lines) = 0 THEN
    RAISE EXCEPTION 'Debe rectificarse al menos una línea';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM jsonb_array_elements(p_lines) AS elem
    WHERE COALESCE((elem->>'qty_to_rectify')::NUMERIC, 0) > 0
    GROUP BY (elem->>'original_line_id')
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION 'Líneas duplicadas en la solicitud (un mismo original_line_id no puede aparecer dos veces)';
  END IF;

  -- ── B) Cargar factura original y cerrojos ─────────────────────────────────
  SELECT * INTO v_inv FROM invoices WHERE id = p_invoice_id;
  IF v_inv.id IS NULL THEN
    RAISE EXCEPTION 'Factura no encontrada: %', p_invoice_id;
  END IF;
  IF v_inv.invoice_type <> 'issued' THEN
    RAISE EXCEPTION 'Solo se pueden rectificar facturas emitidas';
  END IF;
  IF COALESCE(v_inv.is_rectifying, FALSE) THEN
    RAISE EXCEPTION 'No se puede rectificar una factura rectificativa';
  END IF;
  IF v_inv.status NOT IN ('issued','paid','partially_paid','overdue') THEN
    RAISE EXCEPTION 'La factura no está en un estado rectificable (estado actual: %)', v_inv.status;
  END IF;
  IF COALESCE(v_inv.recargo_amount, 0) <> 0 OR COALESCE(v_inv.recargo_rate, 0) <> 0 THEN
    RAISE EXCEPTION 'Las facturas con recargo de equivalencia no se pueden rectificar todavía';
  END IF;

  IF v_inv.journal_entry_id IS NOT NULL THEN
    SELECT is_period_closed INTO v_period_closed
    FROM journal_entries WHERE id = v_inv.journal_entry_id;
    IF COALESCE(v_period_closed, FALSE) THEN
      RAISE EXCEPTION 'El periodo contable de la factura original está cerrado';
    END IF;
  END IF;

  -- ── C) Validar líneas, acumular importes y datos de cada una ─────────────
  FOR v_elem IN SELECT * FROM jsonb_array_elements(p_lines) LOOP
    v_orig_line_id := NULLIF(v_elem->>'original_line_id', '')::UUID;
    v_qty_to_rect  := COALESCE((v_elem->>'qty_to_rectify')::NUMERIC, 0);

    IF v_qty_to_rect = 0 THEN
      CONTINUE;
    END IF;
    IF v_qty_to_rect < 0 THEN
      RAISE EXCEPTION 'La cantidad a rectificar no puede ser negativa';
    END IF;
    IF v_orig_line_id IS NULL THEN
      RAISE EXCEPTION 'Falta original_line_id en una de las líneas';
    END IF;

    SELECT * INTO v_orig FROM invoice_lines WHERE id = v_orig_line_id;
    IF v_orig.id IS NULL OR v_orig.invoice_id <> p_invoice_id THEN
      RAISE EXCEPTION 'Línea inválida o no pertenece a la factura: %', v_orig_line_id;
    END IF;

    SELECT COALESCE(SUM(-il.quantity), 0) INTO v_qty_already
    FROM invoice_lines il
    JOIN invoices i ON i.id = il.invoice_id
    WHERE il.rectifies_line_id = v_orig.id
      AND i.is_rectifying = TRUE
      AND i.status <> 'cancelled';

    v_qty_max := v_orig.quantity - v_qty_already;
    IF v_qty_to_rect > v_qty_max THEN
      RAISE EXCEPTION 'La línea "%" solo tiene % unidades pendientes de rectificar (pedidas: %)',
        v_orig.description, v_qty_max, v_qty_to_rect;
    END IF;

    v_line_base := ROUND(v_qty_to_rect * v_orig.unit_price *
                         (1 - COALESCE(v_orig.discount_percentage, 0) / 100), 2);
    v_line_tax  := ROUND(v_line_base * COALESCE(v_orig.tax_rate, 0) / 100, 2);

    v_subtotal     := v_subtotal + v_line_base;
    v_tax_amount   := v_tax_amount + v_line_tax;
    v_at_least_one := TRUE;

    v_lines_data := v_lines_data || jsonb_build_array(jsonb_build_object(
      'original_line_id',     v_orig.id,
      'product_variant_id',   v_orig.product_variant_id,
      'description',          v_orig.description,
      'qty_to_rectify',       v_qty_to_rect,
      'unit_price',           v_orig.unit_price,
      'discount_percentage',  COALESCE(v_orig.discount_percentage, 0),
      'tax_rate',             COALESCE(v_orig.tax_rate, 0),
      -- FIX mig 193: line_total = base + IVA (no solo base) para coherencia con
      -- la convención del resto del código (invoices.subtotal/tax_amount
      -- siguen como antes; solo cambia el line_total de cada invoice_line).
      'line_total',           -(v_line_base + v_line_tax),
      'sort_order',           COALESCE(v_orig.sort_order, 0)
    ));
  END LOOP;

  IF NOT v_at_least_one THEN
    RAISE EXCEPTION 'Debe rectificarse al menos una línea con cantidad mayor que 0';
  END IF;

  IF COALESCE(v_inv.irpf_rate, 0) > 0 THEN
    v_irpf_amount := ROUND(v_subtotal * v_inv.irpf_rate / 100, 2);
  END IF;
  v_total := v_subtotal + v_tax_amount - v_irpf_amount;

  -- ── D) Crear factura rectificativa con retry on unique_violation ─────────
  v_year         := EXTRACT(YEAR FROM CURRENT_DATE)::INT;
  v_fiscal_month := EXTRACT(MONTH FROM CURRENT_DATE)::INT;

  v_try := 0;
  LOOP
    v_try := v_try + 1;
    SELECT COALESCE(MAX(
      NULLIF(substring(invoice_number FROM '^R' || v_year || '-(\d+)$'), '')::INT
    ), 0) + 1
    INTO v_seq
    FROM invoices
    WHERE invoice_series = 'R'
      AND invoice_number LIKE 'R' || v_year || '-%';

    v_credit_note_num := 'R' || v_year || '-' || LPAD(v_seq::TEXT, 4, '0');

    BEGIN
      INSERT INTO invoices (
        invoice_number, invoice_series, invoice_type,
        client_id, client_name, client_nif, client_address,
        client_email, client_phone, payment_method,
        company_name, company_nif, company_address,
        invoice_date, due_date,
        subtotal, tax_rate, tax_amount,
        irpf_rate, irpf_amount,
        total,
        status,
        is_rectifying, rectifies_invoice_id, rectification_reason,
        sale_id, tailoring_order_id, online_order_id,
        store_id, notes, created_by
      ) VALUES (
        v_credit_note_num, 'R', 'issued',
        v_inv.client_id, v_inv.client_name, v_inv.client_nif, v_inv.client_address,
        v_inv.client_email, v_inv.client_phone, v_inv.payment_method,
        v_inv.company_name, v_inv.company_nif, v_inv.company_address,
        CURRENT_DATE, NULL,
        -v_subtotal, v_inv.tax_rate, -v_tax_amount,
        v_inv.irpf_rate, -v_irpf_amount,
        -v_total,
        'issued',
        TRUE, v_inv.id, trim(p_reason),
        v_inv.sale_id, v_inv.tailoring_order_id, v_inv.online_order_id,
        v_inv.store_id,
        'Rectificativa de ' || v_inv.invoice_number,
        p_user_id
      ) RETURNING id INTO v_credit_note_id;
      EXIT;
    EXCEPTION WHEN unique_violation THEN
      IF v_try >= v_max_retries THEN
        RAISE EXCEPTION 'No se pudo asignar número de rectificativa tras % intentos', v_max_retries;
      END IF;
    END;
  END LOOP;

  -- ── E) Insertar líneas de la rectificativa ────────────────────────────────
  FOR v_elem IN SELECT * FROM jsonb_array_elements(v_lines_data) LOOP
    INSERT INTO invoice_lines (
      invoice_id, description, quantity, unit_price,
      discount_percentage, tax_rate, line_total,
      product_variant_id, sort_order, rectifies_line_id
    ) VALUES (
      v_credit_note_id,
      (v_elem->>'description'),
      -((v_elem->>'qty_to_rectify')::NUMERIC),
      (v_elem->>'unit_price')::NUMERIC,
      COALESCE((v_elem->>'discount_percentage')::NUMERIC, 0),
      COALESCE((v_elem->>'tax_rate')::NUMERIC, 0),
      (v_elem->>'line_total')::NUMERIC,
      NULLIF(v_elem->>'product_variant_id','')::UUID,
      COALESCE((v_elem->>'sort_order')::INT, 0),
      (v_elem->>'original_line_id')::UUID
    );
  END LOOP;

  -- ── F) Asiento contable de contrapartida ──────────────────────────────────
  v_try := 0;
  LOOP
    v_try := v_try + 1;
    SELECT COALESCE(MAX(entry_number), 0) + 1 INTO v_entry_number
    FROM journal_entries WHERE fiscal_year = v_year;

    BEGIN
      INSERT INTO journal_entries (
        entry_number, fiscal_year, fiscal_month, entry_date,
        description, entry_type,
        reference_type, reference_id, reference_number,
        status, posted_at, posted_by,
        total_debit, total_credit, created_by
      ) VALUES (
        v_entry_number, v_year, v_fiscal_month, CURRENT_DATE,
        'Rectificativa ' || v_credit_note_num || ' (rectifica ' || v_inv.invoice_number || ')',
        'sale',
        'invoice', v_credit_note_id, v_credit_note_num,
        'posted', NOW(), p_user_id,
        v_subtotal + v_tax_amount,
        v_total + v_irpf_amount,
        p_user_id
      ) RETURNING id INTO v_entry_id;
      EXIT;
    EXCEPTION WHEN unique_violation THEN
      IF v_try >= v_max_retries THEN
        RAISE EXCEPTION 'No se pudo asignar número de asiento tras % intentos', v_max_retries;
      END IF;
    END;
  END LOOP;

  INSERT INTO journal_entry_lines (journal_entry_id, account_code, debit, credit, description, sort_order)
  VALUES
    (v_entry_id, '708', v_subtotal,   0,        'Devoluciones ventas',         0),
    (v_entry_id, '477', v_tax_amount, 0,        'IVA repercutido (rectif.)',   1),
    (v_entry_id, '430', 0,            v_total,  'Cliente (rectif.)',           2);

  IF v_irpf_amount <> 0 THEN
    INSERT INTO journal_entry_lines (journal_entry_id, account_code, debit, credit, description, sort_order)
    VALUES (v_entry_id, '473', 0, v_irpf_amount, 'IRPF (rectif.)', 3);
  END IF;

  UPDATE invoices SET journal_entry_id = v_entry_id WHERE id = v_credit_note_id;

  -- ── G) Marcar la original 'rectified' si todas las líneas al 100% ─────────
  SELECT NOT EXISTS (
    SELECT 1 FROM invoice_lines orig
    WHERE orig.invoice_id = p_invoice_id
      AND orig.quantity > (
        SELECT COALESCE(SUM(-il.quantity), 0)
        FROM invoice_lines il
        JOIN invoices i ON i.id = il.invoice_id
        WHERE il.rectifies_line_id = orig.id
          AND i.is_rectifying = TRUE
          AND i.status <> 'cancelled'
      )
  ) INTO v_all_full;

  IF v_all_full THEN
    UPDATE invoices SET status = 'rectified' WHERE id = p_invoice_id;
  END IF;

  RETURN jsonb_build_object(
    'success',             true,
    'credit_note_id',      v_credit_note_id,
    'credit_note_number',  v_credit_note_num,
    'is_full',             v_all_full,
    'subtotal',            -v_subtotal,
    'tax_amount',          -v_tax_amount,
    'irpf_amount',         -v_irpf_amount,
    'total',               -v_total,
    'journal_entry_id',    v_entry_id,
    'original_status',     CASE WHEN v_all_full THEN 'rectified' ELSE v_inv.status END
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.rpc_create_credit_note(UUID, JSONB, TEXT, UUID) TO service_role, authenticated;
