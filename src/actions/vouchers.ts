'use server'

import { protectedAction, type AdminClient } from '@/lib/server/action-wrapper'
import { success, failure } from '@/lib/errors'
import { buildAuditDiff } from '@/lib/audit'

async function userIsFullAdmin(ctx: { adminClient: AdminClient; userId: string }): Promise<boolean> {
  const { data: roleRows } = await ctx.adminClient
    .from('user_roles').select('roles!inner(name)').eq('user_id', ctx.userId)
  return (roleRows ?? []).some((ur: { roles?: { name?: string } | { name?: string }[] }) => {
    const r = ur.roles
    const name = Array.isArray(r) ? r[0]?.name : r?.name
    return name === 'administrador' || name === 'super_admin'
  })
}

function recalcVoucherStatus(remaining: number, original: number): 'used' | 'partially_used' | 'active' {
  if (remaining <= 0) return 'used'
  if (remaining < original) return 'partially_used'
  return 'active'
}

// ─── cancelVoucherAction ────────────────────────────────────────────────────

export const cancelVoucherAction = protectedAction<
  { voucherId: string; reason?: string | null },
  { id: string; status: 'cancelled' }
>(
  {
    permission: 'pos.sell',
    auditModule: 'pos',
    auditAction: 'state_change',
    auditEntity: 'voucher',
    revalidate: ['/admin/tickets', '/admin/tickets/vales'],
  },
  async (ctx, { voucherId, reason }) => {
    if (!voucherId) return failure('ID de vale requerido', 'VALIDATION')

    const { data: before } = await ctx.adminClient
      .from('vouchers')
      .select('id, code, status, remaining_amount, notes')
      .eq('id', voucherId)
      .single()
    if (!before) return failure('Vale no encontrado', 'NOT_FOUND')

    const status = (before as { status: string }).status
    if (status === 'used') {
      return failure('Este vale ya está totalmente canjeado y no se puede anular', 'CONFLICT')
    }
    if (status === 'cancelled') {
      return failure('El vale ya está anulado', 'CONFLICT')
    }

    const trimmedReason = reason?.trim()
    const prevNotes = ((before as { notes: string | null }).notes ?? '').trimEnd()
    const stamp = new Date().toISOString().slice(0, 10)
    const newLine = trimmedReason
      ? `[${stamp}] Anulado: ${trimmedReason}`
      : `[${stamp}] Anulado`
    const newNotes = prevNotes ? `${prevNotes}\n${newLine}` : newLine

    const { error } = await ctx.adminClient
      .from('vouchers')
      .update({ status: 'cancelled', notes: newNotes })
      .eq('id', voucherId)
    if (error) return failure(error.message)

    return success({
      id: voucherId,
      status: 'cancelled' as const,
      auditDescription: `Vale ${(before as { code: string }).code} anulado${trimmedReason ? `: ${trimmedReason}` : ''}`,
      auditOldData: { status, notes: (before as { notes: string | null }).notes },
      auditNewData: { status: 'cancelled', notes: newNotes },
    } as any)
  }
)

// ─── reassignVoucherClientAction ───────────────────────────────────────────

export const reassignVoucherClientAction = protectedAction<
  { voucherId: string; clientId: string | null },
  { id: string; client_id: string | null }
