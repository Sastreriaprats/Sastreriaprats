-- 279_cupon_se_consume_al_pagar.sql
--
-- El cupón gastaba un uso al PULSAR "Pagar", no al pagar. Dos problemas:
--
--  1) Si el cliente se echaba atrás en la pasarela, o el pago fallaba, el uso
--     ya estaba gastado. Con un código de campaña limitado (max_uses), cada
--     abandono se comía un cupón que nadie llegó a disfrutar.
--  2) El incremento era un lee-y-escribe desde JavaScript
--     (`current_uses: leido + 1`), así que dos checkouts a la vez se pisaban y
--     el contador se quedaba corto.
--
-- El único punto con autoridad para dar un pago por bueno es el webhook de
-- Redsys, pero no podía consumir el cupón porque `pending_online_orders` no
-- guardaba cuál se había aplicado. Esta migración añade esa columna y una
-- función que incrementa el contador de forma atómica, dentro del propio SQL.
--
-- No cambia ningún importe ni ningún contador existente.

ALTER TABLE pending_online_orders
  ADD COLUMN IF NOT EXISTS discount_code_id UUID REFERENCES discount_codes(id) ON DELETE SET NULL;

COMMENT ON COLUMN pending_online_orders.discount_code_id IS
  'Cupón aplicado a esta intención de pago. Lo consume el webhook de Redsys cuando el pago se confirma, no el checkout.';

-- Incremento ATÓMICO del contador de usos. Hacerlo en SQL evita la carrera del
-- lee-y-escribe: dos pagos simultáneos suman dos, no uno.
CREATE OR REPLACE FUNCTION public.fn_consume_discount_code(p_code_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uses INTEGER;
BEGIN
  IF p_code_id IS NULL THEN
    RETURN NULL;
  END IF;

  UPDATE discount_codes
     SET current_uses = COALESCE(current_uses, 0) + 1,
         updated_at   = NOW()
   WHERE id = p_code_id
  RETURNING current_uses INTO v_uses;

  RETURN v_uses;
END;
$$;

-- Solo el servidor la usa (webhook con service_role). No se expone al navegador:
-- si anon pudiera llamarla, cualquiera podría agotar un cupón desde fuera.
REVOKE ALL ON FUNCTION public.fn_consume_discount_code(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fn_consume_discount_code(UUID) FROM anon;
REVOKE ALL ON FUNCTION public.fn_consume_discount_code(UUID) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.fn_consume_discount_code(UUID) TO service_role;
