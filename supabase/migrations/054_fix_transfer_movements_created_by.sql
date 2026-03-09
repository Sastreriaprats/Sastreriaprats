-- ==========================================
-- 054: Corregir usuario en movimientos de traspasos
-- ==========================================
-- transfer_out -> quien creó el traspaso (requested_by)
-- transfer_in  -> quien lo aprobó (approved_by)

UPDATE stock_movements m
SET created_by = t.requested_by
FROM stock_transfers t
WHERE m.movement_type = 'transfer_out'
  AND t.approved_by IS NOT NULL
  AND m.reason = 'Traspaso ' || t.transfer_number;

UPDATE stock_movements m
SET created_by = t.approved_by
FROM stock_transfers t
WHERE m.movement_type = 'transfer_in'
  AND t.approved_by IS NOT NULL
  AND m.reason = 'Traspaso ' || t.transfer_number;
