-- ==========================================
-- 151: Reescritura de plantillas transaccionales
-- ==========================================
-- Sobrescribe las 6 plantillas transaccionales sembradas en la mig 008 y
-- añade 2 nuevas (newsletter_welcome, estimate_email). Cada body_html_es
-- contiene SOLO el cuerpo del email (entre header y footer); el layout
-- común (logo manuscrito + datos de contacto reales) lo añade en runtime
-- la función `wrapInLayout` en `src/lib/email/transactional.ts`.
--
-- Por qué este diseño:
--   - El header/footer queda blindado en código: nadie puede romper la
--     identidad visual editando una plantilla desde el admin.
--   - Las plantillas sólo contienen el contenido editable. Isma puede
--     ajustar textos y mensajes vía el editor sin código del admin.
--
-- Compatibilidad: si esta migración aún no se ha aplicado, el código
-- `sendFromTemplate` detecta que la plantilla en BD usa el HTML legacy
-- (sin variables type `{{client_name}}` etc.) y cae al fallback inline
-- definido en cada función. Por tanto el deploy puede ir antes que el SQL
-- sin romper ningún email.

-- ─────────────────────────────────────────────────────────────────────────
-- order_confirmation
-- ─────────────────────────────────────────────────────────────────────────
INSERT INTO email_templates (code, name, category, subject_es, body_html_es, variables, is_active)
VALUES (
  'order_confirmation',
  'Confirmación de pedido',
  'transactional',
  'Pedido confirmado — {{order_number}}',
  $body$<tr><td align="center" style="padding:0 60px 24px;">
  <h2 style="margin:0 0 12px;font-size:18px;font-weight:bold;color:#1a2942;">¡Gracias por tu compra!</h2>
  <p style="margin:0 0 12px;font-size:14px;color:#555555;">Hola {{client_name}},</p>
  <p style="margin:0 0 20px;font-size:13px;line-height:1.6;color:#555555;">Tu pedido <strong style="color:#1a2942;">{{order_number}}</strong> ha sido confirmado. Te avisaremos cuando esté listo para entregar.</p>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f5f0e8;border-radius:6px;">
    <tr><td style="padding:16px 20px;">
      <p style="margin:0 0 8px;font-size:11px;letter-spacing:1.5px;color:#888888;text-transform:uppercase;">Artículos</p>
      <ul style="margin:0;padding:0 0 0 18px;color:#333333;font-size:13px;line-height:1.6;list-style:disc;">{{items_html}}</ul>
      <p style="margin:16px 0 0;font-size:16px;font-weight:bold;color:#1a2942;text-align:right;">Total: {{total}}</p>
    </td></tr>
  </table>
</td></tr>$body$,
  ARRAY['order_number','client_name','total','items_html']::text[],
  TRUE
)
ON CONFLICT (code) DO UPDATE SET
  name = EXCLUDED.name, category = EXCLUDED.category, subject_es = EXCLUDED.subject_es,
  body_html_es = EXCLUDED.body_html_es, variables = EXCLUDED.variables, is_active = EXCLUDED.is_active, updated_at = NOW();


-- ─────────────────────────────────────────────────────────────────────────
-- shipping_confirmation
-- ─────────────────────────────────────────────────────────────────────────
INSERT INTO email_templates (code, name, category, subject_es, body_html_es, variables, is_active)
VALUES (
  'shipping_confirmation',
  'Confirmación de envío',
  'transactional',
  'Tu pedido {{order_number}} ha sido enviado',
  $body$<tr><td align="center" style="padding:0 60px 24px;">
  <h2 style="margin:0 0 12px;font-size:18px;font-weight:bold;color:#1a2942;">¡Tu pedido está en camino!</h2>
  <p style="margin:0 0 12px;font-size:14px;color:#555555;">Hola {{client_name}},</p>
  <p style="margin:0 0 20px;font-size:13px;line-height:1.6;color:#555555;">Tu pedido <strong style="color:#1a2942;">{{order_number}}</strong> ha sido enviado.</p>
</td></tr>
{{tracking_block}}$body$,
  ARRAY['order_number','client_name','tracking_block']::text[],
  TRUE
)
ON CONFLICT (code) DO UPDATE SET
  name = EXCLUDED.name, category = EXCLUDED.category, subject_es = EXCLUDED.subject_es,
  body_html_es = EXCLUDED.body_html_es, variables = EXCLUDED.variables, is_active = EXCLUDED.is_active, updated_at = NOW();