>(
  {
    permission: 'pos.sell',
    auditModule: 'pos',
    auditAction: 'update',
    auditEntity: 'voucher',
    revalidate: ['/admin/tickets', '/admin/tickets/vales'],
  },
  async (ctx, { voucherId, clientId }) => {
    if (!voucherId) return failure('ID de vale requerido', 'VALIDATION')

    const { data: before } = await ctx.adminClient
      .from('vouchers')
      .select('id, code, client_id')
      .eq('id', voucherId)
      .single()
    if (!before) return failure('Vale no encontrado', 'NOT_FOUND')

    const newClientId = clientId && clientId.trim() ? clientId.trim() : null
    const oldClientId = (before as { client_id: string | null }).client_id ?? null

    if (newClientId === oldClientId) {
      return success({
        id: voucherId,
        client_id: newClientId,
        auditDescription: `Vale ${(before as { code: string }).code}: cliente sin cambios`,
      } as any)
    }

    if (newClientId) {
      const { data: client } = await ctx.adminClient
        .from('clients')
        .select('id')
        .eq('id', newClientId)
        .maybeSingle()
      if (!client) return failure('Cliente no encontrado', 'VALIDATION')
    }

    const { error } = await ctx.adminClient
      .from('vouchers')
      .update({ client_id: newClientId })
      .eq('id', voucherId)
    if (error) return failure(error.message)

    return success({
      id: voucherId,
      client_id: newClientId,
      auditDescription: `Vale ${(before as { code: string }).code}: cliente actualizado`,
      auditOldData: { client_id: oldClientId },
      auditNewData: { client_id: newClientId },
    } as any)
  }
)

// ─── updateVoucherExpiryAction ─────────────────────────────────────────────

export const updateVoucherExpiryAction = protectedAction<
  { voucherId: string; expiryDate: string },
  { id: string; expiry_date: string }
>(
  {
    permission: 'pos.sell',
    auditModule: 'pos',
    auditAction: 'update',
    auditEntity: 'voucher',
    revalidate: ['/admin/tickets', '/admin/tickets/vales'],
  },
  async (ctx, { voucherId, expiryDate }) => {
    if (!voucherId) return failure('ID de vale requerido', 'VALIDATION')
    if (!expiryDate || !/^\d{4}-\d{2}-\d{2}$/.test(expiryDate)) {
      return failure('Fecha de caducidad inválida (formato YYYY-MM-DD)', 'VALIDATION')
    }

    const { data: before } = await ctx.adminClient
      .from('vouchers')
      .select('id, code, expiry_date, status')
      .eq('id', voucherId)
      .single()
    if (!before) return failure('Vale no encontrado', 'NOT_FOUND')

    const oldDate = (before as { expiry_date: string | null }).expiry_date

    const { error } = await ctx.adminClient
      .from('vouchers')
      .update({ expiry_date: expiryDate })
      .eq('id', voucherId)
    if (error) return failure(error.message)

    const diff = buildAuditDiff(
      { expiry_date: oldDate },
      { expiry_date: expiryDate },
    )
    return success({
      id: voucherId,
      expiry_date: expiryDate,
      auditDescription: `Vale ${(before as { code: string }).code}: caducidad ${oldDate ?? '—'} → ${expiryDate}`,
      auditOldData: diff?.auditOldData,
      auditNewData: diff?.auditNewData,
    } as any)
  }
)

// ─── createAdminVoucher ────────────────────────────────────────────────────
// Crea un vale directamente desde admin, SIN venta asociada (origin_sale_id=null)
// y SIN tocar cash_sessions. La compensación contable ocurre al canjearse el
// vale en una venta vía rpc_create_sale.

export const createAdminVoucher = protectedAction<
  {
    amount: number
    clientId?: string | null
    voucherKind?: 'gift_card' | 'return'
    expiryDays?: number
    notes?: string
    storeId?: string
  },
  { id: string; code: string; original_amount: number; remaining_amount: number; issued_date: string; expiry_date: string }
