import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { verifyOptInToken } from '@/lib/newsletter/tokens'
import { isRateLimited } from '@/lib/rate-limit'

/** POST /api/newsletter/baja-motivo — guarda el motivo opcional de baja. */
export async function POST(request: NextRequest) {
  try {
    const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
      || request.headers.get('cf-connecting-ip')?.trim()
      || 'unknown'

    if (isRateLimited(ip, 'newsletter-baja-motivo', 3, 60)) {
      return NextResponse.json(
        { ok: false, error: 'Demasiados intentos. Inténtalo de nuevo en un minuto.' },
        { status: 429 }
      )
    }

    const body = await request.json().catch(() => null) as { token?: unknown; reason?: unknown } | null
    if (!body) {
      return NextResponse.json({ ok: false, error: 'Petición inválida' }, { status: 400 })
    }
    const token = typeof body.token === 'string' ? body.token : ''
    const reason = typeof body.reason === 'string' ? body.reason.trim() : ''

    if (!reason) {
      return NextResponse.json({ ok: false, error: 'Motivo vacío' }, { status: 400 })
    }
    if (reason.length > 500) {
      return NextResponse.json({ ok: false, error: 'Motivo demasiado largo' }, { status: 400 })
    }

    const result = verifyOptInToken(token)
    if (!result.valid) {
      return NextResponse.json({ ok: false, error: 'Enlace no válido' }, { status: 400 })
    }

    const admin = createAdminClient()
    const { error } = await admin
      .from('clients')
      .update({ unsubscribe_reason: reason })
      .eq('id', result.clientId)

    if (error) {
      console.error('[newsletter/baja-motivo] update error:', error)
      return NextResponse.json({ ok: false, error: 'Error al guardar' }, { status: 500 })
    }
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[newsletter/baja-motivo]', err)
    return NextResponse.json({ ok: false, error: 'Error interno' }, { status: 500 })
  }
}