-- ─────────────────────────────────────────────────────────────────────────
-- fitting_reminder
-- ─────────────────────────────────────────────────────────────────────────
INSERT INTO email_templates (code, name, category, subject_es, body_html_es, variables, is_active)
VALUES (
  'fitting_reminder',
  'Recordatorio de prueba',
  'transactional',
  'Recordatorio: prueba mañana a las {{time}}',
  $body$<tr><td align="center" style="padding:0 60px 24px;">
  <h2 style="margin:0 0 12px;font-size:18px;font-weight:bold;color:#1a2942;">Recordatorio de prueba</h2>
  <p style="margin:0 0 12px;font-size:14px;color:#555555;">Estimado/a {{client_name}},</p>
  <p style="margin:0 0 20px;font-size:13px;line-height:1.6;color:#555555;">Le recordamos que tiene una prueba programada en nuestra tienda:</p>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f5f3ff;border:1px solid #c4b5fd;border-radius:6px;">
    <tr><td style="padding:16px 20px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
        <tr><td style="font-size:12px;color:#7c3aed;padding:6px 0;">Fecha</td><td style="font-size:13px;font-weight:bold;color:#1a2942;text-align:right;">{{date}}</td></tr>
        <tr><td style="font-size:12px;color:#7c3aed;padding:6px 0;">Hora</td><td style="font-size:13px;font-weight:bold;color:#1a2942;text-align:right;">{{time}}</td></tr>
        <tr><td style="font-size:12px;color:#7c3aed;padding:6px 0;">Tienda</td><td style="font-size:13px;font-weight:bold;color:#1a2942;text-align:right;">{{store_name}}</td></tr>
        {{order_row}}
      </table>
    </td></tr>
  </table>
  <p style="margin:20px 0 0;font-size:13px;color:#555555;">Le esperamos.</p>
</td></tr>$body$,
  ARRAY['client_name','date','time','store_name','order_row']::text[],
  TRUE
)
ON CONFLICT (code) DO UPDATE SET
  name = EXCLUDED.name, category = EXCLUDED.category, subject_es = EXCLUDED.subject_es,
  body_html_es = EXCLUDED.body_html_es, variables = EXCLUDED.variables, is_active = EXCLUDED.is_active, updated_at = NOW();


-- ─────────────────────────────────────────────────────────────────────────
-- status_update (actualización pedido sastrería)
-- ─────────────────────────────────────────────────────────────────────────
INSERT INTO email_templates (code, name, category, subject_es, body_html_es, variables, is_active)
VALUES (
  'status_update',
  'Actualización de pedido',
  'transactional',
  'Actualización pedido {{order_number}}',
  $body$<tr><td align="center" style="padding:0 60px 24px;">
  <h2 style="margin:0 0 12px;font-size:18px;font-weight:bold;color:#1a2942;">Actualización de tu pedido</h2>
  <p style="margin:0 0 16px;font-size:14px;color:#555555;">Hola {{client_name}},</p>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f5f0e8;border-radius:6px;margin:0 0 20px;">
    <tr><td align="center" style="padding:16px;">
      <p style="margin:0;font-size:11px;letter-spacing:1.5px;color:#888888;text-transform:uppercase;">Pedido</p>
      <p style="margin:4px 0 0;font-size:18px;font-weight:bold;color:#1a2942;">{{order_number}}</p>
    </td></tr>
  </table>
  <p style="margin:0;font-size:13px;line-height:1.6;color:#333333;">{{message}}</p>
</td></tr>$body$,
  ARRAY['order_number','client_name','message']::text[],
  TRUE
)
ON CONFLICT (code) DO UPDATE SET
  name = EXCLUDED.name, category = EXCLUDED.category, subject_es = EXCLUDED.subject_es,
  body_html_es = EXCLUDED.body_html_es, variables = EXCLUDED.variables, is_active = EXCLUDED.is_active, updated_at = NOW();


