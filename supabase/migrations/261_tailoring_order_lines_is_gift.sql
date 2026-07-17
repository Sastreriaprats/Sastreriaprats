-- 261: Prendas REGALO en pedidos de sastrería.
--
-- Caso de uso: al crear un pedido se quiere regalar una prenda (o el pedido
-- entero) sin teclear precio. Hasta ahora la UI exigía PVP > 0 y un 0 € se
-- confundía con un error de tecleo (como los wipes de precios ya sufridos).
--
-- Flag a nivel de LÍNEA (no de pedido): permite pedidos mixtos
-- (traje cobrado + corbata regalo). "Pedido regalo" = todas sus líneas gift.
--
-- Un regalo a 0 € no genera deuda (total_pending es columna generada) ni
-- aparece en Cobros (filtra total_pending > 0), ni toca comisiones (motor
-- basado en sales del TPV). Solo suma +1 prenda en los conteos de informes,
-- a propósito: es producción real del taller.

ALTER TABLE tailoring_order_lines
  ADD COLUMN IF NOT EXISTS is_gift boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN tailoring_order_lines.is_gift IS
  'Prenda regalada: PVP 0 permitido; se muestra como "Regalo" en UI y ficha PDF';
