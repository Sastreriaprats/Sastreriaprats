-- ==========================================
-- 152: Campos editables sin código en plantillas transaccionales
-- ==========================================
-- Añade columna `editable_fields JSONB` a email_templates. Cada plantilla
-- transaccional declara aquí los textos que un usuario sin permiso técnico
-- (Isma, Maryana, Mónica) puede editar desde el dialog "Editar contenido".
--
-- Los `body_html_es` se reescriben para usar variables `{{headline}}`,
-- `{{intro_text}}`, etc. en lugar de literales fijos. Las variables
-- dinámicas existentes (`{{order_number}}`, `{{client_name}}`, etc.) se
-- pueden usar también DENTRO de los textos editables — el render del
-- helper sendFromTemplate hace dos pasadas para resolverlas.

ALTER TABLE email_templates
  ADD COLUMN IF NOT EXISTS editable_fields JSONB DEFAULT '{}'::jsonb;

COMMENT ON COLUMN email_templates.editable_fields IS
  'Diccionario de textos editables sin código. Cada clave es una variable usada en body_html_es. Permite a usuarios no técnicos cambiar el contenido visible del email.';

-- ─────────────────────────────────────────────────────────────────────────
-- order_confirmation
-- ─────────────────────────────────────────────────────────────────────────
UPDATE email_templates SET
  body_html_es = $body$<tr><td align="center" style="padding:0 60px 24px;">
  <h2 style="margin:0 0 12px;font-size:18px;font-weight:bold;color:#1a2942;">{{headline}}</h2>
  <p style="margin:0 0 12px;font-size:14px;color:#555555;">{{greeting}} {{client_name}},</p>
  <p style="margin:0 0 20px;font-size:13px;line-height:1.6;color:#555555;">{{intro_text}}</p>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f5f0e8;border-radius:6px;">
    <tr><td style="padding:16px 20px;">
      <p style="margin:0 0 8px;font-size:11px;letter-spacing:1.5px;color:#888888;text-transform:uppercase;">{{items_label}}</p>
      <ul style="margin:0;padding:0 0 0 18px;color:#333333;font-size:13px;line-height:1.6;list-style:disc;">{{items_html}}</ul>
      <p style="margin:16px 0 0;font-size:16px;font-weight:bold;color:#1a2942;text-align:right;">{{total_label}}: {{total}}</p>
    </td></tr>
  </table>
</td></tr>$body$,
  editable_fields = '{
    "headline": "¡Gracias por tu compra!",
    "greeting": "Hola",
    "intro_text": "Tu pedido {{order_number}} ha sido confirmado. Te avisaremos cuando esté listo para entregar.",
    "items_label": "Artículos",
    "total_label": "Total"
  }'::jsonb,
  updated_at = NOW()
WHERE code = 'order_confirmation';

-- ─────────────────────────────────────────────────────────────────────────
-- shipping_confirmation
-- ─────────────────────────────────────────────────────────────────────────
UPDATE email_templates SET
  body_html_es = $body$<tr><td align="center" style="padding:0 60px 24px;">
  <h2 style="margin:0 0 12px;font-size:18px;font-weight:bold;color:#1a2942;">{{headline}}</h2>
  <p style="margin:0 0 12px;font-size:14px;color:#555555;">{{greeting}} {{client_name}},</p>
  <p style="margin:0 0 20px;font-size:13px;line-height:1.6;color:#555555;">{{intro_text}}</p>
</td></tr>
{{tracking_block}}$body$,
  editable_fields = '{
    "headline": "¡Tu pedido está en camino!",
    "greeting": "Hola",
    "intro_text": "Tu pedido {{order_number}} ha sido enviado."
  }'::jsonb,
  updated_at = NOW()
WHERE code = 'shipping_confirmation';

-- ─────────────────────────────────────────────────────────────────────────
-- fitting_reminder
-- ─────────────────────────────────────────────────────────────────────────
UPDATE email_templates SET
  body_html_es = $body$<tr><td align="center" style="padding:0 60px 24px;">
  <h2 style="margin:0 0 12px;font-size:18px;font-weight:bold;color:#1a2942;">{{headline}}</h2>
  <p style="margin:0 0 12px;font-size:14px;color:#555555;">{{greeting}} {{client_name}},</p>
  <p style="margin:0 0 20px;font-size:13px;line-height:1.6;color:#555555;">{{intro_text}}</p>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f5f3ff;border:1px solid #c4b5fd;border-radius:6px;">
    <tr><td style="padding:16px 20px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
        <tr><td style="font-size:12px;color:#7c3aed;padding:6px 0;">{{date_label}}</td><td style="font-size:13px;font-weight:bold;color:#1a2942;text-align:right;">{{date}}</td></tr>
        <tr><td style="font-size:12px;color:#7c3aed;padding:6px 0;">{{time_label}}</td><td style="font-size:13px;font-weight:bold;color:#1a2942;text-align:right;">{{time}}</td></tr>
        <tr><td style="font-size:12px;color:#7c3aed;padding:6px 0;">{{store_label}}</td><td style="font-size:13px;font-weight:bold;color:#1a2942;text-align:right;">{{store_name}}</td></tr>
        {{order_row}}
      </table>
    </td></tr>
  </table>
  <p style="margin:20px 0 0;font-size:13px;color:#555555;">{{outro_text}}</p>
