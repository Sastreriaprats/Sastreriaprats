-- 204_cash_withdrawal_type.sql
--
-- Clasificación de las retiradas de caja: 'gasto' (compra pagada con efectivo de
-- caja, p.ej. Mercadona -> SÍ es gasto) vs 'extraccion' (sacar/entregar dinero,
-- NO es gasto). El informe de gastos solo cuenta las de tipo 'gasto'.
--
-- Default 'extraccion' = conservador: por defecto NO cuenta como gasto hasta que
-- se clasifique (al hacer la retirada o por backfill). El espejo en
-- manual_transactions se sigue creando para TODA retirada (no afecta al arqueo,
-- que usa cash_sessions.total_withdrawals; sí mantiene el ledger de movimientos
-- de caja); el informe de gastos excluye las 'extraccion'.
--
-- Idempotente, sin bloques $$.

ALTER TABLE cash_withdrawals
  ADD COLUMN IF NOT EXISTS withdrawal_type text NOT NULL DEFAULT 'extraccion';
