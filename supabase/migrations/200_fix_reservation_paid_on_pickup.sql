-- 200_fix_reservation_paid_on_pickup.sql
--
-- FIX 2 (reservas): al recoger/vender una reserva en el TPV, el cobro se registra
-- en la venta (sales/sale_payments) pero la CABECERA product_reservations no
-- reflejaba el pago: total_paid seguía a 0 y payment_status='pending', por lo que
-- la ficha del cliente mostraba "0,00 € pagado · X € pdte" pese a estar cobrada.
--
-- Causa: el recalc de cabecera (fn_recalc_reservation_header) derivaba
-- payment_status del total_paid EXISTENTE, pero nada subía total_paid en el flujo
-- de recogida (solo el flujo de "pago a cuenta" lo tocaba).
--
-- Asunción de negocio confirmada: recogida = pago total (la UI cobra el prorrateo
-- pendiente al recoger). Por tanto, cuando la reserva queda 'fulfilled' fijamos
-- total_paid = total y payment_status='paid', y enlazamos fulfilled_sale_id.
--
-- Centralizado en el trigger de recálculo (cubre recogida por línea explícita y
-- por FIFO). NO toca rpc_create_sale. Incluye backfill de las reservas ya
-- recogidas que quedaron a 0.

-- ── 1) Recalc de cabecera: ahora sincroniza total_paid al quedar fulfilled ──────
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
BEGIN
  v_res_id := COALESCE(NEW.reservation_id, OLD.reservation_id);

  SELECT
    COALESCE(SUM(CASE WHEN status <> 'cancelled' THEN line_total ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN status <> 'cancelled' THEN quantity   ELSE 0 END), 0),
    BOOL_OR(status = 'active'),
    BOOL_OR(status = 'pending_stock'),
    BOOL_AND(status = 'fulfilled') FILTER (WHERE TRUE),
    BOOL_AND(status = 'cancelled') FILTER (WHERE TRUE)
  INTO v_total, v_qty, v_has_active, v_has_pending, v_all_fulfilled, v_all_cancelled
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

  -- Recogida = pago total: al quedar 'fulfilled' el cobro se hizo en la venta,
  -- así que la cabecera refleja total_paid = total (sin reducir pagos previos
  -- mayores). En el resto de estados, total_paid no se toca (flujo de pago a
  -- cuenta intacto).
  IF v_status = 'fulfilled' THEN
    v_new_paid := GREATEST(COALESCE(v_paid, 0), v_total);
    SELECT fulfilled_sale_id INTO v_sale_id
      FROM product_reservation_lines
     WHERE reservation_id = v_res_id AND fulfilled_sale_id IS NOT NULL
     LIMIT 1;
  ELSE
    v_new_paid := COALESCE(v_paid, 0);
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

-- El trigger trigger_reservation_lines_recalc ya existe (mig 111a) y sigue válido.

-- ── 2) Backfill: reservas ya recogidas (fulfilled) que quedaron a 0 ─────────────
-- Idempotente: en una segunda ejecución no hay fulfilled con total_paid < total.
DO $do$
DECLARE
  v_changed INTEGER := 0;
BEGIN
  WITH upd AS (
    UPDATE product_reservations r
       SET total_paid     = r.total,
           payment_status = 'paid',
           fulfilled_sale_id = COALESCE(r.fulfilled_sale_id, (
             SELECT l.fulfilled_sale_id
               FROM product_reservation_lines l
              WHERE l.reservation_id = r.id AND l.fulfilled_sale_id IS NOT NULL
              LIMIT 1
           )),
           fulfilled_at = COALESCE(r.fulfilled_at, NOW()),
           updated_at = NOW()
     WHERE r.status = 'fulfilled'
       AND r.total_paid < r.total
     RETURNING 1
  )
  SELECT count(*) INTO v_changed FROM upd;
  RAISE NOTICE 'Backfill mig 200: % reservas recogidas sincronizadas a pagado.', v_changed;
END $do$;
