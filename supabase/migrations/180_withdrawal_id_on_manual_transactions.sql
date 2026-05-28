-- ============================================================
-- Migración 180: vincular manual_transactions <-> cash_withdrawals.
--
-- Hoy una retirada de caja crea una manual_transactions espejo
-- (type='expense', category='caja', description='Retirada de caja: '||reason)
-- pero SIN FK. Eso impedía sincronizar el espejo de forma determinista al
-- editar/borrar la retirada, y el borrado en cascada de ventas dejaba el
-- espejo huérfano.
--
-- Se añade FK con ON DELETE CASCADE: al borrar la retirada, su espejo se borra
-- solo (esto también tapa el gap del borrado de venta). Backfill de las filas
-- existentes por el heurístico validado (11/11 vinculadas, 0 ambiguas).
--
-- Huérfanas: las manual_transactions expense/caja sin retirada (residuo de
-- borrados antiguos) quedan con withdrawal_id=NULL y se dejan en paz.
-- ============================================================

-- (a) Columna + índice
ALTER TABLE manual_transactions
  ADD COLUMN IF NOT EXISTS withdrawal_id uuid REFERENCES cash_withdrawals(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_manual_transactions_withdrawal
  ON manual_transactions(withdrawal_id);

-- (b) Backfill heurístico: 1 manual_transactions por retirada, match por
--     sesión + importe + description = 'Retirada de caja: ' || reason.
--     DISTINCT ON (cw.id) asigna a lo sumo un espejo por retirada.
WITH pares AS (
  SELECT DISTINCT ON (cw.id)
         mt.id AS mt_id, cw.id AS wd_id
  FROM cash_withdrawals cw
  JOIN manual_transactions mt
    ON  mt.cash_session_id = cw.cash_session_id
    AND mt.type        = 'expense'
    AND mt.category    = 'caja'
    AND mt.amount      = cw.amount
    AND mt.description = 'Retirada de caja: ' || cw.reason
    AND mt.withdrawal_id IS NULL
  ORDER BY cw.id, mt.created_at
)
UPDATE manual_transactions m
   SET withdrawal_id = p.wd_id
  FROM pares p
 WHERE m.id = p.mt_id;
