'use server'

import { protectedAction, type AdminClient } from '@/lib/server/action-wrapper'
import { success, failure } from '@/lib/errors'
import { getBusinessHours, isSlotBlocked, type ScheduleBlockLike } from '@/lib/schedule-utils'
import { resolveClientIdsForSearch } from '@/lib/server/query-helpers'
import { normalizeSearchTerm } from '@/lib/utils'

/**
 * Devuelve el bloqueo de agenda activo que choca con la franja indicada, o
 * null si está libre. Filtra por fecha + alcance de tienda (la tienda concreta
 * y los bloqueos "Todas" = store_id NULL) y delega la lógica de solapamiento en
 * `isSlotBlocked` (misma fuente que el flujo público). Bloqueo duro: las
 * acciones que crean/mueven citas rechazan si esto devuelve un bloqueo.
 */
async function findBlockingScheduleBlock(
  adminClient: AdminClient,
  date: string,
  storeId: string | null | undefined,
  startTime: string,
  endTime: string,
): Promise<(ScheduleBlockLike & { title: string }) | null> {
  let q = adminClient
    .from('schedule_blocks')
    .select('title, all_day, start_time, end_time')
    .eq('block_date', date)
    .eq('is_active', true)
  // Alcance: bloqueos de la tienda concreta + los de "Todas" (store_id NULL).
  // Sin tienda en la cita, sólo aplican los de "Todas".
  q = storeId ? q.or(`store_id.eq.${storeId},store_id.is.null`) : q.is('store_id', null)
  const { data } = await q
  const blocks = (data || []) as (ScheduleBlockLike & { title: string })[]
  return isSlotBlocked(blocks, startTime, endTime)
}

const APPOINTMENT_TYPE_ES: Record<string, string> = {
  fitting: 'Prueba',
  measurement: 'Toma de medidas',
  delivery: 'Entrega',
  consultation: 'Consulta',
  pickup: 'Recogida',
  other: 'Cita',
}

/** Descripción legible de una cita para auditoría: "Prueba · Cliente: Juan Pérez · 2026-06-20 10:00". */
function describeAppointment(row: unknown): string {
  const r = (row ?? {}) as Record<string, unknown>
  const clientName = (r.clients as { full_name?: string } | null)?.full_name
    || (typeof r.client_name === 'string' && r.client_name.trim() ? r.client_name : '')
    || (typeof r.title === 'string' && r.title.trim() ? r.title : '')
    || 'Sin cliente'
  const tipo = typeof r.type === 'string' ? (APPOINTMENT_TYPE_ES[r.type] ?? r.type) : 'Cita'
  const fecha = typeof r.date === 'string' ? r.date : ''
  const hora = typeof r.start_time === 'string' ? r.start_time.slice(0, 5) : ''
  const cuando = [fecha, hora].filter(Boolean).join(' ')
  return `${tipo} · Cliente: ${clientName}${cuando ? ` · ${cuando}` : ''}`
}

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

export const findNextAppointmentByClient = protectedAction<{ query: string }, {
  appointment: { id: string; date: string; start_time: string; type: string; title: string; client_name: string } | null
  hasPastOnly: boolean
}>(
  { permission: 'calendar.view', auditModule: 'calendar' },
  async (ctx, { query }) => {
    const term = (query || '').trim()
    if (!term) return success({ appointment: null, hasPastOnly: false })

    const { data, error } = await ctx.adminClient
      .from('appointments')
      .select('id, type, title, date, start_time, status, clients!inner(id, full_name)')
      .ilike('clients.full_name', `%${term}%`)
      .neq('status', 'cancelled')
      .order('date', { ascending: true })
      .order('start_time', { ascending: true })

    if (error) return failure(error.message)
    if (!data || data.length === 0) return success({ appointment: null, hasPastOnly: false })

    const today = new Date().toISOString().slice(0, 10)
    const nowTime = new Date().toTimeString().slice(0, 5)
    const rows = data as Array<Record<string, unknown>>
    const upcoming = rows.find((a) => {
      const d = String(a.date)
      const t = String(a.start_time || '').slice(0, 5)
      return d > today || (d === today && t >= nowTime)
    })

    if (upcoming) {
      const client = upcoming.clients as Record<string, unknown> | null
      return success({
        appointment: {
          id: String(upcoming.id),
          date: String(upcoming.date),
          start_time: String(upcoming.start_time || '').slice(0, 5),
          type: String(upcoming.type),
          title: String(upcoming.title),
          client_name: String(client?.full_name ?? ''),
        },
        hasPastOnly: false,
      })
    }
    return success({ appointment: null, hasPastOnly: true })
  }
)

const CALENDAR_EDIT_PERMISSIONS = ['calendar.edit', 'calendar.update'] as string[]
const CALENDAR_CANCEL_PERMISSIONS = ['calendar.edit', 'calendar.update', 'calendar.delete'] as string[]

