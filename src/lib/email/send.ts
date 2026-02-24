export function renderTemplate(html: string, vars: Record<string, string>): string {
  let result = html
  for (const [key, value] of Object.entries(vars)) {
    result = result.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), value || '')
  }
  return result
}

export async function sendEmail({ to, subject, html }: { to: string; subject: string; html: string }) {
  if (!process.env.RESEND_API_KEY) throw new Error('RESEND_API_KEY not configured')

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
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
    const error = await res.json()
    throw new Error(error.message || 'Failed to send email')
  }
  return res.json()
}
