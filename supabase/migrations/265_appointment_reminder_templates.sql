-- ==========================================
-- 265: Plantillas del recordatorio de cita (24h y 2h)
-- ==========================================
-- El cron de recordatorios enviaba HTML plano sin logo ni footer (el email
-- "cutre" que reportó Isma). Ahora pasa por sendAppointmentReminder →
-- wrapInLayout (mismo diseño que el email del formulario de contacto) y su
-- contenido es editable desde el admin como el resto de transaccionales.
-- La variable {{greeting}} tiene default editable "Estimado/a" pero el
-- código la pisa con "Estimado Sr."/"Estimada Sra." si el cliente tiene
-- tratamiento (clients.salutation, mig 264).

INSERT INTO email_templates (code, name, category, subject_es, body_html_es, variables, is_active, editable_fields)
VALUES (
  'appointment_reminder',
  'Recordatorio de cita (24h)',
  'transactional',
  'Recordatorio: {{appointment_title}} mañana a las {{time}}',
  $body$<tr><td align="center" style="padding:0 60px 24px;">
  <h2 style="margin:0 0 12px;font-size:18px;font-weight:bold;color:#1a2942;">{{headline}}</h2>
  <p style="margin:0 0 12px;font-size:14px;color:#555555;">{{greeting}} {{client_name}},</p>
  <p style="margin:0 0 20px;font-size:13px;line-height:1.6;color:#555555;">{{intro_text}}</p>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f5f0e8;border-radius:6px;">
    <tr><td style="padding:16px 20px;">
      <p style="margin:0 0 8px;font-size:11px;letter-spacing:1.5px;color:#888888;text-transform:uppercase;">{{card_label}}</p>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
        <tr><td style="font-size:12px;color:#888888;padding:6px 0;">Motivo</td><td style="font-size:13px;font-weight:bold;color:#1a2942;text-align:right;">{{appointment_title}}</td></tr>
        <tr><td style="font-size:12px;color:#888888;padding:6px 0;">Fecha</td><td style="font-size:13px;font-weight:bold;color:#1a2942;text-align:right;">{{date}}</td></tr>
        <tr><td style="font-size:12px;color:#888888;padding:6px 0;">Hora</td><td style="font-size:13px;font-weight:bold;color:#1a2942;text-align:right;">{{time}}</td></tr>
        {{store_row}}
      </table>
    </td></tr>
  </table>
  <p style="margin:20px 0 0;font-size:13px;color:#555555;">{{closing_text}}</p>
</td></tr>
<tr><td align="center" style="padding:0 60px 24px;">
  <p style="margin:0 0 8px;font-size:12px;letter-spacing:1px;color:#888888;text-transform:uppercase;">{{phone_label}}</p>
  <p style="margin:0;font-size:16px;font-weight:bold;color:#1a2942;">+34 669 98 55 47</p>
</td></tr>$body$,
  ARRAY['appointment_title','client_name','date','time','store_name','store_row']::text[],
  TRUE,
  '{
    "headline": "Recordatorio de cita",
    "greeting": "Estimado/a",
    "intro_text": "Le recordamos que mañana tiene una cita programada en nuestra tienda:",
    "card_label": "Su cita",
    "closing_text": "Le esperamos.",
    "phone_label": "Para modificar o cancelar su cita"
  }'::jsonb
)
ON CONFLICT (code) DO UPDATE SET
  name = EXCLUDED.name, category = EXCLUDED.category, subject_es = EXCLUDED.subject_es,
  body_html_es = EXCLUDED.body_html_es, variables = EXCLUDED.variables,
  is_active = EXCLUDED.is_active, editable_fields = EXCLUDED.editable_fields, updated_at = NOW();

INSERT INTO email_templates (code, name, category, subject_es, body_html_es, variables, is_active, editable_fields)
VALUES (
  'appointment_reminder_2h',
  'Recordatorio de cita (2h antes)',
  'transactional',
  'Su cita es en 2 horas — {{time}}',
  $body$<tr><td align="center" style="padding:0 60px 24px;">
  <h2 style="margin:0 0 12px;font-size:18px;font-weight:bold;color:#1a2942;">{{headline}}</h2>
  <p style="margin:0 0 12px;font-size:14px;color:#555555;">{{greeting}} {{client_name}},</p>
  <p style="margin:0 0 20px;font-size:13px;line-height:1.6;color:#555555;">{{intro_text}}</p>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f5f0e8;border-radius:6px;">
    <tr><td style="padding:16px 20px;">
      <p style="margin:0 0 8px;font-size:11px;letter-spacing:1.5px;color:#888888;text-transform:uppercase;">{{card_label}}</p>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
        <tr><td style="font-size:12px;color:#888888;padding:6px 0;">Motivo</td><td style="font-size:13px;font-weight:bold;color:#1a2942;text-align:right;">{{appointment_title}}</td></tr>
        <tr><td style="font-size:12px;color:#888888;padding:6px 0;">Fecha</td><td style="font-size:13px;font-weight:bold;color:#1a2942;text-align:right;">{{date}}</td></tr>
        <tr><td style="font-size:12px;color:#888888;padding:6px 0;">Hora</td><td style="font-size:13px;font-weight:bold;color:#1a2942;text-align:right;">{{time}}</td></tr>
        {{store_row}}
      </table>
    </td></tr>
  </table>
  <p style="margin:20px 0 0;font-size:13px;color:#555555;">{{closing_text}}</p>
</td></tr>
<tr><td align="center" style="padding:0 60px 24px;">
  <p style="margin:0 0 8px;font-size:12px;letter-spacing:1px;color:#888888;text-transform:uppercase;">{{phone_label}}</p>
  <p style="margin:0;font-size:16px;font-weight:bold;color:#1a2942;">+34 669 98 55 47</p>
</td></tr>$body$,
  ARRAY['appointment_title','client_name','date','time','store_name','store_row']::text[],
  TRUE,
  '{
    "headline": "Su cita es hoy",
    "greeting": "Estimado/a",
    "intro_text": "Le recordamos que su cita es hoy a las {{time}}:",
    "card_label": "Su cita",
    "closing_text": "Le esperamos.",
    "phone_label": "Para modificar o cancelar su cita"
  }'::jsonb
)
ON CONFLICT (code) DO UPDATE SET
  name = EXCLUDED.name, category = EXCLUDED.category, subject_es = EXCLUDED.subject_es,
  body_html_es = EXCLUDED.body_html_es, variables = EXCLUDED.variables,
  is_active = EXCLUDED.is_active, editable_fields = EXCLUDED.editable_fields, updated_at = NOW();
