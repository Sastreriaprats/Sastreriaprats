-- Alertas: control para no duplicar notificaciones y opción de activar/desactivar
ALTER TABLE supplier_orders ADD COLUMN IF NOT EXISTS alert_on_delivery BOOLEAN DEFAULT true;
ALTER TABLE supplier_orders ADD COLUMN IF NOT EXISTS delivery_alert_sent BOOLEAN DEFAULT false;

ALTER TABLE ap_supplier_invoices ADD COLUMN IF NOT EXISTS alert_on_payment BOOLEAN DEFAULT true;
ALTER TABLE ap_supplier_invoices ADD COLUMN IF NOT EXISTS payment_alert_sent BOOLEAN DEFAULT false;
