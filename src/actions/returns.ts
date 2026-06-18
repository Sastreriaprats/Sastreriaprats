'use server'

import { protectedAction } from '@/lib/server/action-wrapper'
import { success, failure } from '@/lib/errors'
import type { ListParams, ListResult } from '@/lib/server/query-helpers'
import { normalizeSearchTerm } from '@/lib/utils'

export type ReturnRow = {
  id: string
  created_at: string
  return_type: string
  total_returned: number
  reason: string | null
  notes: string | null
  ticket_number: string | null
  sale_id: string | null
  sale_total: number | null
  client_name: string | null
  processed_by_name: string | null
  store_id: string | null
  store_name: string | null
  voucher_id: string | null
  voucher_code: string | null
  voucher_status: string | null
  voucher_remaining: number | null
  voucher_original: number | null
}

const SELECT = `
  id, created_at, return_type, total_returned, reason, notes,
  original_sale_id, voucher_id, exchange_sale_id, store_id,
  original_sale:sales!returns_original_sale_id_fkey ( id, ticket_number, total, client:clients ( full_name ) ),
  voucher:vouchers ( code, status, remaining_amount, original_amount ),
  processed_by_profile:profiles!returns_processed_by_fkey ( full_name ),
  store:stores ( name )
`

type RawReturn = {
  id: string; created_at: string; return_type: string; total_returned: number
  reason: string | null; notes: string | null; original_sale_id: string | null; voucher_id: string | null; store_id: string | null
  original_sale: { id: string; ticket_number: string | null; total: number | null; client: { full_name: string | null } | null } | null
  voucher: { code: string | null; status: string | null; remaining_amount: number | null; original_amount: number | null } | null
  processed_by_profile: { full_name: string | null } | null
  store: { name: string | null } | null
}

function toRow(r: RawReturn): ReturnRow {
  return {
    id: r.id,
    created_at: r.created_at,
    return_type: r.return_type,
    total_returned: Number(r.total_returned),
    reason: r.reason,
    notes: r.notes,
    ticket_number: r.original_sale?.ticket_number ?? null,
    sale_id: r.original_sale?.id ?? r.original_sale_id ?? null,
    sale_total: r.original_sale?.total != null ? Number(r.original_sale.total) : null,
    client_name: r.original_sale?.client?.full_name ?? null,
    processed_by_name: r.processed_by_profile?.full_name ?? null,
    store_id: r.store_id ?? null,
    store_name: r.store?.name ?? null,
    voucher_id: r.voucher_id,
    voucher_code: r.voucher?.code ?? null,
    voucher_status: r.voucher?.status ?? null,
    voucher_remaining: r.voucher?.remaining_amount != null ? Number(r.voucher.remaining_amount) : null,
    voucher_original: r.voucher?.original_amount != null ? Number(r.voucher.original_amount) : null,
  }
}

// Volumen bajo (decenas de filas): se trae todo con joins y se filtra/pagina en
// memoria, evitando las limitaciones de PostgREST para filtrar/buscar por campos
// embebidos (ticket, cliente, estado del vale). Revisar si el volumen crece mucho.
export const listReturns = protectedAction<ListParams, ListResult<ReturnRow>>(
  { permission: 'returns.view', auditModule: 'pos' },
  async (ctx, params) => {
    const { data, error } = await ctx.adminClient
      .from('returns')
      .select(SELECT)
      .order('created_at', { ascending: false })
    if (error) return failure(error.message)

    let rows = (data as unknown as RawReturn[]).map(toRow)

    const f = params.filters || {}
    if (f.from) rows = rows.filter((r) => r.created_at >= String(f.from))
    if (f.to) rows = rows.filter((r) => r.created_at <= String(f.to) + 'T23:59:59.999Z')
    if (f.store_id) rows = rows.filter((r) => r.store_id === f.store_id)
    if (f.return_type) rows = rows.filter((r) => r.return_type === f.return_type)
    if (f.voucher_status) rows = rows.filter((r) => r.voucher_status === f.voucher_status)

    const term = normalizeSearchTerm(params.search || '')
    if (term) {
      rows = rows.filter((r) => {
        const hay = normalizeSearchTerm([r.ticket_number, r.client_name, r.reason].filter(Boolean).join(' '))
        return term.split(' ').every((t) => hay.includes(t))
      })
    }

    const total = rows.length
    const pageSize = params.pageSize || 25
    const page = params.page || 1
    const totalPages = Math.max(1, Math.ceil(total / pageSize))
    const paged = rows.slice((page - 1) * pageSize, (page - 1) * pageSize + pageSize)

    return success({ data: paged, total, page, pageSize, totalPages })
  }
)