</td></tr>$body$,
  editable_fields = '{
    "headline": "Recordatorio de prueba",
    "greeting": "Estimado/a",
    "intro_text": "Le recordamos que tiene una prueba programada en nuestra tienda:",
    "date_label": "Fecha",
    "time_label": "Hora",
    "store_label": "Tienda",
    "outro_text": "Le esperamos."
  }'::jsonb,
  updated_at = NOW()
WHERE code = 'fitting_reminder';

-- ─────────────────────────────────────────────────────────────────────────
-- status_update
-- ─────────────────────────────────────────────────────────────────────────
UPDATE email_templates SET
  body_html_es = $body$<tr><td align="center" style="padding:0 60px 24px;">
  <h2 style="margin:0 0 12px;font-size:18px;font-weight:bold;color:#1a2942;">{{headline}}</h2>
  <p style="margin:0 0 16px;font-size:14px;color:#555555;">{{greeting}} {{client_name}},</p>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f5f0e8;border-radius:6px;margin:0 0 20px;">
    <tr><td align="center" style="padding:16px;">
      <p style="margin:0;font-size:11px;letter-spacing:1.5px;color:#888888;text-transform:uppercase;">{{order_label}}</p>
      <p style="margin:4px 0 0;font-size:18px;font-weight:bold;color:#1a2942;">{{order_number}}</p>
    </td></tr>
  </table>
  <p style="margin:0;font-size:13px;line-height:1.6;color:#333333;">{{message}}</p>
</td></tr>$body$,
  editable_fields = '{
    "headline": "Actualización de tu pedido",
    "greeting": "Hola",
    "order_label": "Pedido"
  }'::jsonb,
  updated_at = NOW()
WHERE code = 'status_update';

-- ─────────────────────────────────────────────────────────────────────────
-- welcome
-- ─────────────────────────────────────────────────────────────────────────
UPDATE email_templates SET
  body_html_es = $body$<tr><td align="center" style="padding:0 60px 24px;">
  <h2 style="margin:0 0 12px;font-size:18px;font-weight:bold;color:#1a2942;">{{headline}}</h2>
  <p style="margin:0 0 12px;font-size:14px;color:#555555;">{{intro_text}}</p>
  <p style="margin:0 0 12px;font-size:13px;line-height:1.6;color:#555555;">{{features_intro}}</p>
  <ul style="margin:0 0 20px;padding:0 0 0 24px;font-size:13px;line-height:1.7;color:#333333;text-align:left;">
    <li>{{feature_1}}</li>
    <li>{{feature_2}}</li>
    <li>{{feature_3}}</li>
    <li>{{feature_4}}</li>
  </ul>
</td></tr>
{{credentials_block}}
<tr><td align="center" style="padding:8px 16px 24px;">
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" style="margin:0 auto;">
    <tr><td align="center" style="border:1px solid #333333;padding:14px 32px;">
      <a href="{{boutique_url}}" target="_blank" rel="noopener" style="font-size:11px;letter-spacing:2px;color:#333333;text-decoration:none;text-transform:uppercase;">{{cta_text}}</a>
    </td></tr>
  </table>
</td></tr>$body$,
  editable_fields = '{
    "headline": "Bienvenido, {{client_name}}",
    "intro_text": "Gracias por crear tu cuenta en Sastrería Prats.",
    "features_intro": "Desde tu área personal podrás:",
    "feature_1": "Consultar tus pedidos y su estado",
    "feature_2": "Ver tus medidas corporales",
    "feature_3": "Gestionar tu lista de favoritos",
    "feature_4": "Reservar citas online",
    "cta_text": "DESCUBRIR COLECCIÓN"
  }'::jsonb,
  updated_at = NOW()
WHERE code = 'welcome';

