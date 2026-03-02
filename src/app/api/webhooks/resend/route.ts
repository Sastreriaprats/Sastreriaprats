/**
 * Webhook de Resend para eventos de email (entregado, abierto, clic, rebote).
 *
 * Configuración en Resend:
 * 1. resend.com → Webhooks → Add Webhook
 * 2. URL: https://sastreriaprats.com/api/webhooks/resend
 * 3. Eventos: email.delivered, email.opened, email.clicked, email.bounced
 * 4. Copiar el signing secret y definir RESEND_WEBHOOK_SECRET en .env.local y en Vercel.
 * Sin RESEND_WEBHOOK_SECRET el webhook acepta requests sin verificar (solo para desarrollo).
 */
import { NextRequest, NextResponse } from 'next/server'
import { Resend } from 'resend'
import { createAdminClient } from '@/lib/supabase/admin'

/** Resend envía event.type y event.data (created_at, email_id, ...) */
function getEmailId(event: { data?: { email_id?: string; id?: string } }): string | null {
  const id = event.data?.email_id ?? event.data?.id
  return id ?? null
}

type WebhookEvent = { type: string; data?: { email_id?: string; id?: string; created_at?: string } }

export async function POST(request: NextRequest) {
  const rawBody = await request.text()
  let event: WebhookEvent
  const secret = process.env.RESEND_WEBHOOK_SECRET
  if (secret) {
    try {
      const resend = new Resend()
      const verified = resend.webhooks.verify({
        payload: rawBody,
        headers: {
          id: request.headers.get('svix-id') ?? '',
          timestamp: request.headers.get('svix-timestamp') ?? '',
          signature: request.headers.get('svix-signature') ?? '',
        },
        webhookSecret: secret,
      })
      event = verified as WebhookEvent
    } catch {
      return NextResponse.json({ error: 'Invalid webhook signature' }, { status: 401 })
    }
  } else {
    try {
      event = JSON.parse(rawBody) as WebhookEvent
    } catch {
      return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
    }
  }

  try {
    const emailId = getEmailId(event)
    if (!emailId) return NextResponse.json({ received: true })

    const admin = createAdminClient()
    const now = new Date().toISOString()

    // 1) Actualizar email_logs (tabla unificada de envíos) y opcionalmente campaña / clientes
    if (event.type === 'email.delivered') {
      const { data: log } = await admin
        .from('email_logs')
        .update({ status: 'delivered' })
        .eq('resend_id', emailId)
        .select('campaign_id')
        .maybeSingle()
      if (log?.campaign_id) {
        const { data: camp } = await admin
          .from('email_campaigns')
          .select('delivered_count')
          .eq('id', log.campaign_id)
          .single()
        const count = (camp?.delivered_count as number) ?? 0
        await admin.from('email_campaigns').update({ delivered_count: count + 1 }).eq('id', log.campaign_id)
      }
    } else if (event.type === 'email.opened') {
      const { data: log } = await admin
        .from('email_logs')
        .update({ status: 'opened', opened_at: now })
        .eq('resend_id', emailId)
        .select('campaign_id')
        .maybeSingle()
      if (log?.campaign_id) {
        const { data: camp } = await admin
          .from('email_campaigns')
          .select('opened_count')
          .eq('id', log.campaign_id)
          .single()
        const count = (camp?.opened_count as number) ?? 0
        await admin.from('email_campaigns').update({ opened_count: count + 1 }).eq('id', log.campaign_id)
      }
    } else if (event.type === 'email.clicked') {
      const { data: log } = await admin
        .from('email_logs')
        .update({ clicked_at: now })
        .eq('resend_id', emailId)
        .select('campaign_id')
        .maybeSingle()
      if (log?.campaign_id) {
        const { data: camp } = await admin
          .from('email_campaigns')
          .select('clicked_count')
          .eq('id', log.campaign_id)
          .single()
        const count = (camp?.clicked_count as number) ?? 0
        await admin.from('email_campaigns').update({ clicked_count: count + 1 }).eq('id', log.campaign_id)
      }
    } else if (event.type === 'email.bounced') {
      const { data: log } = await admin
        .from('email_logs')
        .update({ status: 'bounced' })
        .eq('resend_id', emailId)
        .select('client_id')
        .maybeSingle()
      if (log?.client_id) {
        await admin.from('clients').update({ email_bounced: true }).eq('id', log.client_id)
      }
    }

    // 2) Mantener compatibilidad con client_email_history (tabla legacy)
    const statusMap: Record<string, string> = {
      'email.sent': 'sent',
      'email.delivered': 'delivered',
      'email.opened': 'opened',
      'email.clicked': 'clicked',
      'email.bounced': 'bounced',
      'email.complained': 'failed',
    }
    const newStatus = statusMap[event.type]
    if (newStatus) {
      await admin
        .from('client_email_history')
        .update({
          status: newStatus,
          ...(event.type === 'email.opened' ? { opened_at: now } : {}),
          ...(event.type === 'email.clicked' ? { clicked_at: now } : {}),
        })
        .eq('resend_id', emailId)
    }

    return NextResponse.json({ received: true })
  } catch (error: unknown) {
    console.error('[Resend Webhook Error]', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Webhook error' },
      { status: 500 }
    )
  }
}
