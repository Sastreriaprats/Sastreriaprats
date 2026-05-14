'use server'

import { protectedAction } from '@/lib/server/action-wrapper'
import { success, failure } from '@/lib/errors'
import type { ListParams, ListResult } from '@/lib/server/query-helpers'
import { normalizeSearchTerm } from '@/lib/utils'
import type {
  AlterationStatus,
  AlterationType,
  AlterationWithRelations,
  CreateAlterationInput,
  UpdateAlterationInput,
} from '@/types/alterations'

// NOTA: este archivo es `'use server'`. Solo debe exportar funciones async.
// Los re-exports de tipo (`export type { ... }`) NO se eliden de forma fiable
// por el loader de Server Actions de Next y provocan `ReferenceError` en
// runtime. Si necesitas un tipo, impórtalo directamente desde `@/types/alterations`.

const SELECT_ALTERATIONS = `
  id, alteration_number, client_id, phone, garment_type,
  official_id, official_name, description,
  alteration_date, workshop_sent_date, client_delivery_date,
  status, notes,
  store_id, created_by, created_at, updated_at,
  tailoring_order_id, sale_id, alteration_type, estimated_completion,
  clients ( id, full_name, phone ),
  official:officials ( id, name ),
  tailoring_orders ( id, order_number ),
  stores ( id, name )
`

// ─── listAlterations ────────────────────────────────────────────────────────

export const listAlterations = protectedAction<
  ListParams & {
    clientId?: string
    status?: AlterationStatus | 'all'
    alterationType?: AlterationType | 'all'
    alteration_type?: AlterationType | 'all'
    from?: string
    to?: string
  },
  ListResult<AlterationWithRelations> & { statusCounts: Record<string, number> }
>(
  { permission: 'clients.view', auditModule: 'alterations' },
  async (ctx, params) => {
    const page = params.page || 1
    const pageSize = params.pageSize || 25
    const fromIdx = (page - 1) * pageSize
    const toIdx = fromIdx + pageSize - 1

    let query = ctx.adminClient
      .from('alterations')
      .select(SELECT_ALTERATIONS, { count: 'exact' })

    if (params.clientId) query = query.eq('client_id', params.clientId)
    if (params.storeId) query = query.eq('store_id', params.storeId)

    const status = params.filters?.status ?? params.status
    if (status && status !== 'all') query = query.eq('status', status)

    const altType = params.filters?.alteration_type ?? params.alterationType ?? params.alteration_type
    if (altType && altType !== 'all') query = query.eq('alteration_type', altType)

    if (params.from) query = query.gte('alteration_date', params.from)
    if (params.to) query = query.lte('alteration_date', params.to)

    if (params.search) {
      const term = normalizeSearchTerm(params.search)
      if (term) {
        // Búsqueda por número de arreglo (siempre ASCII) o descripción.
        query = query.or(`alteration_number.ilike.%${term}%,description.ilike.%${term}%`)
      }
    }

    query = query.order(params.sortBy || 'alteration_date', { ascending: params.sortOrder === 'asc' })
    query = query.order('alteration_number', { ascending: false })

    const { data, count, error } = await query.range(fromIdx, toIdx)
    if (error) {
      console.error('[listAlterations]', error)
      return failure(error.message)
    }

    // Status counts (sin filtros de status para que el sidebar pueda mostrar todo)
    let countsQuery = ctx.adminClient.from('alterations').select('status')
    if (params.clientId) countsQuery = countsQuery.eq('client_id', params.clientId)
    if (params.storeId) countsQuery = countsQuery.eq('store_id', params.storeId)
    const { data: countsRaw } = await countsQuery
    const statusCounts: Record<string, number> = {}
    for (const row of countsRaw || []) {
      const s = (row as { status: string }).status
      statusCounts[s] = (statusCounts[s] || 0) + 1
    }

    const total = count ?? 0
    return success({
      data: (data || []) as unknown as AlterationWithRelations[],
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
      statusCounts,
    })
  }
)

// ─── getAlteration ─────────────────────────────────────────────────────────

export const getAlteration = protectedAction<{ id: string }, AlterationWithRelations | null>(
  { permission: 'clients.view', auditModule: 'alterations' },
  async (ctx, { id }) => {
    const { data, error } = await ctx.adminClient
      .from('alterations')
      .select(SELECT_ALTERATIONS)
      .eq('id', id)
      .maybeSingle()
    if (error) {
      console.error('[getAlteration]', error)
      return failure(error.message)
    }
    return success(data as unknown as AlterationWithRelations | null)
  }
)

