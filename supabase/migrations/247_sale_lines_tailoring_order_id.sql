-- Migration 247: discriminador por línea para cobros de pedido en el TPV
--
-- BUG (Mónica): cobrar un pedido de sastrería desde el TPV se atribuía a BOUTIQUE
-- y se duplicaba (la venta caía en boutique Y el cobro vivía además en
-- tailoring_order_payments / valor del pedido) → los informes sobre-estimaban
-- ~44.162€.
--
-- El canal hoy es `sales.sale_type` (cabecera), que no se reetiqueta al cobrar un
-- pedido desde el panel del TPV (queda 'boutique'). Como un ticket puede MEZCLAR
-- producto de boutique + cobro de pedido, el discriminador debe ser POR LÍNEA.
--
-- Esta migración SOLO añade la columna (Pieza 1). El RPC (Pieza 2), el cliente
-- (Pieza 3), los informes (Pieza 4) y el backfill de las 12 líneas históricas
-- (Pieza 5) van aparte. Mientras tanto la columna queda NULL en todas las líneas
-- (foto intacta: NULL = boutique real, que es como se contaba).
--
-- ON DELETE SET NULL: consistente con `sales.tailoring_order_id` y demás FKs a
-- tailoring_orders (invoices, alterations, appointments). Una línea de venta es un
-- registro de caja que existe por sí mismo; si se borrara el pedido, la venta NO
-- debe romperse — solo pierde la traza del enlace.

ALTER TABLE sale_lines
  ADD COLUMN IF NOT EXISTS tailoring_order_id UUID NULL
  REFERENCES tailoring_orders(id) ON DELETE SET NULL;

-- Índice parcial: la inmensa mayoría de líneas son NULL (boutique); solo nos
-- interesa indexar las pocas líneas de cobro (para localizarlas y para la FK).
CREATE INDEX IF NOT EXISTS idx_sale_lines_tailoring_order_id
  ON sale_lines (tailoring_order_id)
  WHERE tailoring_order_id IS NOT NULL;

COMMENT ON COLUMN sale_lines.tailoring_order_id IS
  'Si NO es NULL, esta línea es el cobro de un pedido de sastrería desde el TPV (no producto de boutique). Los informes la EXCLUYEN de boutique; la sastrería se cuenta SOLO desde tailoring_orders/tailoring_order_payments para no duplicar. Poblado por rpc_create_sale (mig 248) desde la línea de cobro del TPV.';
