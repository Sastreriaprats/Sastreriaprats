-- ============================================================
-- Migration 164: plantilla de acuse de mensaje de contacto
-- ============================================================
-- Plantilla editable desde /admin/emails para el email que el cliente
-- recibe tras enviar el formulario de /contacto.
--
-- Si la plantilla NO existe en BD, sendContactAcknowledgment cae al
-- fallback hardcoded de src/lib/email/transactional.ts. Esta migración
-- sube la versión editable, con el MISMO contenido que el fallback —
-- así Mónica puede ajustar el texto (saludo, promesa de respuesta,
-- teléfono de urgencias…) sin tocar código.
--
-- Idempotente: ON CONFLICT (code) DO NOTHING. Si la plantilla ya
-- existe (porque alguien la creó manualmente), no se sobreescribe.
-- ============================================================

INSERT INTO email_templates (code, name, subject_es, body_html_es, is_active, editable_fields)
VALUES (
  'contact_acknowledgment',
  'Acuse de mensaje de contacto',
  'Hemos recibido tu mensaje — Sastrería Prats',
  $html$
      <tr><td align="center" style="padding:0 60px 32px;">
        <h2 style="margin:0 0 12px;font-size:18px;font-weight:bold;color:#1a2942;">Gracias por contactar con nosotros</h2>
        <p style="margin:0 0 12px;font-size:14px;color:#555555;">Estimado/a {{client_name}},</p>
        <p style="margin:0 0 8px;font-size:13px;line-height:1.6;color:#555555;">Hemos recibido tu mensaje correctamente. Nuestro equipo lo está revisando y se pondrá en contacto contigo lo antes posible, normalmente en menos de 24 horas hábiles.</p>
      </td></tr>
      {{details_block}}
      <tr><td align="center" style="padding:0 60px 32px;">
        <p style="margin:0 0 8px;font-size:12px;letter-spacing:1px;color:#888888;text-transform:uppercase;">Si tu solicitud es urgente</p>
        <p style="margin:0;font-size:16px;font-weight:bold;color:#1a2942;">+34 669 98 55 47</p>
      </td></tr>
  $html$,
  TRUE,
  '{}'::jsonb
)
ON CONFLICT (code) DO NOTHING;