// ─── createAlteration ──────────────────────────────────────────────────────

export const createAlteration = protectedAction<
  CreateAlterationInput,
  { id: string; alteration_number: string }
>(
  {
    permission: 'clients.view',
    auditModule: 'alterations',
    auditAction: 'create',
    auditEntity: 'alteration',
    revalidate: ['/sastre/arreglos', '/admin/clientes'],
  },
  async (ctx, input) => {
    if (!input.client_id) return failure('Cliente requerido', 'VALIDATION')

    try {
      // Resolver nombre del oficial (snapshot) desde la tabla officials
      let officialName: string | null = null
      if (input.official_id) {
        const { data: off } = await ctx.adminClient
          .from('officials')
          .select('name')
          .eq('id', input.official_id)
          .maybeSingle()
        officialName = (off as { name?: string } | null)?.name ?? null
      }

      // Generar siguiente número
      const { data: numData, error: numErr } = await ctx.adminClient.rpc('next_alteration_number')
      if (numErr) {
        console.error('[createAlteration] next_alteration_number rpc', numErr)
        return failure(numErr.message || 'No se pudo generar número de arreglo')
      }
      const alterationNumber = String(numData)

      const insertPayload = {
        alteration_number: alterationNumber,
        client_id: input.client_id,
        phone: input.phone ?? null,
        garment_type: input.garment_type ?? null,
        official_id: input.official_id ?? null,
        official_name: officialName,
        description: input.description ?? null,
        alteration_date: input.alteration_date ?? new Date().toISOString().split('T')[0],
        notes: input.notes ?? null,
        store_id: input.store_id ?? null,
        created_by: ctx.userId,
        alteration_type: input.alteration_type ?? 'external',
        tailoring_order_id: input.tailoring_order_id ?? null,
        estimated_completion: input.estimated_completion ?? null,
        status: 'pending' as const,
      }

      const { data, error } = await ctx.adminClient
        .from('alterations')
        .insert(insertPayload)
        .select('id, alteration_number')
        .single()

      if (error) {
        console.error('[createAlteration]', error)
        return failure(error.message)
      }
      return success({
        id: String(data.id),
        alteration_number: String(data.alteration_number),
        auditDescription: `Arreglo ${data.alteration_number}`,
      } as unknown as { id: string; alteration_number: string })
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Error al crear arreglo'
      console.error('[createAlteration] exception:', err)
      return failure(msg)
    }
  }
)

// ─── updateAlteration ──────────────────────────────────────────────────────

export const updateAlteration = protectedAction<
  { id: string; data: UpdateAlterationInput },
  { ok: boolean }
>(
  {
    permission: 'clients.view',
    auditModule: 'alterations',
    auditAction: 'update',
    auditEntity: 'alteration',
    revalidate: ['/sastre/arreglos', '/admin/clientes'],
  },
  async (ctx, { id, data }) => {
    if (!id) return failure('ID requerido', 'VALIDATION')
    const updates: Record<string, unknown> = {}
    if (data.phone !== undefined) updates.phone = data.phone
    if (data.garment_type !== undefined) updates.garment_type = data.garment_type
    if (data.description !== undefined) updates.description = data.description
    if (data.alteration_date !== undefined) updates.alteration_date = data.alteration_date
    if (data.workshop_sent_date !== undefined) updates.workshop_sent_date = data.workshop_sent_date
    if (data.client_delivery_date !== undefined) updates.client_delivery_date = data.client_delivery_date
    if (data.estimated_completion !== undefined) updates.estimated_completion = data.estimated_completion
    if (data.status !== undefined) updates.status = data.status
    if (data.notes !== undefined) updates.notes = data.notes
    if (data.official_id !== undefined) {
      updates.official_id = data.official_id
      // Re-snapshot del nombre cuando cambia el oficial
      if (data.official_id) {
        const { data: off } = await ctx.adminClient
          .from('officials')
          .select('name')
          .eq('id', data.official_id)
          .maybeSingle()
        updates.official_name = (off as { name?: string } | null)?.name ?? null
      } else {
        updates.official_name = null
      }
    }

    if (Object.keys(updates).length === 0) return success({ ok: true })

    try {
      const { error } = await ctx.adminClient
        .from('alterations')
        .update(updates)
        .eq('id', id)
      if (error) {
        console.error('[updateAlteration]', error)
        return failure(error.message)
      }
      return success({ ok: true })
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Error al actualizar arreglo'
      return failure(msg)
    }
  }
)

// ─── updateAlterationStatus ───────────────────────────────────────────────
// Mantenido para compatibilidad con código existente (sastre).

