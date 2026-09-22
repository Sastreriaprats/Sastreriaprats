-- 289 · Reservas: departamento (boutique/sastrería) y estado de ENTREGA
--
-- Peticiones de Mónica (22-sep-2026):
--   a) «Dentro de la reserva tiene que haber una opción para poner si la reserva
--      es de boutique o de sastrería, pero si es de sastrería no quiero que
--      cuando se convierta en venta se vaya a sastrería, quiero que se vaya a
--      boutique.» → `department` es SOLO clasificación. El dinero de una reserva
--      entra siempre por boutique (el ticket de recogida es una venta de TPV y
--      las señales las imputa `reservation-payments.ts` a boutique). No hay nada
--      que cambiar en los informes: se documenta y se etiqueta.
--   b) «Poder poner si el producto se lo ha llevado el cliente aunque no lo haya
--      pagado, así al sacar el listado ver quién tiene la reserva con el producto
--      en su casa y sin pagar, o en tienda y sin pagar.» → la ENTREGA ya existe a
--      nivel de línea (status 'fulfilled' descuenta stock), pero no era filtrable
--      en el listado. Se materializa en la cabecera como `delivery_status`, que
--      cruzado con `payment_status` da los cuatro casos que pide.
--
-- Estado mostrado = cruce de las dos dimensiones (ver reservations-tab.tsx):
--   pendiente  + sin pagar → Activa
--   pendiente  + pagada    → Pagada · pendiente de recoger
--   entregada  + sin pagar → Entregada · pendiente de pago (producto en casa)
--   entregada  + pagada    → Cumplida

ALTER TABLE product_reservations
  ADD COLUMN IF NOT EXISTS department TEXT NOT NULL DEFAULT 'boutique',
  ADD COLUMN IF NOT EXISTS delivery_status TEXT NOT NULL DEFAULT 'pending';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'product_reservations_department_check') THEN
    ALTER TABLE product_reservations
      ADD CONSTRAINT product_reservations_department_check
      CHECK (department IN ('boutique', 'sastreria'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'product_reservations_delivery_status_check') THEN
    ALTER TABLE product_reservations
      ADD CONSTRAINT product_reservations_delivery_status_check
      CHECK (delivery_status IN ('pending', 'partial', 'delivered'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_product_reservations_delivery_status
  ON product_reservations(delivery_status);
CREATE INDEX IF NOT EXISTS idx_product_reservations_department
  ON product_reservations(department);

-- ── fn_recalc_reservation_header: se parte de la definición VIVA y solo se le
--    añade el cálculo de delivery_status. El resto queda intacto.
CREATE OR REPLACE FUNCTION public.fn_recalc_reservation_header()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
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
  v_live_lines    INTEGER;
  v_delivered     INTEGER;
  v_delivery      TEXT;
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
    BOOL_OR(status = 'fulfilled' AND fulfilled_sale_id IS NULL),
    COUNT(*) FILTER (WHERE status <> 'cancelled'),
    COUNT(*) FILTER (WHERE status = 'fulfilled')
  INTO v_total, v_qty, v_has_active, v_has_pending, v_all_fulfilled, v_all_cancelled,
       v_manual_fulfil, v_live_lines, v_delivered
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

  -- Entrega: una línea 'fulfilled' es género que YA salió del almacén, tanto si
  -- se cobró (venta) como si el cliente se lo llevó a cuenta (entrega manual).
  IF COALESCE(v_live_lines, 0) = 0 OR COALESCE(v_delivered, 0) = 0 THEN
    v_delivery := 'pending';
  ELSIF v_delivered >= v_live_lines THEN
    v_delivery := 'delivered';
  ELSE
    v_delivery := 'partial';
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
         delivery_status = v_delivery,
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
$function$;

-- Backfill del histórico (mismo criterio que el trigger).
UPDATE product_reservations r
   SET delivery_status = d.calc
  FROM (
    SELECT l.reservation_id,
           CASE
             WHEN COUNT(*) FILTER (WHERE l.status <> 'cancelled') = 0
               OR COUNT(*) FILTER (WHERE l.status = 'fulfilled') = 0 THEN 'pending'
             WHEN COUNT(*) FILTER (WHERE l.status = 'fulfilled')
                  >= COUNT(*) FILTER (WHERE l.status <> 'cancelled') THEN 'delivered'
             ELSE 'partial'
           END AS calc
      FROM product_reservation_lines l
     GROUP BY l.reservation_id
  ) d
 WHERE d.reservation_id = r.id
   AND r.delivery_status IS DISTINCT FROM d.calc;
