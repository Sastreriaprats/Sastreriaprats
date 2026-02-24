-- Referencia de pago (Redsys u otro) para pedidos online
ALTER TABLE online_orders ADD COLUMN IF NOT EXISTS payment_reference text;