export const updateAlterationStatus = protectedAction<
  { id: string; status: AlterationStatus },
  { ok: boolean }
>(
  {
    permission: 'clients.view',
    auditModule: 'alterations',
    auditAction: 'state_change',
    auditEntity: 'alteration',
    revalidate: ['/sastre/arreglos', '/admin/clientes'],
  },
  async (ctx, { id, status }) => {
    if (!id) return failure('ID requerido', 'VALIDATION')
    const updates: Record<string, unknown> = { status }
    const today = new Date().toISOString().split('T')[0]
    if (status === 'sent') updates.workshop_sent_date = today
    if (status === 'delivered') updates.client_delivery_date = today

    try {
      const { error } = await ctx.adminClient
        .from('alterations')
        .update(updates)
        .eq('id', id)
      if (error) {
        console.error('[updateAlterationStatus]', error)
        return failure(error.message)
      }
      return success({ ok: true })
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Error al cambiar estado'
      return failure(msg)
    }
  }
)

// ─── cancelAlteration ─────────────────────────────────────────────────────

export const cancelAlteration = protectedAction<{ id: string; reason?: string }, { ok: boolean }>(
  {
    permission: 'clients.view',
    auditModule: 'alterations',
    auditAction: 'state_change',
    auditEntity: 'alteration',
    revalidate: ['/sastre/arreglos', '/admin/clientes'],
  },
  async (ctx, { id, reason }) => {
    if (!id) return failure('ID requerido', 'VALIDATION')
    try {
      const updates: Record<string, unknown> = { status: 'cancelled' }
      if (reason && reason.trim()) {
        const { data: prev } = await ctx.adminClient
          .from('alterations')
          .select('notes')
          .eq('id', id)
          .maybeSingle()
        const prevNotes = ((prev as { notes?: string | null } | null)?.notes ?? '').trim()
        const stamp = new Date().toISOString().slice(0, 10)
        const line = `[${stamp}] Cancelado: ${reason.trim()}`
        updates.notes = prevNotes ? `${prevNotes}\n${line}` : line
      }
      const { error } = await ctx.adminClient.from('alterations').update(updates).eq('id', id)
      if (error) {
        console.error('[cancelAlteration]', error)
        return failure(error.message)
      }
      return success({ ok: true })
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Error al cancelar arreglo'
      return failure(msg)
    }
  }
)

// ─── deleteAlteration ─────────────────────────────────────────────────────
// DELETE físico de la fila. Irreversible. La página detalle redirige al tab
// Arreglos del cliente tras confirmar.

export const deleteAlteration = protectedAction<{ id: string }, { ok: boolean; client_id: string | null }>(
  {
    permission: 'clients.view',
    auditModule: 'alterations',
    auditAction: 'delete',
    auditEntity: 'alteration',
    revalidate: ['/sastre/arreglos', '/admin/clientes'],
  },
  async (ctx, { id }) => {
    if (!id) return failure('ID requerido', 'VALIDATION')
    try {
      // Devolvemos client_id para que el caller pueda redirigir al tab del cliente.
      const { data: prev } = await ctx.adminClient
        .from('alterations')
        .select('client_id, alteration_number')
        .eq('id', id)
        .maybeSingle()
      const clientId = (prev as { client_id?: string | null } | null)?.client_id ?? null

      const { error } = await ctx.adminClient
        .from('alterations')
        .delete()
        .eq('id', id)
      if (error) {
        console.error('[deleteAlteration]', error)
        return failure(error.message)
      }
      return success({
        ok: true,
        client_id: clientId,
        auditDescription: `Arreglo ${(prev as { alteration_number?: string } | null)?.alteration_number ?? id} eliminado permanentemente`,
      } as unknown as { ok: true; client_id: string | null })
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Error al eliminar arreglo'
      return failure(msg)
    }
  }
)

// ─── getAlterationsByOrder ────────────────────────────────────────────────

export const getAlterationsByOrder = protectedAction<
  { tailoring_order_id: string },
  AlterationWithRelations[]
>(
  { permission: 'orders.view', auditModule: 'alterations' },
  async (ctx, { tailoring_order_id }) => {
    const { data, error } = await ctx.adminClient
      .from('alterations')
      .select(SELECT_ALTERATIONS)
      .eq('tailoring_order_id', tailoring_order_id)
      .order('alteration_date', { ascending: false })
    if (error) {
      console.error('[getAlterationsByOrder]', error)
      return failure(error.message)
    }
    return success((data || []) as unknown as AlterationWithRelations[])
  }
)

