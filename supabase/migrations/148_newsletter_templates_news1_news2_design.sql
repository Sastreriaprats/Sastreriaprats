-- ==========================================
-- 148: Reescritura de plantillas newsletter al diseño NEWS_1 / NEWS_2
-- ==========================================
-- Sustituye el body_html_es de newsletter_default y newsletter_optin por
-- versiones pixel-fieles a los PDFs de referencia.
--
-- Logo: https://sastreriaprats.com/logo-prats.png (asset estable en /public).
-- Render server-side de products_grid_html y cta_html via newsletter-render.ts.

-- ─────────────────────────────────────────────────────────────────────────
-- newsletter_default — NEWS_1 (con grid + CTA opcional)
-- ─────────────────────────────────────────────────────────────────────────
INSERT INTO email_templates (
  code, name, category, subject_es, subject_en,
  body_html_es, body_html_en, variables, is_active
) VALUES (
  'newsletter_default',
  'Newsletter Sastrería Prats',
  'marketing',
  '{{subject}}',
  '{{subject}}',
  $body$<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>{{subject}}</title>
</head>
<body style="margin:0;padding:0;background:#ffffff;font-family:'Helvetica Neue',Arial,sans-serif;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#ffffff;">
<tr><td align="center" style="padding:0;">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;background:#ffffff;">

  <!-- HEADER: logo manuscrito Prats centrado -->
  <tr><td align="center" style="padding:40px 0 32px;">
    <img src="https://sastreriaprats.com/logo-prats.png" alt="Prats" height="80" style="display:block;height:80px;width:auto;max-width:260px;border:0;outline:none;text-decoration:none;">
  </td></tr>

  <!-- HERO IMAGE -->
  <tr><td style="padding:0;">
    <img src="{{hero_image_url}}" alt="{{hero_image_alt}}" width="600" style="display:block;width:100%;max-width:600px;height:auto;border:0;outline:none;text-decoration:none;">
  </td></tr>

  <!-- TEXT BLOCK -->
  <tr><td align="center" style="padding:32px 60px 8px;">
    <p style="margin:0 0 6px;font-size:13px;font-weight:bold;color:#333333;">{{title_kicker}}</p>
    <p style="margin:0 0 24px;font-size:13px;color:#555555;">{{subtitle}}</p>
    <p style="margin:0 0 12px;font-size:14px;font-weight:bold;color:#333333;">{{title}}</p>
    <p style="margin:0 0 32px;font-size:13px;line-height:1.6;color:#555555;">{{description}}</p>
  </td></tr>

  <!-- PRODUCT GRID (server-rendered; vacío si no hay productos) -->
  {{products_grid_html}}

  <!-- CTA BUTTON (server-rendered; vacío si no hay CTA) -->
  {{cta_html}}

  <!-- FOOTER -->
  <tr><td align="center" style="padding:40px 0 12px;">
    <img src="https://sastreriaprats.com/logo-prats.png" alt="Prats" height="40" style="display:block;height:40px;width:auto;max-width:160px;border:0;outline:none;text-decoration:none;">
  </td></tr>
  <tr><td align="center" style="padding:0 16px;">
    <p style="margin:6px 0 0;font-size:12px;font-weight:bold;color:#333333;">Sastrería Prats</p>
    <p style="margin:6px 0 0;font-size:11px;color:#888888;">
      <a href="https://www.google.com/maps/search/?api=1&amp;query=Sastreria+Prats+Hermanos+Pinzon+4+Madrid" style="color:#888888;text-decoration:underline;" target="_blank">Calle de los Hermanos Pinzón 4, 28036 Madrid, Madrid, España</a>
    </p>
    <p style="margin:6px 0 0;font-size:11px;color:#aaaaaa;">¿Ya no quieres recibir estos correos electrónicos? <a href="{{unsubscribe_url}}" style="color:#aaaaaa;text-decoration:underline;">Darse de baja</a></p>
    <p style="margin:6px 0 32px;font-size:11px;color:#aaaaaa;">© 2026 Sastrería Prats</p>
  </td></tr>

</table>
</td></tr>
</table>
</body>
</html>$body$,
  NULL,
  ARRAY[
    'subject','hero_image_url','hero_image_alt','title_kicker','title','subtitle','description',
    'products_grid_html','cta_html','cta_text','cta_url',
    'first_name','client_email','unsubscribe_url'
  ]::text[],
  TRUE
)
ON CONFLICT (code) DO UPDATE SET
  name         = EXCLUDED.name,
  category     = EXCLUDED.category,
  subject_es   = EXCLUDED.subject_es,
  subject_en   = EXCLUDED.subject_en,
  body_html_es = EXCLUDED.body_html_es,
  body_html_en = EXCLUDED.body_html_en,
  variables    = EXCLUDED.variables,
  is_active    = EXCLUDED.is_active,
  updated_at   = NOW();


