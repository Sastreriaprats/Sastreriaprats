/**
 * Envío de emails transaccionales.
 *
 * Cada función pública (sendOrderConfirmation, sendWelcomeEmail, etc.) carga
 * su plantilla desde `email_templates` por `code`, interpola variables con
 * `renderTemplate`, envuelve el cuerpo con un layout común (logo + footer)
 * y envía vía Resend.
 *
 * Si la plantilla no existe en BD todavía (p.ej. migración 151 aún no
 * aplicada), se cae al HTML legacy hardcoded como fallback, así no se rompe
 * ningún envío durante el deploy.
 *
 * El layout común vive en este archivo (NO en BD) deliberadamente:
 * incluye logo, dirección y teléfono — datos fijos de la empresa.
 * Las plantillas en BD contienen SOLO el cuerpo entre header y footer.
 */
import { createAdminClient } from '@/lib/supabase/admin'
import { sendEmail, renderTemplate } from '@/lib/email/send'

/* ── Layout común ────────────────────────────────────────────────────────── */

const PUBLIC_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://sastreriaprats.com'
const LOGO_URL = `${PUBLIC_URL.replace(/\/+$/, '')}/logo-prats.png`
const COMPANY_ADDRESS = 'Calle de los Hermanos Pinzón 4, 28036 Madrid, Madrid, España'
const COMPANY_PHONE = '+34 669 98 55 47'
const COMPANY_EMAIL = 'info@sastreriaprats.com'
const MAPS_URL = 'https://www.google.com/maps/search/?api=1&amp;query=Sastreria+Prats+Hermanos+Pinzon+4+Madrid'