-- ─────────────────────────────────────────────────────────────────────────
-- newsletter_welcome
-- ─────────────────────────────────────────────────────────────────────────
UPDATE email_templates SET
  body_html_es = $body$<tr><td align="center" style="padding:0 60px 24px;">
  <h2 style="margin:0 0 12px;font-size:18px;font-weight:bold;color:#1a2942;">{{headline}}</h2>
  <p style="margin:0 0 12px;font-size:14px;color:#555555;">{{intro_text}}</p>
  <p style="margin:0 0 12px;font-size:13px;line-height:1.6;color:#555555;">{{features_intro}}</p>
  <ul style="margin:0 0 20px;padding:0 0 0 24px;font-size:13px;line-height:1.7;color:#333333;text-align:left;">
    <li>{{feature_1}}</li>
    <li>{{feature_2}}</li>
    <li>{{feature_3}}</li>
    <li>{{feature_4}}</li>
  </ul>
</td></tr>
<tr><td align="center" style="padding:8px 16px 24px;">
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" style="margin:0 auto;">
    <tr><td align="center" style="border:1px solid #333333;padding:14px 32px;">
      <a href="{{boutique_url}}" target="_blank" rel="noopener" style="font-size:11px;letter-spacing:2px;color:#333333;text-decoration:none;text-transform:uppercase;">{{cta_text}}</a>
    </td></tr>
  </table>
</td></tr>$body$,
  editable_fields = '{
    "headline": "¡Bienvenido a la familia Prats!",
    "intro_text": "Gracias por suscribirte a nuestra newsletter.",
    "features_intro": "Serás el primero en conocer:",
    "feature_1": "Nuevas colecciones y lanzamientos exclusivos",
    "feature_2": "Consejos de estilo y cuidado de prendas",
    "feature_3": "Eventos especiales en nuestras boutiques",
    "feature_4": "Promociones reservadas para suscriptores",
    "cta_text": "DESCUBRIR COLECCIÓN"
  }'::jsonb,
  updated_at = NOW()
WHERE code = 'newsletter_welcome';

-- ─────────────────────────────────────────────────────────────────────────
-- password_reset
-- ─────────────────────────────────────────────────────────────────────────
UPDATE email_templates SET
  body_html_es = $body$<tr><td align="center" style="padding:0 60px 24px;">
  <h2 style="margin:0 0 12px;font-size:18px;font-weight:bold;color:#1a2942;">{{headline}}</h2>
  <p style="margin:0 0 20px;font-size:13px;line-height:1.6;color:#555555;">{{intro_text}}</p>
</td></tr>
<tr><td align="center" style="padding:8px 16px 24px;">
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" style="margin:0 auto;">
    <tr><td align="center" style="border:1px solid #333333;padding:14px 32px;">
      <a href="{{reset_url}}" target="_blank" rel="noopener" style="font-size:11px;letter-spacing:2px;color:#333333;text-decoration:none;text-transform:uppercase;">{{cta_text}}</a>
    </td></tr>
  </table>
</td></tr>
<tr><td align="center" style="padding:0 60px 24px;">
  <p style="margin:0;font-size:12px;color:#888888;">{{outro_text}}</p>
</td></tr>$body$,
  editable_fields = '{
    "headline": "Restablecer contraseña",
    "intro_text": "Hemos recibido una solicitud para restablecer tu contraseña. Pulsa el botón siguiente para crear una nueva.",
    "cta_text": "RESTABLECER CONTRASEÑA",
    "outro_text": "Si no solicitaste este cambio, ignora este email."
  }'::jsonb,
  updated_at = NOW()
WHERE code = 'password_reset';

-- ─────────────────────────────────────────────────────────────────────────
-- estimate_email
-- ─────────────────────────────────────────────────────────────────────────
UPDATE email_templates SET
  body_html_es = $body$<tr><td align="center" style="padding:0 60px 24px;">
  <h2 style="margin:0 0 12px;font-size:18px;font-weight:bold;color:#1a2942;">{{headline}}</h2>
  <p style="margin:0 0 12px;font-size:13px;color:#555555;">{{greeting}} {{client_name}},</p>
  <p style="margin:0 0 20px;font-size:13px;line-height:1.6;color:#555555;">{{intro_text}}</p>
</td></tr>
{{cta_html}}
<tr><td align="center" style="padding:0 60px 24px;">
  <p style="margin:0;font-size:13px;color:#555555;">{{outro_text}}</p>
</td></tr>$body$,
  editable_fields = '{
    "headline": "Presupuesto {{estimate_number}}",
    "greeting": "Estimado/a",
    "intro_text": "Le enviamos el presupuesto {{estimate_number}} por un importe de {{total}}, válido hasta {{valid_until}}.",
    "outro_text": "Si tiene alguna pregunta, no dude en contactarnos."
  }'::jsonb,
  updated_at = NOW()
WHERE code = 'estimate_email';