export type ReturnDetail = ReturnRow & {
  returned_lines: { description: string; quantity: number; quantity_returned: number; unit_price: number; returned_at: string | null; return_reason: string | null }[]
}

export const getReturn = protectedAction<string, ReturnDetail>(
  { permission: 'returns.view', auditModule: 'pos' },
  async (ctx, returnId) => {
    const { data, error } = await ctx.adminClient
      .from('returns')
      .select(SELECT)
      .eq('id', returnId)
      .maybeSingle()
    if (error) return failure(error.message)
    if (!data) return failure('Devolución no encontrada', 'NOT_FOUND')

    const raw = data as unknown as RawReturn
    const base = toRow(raw)

    let returned_lines: ReturnDetail['returned_lines'] = []
    if (raw.original_sale_id) {
      const { data: lines } = await ctx.adminClient
        .from('sale_lines')
        .select('description, quantity, quantity_returned, unit_price, returned_at, return_reason')
        .eq('sale_id', raw.original_sale_id)
        .gt('quantity_returned', 0)
        .order('sort_order', { ascending: true })
      returned_lines = (lines ?? []).map((l: Record<string, unknown>) => ({
        description: String(l.description ?? ''),
        quantity: Number(l.quantity ?? 0),
        quantity_returned: Number(l.quantity_returned ?? 0),
        unit_price: Number(l.unit_price ?? 0),
        returned_at: (l.returned_at as string) ?? null,
        return_reason: (l.return_reason as string) ?? null,
      }))
    }

    return success({ ...base, returned_lines })
  }
)

// ─── Anular una devolución (R6) ───────────────────────────────────────────────

export type ReturnCancellationPreview = {
  return_id: string
  return_type: string
  total_returned: number
  sale: { id: string; ticket_number: string | null; status: string } | null
  reverts: {
    stock_back_to_sold: { product_variant_id: string; warehouse_id: string; quantity: number }[]
    cash: { amount: number; cash_session_id: string; session_status: string } | null
    voucher_to_cancel: { voucher_id: string; code: string | null; amount: number } | null
  }
  blockers: string[]
  warnings: string[]
  can_cancel: boolean
}

// Preview READ-ONLY: clasifica si la devolución es anulable + qué se revertiría.
// Mismo permiso que ver devoluciones (no muta nada).
export const previewReturnCancellation = protectedAction<{ returnId: string }, ReturnCancellationPreview>(
  { permission: 'returns.view', auditModule: 'pos' },
  async (ctx, { returnId }) => {
    const { data, error } = await ctx.adminClient.rpc('rpc_preview_return_cancellation', { p_return_id: returnId })
    if (error) return failure(error.message)
    const d = data as ReturnCancellationPreview & { error?: string }
    if (!d || d.error) return failure(d?.error || 'Devolución no encontrada', 'NOT_FOUND')
    return success(d)
  }
)

// Anular: delega en rpc_cancel_return (mig 220), que re-evalúa los guards y, si es
// anulable, revierte stock + caja (arqueo canónico) + vale + restaura la venta,
// atómicamente. Permiso sales.edit (anular corrige la venta/stock/caja, como los
// otros reversos). El propio RPC aborta si está bloqueada.
export const cancelReturn = protectedAction<{ returnId: string }, { return_id: string; ticket_number: string | null; auditEntityId: string }>(
  { permission: 'sales.edit', auditAction: 'delete', auditModule: 'pos', auditEntity: 'return' },
  async (ctx, { returnId }) => {
    const { data, error } = await ctx.adminClient.rpc('rpc_cancel_return', { p_return_id: returnId, p_user_id: ctx.userId })
    if (error) return failure(error.message, 'CONFLICT')
    const d = data as { ticket_number?: string | null }
    return success({ return_id: returnId, ticket_number: d?.ticket_number ?? null, auditEntityId: returnId })
  }
)
