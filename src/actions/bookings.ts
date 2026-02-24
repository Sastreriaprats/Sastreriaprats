'use server'

import { createServerSupabaseClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { success, failure } from '@/lib/errors'

export async function bookAppointment(input: {
  date: string
  start_time: string
  store_id: string
  type: string
  notes?: string
}) {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return failure('Debes iniciar sesión para reservar una cita')

  const admin = createAdminClient()

  // Buscar el registro de cliente vinculado a este usuario
  const { data: client } = await admin
    .from('clients')
    .select('id, first_name, last_name, email, phone')
    .eq('profile_id', user.id)
    .single()

  if (!client) {
    return failure('No encontramos tu perfil de cliente. Contacta con nosotros en info@sastreriaprats.com')
  }

  // Calcular end_time (+60 min)
  const [h, m] = input.start_time.split(':').map(Number)
  const endDate = new Date(2000, 0, 1, h, m + 60)
  const end_time = `${endDate.getHours().toString().padStart(2, '0')}:${endDate.getMinutes().toString().padStart(2, '0')}`

  // Verificar conflictos
  const { data: conflicts } = await admin
    .from('appointments')
    .select('id')
    .eq('date', input.date)
    .eq('store_id', input.store_id)
    .neq('status', 'cancelled')
    .lt('start_time', end_time)
    .gt('end_time', input.start_time)

  if (conflicts && conflicts.length > 0) {
    return failure('Ese horario ya no está disponible. Por favor selecciona otro.')
  }

  const typeTitle: Record<string, string> = {
    fitting: 'Prueba de sastrería',
    delivery: 'Entrega de pedido',
    consultation: 'Consulta / Primera visita',
    boutique: 'Cita boutique',
    other: 'Otro',
  }

  const { data, error } = await admin
    .from('appointments')
    .insert({
      type: input.type,
      title: typeTitle[input.type] || 'Cita',
      date: input.date,
      start_time: input.start_time,
      end_time,
      duration_minutes: 60,
      store_id: input.store_id,
      client_id: client.id,
      notes: input.notes || null,
      status: 'scheduled',
      source: 'online',
    })
    .select()
    .single()

  if (error) return failure(error.message)
  return success(data)
}

export async function cancelClientAppointment(appointmentId: string) {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return failure('Debes iniciar sesión')

  const admin = createAdminClient()

  // Verificar que la cita pertenece al cliente
  const { data: client } = await admin
    .from('clients')
    .select('id')
    .eq('profile_id', user.id)
    .single()

  if (!client) return failure('Perfil de cliente no encontrado')

  const { data: appt } = await admin
    .from('appointments')
    .select('id, status, date')
    .eq('id', appointmentId)
    .eq('client_id', client.id)
    .single()

  if (!appt) return failure('Cita no encontrada')
  if (appt.status === 'cancelled') return failure('La cita ya está cancelada')

  const today = new Date().toISOString().split('T')[0]
  if (appt.date < today) return failure('No puedes cancelar una cita pasada')

  const { error } = await admin
    .from('appointments')
    .update({
      status: 'cancelled',
      cancellation_reason: 'Cancelada por el cliente desde la web',
      cancelled_at: new Date().toISOString(),
    })
    .eq('id', appointmentId)

  if (error) return failure(error.message)
  return success({ cancelled: true })
}

export async function getClientAppointmentsWeb() {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return failure('Debes iniciar sesión')

  const admin = createAdminClient()

  const { data: client } = await admin
    .from('clients')
    .select('id')
    .eq('profile_id', user.id)
    .single()

  if (!client) return success([])

  const { data, error } = await admin
    .from('appointments')
    .select('id, type, title, date, start_time, end_time, status, notes, stores(name)')
    .eq('client_id', client.id)
    .order('date', { ascending: false })

  if (error) return failure(error.message)
  return success(data || [])
}
