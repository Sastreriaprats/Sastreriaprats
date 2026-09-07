import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { isAuthorizedCron } from '@/lib/cron-auth'

export async function GET(request: NextRequest) {
  if (!isAuthorizedCron(request.headers.get('authorization'))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const admin = createAdminClient()
  const now = new Date()
  const weekAgo = new Date(now.getTime() - 7 * 86400000)
  // Ventana de INSTANTES exactos y tope superior EXCLUSIVO. Degradar a cadenas de
  // día (start .. end+'T23:59:59') cubría 8 días naturales y repetía entero el día
  // del corte en el informe de la semana siguiente. Con [weekAgo, now) el final de
  // una semana es exactamente el inicio de la otra: 7x24 h, sin solape ni hueco.
  const startIso = weekAgo.toISOString()
  const endIso = now.toISOString()
  // `start` y `end` se quedan solo para el texto "Periodo:" del email.
  const start = weekAgo.toISOString().split('T')[0]
  const end = now.toISOString().split('T')[0]

  const { data: saleLines } = await admin.from('sale_lines')
    .select('line_total, sales!inner(status, created_at)')
    .gte('sales.created_at', startIso).lt('sales.created_at', endIso)
    .eq('sales.status', 'completed')

  const { data: onlineOrders } = await admin.from('online_orders')
    .select('total').gte('created_at', startIso).lt('created_at', endIso)
    .in('status', ['paid', 'processing', 'shipped', 'delivered'])

  const { data: tailoringOrders } = await admin.from('tailoring_orders')
    .select('total, status').gte('created_at', startIso).lt('created_at', endIso)
    .not('status', 'eq', 'cancelled')

  const { count: newClients } = await admin.from('clients')
    .select('id', { count: 'exact' }).gte('created_at', startIso).lt('created_at', endIso)

  const posTotal = (saleLines || []).reduce((s, l) => s + ((l.line_total as number) || 0), 0)
  const onlineTotal = (onlineOrders || []).reduce((s, o) => s + ((o.total as number) || 0), 0)
  const tailoringTotal = (tailoringOrders || []).reduce((s, o) => s + ((o.total as number) || 0), 0)
  const total = posTotal + onlineTotal + tailoringTotal
  const fmt = (n: number) => n.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' })

  // "No hay destinatarios" y "la consulta falló" no pueden dar la misma respuesta:
  // hasta ahora los dos casos caían en el mismo `skipped` y el informe podía llevar
  // meses sin salir sin que nada lo delatara.
  const { data: roles, error: rolesError } = await admin
    .from('roles').select('id').eq('name', 'super_admin').maybeSingle()
  if (rolesError) {
    return NextResponse.json({ error: `roles: ${rolesError.message}` }, { status: 500 })
  }
  if (!roles?.id) {
    return NextResponse.json({ error: 'rol super_admin no encontrado en roles' }, { status: 500 })
  }

  const adminEmails: string[] = []
  const { data: userRoles, error: userRolesError } = await admin.from('user_roles')
    .select('user_id, profiles!inner(email, is_active)')
    .eq('role_id', roles.id)
    .eq('profiles.is_active', true)
  if (userRolesError) {
    return NextResponse.json({ error: `user_roles: ${userRolesError.message}` }, { status: 500 })
  }
  for (const ur of userRoles || []) {
    const profile = ur.profiles as unknown as Record<string, unknown> | null
    if (profile?.email) adminEmails.push(profile.email as string)
  }

  if (adminEmails.length === 0) return NextResponse.json({ skipped: 'no admin emails' })

  // Sin clave no sale ningún email: hay que decirlo, no responder {sent:n}.
  if (!process.env.RESEND_API_KEY) {
    return NextResponse.json({ skipped: 'RESEND_API_KEY no configurada', total })
  }

  let res: Response | null = null
  let resendError: string | null = null
  try {
    res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: process.env.RESEND_FROM_EMAIL || 'Sastrería Prats <noreply@sastreriaprats.com>',
        to: adminEmails,
        subject: `Informe semanal Prats — ${fmt(total)}`,
        html: `
          <div style="font-family:Helvetica,sans-serif;max-width:600px;margin:0 auto;">
            <h2 style="color:#1a2744;border-bottom:3px solid #c9a84c;padding-bottom:8px;">Informe semanal</h2>
            <p style="color:#6b7280;">Periodo: ${start} a ${end}</p>
            <table style="width:100%;border-collapse:collapse;margin:20px 0;">
              <tr><td style="padding:12px;border:1px solid #e5e7eb;font-weight:bold;">Facturación total</td><td style="padding:12px;border:1px solid #e5e7eb;text-align:right;font-size:20px;font-weight:bold;color:#1a2744;">${fmt(total)}</td></tr>
              <tr><td style="padding:12px;border:1px solid #e5e7eb;">Boutique + Tarjetas</td><td style="padding:12px;border:1px solid #e5e7eb;text-align:right;">${fmt(posTotal)}</td></tr>
              <tr><td style="padding:12px;border:1px solid #e5e7eb;">Online</td><td style="padding:12px;border:1px solid #e5e7eb;text-align:right;">${fmt(onlineTotal)}</td></tr>
              <tr><td style="padding:12px;border:1px solid #e5e7eb;">Sastrería</td><td style="padding:12px;border:1px solid #e5e7eb;text-align:right;">${fmt(tailoringTotal)}</td></tr>
              <tr><td style="padding:12px;border:1px solid #e5e7eb;">Nuevos clientes</td><td style="padding:12px;border:1px solid #e5e7eb;text-align:right;">${newClients || 0}</td></tr>
            </table>
            <p style="color:#9ca3af;font-size:12px;text-align:center;margin-top:30px;">Sastrería Prats · Informe automático</p>
          </div>`,
      }),
    })
  } catch (e) {
    resendError = e instanceof Error ? e.message : 'error de red al llamar a Resend'
  }

  // Resend puede rechazar el envío (clave rotada, dominio sin verificar, 429) y
  // antes se ignoraba la respuesta: el cron contestaba {sent:n} sin que hubiera
  // salido nada. Ahora queda rastro en email_logs (visible en Emails > Historial)
  // y se responde 500, para que no se repita lo de los crons caídos de abril.
  if (!res || !res.ok) {
    if (res && !resendError) {
      const bodyText = await res.text().catch(() => '')
      resendError = `HTTP ${res.status} ${bodyText.slice(0, 300)}`
    }
    await admin.from('email_logs').insert(
      adminEmails.map((email) => ({
        recipient_email: email,
        subject: `Informe semanal Prats — ${fmt(total)}`,
        status: 'failed',
        email_type: 'transactional',
        error_message: resendError,
      }))
    )
    return NextResponse.json({ error: resendError }, { status: 500 })
  }

  const sentPayload = (await res.json().catch(() => ({}))) as { id?: string }
  await admin.from('email_logs').insert(
    adminEmails.map((email) => ({
      recipient_email: email,
      subject: `Informe semanal Prats — ${fmt(total)}`,
      status: 'sent',
      email_type: 'transactional',
      sent_at: new Date().toISOString(),
      resend_id: sentPayload.id ?? null,
    }))
  )

  return NextResponse.json({ sent: adminEmails.length, total })
}
