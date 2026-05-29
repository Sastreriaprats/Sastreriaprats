-- ============================================================
-- Migración 190: rpc_reverse_stock_movement — revertir un ajuste manual.
--
-- Crea un movimiento de CONTRAPARTIDA (no borra el original) y reajusta
-- stock_levels, todo atómico (no hay trigger: stock_levels se actualiza a mano).
--
-- Solo ajustes manuales (adjustment_positive/negative). Cerrojos: no reversión
-- de reversiones, no doble reverso, y NO permitir stock negativo (estado
-- inválido -> se avisa, no se oculta).
--
-- p_user_id: las RPC se llaman con service role (auth.uid() sería NULL).
-- ============================================================

CREATE OR REPLACE FUNCTION public.rpc_reverse_stock_movement(
  p_movement_id uuid,
  p_user_id     uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_m        RECORD;
  v_level    RECORD;
  v_delta    integer;
  v_after    integer;
  v_opposite stock_movement_type;
  v_rev_id   uuid;
BEGIN
  SELECT * INTO v_m FROM stock_movements WHERE id = p_movement_id;
  IF v_m.id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Movimiento no encontrado.');
  END IF;

  -- 1) Solo ajustes manuales
  IF v_m.movement_type NOT IN ('adjustment_positive', 'adjustment_negative') THEN
    RETURN jsonb_build_object('success', false, 'error',
      'Solo se pueden revertir ajustes manuales. Para revertir un movimiento de venta/compra/traspaso/reserva/devolución, deshaz la operación origen desde su pantalla.');
  END IF;

  -- 2) No revertir una reversión
  IF v_m.reference_type = 'reversal' THEN
    RETURN jsonb_build_object('success', false, 'error', 'No se puede revertir una reversión.');
  END IF;

  -- 3) No doble reverso
  IF EXISTS (SELECT 1 FROM stock_movements WHERE reference_type = 'reversal' AND reference_id = p_movement_id) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Este movimiento ya fue revertido.');
  END IF;

  -- 4) Stock level actual de la variante+almacén
  SELECT * INTO v_level FROM stock_levels
   WHERE product_variant_id = v_m.product_variant_id AND warehouse_id = v_m.warehouse_id;
  IF v_level.id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'No existe nivel de stock para esta variante y almacén.');
  END IF;

  v_delta := -v_m.quantity;                 -- signo opuesto
  v_after := v_level.quantity + v_delta;

  -- 5) No permitir stock negativo
  IF v_after < 0 THEN
    RETURN jsonb_build_object('success', false, 'error',
      'El stock quedaría negativo (resultado: ' || v_after || '). Probablemente las unidades del ajuste original ya se movieron. Haz un ajuste manual con el motivo concreto.');
  END IF;

  v_opposite := CASE WHEN v_m.movement_type = 'adjustment_positive'
                     THEN 'adjustment_negative'::stock_movement_type
                     ELSE 'adjustment_positive'::stock_movement_type END;

  INSERT INTO stock_movements (
    product_variant_id, warehouse_id, movement_type, quantity,
    stock_before, stock_after, reference_type, reference_id,
    reason, notes, created_by, store_id
  ) VALUES (
    v_m.product_variant_id, v_m.warehouse_id, v_opposite, v_delta,
    v_level.quantity, v_after, 'reversal', p_movement_id,
    'Reverso del movimiento ' || COALESCE(v_m.reason, p_movement_id::text),
    'Reverso automático del movimiento ' || p_movement_id::text
      || ' (' || v_m.movement_type || ' ' || v_m.quantity || ' uds del ' || to_char(v_m.created_at, 'YYYY-MM-DD') || ')',
    p_user_id, v_m.store_id
  ) RETURNING id INTO v_rev_id;

  UPDATE stock_levels
     SET quantity = v_after, last_movement_at = now(), updated_at = now()
   WHERE id = v_level.id;

  RETURN jsonb_build_object(
    'success', true,
    'message', 'Movimiento revertido.',
    'reversal_movement_id', v_rev_id,
    'new_stock', v_after
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.rpc_reverse_stock_movement(uuid, uuid) TO service_role, authenticated;
