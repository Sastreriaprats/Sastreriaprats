-- 280_alertas_facturas_y_entregas.sql
--
-- Los avisos de "factura de proveedor a punto de vencer" y "entrega de pedido a
-- proveedor prevista" NUNCA han salido: los dos bloques del cron consultan
-- columnas que no existen.
--
--   ap_supplier_invoices  ->  .eq('payment_alert_sent', false)      NO EXISTE
--   supplier_orders       ->  .eq('delivery_alert_sent', false)     NO EXISTE
--                             .or('alert_on_delivery...')           NO EXISTE
--
-- PostgREST devuelve error 42703 y, como el cron solo leía `data` sin mirar
-- `error`, los dos bloques se saltaban en silencio. Es el drift de la
-- migración 043.
--
-- Se añaden las columnas siguiendo el patrón que YA funciona en
-- `supplier_due_dates` (alert_sent + alert_days_before): un flag de "ya
-- avisado" para no repetir, y un interruptor por fila para poder silenciar
-- avisos concretos.
--
-- BACKFILL, y el porqué: hoy hay 109 facturas no pagadas cuyo vencimiento YA
-- pasó. Si el cron arrancara con todas sin marcar, la primera ejecución soltaría
-- 126 notificaciones de golpe y el aviso nacería siendo ruido. Se marcan como
-- ya avisadas las que vencieron ANTES de hoy: esa deuda vieja ya se ve en
-- Contabilidad > Vencimientos, que es su sitio. Así el primer día solo avisan
-- las 17 que vencen dentro de los próximos 7 días, y a partir de ahí cada
-- factura avisa una vez, cuando entra en la ventana.
--
-- No toca ningún importe ni el estado de ninguna factura.

-- ── Facturas de proveedor ───────────────────────────────────────────────────
ALTER TABLE ap_supplier_invoices
  ADD COLUMN IF NOT EXISTS payment_alert_sent BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN ap_supplier_invoices.payment_alert_sent IS
  'Ya se ha notificado el vencimiento de esta factura. Evita repetir el aviso en cada pasada del cron.';

-- Las ya pagadas no deben avisar nunca, y el histórico vencido tampoco (ver
-- BACKFILL arriba).
UPDATE ap_supplier_invoices
   SET payment_alert_sent = TRUE
 WHERE payment_alert_sent = FALSE
   AND (status = 'pagada' OR due_date < CURRENT_DATE);

-- ── Pedidos a proveedor ─────────────────────────────────────────────────────
ALTER TABLE supplier_orders
  ADD COLUMN IF NOT EXISTS delivery_alert_sent BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE supplier_orders
  ADD COLUMN IF NOT EXISTS alert_on_delivery BOOLEAN NOT NULL DEFAULT TRUE;

COMMENT ON COLUMN supplier_orders.delivery_alert_sent IS
  'Ya se ha notificado la entrega prevista de este pedido. Evita repetir el aviso.';
COMMENT ON COLUMN supplier_orders.alert_on_delivery IS
  'Interruptor por pedido para silenciar el aviso de entrega prevista.';

-- Mismo criterio: lo ya recibido, cancelado o zanjado no avisa, y las entregas
-- cuya fecha prevista ya pasó tampoco (serían avisos nacidos caducados).
UPDATE supplier_orders
   SET delivery_alert_sent = TRUE
 WHERE delivery_alert_sent = FALSE
   AND (status IN ('received', 'cancelled', 'closed')
        OR estimated_delivery_date IS NULL
        OR estimated_delivery_date < CURRENT_DATE);
