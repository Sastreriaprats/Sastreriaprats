import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

const TEAM_EMAIL = process.env.CONTACT_TEAM_EMAIL || process.env.RESEND_FROM_EMAIL || 'info@sastreriaprats.es'

export async function POST(request: NextRequest) {
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
      try {
        await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            from: fromEmail,
            to: TEAM_EMAIL,
            subject: `[Sastrería Prats] Nueva solicitud de contacto de ${name.trim()}`,
            html: `
              <h2>Nueva solicitud de contacto</h2>
              <p><strong>Nombre:</strong> ${name.trim()}</p>
              <p><strong>Email:</strong> ${email.trim()}</p>
              ${phone ? `<p><strong>Teléfono:</strong> ${phone}</p>` : ''}
              ${service ? `<p><strong>Servicio:</strong> ${service}</p>` : ''}
              ${preferredDate ? `<p><strong>Fecha preferida:</strong> ${preferredDate}</p>` : ''}
              ${message ? `<p><strong>Mensaje:</strong><br/>${message.replace(/\n/g, '<br/>')}</p>` : ''}
            `,
          }),
        })
      } catch (e) {
        console.error('[Contact API] Team notification email failed:', e)
      }

      try {
        await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            from: fromEmail,
            to: email.trim(),
            subject: 'Hemos recibido tu mensaje — Sastrería Prats',
            html: `
              <h2>Gracias por contactar con Sastrería Prats</h2>
              <p>Estimado/a ${name.trim()},</p>
              <p>Hemos recibido tu mensaje correctamente. Nuestro equipo se pondrá en contacto contigo lo antes posible.</p>
              <p>Atentamente,<br/>El equipo de Sastrería Prats</p>
            `,
          }),
        })
      } catch (e) {
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
