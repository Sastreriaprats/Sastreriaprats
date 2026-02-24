'use server'

import { protectedAction } from '@/lib/server/action-wrapper'
import { success, failure } from '@/lib/errors'

export const listAppointments = protectedAction<{
  start_date: string
  end_date: string
  store_id?: string
  tailor_id?: string
}, unknown[]>(
  { permission: 'calendar.view', auditModule: 'calendar' },
  async (ctx, { start_date, end_date, store_id, tailor_id }) => {
    let query = ctx.adminClient
      .from('appointments')
      .select(`
        *,
        clients ( id, full_name, phone, email ),
        profiles!appointments_tailor_id_fkey ( id, full_name ),
        stores ( id, name, code ),
        tailoring_orders ( id, order_number )
      `)
      .gte('date', start_date)
      .lte('date', end_date)
      .order('date')
      .order('start_time')

    if (store_id) query = query.eq('store_id', store_id)
    if (tailor_id) query = query.eq('tailor_id', tailor_id)

    const { data, error } = await query
    if (error) return failure(error.message)
    return success(data || [])
  }
)

const CALENDAR_EDIT_PERMISSIONS = ['calendar.edit', 'calendar.update'] as string[]
const CALENDAR_CANCEL_PERMISSIONS = ['calendar.edit', 'calendar.update', 'calendar.delete'] as string[]

export const createAppointment = protectedAction<Record<string, unknown>, unknown>(
  {
    permission: CALENDAR_EDIT_PERMISSIONS,
    auditModule: 'calendar',
    auditAction: 'create',
    auditEntity: 'appointment',
    revalidate: ['/admin/calendario'],
  },
  async (ctx, input) => {
    const startTime = String(input.start_time || '10:00')
    const durationMinutes = Number(input.duration_minutes) || 60
    const [hours, minutes] = startTime.split(':').map(Number)
    const endDate = new Date(2000, 0, 1, hours, minutes + durationMinutes)
    const end_time = `${endDate.getHours().toString().padStart(2, '0')}:${endDate.getMinutes().toString().padStart(2, '0')}`

    if (input.tailor_id) {
      const { data: conflicts } = await ctx.adminClient
        .from('appointments')
        .select('id, title, start_time, end_time')
        .eq('date', input.date as string)
        .neq('status', 'cancelled')
        .eq('tailor_id', input.tailor_id as string)
        .lt('start_time', end_time)
        .gt('end_time', startTime)

      if (conflicts && conflicts.length > 0) {
        return failure(`Conflicto de horario con: ${conflicts.map((c: Record<string, unknown>) => `${c.title} (${String(c.start_time).slice(0, 5)}-${String(c.end_time).slice(0, 5)})`).join(', ')}`)
      }
    }

    const { data, error } = await ctx.adminClient
      .from('appointments')
      .insert({
        type: input.type,
        title: input.title,
        description: input.description || null,
        date: input.date,
        start_time: startTime,
        end_time,
        duration_minutes: durationMinutes,
        store_id: input.store_id,
        tailor_id: input.tailor_id || null,
        client_id: input.client_id || null,
        order_id: input.order_id || null,
        notes: input.notes || null,
        status: 'scheduled',
        created_by: ctx.userId,
      })
      .select(`*, clients(full_name), profiles!appointments_tailor_id_fkey(full_name), stores(name)`)
      .single()

    if (error) return failure(error.message)
    return success(data)
  }
)

export const updateAppointment = protectedAction<{ id: string; data: Record<string, unknown> }, unknown>(
  {
    permission: CALENDAR_EDIT_PERMISSIONS,
    auditModule: 'calendar',
    auditAction: 'update',
    auditEntity: 'appointment',
    revalidate: ['/admin/calendario'],
  },
  async (ctx, { id, data: input }) => {
    const updateData: Record<string, unknown> = { ...input }

    if (input.start_time && input.duration_minutes) {
      const [hours, minutes] = String(input.start_time).split(':').map(Number)
      const endDate = new Date(2000, 0, 1, hours, minutes + Number(input.duration_minutes))
      updateData.end_time = `${endDate.getHours().toString().padStart(2, '0')}:${endDate.getMinutes().toString().padStart(2, '0')}`
    }

    const { data, error } = await ctx.adminClient
      .from('appointments')
      .update(updateData)
      .eq('id', id)
      .select(`*, clients(full_name), profiles!appointments_tailor_id_fkey(full_name), stores(name)`)
      .single()

    if (error) return failure(error.message)
    return success(data)
  }
)

export const cancelAppointment = protectedAction<{ id: string; reason?: string }, unknown>(
  {
    permission: CALENDAR_CANCEL_PERMISSIONS,
    auditModule: 'calendar',
    auditAction: 'state_change',
    auditEntity: 'appointment',
    revalidate: ['/admin/calendario'],
  },
  async (ctx, { id, reason }) => {
    const { data, error } = await ctx.adminClient
      .from('appointments')
      .update({
        status: 'cancelled',
        cancellation_reason: reason || null,
        cancelled_at: new Date().toISOString(),
        cancelled_by: ctx.userId,
      })
      .eq('id', id)
      .select()
      .single()

    if (error) return failure(error.message)
    return success(data)
  }
)

