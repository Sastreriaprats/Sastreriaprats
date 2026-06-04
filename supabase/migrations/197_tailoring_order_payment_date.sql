-- ============================================================
-- Migración 197: fecha de pago manual en pedidos de sastrería.
--
-- Petición: en /admin/pedidos (pestaña Sastrería) poder indicar/editar a mano
-- una "fecha de pago" por pedido y mostrarla como columna en el listado.
--
-- Decisiones:
--  - Columna nueva `payment_date DATE` (nullable). Los cobros reales de un
--    pedido de sastrería siguen registrándose por caja (tabla `sales`); esta
--    columna es un dato editable manualmente (p. ej. fecha prevista/acordada de
--    cobro), NO se deriva automáticamente de los pagos.
--  - Nullable, sin DEFAULT: un pedido sin fecha de pago muestra "—".
--
-- Idempotente: ADD COLUMN IF NOT EXISTS.
-- ============================================================

ALTER TABLE tailoring_orders
  ADD COLUMN IF NOT EXISTS payment_date DATE;

COMMENT ON COLUMN tailoring_orders.payment_date IS 'Fecha de pago del pedido, editable manualmente desde el detalle. No se deriva de los cobros por caja.';
