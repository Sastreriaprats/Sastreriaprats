import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const admin = createAdminClient()
  const now = new Date()
  const weekAgo = new Date(now.getTime() - 7 * 86400000)
  const start = weekAgo.toISOString().split('T')[0]
  const end = now.toISOString().split('T')[0]

  const { data: saleLines } = await admin.from('sale_lines')
    .select('line_total, sales!inner(status, created_at)')
    .gte('sales.created_at', start).lte('sales.created_at', end + 'T23:59:59')
    .eq('sales.status', 'completed')

  const { data: onlineOrders } = await admin.from('online_orders')
    .select('total').gte('created_at', start).lte('created_at', end + 'T23:59:59')
    .in('status', ['paid', 'processing', 'shipped', 'delivered'])

  const { data: tailoringOrders } = await admin.from('tailoring_orders')
    .select('total, status').gte('created_at', start).lte('created_at', end + 'T23:59:59')
    .not('status', 'eq', 'cancelled')

  const { count: newClients } = await admin.from('clients')
    .select('id', { count: 'exact' }).gte('created_at', start)

  const posTotal = (saleLines || []).reduce((s, l) => s + ((l.line_total as number) || 0), 0)
  const onlineTotal = (onlineOrders || []).reduce((s, o) => s + ((o.total as number) || 0), 0)
  const tailoringTotal = (tailoringOrders || []).reduce((s, o) => s + ((o.total as number) || 0), 0)
  const total = posTotal + onlineTotal + tailoringTotal
  const fmt = (n: number) => n.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' })

  const { data: roles } = await admin.from('roles').select('id').eq('name', 'super_admin').single()
  const adminEmails: string[] = []
  if (roles?.id) {
    const { data: userRoles } = await admin.from('user_roles')
      .select('user_id, profiles!inner(email, is_active)')
      .eq('role_id', roles.id)
      .eq('profiles.is_active', true)
    for (const ur of userRoles || []) {
      const profile = ur.profiles as unknown as Record<string, unknown> | null
      if (profile?.email) adminEmails.push(profile.email as string)
    }
  }

  if (adminEmails.length === 0) return NextResponse.json({ skipped: 'no admin emails' })

  if (process.env.RESEND_API_KEY) {
    await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: process.env.RESEND_FROM_EMAIL || 'noreply@prats.es',
        to: adminEmails,
        subject: `Informe semanal Prats — ${fmt(total)}`,
        html: `
          <div style="font-family:Helvetica,sans-serif;max-width:600px;margin:0 auto;">
            <h2 style="color:#1a2744;border-bottom:3px solid #c9a84c;padding-bottom:8px;">Informe semanal</h2>
            <p style="color:#6b7280;">Periodo: ${start} a ${end}</p>
            <table style="width:100%;border-collapse:collapse;margin:20px 0;">
              <tr><td style="padding:12px;border:1px solid #e5e7eb;font-weight:bold;">Facturación total</td><td style="padding:12px;border:1px solid #e5e7eb;text-align:right;font-size:20px;font-weight:bold;color:#1a2744;">${fmt(total)}</td></tr>
              <tr><td style="padding:12px;border:1px solid #e5e7eb;">TPV / Boutique</td><td style="padding:12px;border:1px solid #e5e7eb;text-align:right;">${fmt(posTotal)}</td></tr>
              <tr><td style="padding:12px;border:1px solid #e5e7eb;">Online</td><td style="padding:12px;border:1px solid #e5e7eb;text-align:right;">${fmt(onlineTotal)}</td></tr>
              <tr><td style="padding:12px;border:1px solid #e5e7eb;">Sastrería</td><td style="padding:12px;border:1px solid #e5e7eb;text-align:right;">${fmt(tailoringTotal)}</td></tr>
              <tr><td style="padding:12px;border:1px solid #e5e7eb;">Nuevos clientes</td><td style="padding:12px;border:1px solid #e5e7eb;text-align:right;">${newClients || 0}</td></tr>
            </table>
            <p style="color:#9ca3af;font-size:12px;text-align:center;margin-top:30px;">Sastrería Prats · Informe automático</p>
          </div>`,
      }),
    })
  }

  return NextResponse.json({ sent: adminEmails.length, total })
}
