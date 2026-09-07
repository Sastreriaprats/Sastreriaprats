-- 281_alert_on_payment_activado.sql
--
-- Segunda pieza del aviso de vencimiento de facturas de proveedor (ver mig 280).
--
-- Con las columnas ya creadas, el aviso SEGUÍA sin salir para ninguna factura:
-- el cron filtra por `alert_on_payment IS NULL OR alert_on_payment = TRUE`, pero
-- la columna nace con DEFAULT FALSE y no hay ni un sitio en la aplicación que la
-- ponga a TRUE (las dos actions que reciben ese campo desde la UI hacen
-- `void alert_on_payment` a propósito: gestionan pedidos a proveedor, no
-- facturas). Resultado: las 643 facturas tienen FALSE y ninguna avisaría jamás.
--
-- El interruptor está para SILENCIAR un caso concreto, no para tener el aviso
-- apagado de fábrica. Se invierte el valor por defecto y se activa en las
-- existentes, que es como ya funciona `supplier_due_dates.alert_sent` y como se
-- ha creado `supplier_orders.alert_on_delivery` en la 280.
--
-- Esto NO desata una avalancha: la 280 ya marcó como avisadas las pagadas y las
-- vencidas antes de hoy, así que solo avisarán las que vayan venciendo.
--
-- No toca ningún importe: es un interruptor de notificación.

ALTER TABLE ap_supplier_invoices
  ALTER COLUMN alert_on_payment SET DEFAULT TRUE;

UPDATE ap_supplier_invoices
   SET alert_on_payment = TRUE
 WHERE alert_on_payment IS DISTINCT FROM TRUE;

COMMENT ON COLUMN ap_supplier_invoices.alert_on_payment IS
  'Avisar del vencimiento de esta factura. Activo por defecto; se apaga para silenciar un caso concreto.';
