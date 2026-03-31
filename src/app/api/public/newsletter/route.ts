import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { isRateLimited } from '@/lib/rate-limit'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/** POST /api/public/newsletter — suscripción pública a la newsletter */
export async function POST(request: NextRequest) {
  try {
    const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown'
    if (isRateLimited(ip, 'newsletter', 5, 3600)) {
      return NextResponse.json({ error: 'Demasiados intentos. Inténtalo más tarde.' }, { status: 429 })
    }

    const body = await request.json()
    const email = (body.email || '').trim().toLowerCase()

    if (!email || !EMAIL_RE.test(email)) {
      return NextResponse.json({ error: 'Email no válido' }, { status: 400 })
    }

    const admin = createAdminClient()

    // Buscar si ya existe un cliente con este email
    const { data: existing } = await admin
      .from('clients')
      .select('id, newsletter_subscribed, accepts_marketing, full_name')
      .eq('email', email)
      .maybeSingle()

    let isNew = false

    if (existing) {
      if (existing.newsletter_subscribed && existing.accepts_marketing) {
        return NextResponse.json({ ok: true, message: 'Ya estás suscrito. ¡Gracias!' })
      }
      // Actualizar opt-in
      await admin
        .from('clients')
        .update({
          newsletter_subscribed: true,
          accepts_marketing: true,
          marketing_consent_date: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', existing.id)
    } else {
      isNew = true
      await admin.from('clients').insert({
        email,
        full_name: email.split('@')[0],
        newsletter_subscribed: true,
        accepts_marketing: true,
        marketing_consent_date: new Date().toISOString(),
        accepts_data_storage: true,
        data_consent_date: new Date().toISOString(),
        source: 'newsletter',
      })
    }

    // Enviar email de bienvenida para nuevos suscriptores (fire-and-forget)
    if (isNew) {
      try {
        const { sendNewsletterWelcome } = await import('@/lib/email/transactional')
        sendNewsletterWelcome({ email }).catch(() => {})
      } catch { /* email sending is best-effort */ }
    }

    return NextResponse.json({
      ok: true,
      message: isNew
        ? '¡Bienvenido a la familia Prats! Revisa tu email.'
        : '¡Suscripción activada! Gracias por unirte.',
    })
  } catch (err) {
    console.error('[newsletter]', err)
    return NextResponse.json({ error: 'Error al procesar la suscripción' }, { status: 500 })
  }
}