-- ─────────────────────────────────────────────────────────────────────────
-- welcome (alta de cuenta cliente)
-- ─────────────────────────────────────────────────────────────────────────
INSERT INTO email_templates (code, name, category, subject_es, body_html_es, variables, is_active)
VALUES (
  'welcome',
  'Bienvenida (cuenta cliente)',
  'transactional',
  'Bienvenido a Sastrería Prats',
  $body$<tr><td align="center" style="padding:0 60px 24px;">
  <h2 style="margin:0 0 12px;font-size:18px;font-weight:bold;color:#1a2942;">Bienvenido, {{client_name}}</h2>
  <p style="margin:0 0 12px;font-size:14px;color:#555555;">Gracias por crear tu cuenta en Sastrería Prats.</p>
  <p style="margin:0 0 12px;font-size:13px;line-height:1.6;color:#555555;">Desde tu área personal podrás:</p>
  <ul style="margin:0 0 20px;padding:0 0 0 24px;font-size:13px;line-height:1.7;color:#333333;text-align:left;">
    <li>Consultar tus pedidos y su estado</li>
    <li>Ver tus medidas corporales</li>
    <li>Gestionar tu lista de favoritos</li>
    <li>Reservar citas online</li>
  </ul>
</td></tr>
{{credentials_block}}
<tr><td align="center" style="padding:8px 16px 24px;">
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" style="margin:0 auto;">
    <tr><td align="center" style="border:1px solid #333333;padding:14px 32px;">
      <a href="{{boutique_url}}" target="_blank" rel="noopener" style="font-size:11px;letter-spacing:2px;color:#333333;text-decoration:none;text-transform:uppercase;">DESCUBRIR COLECCIÓN</a>
    </td></tr>
  </table>
</td></tr>$body$,
  ARRAY['client_name','login_url','boutique_url','credentials_block']::text[],
  TRUE
)
ON CONFLICT (code) DO UPDATE SET
  name = EXCLUDED.name, category = EXCLUDED.category, subject_es = EXCLUDED.subject_es,
  body_html_es = EXCLUDED.body_html_es, variables = EXCLUDED.variables, is_active = EXCLUDED.is_active, updated_at = NOW();


-- ─────────────────────────────────────────────────────────────────────────
-- password_reset
-- ─────────────────────────────────────────────────────────────────────────
INSERT INTO email_templates (code, name, category, subject_es, body_html_es, variables, is_active)
VALUES (
  'password_reset',
  'Restablecer contraseña',
  'transactional',
  'Restablecer contraseña — Sastrería Prats',
  $body$<tr><td align="center" style="padding:0 60px 24px;">
  <h2 style="margin:0 0 12px;font-size:18px;font-weight:bold;color:#1a2942;">Restablecer contraseña</h2>
  <p style="margin:0 0 20px;font-size:13px;line-height:1.6;color:#555555;">Hemos recibido una solicitud para restablecer tu contraseña. Pulsa el botón siguiente para crear una nueva.</p>
</td></tr>
<tr><td align="center" style="padding:8px 16px 24px;">
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" style="margin:0 auto;">
    <tr><td align="center" style="border:1px solid #333333;padding:14px 32px;">
      <a href="{{reset_url}}" target="_blank" rel="noopener" style="font-size:11px;letter-spacing:2px;color:#333333;text-decoration:none;text-transform:uppercase;">RESTABLECER CONTRASEÑA</a>
    </td></tr>
  </table>
</td></tr>
<tr><td align="center" style="padding:0 60px 24px;">
  <p style="margin:0;font-size:12px;color:#888888;">Si no solicitaste este cambio, ignora este email.</p>
</td></tr>$body$,
  ARRAY['reset_url']::text[],
  TRUE
)
ON CONFLICT (code) DO UPDATE SET
  name = EXCLUDED.name, category = EXCLUDED.category, subject_es = EXCLUDED.subject_es,
  body_html_es = EXCLUDED.body_html_es, variables = EXCLUDED.variables, is_active = EXCLUDED.is_active, updated_at = NOW();


