import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { getPublicSlots, isDayClosed, filterBlockedSlots, isSlotBlocked, type ScheduleBlockLike } from '@/lib/schedule-utils'
import { escapeLikePattern, pickPreferredClient } from '@/lib/clients/email-lookup'

export async function GET(request: NextRequest) {
  try {
  const { searchParams } = new URL(request.url)
  const date = searchParams.get('date')
  const storeId = searchParams.get('store_id')

  if (!date || !storeId) {
    return NextResponse.json({ error: 'date and store_id required' }, { status: 400 })
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json({ error: 'Invalid date format (YYYY-MM-DD)' }, { status: 400 })
  }

  // Domingo cerrado
  if (isDayClosed(date)) {
    return NextResponse.json({ date, store_id: storeId, slots: [], closed: true })
  }

  const admin = createAdminClient()

  // Consultar citas existentes y bloqueos en paralelo
  const [existingRes, blocksRes] = await Promise.all([
    admin
      .from('appointments')
      .select('start_time, end_time')
      .eq('date', date)
      .eq('store_id', storeId)
      .neq('status', 'cancelled'),
    admin
      .from('schedule_blocks')
      .select('all_day, start_time, end_time')
      .eq('block_date', date)
      .eq('is_active', true)
      .or(`store_id.eq.${storeId},store_id.is.null`),
  ])

  const existing = existingRes.data || []
  const blocks = (blocksRes.data || []) as { all_day: boolean; start_time: string | null; end_time: string | null }[]

  // Obtener slots según día de la semana (sábado solo mañana, domingo vacío)
  let slotTimes = getPublicSlots(date)

  // Filtrar por bloqueos
  slotTimes = filterBlockedSlots(slotTimes, blocks)

  // No ofrecer horas que ya han pasado: la agenda se llenaba de citas online
  // para esta misma mañana, que nadie iba a atender. El "ahora" se calcula con
  // timeZone 'Europe/Madrid' EXPLÍCITA porque el proceso corre en UTC (Vercel)
  // y getHours()/toISOString() darían otra hora y hasta otro día.
  const _ahora = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Europe/Madrid', year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
    }).formatToParts(new Date()).map(p => [p.type, p.value])
  )
  const hoyMadrid = `${_ahora.year}-${_ahora.month}-${_ahora.day}`
  if (date < hoyMadrid) {
    return NextResponse.json({ date, store_id: storeId, slots: [], closed: true })
  }
  if (date === hoyMadrid) {
    // Margen para que al cliente le dé tiempo a llegar a la tienda.
    const MARGEN_MIN = 60
    const limiteMin = Number(_ahora.hour) * 60 + Number(_ahora.minute) + MARGEN_MIN
    slotTimes = slotTimes.filter(t => {
      const [hh, mm] = t.split(':').map(Number)
      return hh * 60 + mm >= limiteMin
    })
  }

  const slots: { time: string; available: boolean }[] = []

  for (const timeStr of slotTimes) {
    const [h, m] = timeStr.split(':').map(Number)
    // La cita que crea bookAppointment dura 60 min, no 30: si aquí se mide la
    // ventana a 30 se publican huecos que la reserva luego rechaza (10:30 con
    // una cita a las 11:00). Misma duración en los dos sitios.
    const endMin = h * 60 + m + 60
    const endStr = `${Math.floor(endMin / 60).toString().padStart(2, '0')}:${(endMin % 60).toString().padStart(2, '0')}`
    // La BD devuelve TIME como 'HH:MM:SS' y los huecos son 'HH:MM': sin recortar,
    // '11:00:00' > '11:00' es true y una cita que TERMINA a las 11:00 tapaba el
    // hueco de las 11:00. Se normaliza a HH:MM igual que isSlotBlocked.
    const conflict = (existing).find(
      (a: Record<string, unknown>) =>
        String(a.start_time).slice(0, 5) < endStr && String(a.end_time).slice(0, 5) > timeStr
    )
    slots.push({ time: timeStr, available: !conflict })
  }

  return NextResponse.json({ date, store_id: storeId, slots })
  } catch (err) {
    console.error('[appointments/GET]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
  // Este POST escribe en `clients` y `appointments` con service-role (salta
  // RLS): sin sesión, cualquiera desde fuera podía llenar la agenda de citas
  // basura y el fichero de clientes de fichas falsas. El flujo vivo de la web
  // reserva con la server action bookAppointment, que ya exige usuario
  // logueado; aquí se aplica el mismo criterio.
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }

  const body = await request.json()
  const { date, start_time, store_id, client_name, client_email, client_phone, type, notes } = body

  if (!date || !start_time || !store_id || !client_name || !client_email) {
    return NextResponse.json(
      { error: 'Campos obligatorios: date, start_time, store_id, client_name, client_email' },
      { status: 400 }
    )
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json({ error: 'Formato de fecha inválido (YYYY-MM-DD)' }, { status: 400 })
  }
  if (!/^\d{2}:\d{2}$/.test(start_time)) {
    return NextResponse.json({ error: 'Formato de hora inválido (HH:MM)' }, { status: 400 })
  }

  // No permitir reservas en domingo
  if (isDayClosed(date)) {
    return NextResponse.json({ error: 'No se aceptan reservas en domingo' }, { status: 400 })
  }

  const admin = createAdminClient()

  const endH = parseInt(start_time.split(':')[0]) + 1
  const end_time = `${endH.toString().padStart(2, '0')}:00`

  // Verificar bloqueos (misma lógica única que el lado admin)
  const { data: blocks } = await admin
    .from('schedule_blocks')
    .select('all_day, start_time, end_time')
    .eq('block_date', date)
    .eq('is_active', true)
    .or(`store_id.eq.${store_id},store_id.is.null`)

  if (isSlotBlocked((blocks || []) as ScheduleBlockLike[], start_time, end_time)) {
    return NextResponse.json({ error: 'Horario no disponible (bloqueado)' }, { status: 409 })
  }

  const { data: conflict } = await admin
    .from('appointments')
    .select('id')
    .eq('date', date)
    .eq('store_id', store_id)
    .neq('status', 'cancelled')
    .lt('start_time', end_time)
    .gt('end_time', start_time)
    .limit(1)

  if (conflict && conflict.length > 0) {
    return NextResponse.json({ error: 'Horario no disponible' }, { status: 409 })
  }

  let clientId: string | null = null
  // El email se compara sin distinguir mayúsculas y TOLERANDO varias filas:
  // clients.email no es único, así que con `.eq(...).single()` bastaba un
  // duplicado para que la consulta fallase (data null) y se creara otra ficha
  // más. Se prefiere la ficha "oficial" de tienda (con client_code) y, si no,
  // la más antigua: mismo criterio que findLinkableClientsByEmail (auth.ts).
  const emailPattern = escapeLikePattern(String(client_email))
  const { data: emailMatches, error: emailLookupError } = await admin
    .from('clients')
    .select('id, client_code')
    .ilike('email', emailPattern)
    .order('created_at', { ascending: true })
  if (emailLookupError) console.error('[appointments/POST] búsqueda de cliente por email', emailLookupError)
  const matchedRows = emailMatches ?? []
  const existingClient = pickPreferredClient(matchedRows)

  if (existingClient) {
    clientId = existingClient.id
  } else {
    const nameParts = client_name.trim().split(' ')
    const firstName = nameParts[0]
    const lastName = nameParts.slice(1).join(' ') || ''

    const { data: newClient } = await admin
      .from('clients')
      .insert({
        first_name: firstName,
        last_name: lastName,
        email: client_email,
        phone: client_phone || null,
        source: 'web',
      })
      .select('id')
      .single()
    clientId = newClient?.id || null
  }

  const { data: appointment, error } = await admin
    .from('appointments')
    .insert({
      type: type || 'consultation',
      title: `Cita online — ${client_name}`,
      date,
      start_time,
      end_time,
      duration_minutes: 60,
      store_id,
      client_id: clientId,
      status: 'scheduled',
      notes: notes || null,
      source: 'online',
    })
    .select()
    .single()

  if (error || !appointment) {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }

  return NextResponse.json({
    success: true,
    appointment_id: appointment.id,
    message: 'Cita reservada correctamente',
  })
  } catch (err) {
    console.error('[appointments/POST]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