export const moveAppointment = protectedAction<{
  id: string
  new_date: string
  new_start_time: string
  new_tailor_id?: string
}, unknown>(
  {
    permission: CALENDAR_EDIT_PERMISSIONS,
    auditModule: 'calendar',
    auditAction: 'update',
    auditEntity: 'appointment',
    revalidate: ['/admin/calendario'],
  },
  async (ctx, { id, new_date, new_start_time, new_tailor_id }) => {
    const { data: current } = await ctx.adminClient
      .from('appointments')
      .select('duration_minutes, tailor_id')
      .eq('id', id)
      .single()

    if (!current) return failure('Cita no encontrada')

    const [hours, minutes] = new_start_time.split(':').map(Number)
    const endDate = new Date(2000, 0, 1, hours, minutes + (current.duration_minutes as number))
    const new_end_time = `${endDate.getHours().toString().padStart(2, '0')}:${endDate.getMinutes().toString().padStart(2, '0')}`

    const tailorId = new_tailor_id || (current.tailor_id as string | null)

    if (tailorId) {
      const { data: conflicts } = await ctx.adminClient
        .from('appointments')
        .select('id')
        .eq('date', new_date)
        .neq('id', id)
        .neq('status', 'cancelled')
        .eq('tailor_id', tailorId)
        .lt('start_time', new_end_time)
        .gt('end_time', new_start_time)

      if (conflicts && conflicts.length > 0) {
        return failure('Conflicto de horario en la nueva posición')
      }
    }

    const { data, error } = await ctx.adminClient
      .from('appointments')
      .update({
        date: new_date,
        start_time: new_start_time,
        end_time: new_end_time,
        ...(new_tailor_id ? { tailor_id: new_tailor_id } : {}),
      })
      .eq('id', id)
      .select(`*, clients(full_name), profiles!appointments_tailor_id_fkey(full_name)`)
      .single()

    if (error) return failure(error.message)
    return success(data)
  }
)

export const listClientAppointments = protectedAction<{ client_id: string }, unknown[]>(
  { permission: 'calendar.view', auditModule: 'calendar' },
  async (ctx, { client_id }) => {
    const { data, error } = await ctx.adminClient
      .from('appointments')
      .select(`
        id, type, title, date, start_time, end_time, duration_minutes,
        status, source, notes, created_at,
        profiles!appointments_tailor_id_fkey ( full_name ),
        stores ( name )
      `)
      .eq('client_id', client_id)
      .order('date', { ascending: false })
      .order('start_time', { ascending: false })

    if (error) return failure(error.message)
    return success(data || [])
  }
)

export const markAttendance = protectedAction<{ id: string; status: 'completed' | 'no_show' | 'scheduled' }, unknown>(
  {
    permission: CALENDAR_EDIT_PERMISSIONS,
    auditModule: 'calendar',
    auditAction: 'state_change',
    auditEntity: 'appointment',
    revalidate: ['/admin/calendario'],
  },
  async (ctx, { id, status }) => {
    const { data, error } = await ctx.adminClient
      .from('appointments')
      .update({ status })
      .eq('id', id)
      .select()
      .single()

    if (error) return failure(error.message)
    return success(data)
  }
)

export const getTailorAvailability = protectedAction<{
  tailor_id: string
  date: string
}, unknown>(
  { permission: 'calendar.view', auditModule: 'calendar' },
  async (ctx, { tailor_id, date }) => {
    const openTime = '09:00'
    const closeTime = '20:00'

    const { data: appointments } = await ctx.adminClient
      .from('appointments')
      .select('start_time, end_time, duration_minutes, title')
      .eq('tailor_id', tailor_id)
      .eq('date', date)
      .neq('status', 'cancelled')
      .order('start_time')

    const slots: { time: string; available: boolean; appointment?: unknown }[] = []
    const [openH] = openTime.split(':').map(Number)
    const [closeH] = closeTime.split(':').map(Number)

    for (let h = openH; h < closeH; h++) {
      for (let m = 0; m < 60; m += 30) {
        const timeStr = `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`
        const endStr = m === 30
          ? `${(h + 1).toString().padStart(2, '0')}:00`
          : `${h.toString().padStart(2, '0')}:30`

        const conflict = (appointments || []).find(
          (a: Record<string, unknown>) => String(a.start_time) < endStr && String(a.end_time) > timeStr
        )
        slots.push({
          time: timeStr,
          available: !conflict,
          appointment: conflict || undefined,
        })
      }
    }

    return success({ openTime, closeTime, slots, appointments: appointments || [] })
  }
)
