-- ==========================================
-- 153: Newsletter opt-in con cuerpo editable
-- ==========================================
-- Variabiliza los textos hardcodeados del HTML de newsletter_optin para
-- que se puedan editar desde el dialog "Editar contenido por defecto" sin
-- tocar código.
--
-- Reutiliza la columna `editable_fields JSONB` introducida en la mig 152
-- (mismo mecanismo de "textos editables sin código" que ya usan las
-- plantillas transaccionales). El helper composeNewsletterEmail aplica una
-- pre-pasada para resolver {{first_name}} dentro de optin_body antes del
-- render final.
--
-- Texto inicial: el redactado por Isma con el mensaje RGPD completo.

INSERT INTO email_templates (code, name, category, subject_es, body_html_es, variables, editable_fields, is_active)
VALUES (
  'newsletter_optin',
  'Invitación a newsletter (opt-in RGPD)',
  'marketing',
  'Confirma tu suscripción a la newsletter de Sastrería Prats',
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
    <img src="{{logo_url}}" alt="Prats" height="80" style="display:block;height:80px;width:auto;max-width:260px;border:0;outline:none;text-decoration:none;">
  </td></tr>

  <!-- HERO IMAGE -->
  <tr><td style="padding:0;">
    <img src="{{hero_image_url}}" alt="Sastrería Prats" width="600" style="display:block;width:100%;max-width:600px;height:auto;border:0;outline:none;text-decoration:none;">
  </td></tr>

  <!-- TEXT BLOCK -->
  <tr><td align="center" style="padding:32px 60px 8px;">
    <p style="margin:0 0 6px;font-size:13px;font-weight:bold;color:#333333;">{{optin_title_kicker}}</p>
    <p style="margin:0 0 24px;font-size:13px;color:#555555;">Confirma tu suscripción para recibir nuestras novedades</p>
    <p style="margin:0 0 12px;font-size:14px;font-weight:bold;color:#333333;">{{optin_title}}</p>
    <div style="margin:0 0 32px;font-size:13px;line-height:1.6;color:#555555;text-align:left;">{{optin_body_html}}</div>
  </td></tr>

  <!-- CTA fijo -->
  <tr><td align="center" style="padding:8px 16px 32px;">
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" style="margin:0 auto;">
      <tr><td align="center" style="border:1px solid #333333;padding:14px 32px;">
        <a href="{{confirmation_url}}" target="_blank" rel="noopener" style="font-size:11px;letter-spacing:2px;color:#333333;text-decoration:none;text-transform:uppercase;">{{optin_cta_text}}</a>
      </td></tr>
    </table>
  </td></tr>

  <!-- FOOTER (sin baja) -->
  <tr><td align="center" style="padding:24px 0 12px;">
    <img src="{{logo_url}}" alt="Prats" height="40" style="display:block;height:40px;width:auto;max-width:160px;border:0;outline:none;text-decoration:none;">
  </td></tr>
  <tr><td align="center" style="padding:0 16px;">
    <p style="margin:6px 0 0;font-size:12px;font-weight:bold;color:#333333;">Sastrería Prats</p>
    <p style="margin:6px 0 0;font-size:11px;color:#888888;">
      <a href="https://www.google.com/maps/search/?api=1&amp;query=Sastreria+Prats+Hermanos+Pinzon+4+Madrid" style="color:#888888;text-decoration:underline;" target="_blank">Calle de los Hermanos Pinzón 4, 28036 Madrid, Madrid, España</a>
    </p>
    <p style="margin:6px 0 0;font-size:11px;color:#aaaaaa;">© 2026 Sastrería Prats</p>
    <p style="margin:16px 0 32px;font-size:10px;color:#bbbbbb;font-style:italic;">{{optin_footer_note}}</p>
  </td></tr>

</table>
</td></tr>
</table>
</body>
</html>$body$,
  ARRAY[
    'logo_url','hero_image_url','first_name','confirmation_url','client_email',
    'optin_title_kicker','optin_title','optin_body','optin_body_html','optin_cta_text','optin_footer_note'
  ]::text[],
  jsonb_build_object(
    'optin_title_kicker', 'Sastrería Prats',
    'optin_title', 'Únete a la familia Prats',
    'optin_body', E'Hola {{first_name}},\n\nEn Sastrería Prats queremos seguir compartiendo contigo nuestras novedades, colecciones, promociones especiales, eventos y todo lo relacionado con nuestra forma de entender la sastrería.\n\nPara poder hacerlo y cumplir correctamente con la normativa de protección de datos, necesitamos tu consentimiento para enviarte comunicaciones comerciales e información general por email.\n\nSi quieres seguir formando parte de nuestra comunidad y recibir nuestras novedades, por favor confirma tu suscripción haciendo clic en el siguiente botón:',
    'optin_cta_text', 'SÍ, QUIERO SUSCRIBIRME',
    'optin_footer_note', 'Si no quieres recibir nada, simplemente ignora este email. No volveremos a escribirte.'
  ),
  TRUE
)
ON CONFLICT (code) DO UPDATE SET
  name         = EXCLUDED.name,
  category     = EXCLUDED.category,
  subject_es   = EXCLUDED.subject_es,
  body_html_es = EXCLUDED.body_html_es,
  variables    = EXCLUDED.variables,
  editable_fields = EXCLUDED.editable_fields,
  is_active    = EXCLUDED.is_active,
  updated_at   = NOW();
