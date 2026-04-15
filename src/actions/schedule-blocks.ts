'use server'

import { protectedAction } from '@/lib/server/action-wrapper'
import { success, failure } from '@/lib/errors'

export interface ScheduleBlock {
  id: string
  store_id: string | null
  title: string
  reason: string | null
  block_date: string
  all_day: boolean
  start_time: string | null
  end_time: string | null
  is_active: boolean
  created_at: string
  store_name?: string | null
}

export const listScheduleBlocks = protectedAction<{ from_date?: string; store_id?: string }, ScheduleBlock[]>(
  { auditModule: 'calendar' },
  async (ctx, { from_date, store_id }) => {
    const today = from_date || new Date().toISOString().split('T')[0]
    let query = ctx.adminClient
      .from('schedule_blocks')
      .select('*, stores ( name )')
      .eq('is_active', true)
      .gte('block_date', today)
      .order('block_date')
      .limit(100)

    if (store_id) {
      query = query.or(`store_id.eq.${store_id},store_id.is.null`)
    }

    const { data, error } = await query
    if (error) return failure(error.message)

    const blocks: ScheduleBlock[] = ((data || []) as Record<string, unknown>[]).map(b => ({
      id: String(b.id),
      store_id: b.store_id as string | null,
      title: String(b.title),
      reason: b.reason as string | null,
      block_date: String(b.block_date),
      all_day: Boolean(b.all_day),
      start_time: b.start_time ? String(b.start_time).slice(0, 5) : null,
      end_time: b.end_time ? String(b.end_time).slice(0, 5) : null,
      is_active: Boolean(b.is_active),
      created_at: String(b.created_at),
      store_name: (b.stores as Record<string, unknown> | null)?.name as string | null,
    }))

    return success(JSON.parse(JSON.stringify(blocks)))
  }
)

export const createScheduleBlock = protectedAction<{
  title: string
  reason?: string
  block_date: string
  all_day: boolean
  start_time?: string
  end_time?: string
  store_id?: string
}, unknown>(
  {
    permission: ['calendar.edit', 'calendar.update'],
    auditModule: 'calendar',
    auditAction: 'create',
    auditEntity: 'schedule_block',
    revalidate: ['/admin/calendario'],
  },
  async (ctx, input) => {
    const { data, error } = await ctx.adminClient
      .from('schedule_blocks')
      .insert({
        title: input.title,
        reason: input.reason || null,
        block_date: input.block_date,
        all_day: input.all_day,
        start_time: input.all_day ? null : input.start_time || null,
        end_time: input.all_day ? null : input.end_time || null,
        store_id: input.store_id || null,
        created_by: ctx.userId,
      })
      .select()
      .single()

    if (error) return failure(error.message)
    return success(data)
  }
)

export const deleteScheduleBlock = protectedAction<{ id: string }, unknown>(
  {
    permission: ['calendar.edit', 'calendar.delete'],
    auditModule: 'calendar',
    auditAction: 'delete',
    auditEntity: 'schedule_block',
    revalidate: ['/admin/calendario'],
  },
  async (ctx, { id }) => {
    const { error } = await ctx.adminClient
      .from('schedule_blocks')
      .update({ is_active: false })
      .eq('id', id)

    if (error) return failure(error.message)
    return success({ deleted: true })
  }
)

/**
 * Consulta pública (sin auth) para verificar bloqueos de una fecha/tienda.
 * Usada por el endpoint de reservas públicas.
 */
export async function getBlocksForDate(adminClient: ReturnType<typeof import('@/lib/supabase/admin').createAdminClient>, date: string, storeId?: string) {
  let query = adminClient
    .from('schedule_blocks')
    .select('id, all_day, start_time, end_time, store_id')
    .eq('block_date', date)
    .eq('is_active', true)

  if (storeId) {
    query = query.or(`store_id.eq.${storeId},store_id.is.null`)
  }

  const { data } = await query
  return (data || []) as { id: string; all_day: boolean; start_time: string | null; end_time: string | null; store_id: string | null }[]
}
