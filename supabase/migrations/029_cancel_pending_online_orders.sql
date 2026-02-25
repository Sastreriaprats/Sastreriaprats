-- Marcar como cancelados los pedidos online que quedaron en "pending_payment"
-- (intentos de pago anteriores a no guardar hasta cobro correcto).
UPDATE online_orders
SET
  status = 'cancelled',
  cancelled_at = NOW(),
  cancellation_reason = 'Pago no completado (limpieza histórica)'
WHERE status = 'pending_payment';
