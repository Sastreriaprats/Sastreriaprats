import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const admin = createAdminClient()
  const now = new Date()
  const today = now.toISOString().split('T')[0]
  const tomorrow = new Date(now.getTime() + 24 * 3600000).toISOString().split('T')[0]

  let sent24h = 0
  let sent2h = 0

  const { data: tomorrowAppts } = await admin
    .from('appointments')
    .select('id, title, date, start_time, client_id, clients(email, full_name), stores(name)')
    .eq('date', tomorrow)
    .eq('status', 'scheduled')
    .eq('reminder_sent_24h', false)

  for (const appt of tomorrowAppts || []) {
    const client = appt.clients as unknown as Record<string, unknown> | null
    if (client?.email) {
      try {
        const store = appt.stores as unknown as Record<string, unknown> | null
        await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            from: process.env.RESEND_FROM_EMAIL || 'noreply@prats.es',
            to: client.email,
            subject: `Recordatorio: ${appt.title} mañana a las ${String(appt.start_time).slice(0, 5)}`,
            html: `
              <h2>Recordatorio de cita</h2>
              <p>Estimado/a ${client.full_name},</p>
              <p>Le recordamos que tiene una cita programada:</p>
              <ul>
                <li><strong>${appt.title}</strong></li>
                <li>Fecha: ${appt.date}</li>
                <li>Hora: ${String(appt.start_time).slice(0, 5)}</li>
                <li>Tienda: ${store?.name || ''}</li>
              </ul>
              <p>Le esperamos. Sastrería Prats.</p>
            `,
          }),
        })
        sent24h++
      } catch (e) {
        console.error('[Reminder 24h] Error sending email:', e)
      }

      await admin.from('appointments').update({ reminder_sent_24h: true }).eq('id', appt.id)
    }
  }

  const twoHoursLater = new Date(now.getTime() + 2 * 3600000)
  const threeHoursLater = new Date(now.getTime() + 3 * 3600000)
  const timeFrom = `${twoHoursLater.getHours().toString().padStart(2, '0')}:${twoHoursLater.getMinutes().toString().padStart(2, '0')}`
  const timeTo = `${threeHoursLater.getHours().toString().padStart(2, '0')}:${threeHoursLater.getMinutes().toString().padStart(2, '0')}`

  const { data: soonAppts } = await admin
    .from('appointments')
    .select('id, title, start_time, client_id, clients(email, full_name, phone)')
    .eq('date', today)
    .eq('status', 'scheduled')
    .eq('reminder_sent_2h', false)
    .gte('start_time', timeFrom)
    .lt('start_time', timeTo)

  for (const appt of soonAppts || []) {
    const client = appt.clients as unknown as Record<string, unknown> | null
    if (client?.email) {
      try {
        await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            from: process.env.RESEND_FROM_EMAIL || 'noreply@prats.es',
            to: client.email,
            subject: `Su cita es en 2 horas — ${String(appt.start_time).slice(0, 5)}`,
            html: `<p>Le recordamos que su cita "${appt.title}" es hoy a las ${String(appt.start_time).slice(0, 5)}. ¡Le esperamos!</p>`,
          }),
        })
        sent2h++
      } catch (e) {
        console.error('[Reminder 2h] Error sending email:', e)
      }

      await admin.from('appointments').update({ reminder_sent_2h: true }).eq('id', appt.id)
    }
  }

  return NextResponse.json({ sent_24h: sent24h, sent_2h: sent2h })
}