>(
  {
    permission: 'pos.sell',
    auditModule: 'vouchers',
    auditAction: 'create',
    auditEntity: 'voucher',
    revalidate: ['/admin/tickets', '/admin/tickets/vales'],
  },
  async (ctx, input) => {
    if (!input.amount || input.amount <= 0) return failure('El importe debe ser mayor que 0', 'VALIDATION')

    const code = 'GC-' + Date.now().toString(36).toUpperCase() + '-' + Math.random().toString(36).substring(2, 6).toUpperCase()

    const expiryDate = new Date()
    expiryDate.setDate(expiryDate.getDate() + (input.expiryDays || 365))

    const { data, error } = await ctx.adminClient
      .from('vouchers')
      .insert({
        code,
        voucher_type: 'fixed',
        voucher_kind: input.voucherKind || 'gift_card',
        original_amount: input.amount,
        remaining_amount: input.amount,
        origin_sale_id: null,
        client_id: input.clientId || null,
        issued_date: new Date().toISOString().split('T')[0],
        expiry_date: expiryDate.toISOString().split('T')[0],
        status: 'active',
        issued_by_store_id: input.storeId || null,
        issued_by: ctx.userId,
        notes: input.notes || null,
      })
      .select('id, code, original_amount, remaining_amount, issued_date, expiry_date')
      .single()

    if (error) return failure(error.message)

    return success({
      ...data,
      auditDescription: `Vale ${data.code} creado · ${Number(input.amount).toFixed(2)} €${input.clientId ? ' (con cliente)' : ' (sin cliente)'}`,
    } as any)
  }
)

// ─── getVoucherDetail (pos.access) ─────────────────────────────────────────
// Vale completo + historial de canjes (sale_payments) + vale padre/hijos.

export type VoucherDetail = {
  id: string; code: string; voucher_kind: string | null; voucher_type: string | null
  original_amount: number; remaining_amount: number; status: string
  client_id: string | null; client_name: string | null
  origin_sale_id: string | null; origin_ticket: string | null
  store_name: string | null; issued_date: string | null; expiry_date: string | null
  notes: string | null; parent_voucher_id: string | null; created_at: string
  parent: { id: string; code: string } | null
  children: { id: string; code: string; remaining_amount: number; status: string }[]
  redemptions: { sale_id: string; ticket_number: string | null; created_at: string | null; amount: number; store_name: string | null }[]
}

export const getVoucherDetail = protectedAction<string, VoucherDetail>(
  { permission: 'pos.access', auditModule: 'pos' },
  async (ctx, voucherId) => {
    if (!voucherId) return failure('ID de vale requerido', 'VALIDATION')
    const { data, error } = await ctx.adminClient
      .from('vouchers')
      .select(`
        id, code, voucher_kind, voucher_type, original_amount, remaining_amount, status,
        client_id, origin_sale_id, issued_date, expiry_date, notes, parent_voucher_id, created_at,
        client:clients ( full_name ),
        store:stores ( name ),
        origin:sales!vouchers_origin_sale_id_fkey ( ticket_number )
      `)
      .eq('id', voucherId)
      .maybeSingle()
    if (error) return failure(error.message)
    if (!data) return failure('Vale no encontrado', 'NOT_FOUND')
    const v = data as Record<string, any>

    // Vale padre (auto-referencia: PostgREST no embebe vouchers->vouchers; consulta aparte)
    let parent: { id: string; code: string } | null = null
    if (v.parent_voucher_id) {
      const { data: p } = await ctx.adminClient.from('vouchers').select('id, code').eq('id', v.parent_voucher_id).maybeSingle()
      if (p) parent = { id: p.id as string, code: p.code as string }
    }

    // Hijos residuales
    const { data: kids } = await ctx.adminClient
      .from('vouchers').select('id, code, remaining_amount, status').eq('parent_voucher_id', voucherId)

    // Canjes: sale_payments con este voucher_id
    const { data: pays } = await ctx.adminClient
      .from('sale_payments')
      .select('amount, sale:sales ( id, ticket_number, created_at, store:stores ( name ) )')
      .eq('voucher_id', voucherId)
    const redemptions = (pays ?? []).map((p: Record<string, any>) => ({
      sale_id: p.sale?.id ?? '',
      ticket_number: p.sale?.ticket_number ?? null,
      created_at: p.sale?.created_at ?? null,
      amount: Number(p.amount),
      store_name: p.sale?.store?.name ?? null,
    })).sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))

    return success({
      id: v.id, code: v.code, voucher_kind: v.voucher_kind, voucher_type: v.voucher_type,
      original_amount: Number(v.original_amount), remaining_amount: Number(v.remaining_amount), status: v.status,
      client_id: v.client_id, client_name: v.client?.full_name ?? null,
      origin_sale_id: v.origin_sale_id, origin_ticket: v.origin?.ticket_number ?? null,
      store_name: v.store?.name ?? null, issued_date: v.issued_date, expiry_date: v.expiry_date,
      notes: v.notes, parent_voucher_id: v.parent_voucher_id, created_at: v.created_at,
      parent,
      children: (kids ?? []).map((k: Record<string, any>) => ({ id: k.id, code: k.code, remaining_amount: Number(k.remaining_amount), status: k.status })),
      redemptions,
    })
  }
)