/**
 * Buscador de cliente del diálogo de cita. Unifica con el buscador CENTRAL:
 * tokeniza `clients.search_text` (unaccent + AND por token) con fallback difuso,
 * igual que pedidos/reservas/tickets tras el fix multi-palabra. Antes hacía un
 * ILIKE contiguo solo sobre full_name → fallaba con typo leve / orden / acentos
 * (un cliente dado de alta salía como "sin dar de alta"). Gated con el MISMO
 * permiso que crear cita → no amplía el acceso a clientes.
 */
export const searchClientsForAppointment = protectedAction<
  { term: string },
  { id: string; full_name: string; client_code: string }[]
>(
  { permission: CALENDAR_EDIT_PERMISSIONS, auditModule: 'calendar' },
  async (ctx, { term }) => {
    const safe = normalizeSearchTerm(term || '')
    if (safe.length < 2) return success([])
    const ids = await resolveClientIdsForSearch(ctx.adminClient, safe)
    if (ids.length === 0) return success([])
    // `ids` viene por relevancia (fuzzy: score desc; token: orden BD). Cogemos el
    // top y PRESERVAMOS ese orden al pintar (el `.in` de PostgREST no lo respeta),
    // para que un match difuso salga arriba y no lo tape un orden alfabético.
    const idsTop = ids.slice(0, 30)
    const { data, error } = await ctx.adminClient
      .from('clients')
      .select('id, full_name, client_code')
      .in('id', idsTop)
      .eq('is_active', true)
    if (error) return failure(error.message)
    const rank = new Map(idsTop.map((id, i) => [id, i]))
    const rows = (data ?? [])
      .slice()
      .sort(
        (a: { id: string }, b: { id: string }) =>
          (rank.get(String(a.id)) ?? Number.MAX_SAFE_INTEGER) - (rank.get(String(b.id)) ?? Number.MAX_SAFE_INTEGER),
      )
      .slice(0, 8)
    return success(
      rows.map((c: { id: string; full_name: string | null; client_code: string | null }) => ({
        id: String(c.id),
        full_name: c.full_name ?? '',
        client_code: c.client_code ?? '',
      })),
    )
  }
)

export const createAppointment = protectedAction<Record<string, unknown>, unknown>(
  {
    permission: CALENDAR_EDIT_PERMISSIONS,
    auditModule: 'calendar',
    auditAction: 'create',
    auditEntity: 'appointment',
    revalidate: ['/admin/calendario', '/sastre/calendario'],
  },
  async (ctx, input) => {
    const startTime = String(input.start_time || '10:00')
    const durationMinutes = Number(input.duration_minutes) || 60
    const [hours, minutes] = startTime.split(':').map(Number)
    const endDate = new Date(2000, 0, 1, hours, minutes + durationMinutes)
    const end_time = `${endDate.getHours().toString().padStart(2, '0')}:${endDate.getMinutes().toString().padStart(2, '0')}`

    // Bloqueo duro: no se puede agendar en una franja bloqueada (la banda del
    // grid era sólo visual; aquí se valida en servidor).
    const blocked = await findBlockingScheduleBlock(ctx.adminClient, input.date as string, input.store_id as string | null, startTime, end_time)
    if (blocked) {
      return failure(`Esa franja está bloqueada: ${blocked.title}. No se puede agendar.`)
    }

    // El mismo sastre no puede tener dos citas solapadas.
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
        return failure(`El sastre ya tiene una cita: ${conflicts.map((c: Record<string, unknown>) => `${c.title} (${String(c.start_time).slice(0, 5)}-${String(c.end_time).slice(0, 5)})`).join(', ')}`)
      }
    }

    // Aforo de la tienda: hasta 2 citas solapadas en el mismo sitio (se bloquea la 3ª).
    const STORE_CAPACITY = 2
    if (input.store_id) {
      const { count } = await ctx.adminClient
        .from('appointments')
        .select('id', { count: 'exact', head: true })
        .eq('date', input.date as string)
        .eq('store_id', input.store_id as string)
        .neq('status', 'cancelled')
        .lt('start_time', end_time)
        .gt('end_time', startTime)

      if ((count ?? 0) >= STORE_CAPACITY) {
        return failure(`Esa franja ya tiene ${STORE_CAPACITY} citas en esta tienda. Elige otra hora o tienda.`)
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
        client_name: input.client_id ? null : ((input.client_name as string)?.trim() || null),
        order_id: input.order_id || null,
        notes: input.notes || null,
        status: 'scheduled',
        created_by: ctx.userId,
      })
      .select(`*, clients(full_name), profiles!appointments_tailor_id_fkey(full_name), stores(name)`)
      .single()

    if (error) return failure(error.message)
    return success({ ...(data as Record<string, unknown>), auditDescription: describeAppointment(data) })
  }
)

