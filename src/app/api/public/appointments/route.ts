import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getPublicSlots, isDayClosed, filterBlockedSlots } from '@/lib/schedule-utils'

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

  const slots: { time: string; available: boolean }[] = []

  for (const timeStr of slotTimes) {
    const [h, m] = timeStr.split(':').map(Number)
    const endMin = h * 60 + m + 30
    const endStr = `${Math.floor(endMin / 60).toString().padStart(2, '0')}:${(endMin % 60).toString().padStart(2, '0')}`
    const conflict = (existing).find(
      (a: Record<string, unknown>) => String(a.start_time) < endStr && String(a.end_time) > timeStr
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

  // Verificar bloqueos
  const { data: blocks } = await admin
    .from('schedule_blocks')
    .select('all_day, start_time, end_time')
    .eq('block_date', date)
    .eq('is_active', true)
    .or(`store_id.eq.${store_id},store_id.is.null`)

  if (blocks && blocks.length > 0) {
    const isBlocked = blocks.some((b: Record<string, unknown>) => {
      if (b.all_day) return true
      if (!b.start_time || !b.end_time) return false
      const endH = parseInt(start_time.split(':')[0]) + 1
      const end_time_calc = `${endH.toString().padStart(2, '0')}:00`
      return String(b.start_time) < end_time_calc && String(b.end_time) > start_time
    })
    if (isBlocked) {
      return NextResponse.json({ error: 'Horario no disponible (bloqueado)' }, { status: 409 })
    }
  }

  const endH = parseInt(start_time.split(':')[0]) + 1
  const end_time = `${endH.toString().padStart(2, '0')}:00`

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
  const { data: existingClient } = await admin
    .from('clients')
    .select('id')
    .eq('email', client_email)
    .single()

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