// ─── adjustVoucherBalance (vouchers.manage + isFullAdmin) ───────────────────
// Ajuste manual del saldo. Si el nuevo saldo supera el original, sube también
// el original (coherencia remaining <= original). reason OBLIGATORIO -> se anexa
// a notes con timestamp y queda en el audit log. No genera asiento (la
// contabilidad de un vale ocurre al canjearse).

export const adjustVoucherBalance = protectedAction<
  { voucherId: string; newRemaining: number; reason: string },
  { id: string; remaining_amount: number; original_amount: number; status: string }
>(
  {
    permission: 'vouchers.manage',
    auditModule: 'vouchers',
    auditAction: 'update',
    auditEntity: 'voucher',
    revalidate: ['/admin/tickets', '/admin/tickets/vales'],
  },
  async (ctx, { voucherId, newRemaining, reason }) => {
    if (!voucherId) return failure('ID de vale requerido', 'VALIDATION')
    const reasonTrim = (reason ?? '').trim()
    if (reasonTrim.length < 10) return failure('El motivo del ajuste debe tener al menos 10 caracteres', 'VALIDATION')
    const remaining = Math.round((Number(newRemaining) || 0) * 100) / 100
    if (remaining < 0) return failure('El saldo no puede ser negativo', 'VALIDATION')

    if (!(await userIsFullAdmin(ctx))) return failure('Solo un administrador puede ajustar el saldo de un vale.', 'FORBIDDEN')

    const { data: before } = await ctx.adminClient
      .from('vouchers')
      .select('id, code, status, original_amount, remaining_amount, notes')
      .eq('id', voucherId)
      .single()
    if (!before) return failure('Vale no encontrado', 'NOT_FOUND')

    const b = before as { code: string; status: string; original_amount: number; remaining_amount: number; notes: string | null }
    if (b.status === 'cancelled') return failure('El vale está anulado. Reactívalo antes de ajustar su saldo.', 'CONFLICT')

    const oldRemaining = Number(b.remaining_amount)
    const oldOriginal = Number(b.original_amount)
    const newOriginal = remaining > oldOriginal ? remaining : oldOriginal
    const newStatus = recalcVoucherStatus(remaining, newOriginal)

    const stamp = new Date().toISOString().slice(0, 10)
    const prevNotes = (b.notes ?? '').trimEnd()
    const line = `[${stamp}] Saldo ajustado: ${oldRemaining.toFixed(2)} → ${remaining.toFixed(2)} €${newOriginal !== oldOriginal ? ` (original ${oldOriginal.toFixed(2)} → ${newOriginal.toFixed(2)} €)` : ''}. Motivo: ${reasonTrim}`
    const newNotes = prevNotes ? `${prevNotes}\n${line}` : line

    const { error } = await ctx.adminClient
      .from('vouchers')
      .update({ remaining_amount: remaining, original_amount: newOriginal, status: newStatus, notes: newNotes })
      .eq('id', voucherId)
    if (error) return failure(error.message)

    return success({
      id: voucherId,
      remaining_amount: remaining,
      original_amount: newOriginal,
      status: newStatus,
      auditDescription: `Vale ${b.code}: saldo ${oldRemaining.toFixed(2)} → ${remaining.toFixed(2)} €. ${reasonTrim}`,
      auditOldData: { remaining_amount: oldRemaining, original_amount: oldOriginal, status: b.status },
      auditNewData: { remaining_amount: remaining, original_amount: newOriginal, status: newStatus },
    } as any)
  }
)

