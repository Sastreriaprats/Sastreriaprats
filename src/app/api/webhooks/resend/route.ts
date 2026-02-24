import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function POST(request: NextRequest) {
  try {
    const event = await request.json()
    const admin = createAdminClient()

    const emailId = event.data?.email_id

    if (!emailId) return NextResponse.json({ received: true })

    const statusMap: Record<string, string> = {
      'email.sent': 'sent',
      'email.delivered': 'delivered',
      'email.opened': 'opened',
      'email.clicked': 'clicked',
      'email.bounced': 'bounced',
      'email.complained': 'failed',
    }

    const newStatus = statusMap[event.type]
    if (!newStatus) return NextResponse.json({ received: true })

    await admin
      .from('client_email_history')
      .update({
        status: newStatus,
        ...(event.type === 'email.opened' ? { opened_at: new Date().toISOString() } : {}),
        ...(event.type === 'email.clicked' ? { clicked_at: new Date().toISOString() } : {}),
      })
      .eq('resend_id', emailId)

    return NextResponse.json({ received: true })
  } catch (error: any) {
    console.error('[Resend Webhook Error]', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
