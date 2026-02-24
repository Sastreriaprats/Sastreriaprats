import { createAdminClient } from '@/lib/supabase/admin'

function wrapInLayout(content: string): string {
  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"></head>
<body style="margin:0;padding:0;background:#f5f0e8;font-family:Helvetica,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f0e8;padding:40px 20px;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;">
        <tr><td style="background:#1a2744;padding:30px;text-align:center;">
          <h1 style="color:#ffffff;font-size:24px;letter-spacing:6px;margin:0;">PRATS</h1>
          <p style="color:#c9a84c;font-size:10px;letter-spacing:4px;margin:4px 0 0;">MADRID</p>
        </td></tr>
        <tr><td style="padding:40px 30px;">${content}</td></tr>
        <tr><td style="background:#f9fafb;padding:20px 30px;text-align:center;">
          <p style="color:#9ca3af;font-size:11px;margin:0;">Sastrería Prats · Calle de Serrano 82, 28006 Madrid</p>
          <p style="color:#9ca3af;font-size:11px;margin:4px 0 0;">+34 91 435 6789 · info@sastreriaprats.com</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`
}

async function send(to: string, subject: string, html: string) {
  if (!process.env.RESEND_API_KEY) return
  const admin = createAdminClient()
  try {
    await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: process.env.RESEND_FROM_EMAIL || 'Sastrería Prats <no-reply@sastreriaprats.com>',
        to,
        subject,
        html: wrapInLayout(html),
      }),
    })
    await admin.from('email_logs').insert({
      recipient_email: to,
      subject,
      status: 'sent',
      email_type: 'transactional',
      sent_at: new Date().toISOString(),
    })
  } catch (e: unknown) {
    const errMsg = e instanceof Error ? e.message : 'Unknown error'
    await admin.from('email_logs').insert({
      recipient_email: to,
      subject,
      status: 'failed',
      email_type: 'transactional',
      error_message: errMsg,
    })
  }
}

export async function sendOrderConfirmation(order: {
  order_number: string; client_name: string; client_email: string; total: number; items: string[]
}) {
  const itemsHtml = order.items.map(i => `<li style="padding:4px 0;color:#374151;">${i}</li>`).join('')
  await send(order.client_email, `Pedido confirmado — ${order.order_number}`, `
    <h2 style="color:#1a2744;margin:0 0 16px;">¡Gracias por tu compra!</h2>
    <p style="color:#6b7280;">Hola ${order.client_name},</p>
    <p style="color:#6b7280;">Tu pedido <strong style="color:#1a2744;">${order.order_number}</strong> ha sido confirmado.</p>
    <div style="background:#f9fafb;border-radius:8px;padding:16px;margin:20px 0;">
      <p style="font-size:12px;color:#9ca3af;margin:0 0 8px;">Artículos:</p>
      <ul style="margin:0;padding-left:20px;">${itemsHtml}</ul>
      <p style="font-size:18px;font-weight:bold;color:#1a2744;margin:12px 0 0;text-align:right;">Total: €${order.total.toFixed(2)}</p>
    </div>
    <p style="color:#6b7280;">Te enviaremos un email cuando se prepare el envío.</p>
  `)
}

export async function sendShippingConfirmation(order: {
  order_number: string; client_name: string; client_email: string; tracking_number?: string; carrier?: string
}) {
  await send(order.client_email, `Tu pedido ${order.order_number} ha sido enviado`, `
    <h2 style="color:#1a2744;margin:0 0 16px;">¡Tu pedido está en camino!</h2>
    <p style="color:#6b7280;">Hola ${order.client_name},</p>
    <p style="color:#6b7280;">Tu pedido <strong>${order.order_number}</strong> ha sido enviado.</p>
    ${order.tracking_number ? `
      <div style="background:#f0f9ff;border:1px solid #bfdbfe;border-radius:8px;padding:16px;margin:20px 0;text-align:center;">
        <p style="font-size:12px;color:#3b82f6;margin:0;">Número de seguimiento</p>
        <p style="font-size:20px;font-weight:bold;color:#1a2744;margin:4px 0;font-family:monospace;">${order.tracking_number}</p>
        ${order.carrier ? `<p style="font-size:12px;color:#6b7280;margin:0;">${order.carrier}</p>` : ''}
      </div>` : ''}
  `)
}

export async function sendFittingReminder(fitting: {
  client_name: string; client_email: string; date: string; time: string; store_name: string; order_number?: string
}) {
  await send(fitting.client_email, `Recordatorio: prueba mañana a las ${fitting.time}`, `
    <h2 style="color:#1a2744;margin:0 0 16px;">Recordatorio de prueba</h2>
    <p style="color:#6b7280;">Estimado/a ${fitting.client_name},</p>
    <p style="color:#6b7280;">Le recordamos que tiene una prueba programada:</p>
    <div style="background:#f5f3ff;border:1px solid #c4b5fd;border-radius:8px;padding:16px;margin:20px 0;">
      <table style="width:100%;"><tbody>
        <tr><td style="color:#7c3aed;font-size:12px;padding:4px 0;">Fecha</td><td style="color:#1a2744;font-weight:bold;text-align:right;">${fitting.date}</td></tr>
        <tr><td style="color:#7c3aed;font-size:12px;padding:4px 0;">Hora</td><td style="color:#1a2744;font-weight:bold;text-align:right;">${fitting.time}</td></tr>
        <tr><td style="color:#7c3aed;font-size:12px;padding:4px 0;">Tienda</td><td style="color:#1a2744;font-weight:bold;text-align:right;">${fitting.store_name}</td></tr>
        ${fitting.order_number ? `<tr><td style="color:#7c3aed;font-size:12px;padding:4px 0;">Pedido</td><td style="color:#1a2744;font-weight:bold;text-align:right;">${fitting.order_number}</td></tr>` : ''}
      </tbody></table>
    </div>
    <p style="color:#6b7280;">Le esperamos.</p>
  `)
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

  await send(order.client_email, `Actualización pedido ${order.order_number}`, `
    <h2 style="color:#1a2744;margin:0 0 16px;">Actualización de tu pedido</h2>
    <p style="color:#6b7280;">Hola ${order.client_name},</p>
    <div style="background:#f9fafb;border-radius:8px;padding:16px;margin:20px 0;">
      <p style="font-size:12px;color:#9ca3af;margin:0;">Pedido</p>
      <p style="font-size:18px;font-weight:bold;color:#1a2744;margin:4px 0;">${order.order_number}</p>
    </div>
    <p style="color:#374151;">${msg}</p>
  `)
}

export async function sendWelcomeEmail(client: { name: string; email: string }) {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://sastreriaprats.com'
  await send(client.email, 'Bienvenido a Sastrería Prats', `
    <h2 style="color:#1a2744;margin:0 0 16px;">Bienvenido, ${client.name}</h2>
    <p style="color:#6b7280;">Gracias por crear tu cuenta en Sastrería Prats.</p>
    <p style="color:#6b7280;">Desde tu área personal podrás:</p>
    <ul style="color:#374151;">
      <li style="padding:4px 0;">Consultar tus pedidos y su estado</li>
      <li style="padding:4px 0;">Ver tus medidas corporales</li>
      <li style="padding:4px 0;">Gestionar tu lista de favoritos</li>
      <li style="padding:4px 0;">Reservar citas online</li>
    </ul>
    <div style="text-align:center;margin:30px 0;">
      <a href="${appUrl}/boutique" style="background:#1a2744;color:#ffffff;padding:12px 32px;border-radius:8px;text-decoration:none;font-size:14px;letter-spacing:1px;">DESCUBRIR COLECCIÓN</a>
    </div>
  `)
}

export async function sendPasswordReset(email: string, resetUrl: string) {
  await send(email, 'Restablecer contraseña — Sastrería Prats', `
    <h2 style="color:#1a2744;margin:0 0 16px;">Restablecer contraseña</h2>
    <p style="color:#6b7280;">Hemos recibido una solicitud para restablecer tu contraseña.</p>
    <div style="text-align:center;margin:30px 0;">
      <a href="${resetUrl}" style="background:#1a2744;color:#ffffff;padding:12px 32px;border-radius:8px;text-decoration:none;font-size:14px;">RESTABLECER CONTRASEÑA</a>
    </div>
    <p style="color:#9ca3af;font-size:12px;">Si no solicitaste este cambio, ignora este email.</p>
  `)
}