// ─── reactivateVoucher (vouchers.manage) ───────────────────────────────────
// Reactiva un vale ANULADO. Si está caducado por fecha, el aviso lo da la UI;
// el vale no será canjeable hasta editar la caducidad (lo valida rpc_create_sale).

export const reactivateVoucher = protectedAction<
  { voucherId: string },
  { id: string; status: string }
>(
  {
    permission: 'vouchers.manage',
    auditModule: 'vouchers',
    auditAction: 'state_change',
    auditEntity: 'voucher',
    revalidate: ['/admin/tickets', '/admin/tickets/vales'],
  },
  async (ctx, { voucherId }) => {
    if (!voucherId) return failure('ID de vale requerido', 'VALIDATION')

    const { data: before } = await ctx.adminClient
      .from('vouchers')
      .select('id, code, status, original_amount, remaining_amount, notes')
      .eq('id', voucherId)
      .single()
    if (!before) return failure('Vale no encontrado', 'NOT_FOUND')

    const b = before as { code: string; status: string; original_amount: number; remaining_amount: number; notes: string | null }
    if (b.status !== 'cancelled') return failure('Solo se puede reactivar un vale anulado.', 'CONFLICT')

    const newStatus = recalcVoucherStatus(Number(b.remaining_amount), Number(b.original_amount))
    const stamp = new Date().toISOString().slice(0, 10)
    const prevNotes = (b.notes ?? '').trimEnd()
    const newNotes = prevNotes ? `${prevNotes}\n[${stamp}] Reactivado` : `[${stamp}] Reactivado`

    const { error } = await ctx.adminClient
      .from('vouchers')
      .update({ status: newStatus, notes: newNotes })
      .eq('id', voucherId)
    if (error) return failure(error.message)

    return success({
      id: voucherId,
      status: newStatus,
      auditDescription: `Vale ${b.code} reactivado (estado ${newStatus})`,
      auditOldData: { status: 'cancelled' },
      auditNewData: { status: newStatus },
    } as any)
  }
)

// ─── updateVoucherNotes (vouchers.manage) ──────────────────────────────────

export const updateVoucherNotes = protectedAction<
  { voucherId: string; notes: string },
  { id: string; notes: string | null }
>(
  {
    permission: 'vouchers.manage',
    auditModule: 'vouchers',
    auditAction: 'update',
    auditEntity: 'voucher',
    revalidate: ['/admin/tickets', '/admin/tickets/vales'],
  },
  async (ctx, { voucherId, notes }) => {
    if (!voucherId) return failure('ID de vale requerido', 'VALIDATION')

    const { data: before } = await ctx.adminClient
      .from('vouchers')
      .select('id, code, notes')
      .eq('id', voucherId)
      .single()
    if (!before) return failure('Vale no encontrado', 'NOT_FOUND')

    const newNotes = (notes ?? '').trim() || null
    const oldNotes = (before as { notes: string | null }).notes ?? null

    const { error } = await ctx.adminClient
      .from('vouchers')
      .update({ notes: newNotes })
      .eq('id', voucherId)
    if (error) return failure(error.message)

    return success({
      id: voucherId,
      notes: newNotes,
      auditDescription: `Vale ${(before as { code: string }).code}: notas actualizadas`,
      auditOldData: { notes: oldNotes },
      auditNewData: { notes: newNotes },
    } as any)
  }
)
