-- ============================================================
-- Migración 208 — FK estructural en los espejos de caja (manual_transactions)
--
-- Fase A del plano de autonomía "FK + reverso de dinero". Los espejos de cobro
-- en `manual_transactions` enlazan HOY con su entidad de origen por TEXTO del
-- número (description/notes), lo que descuadra al borrar/cancelar/renumerar.
-- Esta migración añade FK reales, replicando el patrón YA existente de
-- `withdrawal_id` (mig 180) y `ap_supplier_invoice_id`.
--
-- ADITIVO Y SEGURO:
--  - Columnas NULLABLE → ningún INSERT actual falla (todos omiten estas columnas).
--  - ON DELETE SET NULL (NO cascade): si la entidad se borra sin pasar por el
--    reverso, el espejo SOBREVIVE como huérfano visible (limpiable en Movimientos),
--    en vez de desaparecer en silencio y descuadrar la sesión.
--  - Índices parciales (solo filas con FK no-nula).
--  - Idempotente (IF NOT EXISTS).
--
-- NO cambia ningún reverso (rpc_remove_order_payment, rpc_delete_sale_completely,
-- rpc_cancel_reservation siguen leyendo por TEXTO). Eso es la Fase D, aparte.
-- ============================================================

ALTER TABLE manual_transactions
  ADD COLUMN IF NOT EXISTS sale_id UUID
    REFERENCES sales(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS sale_payment_id UUID
    REFERENCES sale_payments(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS tailoring_order_payment_id UUID
    REFERENCES tailoring_order_payments(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS product_reservation_payment_id UUID
    REFERENCES product_reservation_payments(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS manual_transactions_sale_id_idx
  ON manual_transactions(sale_id) WHERE sale_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS manual_transactions_sale_payment_id_idx
  ON manual_transactions(sale_payment_id) WHERE sale_payment_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS manual_transactions_tailoring_order_payment_id_idx
  ON manual_transactions(tailoring_order_payment_id) WHERE tailoring_order_payment_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS manual_transactions_product_reservation_payment_id_idx
  ON manual_transactions(product_reservation_payment_id) WHERE product_reservation_payment_id IS NOT NULL;

COMMENT ON COLUMN manual_transactions.sale_id IS
  'Espejo de cobro de venta TPV → FK a sales (mig 208, Fase A). Sustituye el acoplamiento por texto del ticket.';
COMMENT ON COLUMN manual_transactions.sale_payment_id IS
  'Espejo de cobro de venta a plazos → FK a sale_payments (mig 208, Fase A).';
COMMENT ON COLUMN manual_transactions.tailoring_order_payment_id IS
  'Espejo de cobro de pedido de sastrería → FK a tailoring_order_payments (mig 208, Fase A).';
COMMENT ON COLUMN manual_transactions.product_reservation_payment_id IS
  'Espejo de cobro de reserva de producto → FK a product_reservation_payments (mig 208, Fase A).';
