-- ==========================================
-- 146: Plantillas de email para newsletter
-- ==========================================
-- UPSERT por code (UNIQUE en email_templates). Ejecutable múltiples veces
-- sin duplicar filas; actualiza body/variables si el code ya existe.
--
-- Motor de render: replace simple en src/lib/email/send.ts:renderTemplate
-- (sustituye {{var}} por value). NO procesa {{#if}} ni {{#each}}.
-- Por eso: el grid de productos y el bloque CTA se renderizan en el server
-- antes de pasarlos como variables {{products_grid_html}} y {{cta_html}}.
-- Si no se pasan, se sustituyen por cadena vacía y desaparecen del email.

-- ─────────────────────────────────────────────────────────────────────────
-- newsletter_default — plantilla flexible para campañas regulares
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
<body style="margin:0;padding:0;background:#f5f0e8;font-family:'Helvetica Neue',Arial,sans-serif;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f5f0e8;">
  <tr><td align="center" style="padding:24px 12px;">
    <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;background:#ffffff;">

      <!-- HEADER -->
      <tr><td align="center" style="padding:24px 0;">
        <p style="margin:0;font-size:9px;letter-spacing:3px;color:#888888;text-transform:uppercase;">Sastrería</p>
        <p style="margin:4px 0 0;font-size:22px;letter-spacing:4px;color:#1a2942;font-weight:600;">PRATS</p>
      </td></tr>

      <!-- HERO IMAGE -->
      <tr><td align="center" style="padding:0;">
        <img src="{{hero_image_url}}" alt="{{hero_image_alt}}" width="600" style="display:block;width:100%;max-width:600px;height:auto;border:0;outline:none;text-decoration:none;">
      </td></tr>

      <!-- TEXT BLOCK -->
      <tr><td align="center">
        <h2 style="margin:24px 16px 8px;font-size:18px;font-weight:600;color:#1a2942;">{{title}}</h2>
        <p style="margin:0 16px 16px;font-size:14px;color:#555555;">{{subtitle}}</p>
        <p style="margin:0 auto 24px;padding:0 16px;font-size:13px;line-height:1.6;color:#666666;max-width:480px;">{{description}}</p>
      </td></tr>

      <!-- PRODUCT GRID (renderizado server-side, vacío si no hay productos) -->
      {{products_grid_html}}

      <!-- CTA BUTTON (renderizado server-side, vacío si no hay CTA) -->
      {{cta_html}}

      <!-- FOOTER -->
      <tr><td style="padding:0 16px;">
        <hr style="border:none;border-top:1px solid #eeeeee;margin:32px 0 16px;">
      </td></tr>
      <tr><td align="center" style="padding:0 16px 24px;">
        <p style="margin:0;font-size:13px;font-weight:bold;color:#1a2942;">Sastrería Prats</p>
        <p style="margin:4px 0 0;font-size:12px;color:#888888;">
          <a href="https://www.google.com/maps/search/?api=1&amp;query=Sastreria+Prats+Hermanos+Pinzon+4+Madrid" style="color:#888888;text-decoration:underline;" target="_blank">Calle de los Hermanos Pinzón 4, 28036 Madrid, Madrid, España</a>
        </p>
        <p style="margin:16px 0 0;font-size:11px;color:#aaaaaa;">¿Ya no quieres recibir estos correos electrónicos? <a href="{{unsubscribe_url}}" style="color:#aaaaaa;text-decoration:underline;">Darse de baja</a></p>
        <p style="margin:8px 0 0;font-size:11px;color:#aaaaaa;">© 2026 Sastrería Prats</p>
      </td></tr>

    </table>
  </td></tr>
</table>
</body>
</html>$body$,
  NULL,
  ARRAY[
    'subject','hero_image_url','hero_image_alt','title','subtitle','description',
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
-- newsletter_optin — invitación inicial RGPD (sin grid, sin baja)
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
<body style="margin:0;padding:0;background:#f5f0e8;font-family:'Helvetica Neue',Arial,sans-serif;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f5f0e8;">
  <tr><td align="center" style="padding:24px 12px;">
    <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;background:#ffffff;">

      <!-- HEADER -->
      <tr><td align="center" style="padding:24px 0;">
        <p style="margin:0;font-size:9px;letter-spacing:3px;color:#888888;text-transform:uppercase;">Sastrería</p>
        <p style="margin:4px 0 0;font-size:22px;letter-spacing:4px;color:#1a2942;font-weight:600;">PRATS</p>
      </td></tr>

      <!-- HERO -->
      <tr><td align="center" style="padding:0;">
        <img src="{{hero_image_url}}" alt="Sastrería Prats" width="600" style="display:block;width:100%;max-width:600px;height:auto;border:0;outline:none;text-decoration:none;">
      </td></tr>

      <!-- TEXT -->
      <tr><td align="center">
        <h2 style="margin:24px 16px 8px;font-size:18px;font-weight:600;color:#1a2942;">Únete a la familia Prats</h2>
        <p style="margin:0 16px 16px;font-size:14px;color:#555555;">Confirma tu suscripción para recibir nuestras novedades</p>
        <p style="margin:0 auto 24px;padding:0 16px;font-size:13px;line-height:1.6;color:#666666;max-width:480px;">Hola {{first_name}}, queremos enviarte nuestras colecciones, lanzamientos y eventos directamente a tu bandeja de entrada. Si te interesa recibir nuestras comunicaciones, confirma haciendo clic en el botón.</p>
      </td></tr>

      <!-- CTA -->
      <tr><td align="center" style="padding:8px 16px 16px;">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center">
          <tr><td align="center" style="border:1px solid #1a2942;padding:14px 32px;">
            <a href="{{confirmation_url}}" target="_blank" style="font-size:11px;letter-spacing:2px;color:#1a2942;text-decoration:none;text-transform:uppercase;">SÍ, QUIERO SUSCRIBIRME</a>
          </td></tr>
        </table>
      </td></tr>

      <!-- FOOTER -->
      <tr><td style="padding:0 16px;">
        <hr style="border:none;border-top:1px solid #eeeeee;margin:32px 0 16px;">
      </td></tr>
      <tr><td align="center" style="padding:0 16px 16px;">
        <p style="margin:0;font-size:13px;font-weight:bold;color:#1a2942;">Sastrería Prats</p>
        <p style="margin:4px 0 0;font-size:12px;color:#888888;">
          <a href="https://www.google.com/maps/search/?api=1&amp;query=Sastreria+Prats+Hermanos+Pinzon+4+Madrid" style="color:#888888;text-decoration:underline;" target="_blank">Calle de los Hermanos Pinzón 4, 28036 Madrid, Madrid, España</a>
        </p>
        <p style="margin:8px 0 0;font-size:11px;color:#aaaaaa;">© 2026 Sastrería Prats</p>
        <p style="margin:16px 0 0;font-size:10px;color:#bbbbbb;font-style:italic;">Si no quieres recibir nada, simplemente ignora este email. No volveremos a escribirte.</p>
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
