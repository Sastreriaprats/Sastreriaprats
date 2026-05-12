'use server'

import { protectedAction } from '@/lib/server/action-wrapper'
import { success, failure } from '@/lib/errors'
import { buildAuditDiff } from '@/lib/audit'

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
