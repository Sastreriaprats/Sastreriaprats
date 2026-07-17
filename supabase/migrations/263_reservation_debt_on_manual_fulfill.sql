-- 263_reservation_debt_on_manual_fulfill.sql
--
-- CIERRA EL HUECO de deuda invisible en reservas entregadas sin venta.
--
-- La mig 200 asumió "recogida = pago total": al quedar la cabecera 'fulfilled'
-- el trigger forzaba total_paid = total y payment_status='paid'. Eso es
-- correcto cuando la recogida pasa por el TPV (el cobro/deuda vive en la
-- VENTA, visible en Cobros), pero "Marcar cumplida" desde admin cumple líneas
-- SIN venta (fulfilled_sale_id NULL) y el mismo trigger BORRABA la deuda en
-- silencio (patrón RSV-2026-0044 por otra puerta).
--
-- Cambio (partiendo de la definición de la mig 200, la última que la define):
-- solo se fuerza total_paid = total cuando TODAS las líneas cumplidas tienen
-- venta real detrás (fulfilled_sale_id). Si alguna se cumplió a mano, se
-- conserva el total_paid real → payment_status queda 'partial'/'pending' y la
-- deuda sigue visible y cobrable (la UI de reservas ya sabe cobrar en
-- fulfilled: rpc_add_reservation_payment sin restricción de estado).

CREATE OR REPLACE FUNCTION public.fn_recalc_reservation_header()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $fn$
DECLARE
  v_res_id        UUID;
  v_total         NUMERIC(12,2);
  v_qty           INTEGER;
  v_status        reservation_status;
  v_has_active    BOOLEAN;
  v_has_pending   BOOLEAN;
  v_all_fulfilled BOOLEAN;
  v_all_cancelled BOOLEAN;
  v_paid          NUMERIC(12,2);
  v_new_paid      NUMERIC(12,2);
  v_sale_id       UUID;
  v_manual_fulfil BOOLEAN;
BEGIN
  v_res_id := COALESCE(NEW.reservation_id, OLD.reservation_id);

  SELECT
    COALESCE(SUM(CASE WHEN status <> 'cancelled' THEN line_total ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN status <> 'cancelled' THEN quantity   ELSE 0 END), 0),
    BOOL_OR(status = 'active'),
    BOOL_OR(status = 'pending_stock'),
    BOOL_AND(status = 'fulfilled') FILTER (WHERE TRUE),
    BOOL_AND(status = 'cancelled') FILTER (WHERE TRUE),
    -- ¿Hay alguna línea cumplida SIN venta real? (marcada a mano desde admin)
    BOOL_OR(status = 'fulfilled' AND fulfilled_sale_id IS NULL)
  INTO v_total, v_qty, v_has_active, v_has_pending, v_all_fulfilled, v_all_cancelled, v_manual_fulfil
  FROM product_reservation_lines
  WHERE reservation_id = v_res_id;

  -- Derivar status agregado
  IF v_all_fulfilled THEN
    v_status := 'fulfilled';
  ELSIF v_all_cancelled THEN
    v_status := 'cancelled';
  ELSIF v_has_active THEN
    v_status := 'active';
  ELSIF v_has_pending THEN
    v_status := 'pending_stock';
  ELSE
    -- Mezcla de fulfilled + cancelled → considerar fulfilled
    v_status := 'fulfilled';
  END IF;

  SELECT total_paid INTO v_paid FROM product_reservations WHERE id = v_res_id;

  -- Recogida por VENTA = pago total (el cobro/deuda vive en la venta, mig 200).
  -- Recogida MANUAL (alguna línea fulfilled sin venta) = conservar el pago real:
  -- la deuda queda visible en la reserva en vez de borrarse en silencio.
  IF v_status = 'fulfilled' AND NOT COALESCE(v_manual_fulfil, false) THEN
    v_new_paid := GREATEST(COALESCE(v_paid, 0), v_total);
  ELSE
    v_new_paid := COALESCE(v_paid, 0);
  END IF;

  IF v_status = 'fulfilled' THEN
    SELECT fulfilled_sale_id INTO v_sale_id
      FROM product_reservation_lines
     WHERE reservation_id = v_res_id AND fulfilled_sale_id IS NOT NULL
     LIMIT 1;
  END IF;

  UPDATE product_reservations
     SET total          = v_total,
         quantity       = NULLIF(v_qty, 0),
         status         = v_status,
         total_paid     = v_new_paid,
         payment_status = CASE
           WHEN v_total <= 0      THEN 'pending'
           WHEN v_new_paid >= v_total THEN 'paid'
           WHEN v_new_paid > 0    THEN 'partial'
           ELSE 'pending'
         END,
         fulfilled_sale_id = CASE WHEN v_status = 'fulfilled' THEN COALESCE(fulfilled_sale_id, v_sale_id) ELSE fulfilled_sale_id END,
         fulfilled_at      = CASE WHEN v_status = 'fulfilled' THEN COALESCE(fulfilled_at, NOW()) ELSE fulfilled_at END,
         updated_at = NOW()
   WHERE id = v_res_id;

  RETURN NEW;
END;
$fn$;

-- El trigger trigger_reservation_lines_recalc (mig 111a) sigue válido.
-- SIN backfill: las fulfilled históricas ya quedaron en 'paid' por la 200 y no
-- es posible distinguir a posteriori cuáles se llevaron de verdad sin cobrar;
-- cualquier caso conocido (tipo RSV-2026-0044) se corrige por datos.
