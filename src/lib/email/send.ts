export function renderTemplate(html: string, vars: Record<string, string>): string {
  let result = html
  for (const [key, value] of Object.entries(vars)) {
    result = result.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), value || '')
  }
  return result
}

/** Mensaje amigable para errores de Resend (dominio no verificado, API key, etc.) */
function parseResendError(res: Response, body: unknown): string {
  const msg = typeof body === 'object' && body !== null && 'message' in body
    ? String((body as { message: unknown }).message)
    : ''
  const lower = msg.toLowerCase()
  if (
    lower.includes('domain') && (lower.includes('verif') || lower.includes('not allowed') || lower.includes('invalid')) ||
    lower.includes('sender') && lower.includes('domain') ||
    lower.includes('from address') && lower.includes('verif')
  ) {
    return 'El dominio del remitente no está verificado en Resend. Verifica el dominio en resend.com o envía solo a direcciones de prueba verificadas en tu cuenta.'
  }
  if (lower.includes('api key') || lower.includes('invalid api') || lower.includes('unauthorized') || res.status === 403) {
    return 'La API key de Resend no es válida o ha expirado. Comprueba RESEND_API_KEY en las variables de entorno.'
  }
  if (msg) return msg
  if (res.status === 422) return 'Los datos del email no son válidos (remitente, destinatario o contenido).'
  return `Error al enviar el email (${res.status}). Comprueba la configuración de Resend.`
}

export async function sendEmail({ to, subject, html }: { to: string; subject: string; html: string }) {
  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey || apiKey === 'PEGA_AQUÍ_TU_NUEVA_KEY') {
    throw new Error('RESEND_API_KEY no configurada. Añade tu API key en .env.local (consíguela en resend.com).')
  }

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: process.env.RESEND_FROM_EMAIL || 'Sastrería Prats <no-reply@sastreriaprats.com>',
      to,
      subject,
      html,
    }),
  })

  if (!res.ok) {
    let body: unknown
    try {
      body = await res.json()
    } catch {
      body = {}
    }
    const message = parseResendError(res, body)
    throw new Error(message)
  }
  const data = await res.json() as { id?: string }
  return data
}
