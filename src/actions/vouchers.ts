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
