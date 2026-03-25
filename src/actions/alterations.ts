'use server'

import { protectedAction } from '@/lib/server/action-wrapper'
import { success, failure } from '@/lib/errors'
import type { ListParams, ListResult } from '@/lib/server/query-helpers'

// ─── Types ───────────────────────────────────────────────────────────────────

export type AlterationRow = {
  id: string
  client_id: string
  alteration_type: string
  tailoring_order_id: string | null
  sale_id: string | null
  description: string
  garment_type: string | null
  garment_description: string | null
  alteration_details: string | null
  has_cost: boolean
  cost: number
  is_included: boolean
  status: string
  estimated_completion: string | null
  completed_at: string | null
  delivered_at: string | null
  assigned_to: string | null
  store_id: string | null
  registered_by: string | null
  created_at: string
  clients: { full_name: string } | null
  tailoring_orders: { order_number: string } | null
  stores: { name: string } | null
  registered_by_profile: { full_name: string } | null
  assigned_to_profile: { full_name: string } | null
}

type AlterationStatus = 'pending' | 'in_progress' | 'completed' | 'delivered'

const SELECT_ALTERATIONS = `
  id, client_id, alteration_type, tailoring_order_id, sale_id,
  description, garment_type, garment_description, alteration_details,
  has_cost, cost, is_included, status,
  estimated_completion, completed_at, delivered_at,
  assigned_to, store_id, registered_by, created_at,
  clients ( full_name ),
  tailoring_orders ( order_number ),
  stores ( name ),
  registered_by_profile:profiles!boutique_alterations_registered_by_fkey ( full_name ),
  assigned_to_profile:profiles!boutique_alterations_assigned_to_fkey ( full_name )
`

// ─── List ────────────────────────────────────────────────────────────────────

export const listAlterations = protectedAction<
  ListParams & { status?: string; alteration_type?: string },
  ListResult<AlterationRow> & { statusCounts: Record<string, number> }
>(
  { permission: 'clients.view', auditModule: 'alterations' },
  async (ctx, params) => {
    const page = params.page || 1
    const pageSize = params.pageSize || 25
    const from = (page - 1) * pageSize
    const to = from + pageSize - 1

    let query = ctx.adminClient
      .from('boutique_alterations')
      .select(SELECT_ALTERATIONS, { count: 'exact' })

    // Filtros
    const status = params.filters?.status ?? params.status
    if (status && status !== 'all') {
      query = query.eq('status', status)
    }
    const altType = params.filters?.alteration_type ?? params.alteration_type
    if (altType && altType !== 'all') {
      query = query.eq('alteration_type', altType)
    }
    if (params.storeId) {
      query = query.eq('store_id', params.storeId)
    }
    if (params.search) {
      query = query.or(`description.ilike.%${params.search}%,clients.full_name.ilike.%${params.search}%`)
    }

    query = query.order(params.sortBy || 'created_at', { ascending: params.sortOrder === 'asc' })
    const { data, count, error } = await query.range(from, to)
    if (error) {
      console.error('[listAlterations]', error)
      return failure(error.message)
    }

    // Status counts
    const { data: countsRaw } = await ctx.adminClient
      .from('boutique_alterations')
      .select('status')
    const statusCounts: Record<string, number> = {}
    for (const row of countsRaw || []) {
      const s = (row as { status: string }).status
      statusCounts[s] = (statusCounts[s] || 0) + 1
    }

    const total = count ?? 0
    return success({
      data: (data || []) as unknown as AlterationRow[],
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
      statusCounts,
    })
  }
)

// ─── Create ──────────────────────────────────────────────────────────────────

export const createAlteration = protectedAction<
  {
    client_id: string
    alteration_type: 'order' | 'boutique' | 'external'
    tailoring_order_id?: string
    sale_id?: string
    description: string
    garment_type?: string
    garment_description?: string
    alteration_details?: string
    has_cost: boolean
    cost?: number
    is_included?: boolean
    estimated_completion?: string
    assigned_to?: string
    store_id?: string
  },
  { id: string }
>(
  { permission: 'clients.view', auditModule: 'alterations', auditAction: 'create', revalidate: ['/sastre/arreglos'] },
  async (ctx, input) => {
    const { data, error } = await ctx.adminClient
      .from('boutique_alterations')
      .insert({
        client_id: input.client_id,
        alteration_type: input.alteration_type,
        tailoring_order_id: input.tailoring_order_id || null,
        sale_id: input.sale_id || null,
        description: input.description,
        garment_type: input.garment_type || null,
        garment_description: input.garment_description || null,
        alteration_details: input.alteration_details || null,
        has_cost: input.has_cost,
        cost: input.cost ?? 0,
        is_included: input.is_included ?? false,
        estimated_completion: input.estimated_completion || null,
        assigned_to: input.assigned_to || null,
        store_id: input.store_id || null,
        registered_by: ctx.userId,
        status: 'pending',
      })
      .select('id')
      .single()

    if (error) {
      console.error('[createAlteration]', error)
      return failure(error.message)
    }
    return success({ id: data.id })
  }
)

// ─── Update Status ───────────────────────────────────────────────────────────

export const updateAlterationStatus = protectedAction<
  { id: string; status: AlterationStatus },
  { ok: boolean }
>(
  { permission: 'clients.view', auditModule: 'alterations', auditAction: 'state_change', revalidate: ['/sastre/arreglos'] },
  async (ctx, input) => {
    const updates: Record<string, unknown> = { status: input.status }
    if (input.status === 'completed') updates.completed_at = new Date().toISOString()
    if (input.status === 'delivered') updates.delivered_at = new Date().toISOString()

    const { error } = await ctx.adminClient
      .from('boutique_alterations')
      .update(updates)
      .eq('id', input.id)

    if (error) {
      console.error('[updateAlterationStatus]', error)
      return failure(error.message)
    }
    return success({ ok: true })
  }
)

// ─── Get By Order ────────────────────────────────────────────────────────────

export const getAlterationsByOrder = protectedAction<
  { tailoring_order_id: string },
  AlterationRow[]
>(
  { permission: 'orders.view', auditModule: 'alterations' },
  async (ctx, input) => {
    const { data, error } = await ctx.adminClient
      .from('boutique_alterations')
      .select(SELECT_ALTERATIONS)
      .eq('tailoring_order_id', input.tailoring_order_id)
      .order('created_at', { ascending: false })

    if (error) {
      console.error('[getAlterationsByOrder]', error)
      return failure(error.message)
    }
    return success((data || []) as unknown as AlterationRow[])
  }
)
