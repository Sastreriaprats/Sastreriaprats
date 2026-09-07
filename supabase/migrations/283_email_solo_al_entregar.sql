-- ============================================================
-- 283 · El cliente de sastrería solo recibe email al ENTREGAR
-- ============================================================
-- Decisión de Sastrería Prats (7-sep-2026): las actualizaciones de estado
-- intermedias (tejido encargado, en confección, terminado…) NO se envían al
-- cliente. El único correo automático del flujo de sastrería es el de la
-- entrega, para agradecer la confianza y pedir una reseña.
--
-- El código ya solo llamaba al envío en 'delivered' (sendOrderDeliveredThanks,
-- antes sendTailoringStatusUpdate), pero el texto que salía era el genérico
-- "El estado de tu pedido ha sido actualizado".
--
-- 1) Nueva plantilla 'order_delivered', editable desde Configuración → Emails.
-- 2) 'status_update' se desactiva: ya no la usa nadie.
--
-- `review_url` es un campo EDITABLE cuyo valor por defecto es
-- {{store_review_url}} (la ficha de Google de la tienda del pedido, que envía
-- el código). Escribiendo una URL fija en ese campo se usa esa para todos.
-- ============================================================

INSERT INTO email_templates (code, name, category, subject_es, body_html_es, variables, editable_fields, is_active)
VALUES (
  'order_delivered',
  'Pedido entregado (gracias + reseña)',
  'transactional',
  'Gracias por confiar en Sastrería Prats',
  '<tr><td align="center" style="padding:0 60px 24px;">
  <h2 style="margin:0 0 12px;font-size:18px;font-weight:bold;color:#1a2942;">{{headline}}</h2>
  <p style="margin:0 0 16px;font-size:14px;color:#555555;">{{greeting}} {{client_name}},</p>
  <p style="margin:0 0 20px;font-size:13px;line-height:1.6;color:#333333;">{{intro_text}}</p>
  <p style="margin:0 0 20px;font-size:13px;line-height:1.6;color:#333333;">{{review_text}}</p>
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 auto 20px;">
    <tr><td align="center" style="background:#1a2942;border-radius:4px;">
      <a href="{{review_url}}" style="display:inline-block;padding:12px 28px;font-size:13px;font-weight:bold;color:#ffffff;text-decoration:none;letter-spacing:0.5px;">{{cta_text}}</a>
    </td></tr>
  </table>
  <p style="margin:0;font-size:13px;line-height:1.6;color:#555555;">{{closing_text}}</p>
</td></tr>',
  '["order_number","client_name","store_review_url"]'::jsonb,
  jsonb_build_object(
    'greeting',     'Hola',
    'headline',     'Gracias por tu confianza',
    'intro_text',   'Tu pedido {{order_number}} ya está entregado. Gracias por confiar en nosotros para vestirte: es un gusto tenerte como cliente.',
    'review_text',  'Si has quedado satisfecho, nos ayudarías mucho dejándonos una reseña. Nos lleva un minuto y nos sirve para seguir mejorando.',
    'cta_text',     'Dejar una reseña',
    'review_url',   '{{store_review_url}}',
    'closing_text', 'Cualquier ajuste o duda, estamos en la tienda para lo que necesites.'
  ),
  true
)
ON CONFLICT (code) DO UPDATE SET
  name            = EXCLUDED.name,
  subject_es      = EXCLUDED.subject_es,
  body_html_es    = EXCLUDED.body_html_es,
  variables       = EXCLUDED.variables,
  editable_fields = EXCLUDED.editable_fields,
  is_active       = true;

-- La de actualizaciones de estado deja de usarse (se conserva por historial).
UPDATE email_templates SET is_active = false WHERE code = 'status_update';