-- ─────────────────────────────────────────────────────────────────────────
-- newsletter_optin — NEWS_2 style (sin grid, sin CTA opcional, baja N/A)
-- ─────────────────────────────────────────────────────────────────────────
INSERT INTO email_templates (
  code, name, category, subject_es, subject_en,
  body_html_es, body_html_en, variables, is_active
) VALUES (
  'newsletter_optin',
  'Invitación a newsletter (opt-in RGPD)',
  'marketing',
  'Confirma tu suscripción a la newsletter de Sastrería Prats',
  'Confirm your subscription to Sastrería Prats',
  $body$<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>Confirma tu suscripción</title>
</head>
<body style="margin:0;padding:0;background:#ffffff;font-family:'Helvetica Neue',Arial,sans-serif;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#ffffff;">
<tr><td align="center" style="padding:0;">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;background:#ffffff;">

  <!-- HEADER -->
  <tr><td align="center" style="padding:40px 0 32px;">
    <img src="https://sastreriaprats.com/logo-prats.png" alt="Prats" height="80" style="display:block;height:80px;width:auto;max-width:260px;border:0;outline:none;text-decoration:none;">
  </td></tr>

  <!-- HERO IMAGE -->
  <tr><td style="padding:0;">
    <img src="{{hero_image_url}}" alt="Sastrería Prats" width="600" style="display:block;width:100%;max-width:600px;height:auto;border:0;outline:none;text-decoration:none;">
  </td></tr>

  <!-- TEXT BLOCK -->
  <tr><td align="center" style="padding:32px 60px 8px;">
    <p style="margin:0 0 6px;font-size:13px;font-weight:bold;color:#333333;">Sastrería Prats</p>
    <p style="margin:0 0 24px;font-size:13px;color:#555555;">Confirma tu suscripción para recibir nuestras novedades</p>
    <p style="margin:0 0 12px;font-size:14px;font-weight:bold;color:#333333;">Únete a la familia Prats</p>
    <p style="margin:0 0 32px;font-size:13px;line-height:1.6;color:#555555;">Hola {{first_name}}, queremos enviarte nuestras colecciones, lanzamientos y eventos directamente a tu bandeja de entrada. Si te interesa recibir nuestras comunicaciones, confirma haciendo clic en el botón.</p>
  </td></tr>

  <!-- CTA fijo -->
  <tr><td align="center" style="padding:8px 16px 32px;">
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" style="margin:0 auto;">
      <tr><td align="center" style="border:1px solid #333333;padding:14px 32px;">
        <a href="{{confirmation_url}}" target="_blank" rel="noopener" style="font-size:11px;letter-spacing:2px;color:#333333;text-decoration:none;text-transform:uppercase;">SÍ, QUIERO SUSCRIBIRME</a>
      </td></tr>
    </table>
  </td></tr>

  <!-- FOOTER (sin baja) -->
  <tr><td align="center" style="padding:24px 0 12px;">
    <img src="https://sastreriaprats.com/logo-prats.png" alt="Prats" height="40" style="display:block;height:40px;width:auto;max-width:160px;border:0;outline:none;text-decoration:none;">
  </td></tr>
  <tr><td align="center" style="padding:0 16px;">
    <p style="margin:6px 0 0;font-size:12px;font-weight:bold;color:#333333;">Sastrería Prats</p>
    <p style="margin:6px 0 0;font-size:11px;color:#888888;">
      <a href="https://www.google.com/maps/search/?api=1&amp;query=Sastreria+Prats+Hermanos+Pinzon+4+Madrid" style="color:#888888;text-decoration:underline;" target="_blank">Calle de los Hermanos Pinzón 4, 28036 Madrid, Madrid, España</a>
    </p>
    <p style="margin:6px 0 0;font-size:11px;color:#aaaaaa;">© 2026 Sastrería Prats</p>
    <p style="margin:16px 0 32px;font-size:10px;color:#bbbbbb;font-style:italic;">Si no quieres recibir nada, simplemente ignora este email. No volveremos a escribirte.</p>
  </td></tr>

</table>
</td></tr>
</table>
</body>
</html>$body$,
  NULL,
  ARRAY['hero_image_url','first_name','confirmation_url','client_email']::text[],
  TRUE
)
ON CONFLICT (code) DO UPDATE SET
  name         = EXCLUDED.name,
  category     = EXCLUDED.category,
  subject_es   = EXCLUDED.subject_es,
  subject_en   = EXCLUDED.subject_en,
  body_html_es = EXCLUDED.body_html_es,
  body_html_en = EXCLUDED.body_html_en,
  variables    = EXCLUDED.variables,
  is_active    = EXCLUDED.is_active,
  updated_at   = NOW();
