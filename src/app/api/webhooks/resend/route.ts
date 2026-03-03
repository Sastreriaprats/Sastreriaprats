/**
 * Webhook de Resend para tracking de emails (delivered, opened, clicked, bounced, complained).
 * Resend usa Svix para firmar los webhooks.
 *
 * Configuración en Resend:
 * 1. resend.com → Webhooks → Add Webhook
 * 2. URL: https://tu-dominio.com/api/webhooks/resend
 * 3. Eventos: email.delivered, email.opened, email.clicked, email.bounced, email.complained
 * 4. Copiar el signing secret y definir RESEND_WEBHOOK_SECRET en .env y en Vercel.
 */
import { NextRequest, NextResponse } from 'next/server'
import { Webhook } from 'svix'
import { createAdminClient } from '@/lib/supabase/admin'

type ResendWebhookData = {
  email_id?: string
  id?: string
  created_at?: string
}

type ResendWebhookEvent = {
  type: string
  data?: ResendWebhookData
}

function getEmailId(event: ResendWebhookEvent): string | null {
  const id = event.data?.email_id ?? event.data?.id
  return id ?? null
}

export async function POST(request: NextRequest) {
  const rawBody = await request.text()
  const secret = process.env.RESEND_WEBHOOK_SECRET

  if (!secret) {
    return NextResponse.json(
      { error: 'RESEND_WEBHOOK_SECRET is not configured' },
      { status: 500 }
    )
  }

  const signature = request.headers.get('svix-signature')
  if (!signature) {
    return NextResponse.json({ error: 'Missing svix-signature header' }, { status: 400 })
  }

  let event: ResendWebhookEvent
  try {
    const wh = new Webhook(secret)
    const headers: Record<string, string> = {
      'svix-id': request.headers.get('svix-id') ?? '',
      'svix-timestamp': request.headers.get('svix-timestamp') ?? '',
      'svix-signature': signature,
    }
    const payload = wh.verify(rawBody, headers) as ResendWebhookEvent
    event = payload
  } catch {
    return NextResponse.json({ error: 'Invalid webhook signature' }, { status: 400 })
  }

  try {
    const emailId = getEmailId(event)
    if (!emailId) return NextResponse.json({ received: true })

    const admin = createAdminClient()
    const now = new Date().toISOString()

    switch (event.type) {
      case 'email.delivered': {
        await admin
          .from('email_logs')
          .update({ status: 'delivered', delivered_at: now })
          .eq('resend_id', emailId)
        break
      }
      case 'email.opened': {
        const { data: row } = await admin
          .from('email_logs')
          .select('opens_count, campaign_id')
          .eq('resend_id', emailId)
          .maybeSingle()
        const nextOpens = ((row?.opens_count as number) ?? 0) + 1
        await admin
          .from('email_logs')
          .update({ opened_at: now, opens_count: nextOpens })
          .eq('resend_id', emailId)
        break
      }
      case 'email.clicked': {
        const { data: row } = await admin
          .from('email_logs')
          .select('clicks_count, campaign_id')
          .eq('resend_id', emailId)
          .maybeSingle()
        const nextClicks = ((row?.clicks_count as number) ?? 0) + 1
        await admin
          .from('email_logs')
          .update({ clicked_at: now, clicks_count: nextClicks })
          .eq('resend_id', emailId)
        break
      }
      case 'email.bounced': {
        const { data: log } = await admin
          .from('email_logs')
          .update({ status: 'bounced', bounced_at: now })
          .eq('resend_id', emailId)
          .select('client_id')
          .maybeSingle()
        if (log?.client_id) {
          await admin.from('clients').update({ email_bounced: true }).eq('id', log.client_id)
        }
        break
      }
      case 'email.complained': {
        await admin
          .from('email_logs')
          .update({ status: 'complained' })
          .eq('resend_id', emailId)
        break
      }
      default:
        break
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
