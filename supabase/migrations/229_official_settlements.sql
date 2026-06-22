-- ============================================================
-- Migración 229: esquema de liquidación de comisiones de oficiales (R9b pieza 1).
--
-- Opción A (marcar líneas): cada línea pagada lleva settlement_id → trazabilidad
-- exacta, sin recuento. official_settlements guarda un SNAPSHOT INMUTABLE de cada
-- liquidación (importe/prendas/periodo pagados).
--
-- AUTOCONTENIDO: NO toca contabilidad ni caja. Motivo (deuda documentada):
-- tailoring_order_lines.labor_cost ya recoge a veces la tarifa del oficial
-- (p.ej. HAROLD Pantalón labor=145=su tarifa), así que postear la liquidación como
-- gasto en P&L DUPLICARÍA el coste de mano de obra. La integración contable es un
-- proyecto aparte que exige reconciliar labor_cost primero. Tampoco es un movimiento
-- de caja POS (es gasto de taller, como los pagos a proveedor).
--
-- Diseñado REVERSIBLE (settlement_id ON DELETE SET NULL + status) para un futuro
-- rpc_void_settlement (anular una liquidación errónea) — no se construye ahora.
--
-- Permisos: ver = reports.view (se muestra en la pestaña Comisiones); escribir =
-- accounting.edit (liquidar mueve dinero). La escritura real irá por RPC
-- (service-role, bypassa RLS); la RLS es defensa en profundidad.
-- ============================================================

CREATE TABLE official_settlements (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  official_id     uuid NOT NULL REFERENCES officials(id) ON DELETE RESTRICT,  -- no borrar oficial con liquidaciones
  period_start    date,
  period_end      date,
  garments_count  integer NOT NULL DEFAULT 0,
  total_amount    numeric(12,2) NOT NULL DEFAULT 0,   -- snapshot inmutable de lo pagado
  paid_at         date,
  payment_method  text,
  reference       text,
  notes           text,
  status          text NOT NULL DEFAULT 'paid',       -- futuro: 'void'
  created_by      uuid,
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_official_settlements_official ON official_settlements(official_id);
CREATE INDEX idx_official_settlements_status   ON official_settlements(status);

-- Marca por línea (Opción A). ON DELETE SET NULL → anular/borrar una liquidación
-- devuelve sus líneas a "no liquidadas" (soporta el reverso futuro).
ALTER TABLE tailoring_order_lines
  ADD COLUMN settlement_id uuid NULL REFERENCES official_settlements(id) ON DELETE SET NULL;
CREATE INDEX idx_tol_settlement ON tailoring_order_lines(settlement_id);

-- RLS (defensa en profundidad; patrón del proyecto: SELECT=ver, escritura=editar).
ALTER TABLE official_settlements ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS settlements_select ON official_settlements;
CREATE POLICY settlements_select ON official_settlements
  FOR SELECT USING (user_has_permission(auth.uid(), 'reports.view'));

DROP POLICY IF EXISTS settlements_insert ON official_settlements;
CREATE POLICY settlements_insert ON official_settlements
  FOR INSERT WITH CHECK (user_has_permission(auth.uid(), 'accounting.edit'));

DROP POLICY IF EXISTS settlements_update ON official_settlements;
CREATE POLICY settlements_update ON official_settlements
  FOR UPDATE USING (user_has_permission(auth.uid(), 'accounting.edit'))
  WITH CHECK (user_has_permission(auth.uid(), 'accounting.edit'));

DROP POLICY IF EXISTS settlements_delete ON official_settlements;
CREATE POLICY settlements_delete ON official_settlements
  FOR DELETE USING (user_has_permission(auth.uid(), 'accounting.edit'));
