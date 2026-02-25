-- Permitir método de pago "demo" para pruebas sin cobro real
ALTER TABLE online_orders DROP CONSTRAINT IF EXISTS online_orders_payment_method_check;
ALTER TABLE online_orders ADD CONSTRAINT online_orders_payment_method_check
  CHECK (payment_method IN ('stripe', 'redsys', 'demo'));
