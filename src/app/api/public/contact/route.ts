import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { isRateLimited } from '@/lib/rate-limit'

const TEAM_EMAIL = process.env.CONTACT_TEAM_EMAIL || 'info@sastreriaprats.com'

const MONTHS_ES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']

function escapeHtml(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}
function formatPreferredDate(value: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value?.trim() || '')
  if (!match) return value?.trim() || ''
  const [, y, m, d] = match
  const month = MONTHS_ES[parseInt(m!, 10) - 1]
  return `${parseInt(d!, 10)} de ${month} de ${y}`
}

export async function POST(request: NextRequest) {
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown'
  if (isRateLimited(ip, 'contact', 5, 60)) {
    return NextResponse.json({ error: 'Too many requests' }, { status: 429 })
  }

  try {
    const body = await request.json()
    const { name, email, phone, service, preferredDate, message } = body

    if (!name || typeof name !== 'string' || !name.trim()) {
      return NextResponse.json(
        { error: 'El nombre es obligatorio' },
        { status: 400 }
      )
    }
    if (!email || typeof email !== 'string' || !email.trim()) {
      return NextResponse.json(
        { error: 'El email es obligatorio' },
        { status: 400 }
      )
    }

    const admin = createAdminClient()
    const { error } = await admin.from('contact_requests').insert({
      name: name.trim(),
      email: email.trim(),
      phone: phone?.trim() || null,
      service: service?.trim() || null,
      preferred_date: preferredDate?.trim() || null,
      message: message?.trim() || null,
      locale: 'es',
    })

    if (error) {
      console.error('[Contact API] DB insert error:', error)
      return NextResponse.json(
        { error: 'Error al guardar la solicitud' },
        { status: 500 }
      )
    }

    const apiKey = process.env.RESEND_API_KEY
    const fromEmail = process.env.RESEND_FROM_EMAIL

    if (apiKey && fromEmail) {
      const teamSubject = `[Sastrería Prats] Nueva solicitud de contacto de ${name.trim()}`
      const teamHtml = `
              <h2>Nueva solicitud de contacto</h2>
              <p><strong>Nombre:</strong> ${escapeHtml(name.trim())}</p>
              <p><strong>Email:</strong> ${escapeHtml(email.trim())}</p>
              ${phone ? `<p><strong>Teléfono:</strong> ${escapeHtml(phone)}</p>` : ''}
              ${service ? `<p><strong>Servicio:</strong> ${escapeHtml(service)}</p>` : ''}
              ${preferredDate ? `<p><strong>Fecha preferida:</strong> ${escapeHtml(formatPreferredDate(preferredDate))}</p>` : ''}
              ${message ? `<p><strong>Mensaje:</strong><br/>${escapeHtml(message).replace(/\n/g, '<br/>')}</p>` : ''}
            `
      try {
        const res = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            from: fromEmail,
            to: TEAM_EMAIL,
            subject: teamSubject,
            html: teamHtml,
          }),
        })
        const data = res.ok ? await res.json().catch(() => null) : null
        await admin.from('email_logs').insert({
          recipient_email: TEAM_EMAIL,
          subject: teamSubject,
          body_html: teamHtml,
          email_type: 'transactional',
          status: res.ok ? 'sent' : 'failed',
          sent_at: new Date().toISOString(),
          resend_id: (data as { id?: string } | null)?.id ?? null,
          ...(res.ok ? {} : { error_message: `HTTP ${res.status}` }),
        })
      } catch (e) {
        console.error('[Contact API] Team notification email failed:', e)
        await admin.from('email_logs').insert({
          recipient_email: TEAM_EMAIL,
          subject: teamSubject,
          body_html: teamHtml,
          email_type: 'transactional',
          status: 'failed',
          error_message: e instanceof Error ? e.message : 'Unknown error',
        })
      }

      // Acuse al cliente: pasa por el sistema unificado de emails transaccionales,
      // que ya envuelve con el layout corporativo (logo header + footer con
      // dirección/teléfono/email/copyright) y registra en email_logs.
      try {
        const { sendContactAcknowledgment } = await import('@/lib/email/transactional')
        await sendContactAcknowledgment({
          to: email.trim(),
          clientName: name.trim(),
          service: service?.trim() || undefined,
          preferredDate: preferredDate?.trim() ? formatPreferredDate(preferredDate) : undefined,
          message: message?.trim() || undefined,
        })
      } catch (e) {
        // No bloqueamos la respuesta al cliente si el acuse falla — el mensaje
        // ya quedó persistido en contact_requests + notificado al equipo.
        console.error('[Contact API] Auto-reply email failed:', e)
      }
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('[Contact API] Error:', err)
    return NextResponse.json(
      { error: 'Error al procesar la solicitud' },
      { status: 500 }
    )
  }
}
