import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { isAuthorizedCron } from '@/lib/cron-auth'
import { sendAppointmentReminder } from '@/lib/email/transactional'
import { formalGreeting } from '@/lib/email/greeting'

// "2026-07-18" → "Viernes, 18 de julio de 2026". Mediodía UTC para que el día no
// se desplace formatee donde formatee el servidor.
function formatApptDate(dateStr: string): string {
  try {
    const formatted = new Intl.DateTimeFormat('es-ES', {
      weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/Madrid',
    }).format(new Date(`${dateStr}T12:00:00Z`))
    return formatted.charAt(0).toUpperCase() + formatted.slice(1)
  } catch {
    return dateStr
  }
}

// Fecha ("2026-09-03") y hora de pared ("09:30") en Madrid para un instante dado.
// El proceso corre en UTC (Vercel), pero appointments.date y start_time guardan
// la hora local de la tienda: sin convertir, la ventana de los recordatorios se
// desplaza 1-2 h y no coincide con ninguna cita.
const MADRID = 'Europe/Madrid'
function madridDate(d: Date): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: MADRID, year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(d)
}
function madridTime(d: Date): string {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: MADRID, hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).format(d)
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
  // El día también en Madrid: con toISOString() un disparo entre las 00:00 y las
  // 02:00 de Madrid resolvería el día anterior.
  const tomorrow = madridDate(new Date(now.getTime() + 24 * 3600000))

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
        // La bandera se marca DENTRO del try: si el envío falla (Resend 429, 5xx),
        // la cita queda sin marcar y la vuelve a coger la siguiente pasada. Fuera
        // del try se daba por avisada una cita a la que no le llegó nada.
        await admin.from('appointments').update({ reminder_sent_24h: true }).eq('id', appt.id)
      } catch (e) {
        console.error('[Reminder 24h] Error sending email:', e)
      }
    }
  }

  const twoHoursLater = new Date(now.getTime() + 2 * 3600000)
  const threeHoursLater = new Date(now.getTime() + 3 * 3600000)
  // Ventana en hora de MADRID. Antes con getHours(), que en Vercel devuelve UTC:
  // el aviso "dentro de 2 horas" caía sobre las citas que estaban empezando (y,
  // como a esa franja casi nunca hay cita, en la práctica no salía nunca).
  const dayFrom = madridDate(twoHoursLater)
  const timeFrom = madridTime(twoHoursLater)
  const timeTo = madridTime(threeHoursLater)

  const { data: soonAppts } = await admin
    .from('appointments')
    .select('id, title, date, start_time, client_id, clients(email, full_name, first_name, last_name, salutation), stores(name)')
    .eq('date', dayFrom)
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
        // Igual que en el bloque de 24h: solo se marca si el envío salió bien.
        await admin.from('appointments').update({ reminder_sent_2h: true }).eq('id', appt.id)
      } catch (e) {
        console.error('[Reminder 2h] Error sending email:', e)
      }
    }
  }

  return NextResponse.json({ sent_24h: sent24h, sent_2h: sent2h })
}