-- ─────────────────────────────────────────────────────────────────────────
-- newsletter_welcome (NUEVA — bienvenida tras opt-in confirmado)
-- ─────────────────────────────────────────────────────────────────────────
INSERT INTO email_templates (code, name, category, subject_es, body_html_es, variables, is_active)
VALUES (
  'newsletter_welcome',
  'Bienvenida newsletter (post opt-in)',
  'transactional',
  '¡Bienvenido a la familia Prats!',
  $body$<tr><td align="center" style="padding:0 60px 24px;">
  <h2 style="margin:0 0 12px;font-size:18px;font-weight:bold;color:#1a2942;">¡Bienvenido a la familia Prats!</h2>
  <p style="margin:0 0 12px;font-size:14px;color:#555555;">Gracias por suscribirte a nuestra newsletter.</p>
  <p style="margin:0 0 12px;font-size:13px;line-height:1.6;color:#555555;">Serás el primero en conocer:</p>
  <ul style="margin:0 0 20px;padding:0 0 0 24px;font-size:13px;line-height:1.7;color:#333333;text-align:left;">
    <li>Nuevas colecciones y lanzamientos exclusivos</li>
    <li>Consejos de estilo y cuidado de prendas</li>
    <li>Eventos especiales en nuestras boutiques</li>
    <li>Promociones reservadas para suscriptores</li>
  </ul>
</td></tr>
<tr><td align="center" style="padding:8px 16px 24px;">
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" style="margin:0 auto;">
    <tr><td align="center" style="border:1px solid #333333;padding:14px 32px;">
      <a href="{{boutique_url}}" target="_blank" rel="noopener" style="font-size:11px;letter-spacing:2px;color:#333333;text-decoration:none;text-transform:uppercase;">DESCUBRIR COLECCIÓN</a>
    </td></tr>
  </table>
</td></tr>$body$,
  ARRAY['boutique_url']::text[],
  TRUE
)
ON CONFLICT (code) DO UPDATE SET
  name = EXCLUDED.name, category = EXCLUDED.category, subject_es = EXCLUDED.subject_es,
  body_html_es = EXCLUDED.body_html_es, variables = EXCLUDED.variables, is_active = EXCLUDED.is_active, updated_at = NOW();


-- ─────────────────────────────────────────────────────────────────────────
-- estimate_email (NUEVA — envío de presupuesto al cliente)
-- ─────────────────────────────────────────────────────────────────────────
INSERT INTO email_templates (code, name, category, subject_es, body_html_es, variables, is_active)
VALUES (
  'estimate_email',
  'Envío de presupuesto',
  'transactional',
  'Presupuesto {{estimate_number}} de {{company_name}}',
  $body$<tr><td align="center" style="padding:0 60px 24px;">
  <h2 style="margin:0 0 12px;font-size:18px;font-weight:bold;color:#1a2942;">Presupuesto {{estimate_number}}</h2>
  <p style="margin:0 0 12px;font-size:13px;color:#555555;">Estimado/a {{client_name}},</p>
  <p style="margin:0 0 20px;font-size:13px;line-height:1.6;color:#555555;">Le enviamos el presupuesto <strong style="color:#1a2942;">{{estimate_number}}</strong> por un importe de <strong>{{total}}</strong>, válido hasta <strong>{{valid_until}}</strong>.</p>
</td></tr>
{{cta_html}}
<tr><td align="center" style="padding:0 60px 24px;">
  <p style="margin:0;font-size:13px;color:#555555;">Si tiene alguna pregunta, no dude en contactarnos.</p>
</td></tr>$body$,
  ARRAY['estimate_number','client_name','total','valid_until','company_name','cta_html']::text[],
  TRUE
)
ON CONFLICT (code) DO UPDATE SET
  name = EXCLUDED.name, category = EXCLUDED.category, subject_es = EXCLUDED.subject_es,
  body_html_es = EXCLUDED.body_html_es, variables = EXCLUDED.variables, is_active = EXCLUDED.is_active, updated_at = NOW();