export const updateAppointment = protectedAction<{ id: string; data: Record<string, unknown> }, unknown>(
  {
    permission: CALENDAR_EDIT_PERMISSIONS,
    auditModule: 'calendar',
    auditAction: 'update',
    auditEntity: 'appointment',
    revalidate: ['/admin/calendario', '/sastre/calendario'],
  },
  async (ctx, { id, data: input }) => {
    // Si el update cambia fecha u hora, validar contra bloqueos (bloqueo duro).
    // Se carga la cita actual para completar los campos que no vengan en el input.
    if (input.date || input.start_time) {
      const { data: current } = await ctx.adminClient
        .from('appointments')
        .select('date, start_time, duration_minutes, store_id')
        .eq('id', id)
        .single()
      if (current) {
        const date = String(input.date ?? current.date)
        const startTime = String(input.start_time ?? current.start_time).slice(0, 5)
        const duration = Number(input.duration_minutes ?? current.duration_minutes) || 60
        const [h, mi] = startTime.split(':').map(Number)
        const ed = new Date(2000, 0, 1, h, mi + duration)
        const endTime = `${ed.getHours().toString().padStart(2, '0')}:${ed.getMinutes().toString().padStart(2, '0')}`
        const storeId = (input.store_id ?? current.store_id) as string | null
        const blocked = await findBlockingScheduleBlock(ctx.adminClient, date, storeId, startTime, endTime)
        if (blocked) {
          return failure(`Esa franja está bloqueada: ${blocked.title}. No se puede cambiar la cita a esa franja.`)
        }
      }
    }

    const updateData: Record<string, unknown> = { ...input }

    if ('client_id' in updateData || 'client_name' in updateData) {
      updateData.client_name = updateData.client_id
        ? null
        : ((updateData.client_name as string)?.trim() || null)
    }

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
    return success({ ...(data as Record<string, unknown>), auditDescription: describeAppointment(data) })
  }
)

export const cancelAppointment = protectedAction<{ id: string; reason?: string }, unknown>(
  {
    permission: CALENDAR_CANCEL_PERMISSIONS,
    auditModule: 'calendar',
    auditAction: 'state_change',
    auditEntity: 'appointment',
    revalidate: ['/admin/calendario', '/sastre/calendario'],
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
      .select(`*, clients(full_name)`)
      .single()

    if (error) return failure(error.message)
    return success({ ...(data as Record<string, unknown>), auditDescription: `Cancelada · ${describeAppointment(data)}` })
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
    revalidate: ['/admin/calendario', '/sastre/calendario'],
  },
  async (ctx, { id, new_date, new_start_time, new_tailor_id }) => {
    const { data: current } = await ctx.adminClient
      .from('appointments')
      .select('duration_minutes, tailor_id, store_id')
      .eq('id', id)
      .single()

    if (!current) return failure('Cita no encontrada')

    const [hours, minutes] = new_start_time.split(':').map(Number)
    const endDate = new Date(2000, 0, 1, hours, minutes + (current.duration_minutes as number))
    const new_end_time = `${endDate.getHours().toString().padStart(2, '0')}:${endDate.getMinutes().toString().padStart(2, '0')}`

    // Bloqueo duro: no se puede mover una cita a una franja bloqueada.
    const blocked = await findBlockingScheduleBlock(ctx.adminClient, new_date, current.store_id as string | null, new_start_time, new_end_time)
    if (blocked) {
      return failure(`Esa franja está bloqueada: ${blocked.title}. No se puede mover la cita ahí.`)
    }

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
    return success({ ...(data as Record<string, unknown>), auditDescription: describeAppointment(data) })
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
    revalidate: ['/admin/calendario', '/sastre/calendario'],
  },
  async (ctx, { id, status }) => {
    const { data, error } = await ctx.adminClient
      .from('appointments')
      .update({ status })
      .eq('id', id)
      .select(`*, clients(full_name)`)
      .single()

    if (error) return failure(error.message)
    const attLabel: Record<string, string> = { completed: 'Asistió', no_show: 'No asistió', scheduled: 'Reprogramada' }
    return success({ ...(data as Record<string, unknown>), auditDescription: `${attLabel[status] ?? status} · ${describeAppointment(data)}` })
  }
)

export const getTailorAvailability = protectedAction<{
  tailor_id: string
  date: string
}, unknown>(
  { permission: 'calendar.view', auditModule: 'calendar' },
  async (ctx, { tailor_id, date }) => {
    const hours = getBusinessHours(date)
    if (!hours) return success({ openTime: null, closeTime: null, slots: [], appointments: [], closed: true })
    const openTime = hours.open
    const closeTime = hours.close

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
