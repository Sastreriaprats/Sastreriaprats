import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { isAuthorizedCron } from '@/lib/cron-auth'
import { sendAppointmentReminder } from '@/lib/email/transactional'
import { formalGreeting } from '@/lib/email/greeting'

// "2026-07-18" → "18 de julio de 2026". Mediodía UTC para que el día no
// se desplace formatee donde formatee el servidor.
function formatApptDate(dateStr: string): string {
  try {
    return new Intl.DateTimeFormat('es-ES', {
      day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/Madrid',
    }).format(new Date(`${dateStr}T12:00:00Z`))
  } catch {
    return dateStr
  }
}

type ApptClient = {
  email?: string | null
  full_name?: string | null
  first_name?: string | null
  last_name?: string | null
  salutation?: string | null
}

export async function GET(request: NextRequest) {
  if (!isAuthorizedCron(request.headers.get('authorization'))) {
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
    .select('id, title, date, start_time, client_id, clients(email, full_name, first_name, last_name, salutation), stores(name)')
    .eq('date', tomorrow)
    .eq('status', 'scheduled')
    .eq('reminder_sent_24h', false)

  for (const appt of tomorrowAppts || []) {
    const client = appt.clients as unknown as ApptClient | null
    if (client?.email) {
      const store = appt.stores as unknown as { name?: string } | null
      const { greeting, name } = formalGreeting(client)
      try {
        await sendAppointmentReminder({
          client_email: client.email,
          client_name: name,
          greeting,
          title: String(appt.title ?? 'Cita'),
          date: formatApptDate(String(appt.date)),
          time: String(appt.start_time).slice(0, 5),
          store_name: store?.name || '',
          variant: '24h',
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
    .select('id, title, date, start_time, client_id, clients(email, full_name, first_name, last_name, salutation), stores(name)')
    .eq('date', today)
    .eq('status', 'scheduled')
    .eq('reminder_sent_2h', false)
    .gte('start_time', timeFrom)
    .lt('start_time', timeTo)

  for (const appt of soonAppts || []) {
    const client = appt.clients as unknown as ApptClient | null
    if (client?.email) {
      const store = appt.stores as unknown as { name?: string } | null
      const { greeting, name } = formalGreeting(client)
      try {
        await sendAppointmentReminder({
          client_email: client.email,
          client_name: name,
          greeting,
          title: String(appt.title ?? 'Cita'),
          date: formatApptDate(String(appt.date)),
          time: String(appt.start_time).slice(0, 5),
          store_name: store?.name || '',
          variant: '2h',
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
