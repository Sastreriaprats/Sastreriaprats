-- ==========================================
-- SASTRERÍA PRATS — Migración 004
-- Tabla de Citas / Agenda (appointments)
-- ==========================================

CREATE TABLE appointments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

  type TEXT NOT NULL CHECK (type IN ('fitting', 'delivery', 'consultation', 'boutique', 'meeting', 'other')),
  title TEXT NOT NULL,
  description TEXT,

  date DATE NOT NULL,
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  duration_minutes INTEGER NOT NULL DEFAULT 60,

  store_id UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  tailor_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  client_id UUID REFERENCES clients(id) ON DELETE SET NULL,
  order_id UUID REFERENCES tailoring_orders(id) ON DELETE SET NULL,

  status TEXT NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'confirmed', 'completed', 'cancelled', 'no_show')),

  cancellation_reason TEXT,
  cancelled_at TIMESTAMPTZ,
  cancelled_by UUID REFERENCES profiles(id) ON DELETE SET NULL,

  reminder_sent_24h BOOLEAN DEFAULT FALSE,
  reminder_sent_2h BOOLEAN DEFAULT FALSE,

  google_event_id TEXT,

  source TEXT DEFAULT 'admin' CHECK (source IN ('admin', 'online', 'phone')),
  notes TEXT,

  created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE INDEX idx_appointments_date ON appointments(date);
CREATE INDEX idx_appointments_store ON appointments(store_id);
CREATE INDEX idx_appointments_tailor ON appointments(tailor_id);
CREATE INDEX idx_appointments_client ON appointments(client_id);
CREATE INDEX idx_appointments_status ON appointments(status);
CREATE INDEX idx_appointments_type ON appointments(type);
CREATE INDEX idx_appointments_date_store ON appointments(date, store_id);
CREATE INDEX idx_appointments_date_tailor ON appointments(date, tailor_id);
CREATE INDEX idx_appointments_reminder_24h ON appointments(date, reminder_sent_24h) WHERE reminder_sent_24h = FALSE AND status = 'scheduled';
CREATE INDEX idx_appointments_reminder_2h ON appointments(date, reminder_sent_2h) WHERE reminder_sent_2h = FALSE AND status = 'scheduled';

CREATE TRIGGER trigger_appointments_updated_at
  BEFORE UPDATE ON appointments FOR EACH ROW EXECUTE PROCEDURE update_updated_at();

-- RLS
ALTER TABLE appointments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "appointments_select" ON appointments FOR SELECT USING (user_has_permission(auth.uid(), 'calendar.view'));
CREATE POLICY "appointments_insert" ON appointments FOR INSERT WITH CHECK (user_has_permission(auth.uid(), 'calendar.create'));
CREATE POLICY "appointments_update" ON appointments FOR UPDATE USING (user_has_permission(auth.uid(), 'calendar.update'));
CREATE POLICY "appointments_delete" ON appointments FOR DELETE USING (user_has_permission(auth.uid(), 'calendar.delete'));
