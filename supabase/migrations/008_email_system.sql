-- ========================================
-- 008: Sistema de emails (plantillas, campañas, logs)
-- ========================================

-- 1. Plantillas de email editables
CREATE TABLE email_templates (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  code VARCHAR(60) UNIQUE NOT NULL,
  name TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'transactional' CHECK (category IN ('transactional', 'marketing', 'notification', 'system')),
  subject_es TEXT NOT NULL,
  subject_en TEXT,
  body_html_es TEXT NOT NULL DEFAULT '',
  body_html_en TEXT,
  variables TEXT[] DEFAULT '{}',
  is_active BOOLEAN DEFAULT TRUE NOT NULL,
  created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  updated_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE INDEX idx_email_templates_code ON email_templates(code);
CREATE INDEX idx_email_templates_category ON email_templates(category);

-- 2. Campañas de email marketing
CREATE TABLE email_campaigns (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  subject TEXT NOT NULL,
  body_html TEXT NOT NULL DEFAULT '',
  template_id UUID REFERENCES email_templates(id) ON DELETE SET NULL,
  segment TEXT NOT NULL DEFAULT 'all',
  segment_filters JSONB DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'sending', 'sent', 'failed', 'cancelled')),
  total_recipients INTEGER DEFAULT 0,
  sent_count INTEGER DEFAULT 0,
  opened_count INTEGER DEFAULT 0,
  clicked_count INTEGER DEFAULT 0,
  scheduled_at TIMESTAMPTZ,
  sent_at TIMESTAMPTZ,
  created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE INDEX idx_email_campaigns_status ON email_campaigns(status);
CREATE INDEX idx_email_campaigns_created ON email_campaigns(created_at DESC);

-- 3. Logs de emails enviados
CREATE TABLE email_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  campaign_id UUID REFERENCES email_campaigns(id) ON DELETE SET NULL,
  client_id UUID REFERENCES clients(id) ON DELETE SET NULL,
  recipient_email TEXT NOT NULL,
  subject TEXT,
  email_type TEXT DEFAULT 'campaign' CHECK (email_type IN ('campaign', 'transactional', 'notification')),
  status TEXT DEFAULT 'sent' CHECK (status IN ('sent', 'delivered', 'opened', 'clicked', 'bounced', 'failed')),
  error_message TEXT,
  resend_id TEXT,
  opened_at TIMESTAMPTZ,
  clicked_at TIMESTAMPTZ,
  sent_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE INDEX idx_email_logs_campaign ON email_logs(campaign_id);
CREATE INDEX idx_email_logs_client ON email_logs(client_id);
CREATE INDEX idx_email_logs_status ON email_logs(status);
CREATE INDEX idx_email_logs_sent ON email_logs(sent_at DESC);

-- 4. RLS
ALTER TABLE email_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "email_templates_select" ON email_templates FOR SELECT USING (user_has_permission(auth.uid(), 'emails.view'));
CREATE POLICY "email_templates_insert" ON email_templates FOR INSERT WITH CHECK (user_has_permission(auth.uid(), 'emails.manage_templates'));
CREATE POLICY "email_templates_update" ON email_templates FOR UPDATE USING (user_has_permission(auth.uid(), 'emails.manage_templates'));
CREATE POLICY "email_templates_delete" ON email_templates FOR DELETE USING (user_has_permission(auth.uid(), 'emails.manage_templates'));

CREATE POLICY "email_campaigns_select" ON email_campaigns FOR SELECT USING (user_has_permission(auth.uid(), 'emails.view'));
CREATE POLICY "email_campaigns_insert" ON email_campaigns FOR INSERT WITH CHECK (user_has_permission(auth.uid(), 'emails.send_campaign'));
CREATE POLICY "email_campaigns_update" ON email_campaigns FOR UPDATE USING (user_has_permission(auth.uid(), 'emails.send_campaign'));

CREATE POLICY "email_logs_select" ON email_logs FOR SELECT USING (user_has_permission(auth.uid(), 'emails.view'));
CREATE POLICY "email_logs_insert" ON email_logs FOR INSERT WITH CHECK (user_has_permission(auth.uid(), 'emails.send') OR user_has_permission(auth.uid(), 'emails.send_campaign'));

-- 5. Trigger updated_at
CREATE TRIGGER set_email_templates_updated_at BEFORE UPDATE ON email_templates FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER set_email_campaigns_updated_at BEFORE UPDATE ON email_campaigns FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- 6. Plantillas transaccionales base
INSERT INTO email_templates (code, name, category, subject_es, subject_en, body_html_es, variables, is_active) VALUES
  ('order_confirmation', 'Confirmación de pedido', 'transactional',
   'Pedido confirmado — {{order_number}}', 'Order confirmed — {{order_number}}',
   '<h2>¡Gracias por tu compra!</h2><p>Hola {{client_name}},</p><p>Tu pedido <strong>{{order_number}}</strong> ha sido confirmado.</p><p>Total: <strong>{{total}}</strong></p>',
   ARRAY['order_number', 'client_name', 'total', 'items'], TRUE),
  ('shipping_confirmation', 'Confirmación de envío', 'transactional',
   'Tu pedido {{order_number}} ha sido enviado', 'Your order {{order_number}} has shipped',
   '<h2>¡Tu pedido está en camino!</h2><p>Hola {{client_name}},</p><p>Nº seguimiento: <strong>{{tracking_number}}</strong></p>',
   ARRAY['order_number', 'client_name', 'tracking_number', 'carrier'], TRUE),
  ('fitting_reminder', 'Recordatorio de prueba', 'transactional',
   'Recordatorio: prueba mañana a las {{time}}', 'Reminder: fitting tomorrow at {{time}}',
   '<h2>Recordatorio de prueba</h2><p>Estimado/a {{client_name}},</p><p>Fecha: {{date}} a las {{time}}</p><p>Tienda: {{store_name}}</p>',
   ARRAY['client_name', 'date', 'time', 'store_name', 'order_number'], TRUE),
  ('welcome', 'Bienvenida', 'transactional',
   'Bienvenido a Sastrería Prats', 'Welcome to Sastrería Prats',
   '<h2>Bienvenido, {{client_name}}</h2><p>Gracias por crear tu cuenta en Sastrería Prats.</p>',
   ARRAY['client_name'], TRUE),
  ('password_reset', 'Restablecer contraseña', 'transactional',
   'Restablecer contraseña', 'Reset password',
   '<h2>Restablecer contraseña</h2><p><a href="{{reset_url}}" style="background:#1a2744;color:#ffffff;padding:12px 32px;border-radius:8px;text-decoration:none;">RESTABLECER</a></p>',
   ARRAY['reset_url'], TRUE),
  ('status_update', 'Actualización de pedido', 'transactional',
   'Actualización pedido {{order_number}}', 'Order update {{order_number}}',
   '<h2>Actualización de tu pedido</h2><p>Hola {{client_name}},</p><p>Pedido: <strong>{{order_number}}</strong></p><p>{{message}}</p>',
   ARRAY['order_number', 'client_name', 'message'], TRUE);
