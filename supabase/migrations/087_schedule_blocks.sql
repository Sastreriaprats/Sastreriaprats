-- ============================================================
-- Migration 087: Schedule Blocks (bloqueos de agenda)
--
-- Permite a administradores bloquear días completos o franjas
-- horarias para que no se puedan reservar citas.
-- Ejemplos: eventos, festivos, vacaciones, reuniones internas.
-- ============================================================

CREATE TABLE IF NOT EXISTS schedule_blocks (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  store_id    UUID REFERENCES stores(id) ON DELETE CASCADE,     -- NULL = todas las tiendas
  title       TEXT NOT NULL,
  reason      TEXT,                                              -- motivo del bloqueo
  block_date  DATE NOT NULL,                                     -- fecha del bloqueo
  all_day     BOOLEAN NOT NULL DEFAULT TRUE,                     -- TRUE = día completo
  start_time  TIME,                                              -- solo si all_day = FALSE
  end_time    TIME,                                              -- solo si all_day = FALSE
  is_active   BOOLEAN NOT NULL DEFAULT TRUE,
  created_by  UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_schedule_blocks_date ON schedule_blocks (block_date);
CREATE INDEX idx_schedule_blocks_store ON schedule_blocks (store_id);
CREATE INDEX idx_schedule_blocks_active ON schedule_blocks (is_active, block_date);

-- RLS
ALTER TABLE schedule_blocks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "schedule_blocks_select" ON schedule_blocks
  FOR SELECT USING (TRUE);

CREATE POLICY "schedule_blocks_insert" ON schedule_blocks
  FOR INSERT WITH CHECK (
    user_has_permission(auth.uid(), 'calendar.edit')
    OR user_has_permission(auth.uid(), 'calendar.update')
  );

CREATE POLICY "schedule_blocks_update" ON schedule_blocks
  FOR UPDATE USING (
    user_has_permission(auth.uid(), 'calendar.edit')
    OR user_has_permission(auth.uid(), 'calendar.update')
  );

CREATE POLICY "schedule_blocks_delete" ON schedule_blocks
  FOR DELETE USING (
    user_has_permission(auth.uid(), 'calendar.edit')
    OR user_has_permission(auth.uid(), 'calendar.delete')
  );
