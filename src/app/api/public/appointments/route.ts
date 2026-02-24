import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const date = searchParams.get('date')
  const storeId = searchParams.get('store_id')

  if (!date || !storeId) {
    return NextResponse.json({ error: 'date and store_id required' }, { status: 400 })
  }

  const admin = createAdminClient()

  const { data: existing } = await admin
    .from('appointments')
    .select('start_time, end_time')
    .eq('date', date)
    .eq('store_id', storeId)
    .neq('status', 'cancelled')

  const openH = 10
  const closeH = 20
  const slots: { time: string; available: boolean }[] = []

  for (let h = openH; h < closeH; h++) {
    const timeStr = `${h.toString().padStart(2, '0')}:00`
    const endStr = `${(h + 1).toString().padStart(2, '0')}:00`
    const conflict = (existing || []).find(
      (a: Record<string, unknown>) => String(a.start_time) < endStr && String(a.end_time) > timeStr
    )
    slots.push({ time: timeStr, available: !conflict })
  }

  return NextResponse.json({ date, store_id: storeId, slots })
}

export async function POST(request: NextRequest) {
  const body = await request.json()
  const { date, start_time, store_id, client_name, client_email, client_phone, type, notes } = body

  if (!date || !start_time || !store_id || !client_name || !client_email) {
    return NextResponse.json(
      { error: 'Campos obligatorios: date, start_time, store_id, client_name, client_email' },
      { status: 400 }
    )
  }

  const admin = createAdminClient()

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

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({
    success: true,
    appointment_id: appointment.id,
    message: 'Cita reservada correctamente',
  })
}