function wrapInLayout(bodyHtml: string): string {
  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1.0">
</head>
<body style="margin:0;padding:0;background:#ffffff;font-family:'Helvetica Neue',Arial,sans-serif;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#ffffff;">
<tr><td align="center" style="padding:0;">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;background:#ffffff;">

  <!-- HEADER -->
  <tr><td align="center" style="padding:40px 0 32px;">
    <img src="${LOGO_URL}" alt="Prats" height="80" style="display:block;height:80px;width:auto;max-width:260px;border:0;outline:none;text-decoration:none;">
  </td></tr>

  ${bodyHtml}

  <!-- FOOTER -->
  <tr><td align="center" style="padding:40px 0 12px;">
    <img src="${LOGO_URL}" alt="Prats" height="40" style="display:block;height:40px;width:auto;max-width:160px;border:0;outline:none;text-decoration:none;">
  </td></tr>
  <tr><td align="center" style="padding:0 16px 32px;">
    <p style="margin:6px 0 0;font-size:12px;font-weight:bold;color:#333333;">Sastrería Prats</p>
    <p style="margin:6px 0 0;font-size:11px;color:#888888;">
      <a href="${MAPS_URL}" style="color:#888888;text-decoration:underline;" target="_blank">${COMPANY_ADDRESS}</a>
    </p>
    <p style="margin:6px 0 0;font-size:11px;color:#888888;">${COMPANY_PHONE} · <a href="mailto:${COMPANY_EMAIL}" style="color:#888888;text-decoration:underline;">${COMPANY_EMAIL}</a></p>
    <p style="margin:6px 0 0;font-size:11px;color:#aaaaaa;">© 2026 Sastrería Prats</p>
  </td></tr>

</table>
</td></tr>
</table>
</body>
</html>`
}

/* ── Helper genérico ─────────────────────────────────────────────────────── */

type Vars = Record<string, string>

interface FallbackPayload {
  subject: string
  bodyHtml: string
}

/**
 * Carga la plantilla por code, interpola variables, envuelve con layout y
 * envía. Si la plantilla no existe en BD, usa el fallback proporcionado.
 *
 * El log en email_logs queda con email_type='transactional'.
 */
async function sendFromTemplate(
  code: string,
  to: string,
  vars: Vars,
  fallback: FallbackPayload,
): Promise<void> {
  if (!process.env.RESEND_API_KEY) throw new Error('RESEND_API_KEY no configurada')
  const admin = createAdminClient()

  // Cargar plantilla activa por code. Si no existe o no está activa, fallback.
  const { data: template } = await admin
    .from('email_templates')
    .select('subject_es, body_html_es, is_active')
    .eq('code', code)
    .maybeSingle()

  let subject: string
  let bodyHtml: string
  if (template && (template.is_active as boolean) && (template.body_html_es as string | null)) {
    subject = renderTemplate((template.subject_es as string) || fallback.subject, vars)
    bodyHtml = renderTemplate(template.body_html_es as string, vars)
  } else {
    subject = renderTemplate(fallback.subject, vars)
    bodyHtml = renderTemplate(fallback.bodyHtml, vars)
  }

  const html = wrapInLayout(bodyHtml)

  try {
    const result = await sendEmail({ to, subject, html })
    await admin.from('email_logs').insert({
      recipient_email: to,
      subject,
      status: 'sent',
      email_type: 'transactional',
      sent_at: new Date().toISOString(),
      resend_id: result?.id ?? null,
    })
  } catch (e: unknown) {
    const errMsg = e instanceof Error ? e.message : 'Unknown error'
    try {
      await admin.from('email_logs').insert({
        recipient_email: to,
        subject,
        status: 'failed',
        email_type: 'transactional',
        error_message: errMsg,
      })
    } catch { /* ignorar error de log */ }
    throw e
  }
}

/* ── Funciones públicas ──────────────────────────────────────────────────── */

export async function sendEstimateEmail(params: {
  to: string
  clientName: string
  estimateNumber: string
  total: number
  validUntil: string
  pdfUrl: string | null
  companyName: string
}) {
  const { to, clientName, estimateNumber, total, validUntil, pdfUrl, companyName } = params
  const totalStr = total.toFixed(2).replace('.', ',')
  const ctaBlock = pdfUrl
    ? `<tr><td align="center" style="padding:8px 16px 32px;">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" style="margin:0 auto;">
          <tr><td align="center" style="border:1px solid #333333;padding:14px 32px;">
            <a href="${pdfUrl}" target="_blank" rel="noopener" style="font-size:11px;letter-spacing:2px;color:#333333;text-decoration:none;text-transform:uppercase;">DESCARGAR PRESUPUESTO</a>
          </td></tr>
        </table>
      </td></tr>`
    : `<tr><td align="center" style="padding:8px 60px 24px;">
        <p style="margin:0;font-size:12px;color:#92400e;background:#fef3c7;border:1px solid #f59e0b;border-radius:6px;padding:12px;">El PDF del presupuesto se generará próximamente. Le contactaremos cuando esté disponible.</p>
      </td></tr>`
  await sendFromTemplate('estimate_email', to, {
    client_name: clientName,
    estimate_number: estimateNumber,
    total: `${totalStr} €`,
    valid_until: validUntil,
    company_name: companyName,
    cta_html: ctaBlock,
  }, {
    subject: `Presupuesto ${estimateNumber} de ${companyName}`,
    bodyHtml: `
      <tr><td align="center" style="padding:0 60px 32px;">
        <h2 style="margin:0 0 12px;font-size:18px;font-weight:bold;color:#1a2942;">Presupuesto {{estimate_number}}</h2>
        <p style="margin:0 0 12px;font-size:13px;color:#555555;">Estimado/a {{client_name}},</p>
        <p style="margin:0 0 20px;font-size:13px;line-height:1.6;color:#555555;">Le enviamos el presupuesto <strong style="color:#1a2942;">{{estimate_number}}</strong> por un importe de <strong>{{total}}</strong>, válido hasta <strong>{{valid_until}}</strong>.</p>
      </td></tr>
      {{cta_html}}
      <tr><td align="center" style="padding:0 60px 24px;">
        <p style="margin:0;font-size:13px;color:#555555;">Si tiene alguna pregunta, no dude en contactarnos.</p>
      </td></tr>
    `,
  })
}

export async function sendOrderConfirmation(order: {
  order_number: string; client_name: string; client_email: string; total: number; items: string[]
}) {
  const itemsHtml = order.items.map(i => `<li style="padding:2px 0;color:#333333;">${escapeHtml(i)}</li>`).join('')
  await sendFromTemplate('order_confirmation', order.client_email, {
    order_number: order.order_number,
    client_name: order.client_name,
    total: `${order.total.toFixed(2)} €`,
    items_html: itemsHtml,
  }, {
    subject: `Pedido confirmado — {{order_number}}`,
    bodyHtml: `
      <tr><td align="center" style="padding:0 60px 24px;">
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
      </td></tr>
    `,
  })
}

export async function sendShippingConfirmation(order: {
  order_number: string; client_name: string; client_email: string; tracking_number?: string; carrier?: string
}) {
  const trackingBlock = order.tracking_number
    ? `<tr><td align="center" style="padding:0 60px 24px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f0f9ff;border:1px solid #bfdbfe;border-radius:6px;">
          <tr><td align="center" style="padding:16px;">
            <p style="margin:0;font-size:11px;color:#3b82f6;letter-spacing:1px;text-transform:uppercase;">Número de seguimiento</p>
            <p style="margin:6px 0 0;font-size:18px;font-weight:bold;color:#1a2942;font-family:monospace;">${escapeHtml(order.tracking_number)}</p>
            ${order.carrier ? `<p style="margin:4px 0 0;font-size:12px;color:#6b7280;">${escapeHtml(order.carrier)}</p>` : ''}
          </td></tr>
        </table>
      </td></tr>`
    : ''
  await sendFromTemplate('shipping_confirmation', order.client_email, {
    order_number: order.order_number,
    client_name: order.client_name,
    tracking_block: trackingBlock,
  }, {
    subject: `Tu pedido {{order_number}} ha sido enviado`,
    bodyHtml: `
      <tr><td align="center" style="padding:0 60px 24px;">
        <h2 style="margin:0 0 12px;font-size:18px;font-weight:bold;color:#1a2942;">¡Tu pedido está en camino!</h2>
        <p style="margin:0 0 12px;font-size:14px;color:#555555;">Hola {{client_name}},</p>
        <p style="margin:0 0 20px;font-size:13px;line-height:1.6;color:#555555;">Tu pedido <strong style="color:#1a2942;">{{order_number}}</strong> ha sido enviado.</p>
      </td></tr>
      {{tracking_block}}
    `,
  })
}

export async function sendFittingReminder(fitting: {
  client_name: string; client_email: string; date: string; time: string; store_name: string; order_number?: string
}) {
  const orderRow = fitting.order_number
    ? `<tr><td style="font-size:12px;color:#7c3aed;padding:6px 0;">Pedido</td><td style="font-size:13px;font-weight:bold;color:#1a2942;text-align:right;">${escapeHtml(fitting.order_number)}</td></tr>`
    : ''
  await sendFromTemplate('fitting_reminder', fitting.client_email, {
    client_name: fitting.client_name,
    date: fitting.date,
    time: fitting.time,
    store_name: fitting.store_name,
    order_row: orderRow,
  }, {
    subject: `Recordatorio: prueba mañana a las {{time}}`,
    bodyHtml: `
      <tr><td align="center" style="padding:0 60px 24px;">
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
      </td></tr>
    `,
  })
}

export async function sendTailoringStatusUpdate(order: {
  client_name: string; client_email: string; order_number: string; new_status: string; message?: string
}) {
  const statusMessages: Record<string, string> = {
    fabric_ordered: 'El tejido de tu pedido ha sido encargado al proveedor.',
    fabric_received: 'El tejido ha llegado. Pronto empezaremos a confeccionar.',
    in_production: 'Tu pedido está en producción. Nuestros sastres están trabajando en él.',
    fitting: 'Tu pedido está listo para la primera prueba. Te contactaremos para programar la cita.',
    adjustments: 'Estamos realizando los ajustes finales después de la prueba.',
    finished: '¡Tu pedido está terminado! Contacta con nosotros para recogerlo.',
  }
  const msg = order.message || statusMessages[order.new_status] || 'El estado de tu pedido ha sido actualizado.'

  await sendFromTemplate('status_update', order.client_email, {
    client_name: order.client_name,
    order_number: order.order_number,
    message: escapeHtml(msg),
  }, {
    subject: `Actualización pedido {{order_number}}`,
    bodyHtml: `
      <tr><td align="center" style="padding:0 60px 24px;">
        <h2 style="margin:0 0 12px;font-size:18px;font-weight:bold;color:#1a2942;">Actualización de tu pedido</h2>
        <p style="margin:0 0 16px;font-size:14px;color:#555555;">Hola {{client_name}},</p>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f5f0e8;border-radius:6px;margin:0 0 20px;">
          <tr><td align="center" style="padding:16px;">
            <p style="margin:0;font-size:11px;letter-spacing:1.5px;color:#888888;text-transform:uppercase;">Pedido</p>
            <p style="margin:4px 0 0;font-size:18px;font-weight:bold;color:#1a2942;">{{order_number}}</p>
          </td></tr>
        </table>
        <p style="margin:0;font-size:13px;line-height:1.6;color:#333333;">{{message}}</p>
      </td></tr>
    `,
  })
}

export async function sendWelcomeEmail(client: { name: string; email: string; password?: string }) {
  const loginUrl = `${PUBLIC_URL}/auth/login`
  const credentialsBlock = client.password
    ? `<tr><td align="center" style="padding:0 60px 24px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f0f9ff;border:1px solid #bfdbfe;border-radius:6px;">
          <tr><td style="padding:16px 20px;">
            <p style="margin:0 0 10px;font-size:13px;font-weight:bold;color:#1a2942;">Tus datos de acceso</p>
            <p style="margin:4px 0;font-size:13px;color:#333333;"><strong>Email:</strong> ${escapeHtml(client.email)}</p>
            <p style="margin:4px 0;font-size:13px;color:#333333;"><strong>Contraseña temporal:</strong> ${escapeHtml(client.password)}</p>
            <p style="margin:10px 0 0;font-size:12px;color:#6b7280;">Te recomendamos cambiar tu contraseña en tu primer acceso.</p>
          </td></tr>
        </table>
      </td></tr>`
    : ''
  await sendFromTemplate('welcome', client.email, {
    client_name: client.name,
    login_url: loginUrl,
    boutique_url: `${PUBLIC_URL}/boutique`,
    credentials_block: credentialsBlock,
  }, {
    subject: 'Bienvenido a Sastrería Prats',
    bodyHtml: `
      <tr><td align="center" style="padding:0 60px 24px;">
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
      </td></tr>
    `,
  })
}

export async function sendNewsletterWelcome(subscriber: { email: string }) {
  await sendFromTemplate('newsletter_welcome', subscriber.email, {
    boutique_url: `${PUBLIC_URL}/boutique`,
  }, {
    subject: '¡Bienvenido a la familia Prats!',
    bodyHtml: `
      <tr><td align="center" style="padding:0 60px 24px;">
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
      </td></tr>
    `,
  })
}

export async function sendPasswordReset(email: string, resetUrl: string) {
  await sendFromTemplate('password_reset', email, {
    reset_url: resetUrl,
  }, {
    subject: 'Restablecer contraseña — Sastrería Prats',
    bodyHtml: `
      <tr><td align="center" style="padding:0 60px 24px;">
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
      </td></tr>
    `,
  })
}

/* ── Helpers internos ────────────────────────────────────────────────────── */

function escapeHtml(s: string): string {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}
