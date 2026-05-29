-- ============================================================
-- Migración 189: permiso stock_movements.reverse.
--
-- Habilita revertir un ajuste manual de stock creando un movimiento de
-- contrapartida (no borra el original). Solo aplica a ajustes manuales
-- (adjustment_positive/negative); los movimientos automáticos se deshacen
-- desde su operación origen. Idempotente.
-- ============================================================

INSERT INTO permissions (code, module, action, display_name, description, category, is_sensitive)
VALUES (
  'stock_movements.reverse', 'stock', 'reverse', 'Revertir movimientos de stock',
  'Revertir un ajuste manual de stock creando un movimiento de contrapartida.',
  'Inventario', true
)
ON CONFLICT (code) DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r CROSS JOIN permissions p
WHERE r.name = 'administrador' AND p.code = 'stock_movements.reverse'
ON CONFLICT DO NOTHING;
