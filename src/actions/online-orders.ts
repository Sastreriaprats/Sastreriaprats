'use server'

import { protectedAction, type AdminClient } from '@/lib/server/action-wrapper'
import { success, failure } from '@/lib/errors'
import { sendShippingConfirmation } from '@/lib/email/transactional'

const ALLOWED_STATUSES = [
  'pending_payment', 'paid', 'processing', 'shipped', 'delivered', 'cancelled', 'refunded',
] as const
export type OnlineOrderStatus = typeof ALLOWED_STATUSES[number]

const ALLOWED_LINE_STATUSES = ['active', 'cancelled', 'refunded'] as const
export type OnlineOrderLineStatus = typeof ALLOWED_LINE_STATUSES[number]

export interface OnlineOrderRow {
  id: string
  order_number: string
  status: string
  total: number
  payment_method: string | null
  paid_at: string | null
  created_at: string
  client_name: string | null
  client_email: string | null
  lines_count: number
}

export const getOnlineOrdersList = protectedAction<
  { limit?: number; status?: string; search?: string } | undefined,
  OnlineOrderRow[]
>(
  { permission: 'shop.view', auditModule: 'cms' },
  async (ctx, opts) => {
    const admin = ctx.adminClient
    const limit = opts?.limit ?? 50
    let q = admin
      .from('online_orders')
      .select(`
        id, order_number, status, total, payment_method, paid_at, created_at,
        client_id, shipping_address,
        clients:client_id(email, first_name, last_name, full_name)
      `)
      .order('created_at', { ascending: false })
      .limit(limit)
    if (opts?.status) q = q.eq('status', opts.status)
    if (opts?.search) {
      const s = opts.search.trim()
      if (s) q = q.ilike('order_number', `%${s}%`)
    }
    const { data, error } = await q
    if (error) return failure(error.message)

    const orderIds = (data || []).map((o: any) => o.id)
    const countsByOrder = new Map<string, number>()
    if (orderIds.length > 0) {
      const { data: lc } = await admin
        .from('online_order_lines')
        .select('order_id, quantity, status')
        .in('order_id', orderIds)
      for (const l of (lc || []) as any[]) {
        const cur = countsByOrder.get(l.order_id) ?? 0
        countsByOrder.set(l.order_id, cur + Number(l.quantity || 0))
      }
    }

    const rows: OnlineOrderRow[] = (data || []).map((o: any) => {
      const c = o.clients
      let client_name: string | null = null
      let client_email: string | null = c?.email ?? null
      if (c) {
        client_name = (c.full_name ?? '').toString().trim()
          || [c.first_name, c.last_name].filter(Boolean).join(' ').trim()
          || null
      }
      if (!client_name || !client_email) {
        const addr = (typeof o.shipping_address === 'object' && o.shipping_address) || null
        if (addr) {
          if (!client_name) {
            const composed = [addr.first_name, addr.last_name].filter(Boolean).join(' ').trim()
            if (composed) client_name = composed
          }
          if (!client_email && typeof addr.email === 'string') client_email = addr.email
        }
      }
      return {
        id: o.id,
        order_number: o.order_number,
        status: o.status,
        total: Number(o.total ?? 0),
        payment_method: o.payment_method ?? null,
        paid_at: o.paid_at ?? null,
        created_at: o.created_at,
        client_name,
        client_email,
        lines_count: countsByOrder.get(o.id) ?? 0,
      }
    })
    return success(rows)
  }
)

export interface OnlineOrderLineRow {
  id: string
  order_id: string
  variant_id: string | null
  product_name: string | null
  variant_sku: string | null
  quantity: number
  unit_price: number
  total: number
  status: OnlineOrderLineStatus
  cancelled_at: string | null
  cancellation_reason: string | null
  stock_restored: boolean
}

export interface OnlineOrderDetail {
  id: string
  order_number: string
  status: string
  total: number
  subtotal: number | null
  shipping_cost: number | null
  payment_method: string | null
  paid_at: string | null
  created_at: string
  client_id: string | null
  shipping_address: unknown
  shipping_tracking_number: string | null
  shipping_carrier: string | null
  shipped_at: string | null
  delivered_at: string | null
  cancelled_at: string | null
  cancellation_reason: string | null
  notes: string | null
  lines: OnlineOrderLineRow[]
  client?: { id?: string; email: string; first_name: string | null; last_name: string | null; phone: string | null }
}

export const getOnlineOrderDetail = protectedAction<string, OnlineOrderDetail | null>(
  { permission: 'shop.view', auditModule: 'cms' },
  async (ctx, orderId) => {
    const admin = ctx.adminClient
    const { data: order, error: orderError } = await admin
      .from('online_orders')
      .select(`
        id, order_number, status, total, subtotal, shipping_cost,
        payment_method, paid_at, created_at, client_id,
        shipping_address, shipping_tracking_number, shipping_carrier,
        shipped_at, delivered_at, cancelled_at, cancellation_reason, notes
      `)
      .eq('id', orderId)
      .single()
    if (orderError || !order) return success(null)
    const { data: lines, error: linesError } = await admin
      .from('online_order_lines')
      .select(`
        id, order_id, variant_id, product_name, variant_sku, quantity, unit_price, total,
        status, cancelled_at, cancellation_reason, stock_restored
      `)
      .eq('order_id', orderId)
      .order('id', { ascending: true })
    if (linesError) return failure(linesError.message)
    let client: OnlineOrderDetail['client'] = undefined
    if ((order as Record<string, unknown>).client_id) {
      const { data: c } = await admin
        .from('clients')
        .select('id, email, first_name, last_name, phone')
        .eq('id', (order as Record<string, unknown>).client_id)
        .single()
      if (c) client = c as OnlineOrderDetail['client']
    }
    const linesNorm: OnlineOrderLineRow[] = (lines || []).map((l: any) => ({
      id: l.id,
      order_id: l.order_id,
      variant_id: l.variant_id ?? null,
      product_name: l.product_name ?? null,
      variant_sku: l.variant_sku ?? null,
      quantity: Number(l.quantity ?? 0),
      unit_price: Number(l.unit_price ?? 0),
      total: Number(l.total ?? 0),
      status: (l.status ?? 'active') as OnlineOrderLineStatus,
      cancelled_at: l.cancelled_at ?? null,
      cancellation_reason: l.cancellation_reason ?? null,
      stock_restored: Boolean(l.stock_restored),
    }))
    return success({
      ...(order as Record<string, unknown>),
      lines: linesNorm,
      client,
    } as OnlineOrderDetail)
  }
)

export const updateOnlineOrderStatusAction = protectedAction<
  { orderId: string; status: OnlineOrderStatus; trackingNumber?: string | null; carrier?: string | null },
  { id: string; status: OnlineOrderStatus }
>(
  {
    permission: 'orders.edit',
    auditModule: 'shop',
    auditAction: 'state_change',
    auditEntity: 'online_order',
    revalidate: ['/admin/tienda-online', '/admin/tienda-online/pedidos'],
  },
  async (ctx, { orderId, status, trackingNumber, carrier }) => {
    if (!orderId) return failure('ID del pedido requerido', 'VALIDATION')
    if (!ALLOWED_STATUSES.includes(status)) {
      return failure('Estado no válido', 'VALIDATION')
    }

    const { data: before, error: fetchErr } = await ctx.adminClient
      .from('online_orders')
      .select('id, order_number, status, client_id, shipping_address, shipping_tracking_number')
      .eq('id', orderId)
      .single()
    if (fetchErr || !before) return failure('Pedido no encontrado', 'NOT_FOUND')

    const beforeRec = before as Record<string, unknown>
    const oldStatus = String(beforeRec.status ?? '')
    if (oldStatus === status && !trackingNumber) {
      return success({
        id: orderId,
        status,
        auditDescription: `Pedido online ${beforeRec.order_number}: estado sin cambios`,
      } as any)
    }

    const patch: Record<string, unknown> = { status }
    if (typeof trackingNumber === 'string' && trackingNumber.trim()) {
      patch.shipping_tracking_number = trackingNumber.trim()
    }
    if (typeof carrier === 'string' && carrier.trim()) {
      patch.shipping_carrier = carrier.trim()
    }
    if (status === 'shipped' && oldStatus !== 'shipped') {
      patch.shipped_at = new Date().toISOString()
    }
    if (status === 'delivered' && oldStatus !== 'delivered') {
      patch.delivered_at = new Date().toISOString()
    }

    const { error: updErr } = await ctx.adminClient
      .from('online_orders')
      .update(patch)
      .eq('id', orderId)
    if (updErr) return failure(updErr.message)

    // Email de envío al pasar a 'shipped'
    if (status === 'shipped' && oldStatus !== 'shipped') {
      try {
        let clientEmail: string | null = null
        let clientName = 'Cliente'
        if (beforeRec.client_id) {
          const { data: c } = await ctx.adminClient
            .from('clients')
            .select('email, first_name, last_name, full_name')
            .eq('id', beforeRec.client_id)
            .single()
          if (c) {
            clientEmail = (c as { email?: string }).email ?? null
            const cr = c as Record<string, string | null>
            clientName = cr.full_name?.trim()
              || [cr.first_name, cr.last_name].filter(Boolean).join(' ').trim()
              || clientName
          }
        }
        if (!clientEmail && typeof beforeRec.shipping_address === 'object' && beforeRec.shipping_address) {
          const addr = beforeRec.shipping_address as Record<string, unknown>
          if (typeof addr.email === 'string') clientEmail = addr.email
          if (!clientName || clientName === 'Cliente') {
            const fn = String(addr.first_name ?? '')
            const ln = String(addr.last_name ?? '')
            const composed = [fn, ln].filter(Boolean).join(' ').trim()
            if (composed) clientName = composed
          }
        }
        if (clientEmail) {
          await sendShippingConfirmation({
            order_number: String(beforeRec.order_number ?? ''),
            client_name: clientName,
            client_email: clientEmail,
            tracking_number: typeof patch.shipping_tracking_number === 'string'
              ? patch.shipping_tracking_number
              : (beforeRec.shipping_tracking_number as string | null) ?? undefined,
            carrier: carrier?.trim() || undefined,
          })
        }
      } catch (e) {
        console.error('[updateOnlineOrderStatusAction] sendShippingConfirmation failed:', e)
      }
    }

    return success({
      id: orderId,
      status,
      auditDescription: `Pedido online ${beforeRec.order_number}: ${oldStatus} → ${status}`,
      auditOldData: { status: oldStatus },
      auditNewData: { status, ...(patch.shipping_tracking_number ? { shipping_tracking_number: patch.shipping_tracking_number } : {}) },
    } as any)
  }
)

/**
 * Repone al stock la cantidad de una línea concreta y deja constancia en
 * stock_movements como movimiento de tipo 'return' referenciando la línea.
 * Es idempotente: solo actúa si la línea NO tenía `stock_restored=true`.
 */
async function restoreStockForLine(
  admin: AdminClient,
  line: { id: string; order_id: string; variant_id: string | null; quantity: number },
  reason: string,
): Promise<{ restored: boolean }> {
  if (!line.variant_id || line.quantity <= 0) return { restored: false }
  // Repone al almacén del que salió la venta (movimiento 'sale' del pedido);
  // si no hay rastro, al de mayor stock. Antes cogía una fila arbitraria con
  // limit(1) y podía devolver la unidad a un almacén del que nunca salió.
  const { data: saleMov } = await admin
    .from('stock_movements')
    .select('warehouse_id')
    .eq('reference_type', 'online_order')
    .eq('reference_id', line.order_id)
    .eq('product_variant_id', line.variant_id)
    .eq('movement_type', 'sale')
    .order('quantity', { ascending: true })
    .limit(1)
    .maybeSingle()
  const { data: levels } = await admin
    .from('stock_levels')
    .select('id, quantity, warehouse_id')
    .eq('product_variant_id', line.variant_id)
    .order('quantity', { ascending: false })
  const sl = (levels || []).find((l: any) => l.warehouse_id === (saleMov as any)?.warehouse_id) ?? (levels || [])[0]
  if (!sl) return { restored: false }
  const newQty = (Number(sl.quantity) || 0) + Number(line.quantity)
  await admin
    .from('stock_levels')
    .update({ quantity: newQty })
    .eq('id', (sl as any).id)
  await admin.from('stock_movements').insert({
    product_variant_id: line.variant_id,
    warehouse_id: (sl as any).warehouse_id,
    movement_type: 'return',
    quantity: Number(line.quantity),
    stock_before: Number(sl.quantity) || 0,
    stock_after: newQty,
    reference_type: 'online_order_line',
    reference_id: line.id,
    reason,
  })
  return { restored: true }
}

export const cancelOnlineOrderLineAction = protectedAction<
  { lineId: string; restock?: boolean; reason?: string | null },
  { id: string; lineId: string; restocked: boolean }
>(
  {
    permission: 'orders.edit',
    auditModule: 'shop',
    auditAction: 'state_change',
    auditEntity: 'online_order_line',
    revalidate: ['/admin/tienda-online', '/admin/tienda-online/pedidos'],
  },
  async (ctx, { lineId, restock = true, reason }) => {
    if (!lineId) return failure('ID de línea requerido', 'VALIDATION')

    const { data: line, error: lineErr } = await ctx.adminClient
      .from('online_order_lines')
      .select('id, order_id, variant_id, quantity, product_name, status, stock_restored')
      .eq('id', lineId)
      .single()
    if (lineErr || !line) return failure('Línea no encontrada', 'NOT_FOUND')
    if ((line as any).status === 'cancelled') {
      return failure('La línea ya está cancelada', 'VALIDATION')
    }

    const { data: order } = await ctx.adminClient
      .from('online_orders')
      .select('id, order_number, status')
      .eq('id', (line as any).order_id)
      .single()
    if (!order) return failure('Pedido no encontrado', 'NOT_FOUND')
    if (['cancelled', 'refunded'].includes(String((order as any).status))) {
      return failure('No se puede cancelar una línea de un pedido ya cancelado/reembolsado', 'VALIDATION')
    }

    let restocked = false
    if (restock && !(line as any).stock_restored) {
      const r = await restoreStockForLine(
        ctx.adminClient,
        {
          id: (line as any).id,
          order_id: (line as any).order_id,
          variant_id: (line as any).variant_id,
          quantity: Number((line as any).quantity || 0),
        },
        `Cancelación línea pedido online ${(order as any).order_number}`,
      )
      restocked = r.restored
    }

    const { error: updErr } = await ctx.adminClient
      .from('online_order_lines')
      .update({
        status: 'cancelled',
        cancelled_at: new Date().toISOString(),
        cancellation_reason: reason?.trim() || null,
        stock_restored: restocked || (line as any).stock_restored || false,
      })
      .eq('id', lineId)
    if (updErr) return failure(updErr.message)

    return success({
      id: (order as any).id,
      lineId,
      restocked,
      auditDescription: `Línea cancelada de pedido ${(order as any).order_number}: ${(line as any).product_name ?? lineId}${restocked ? ' (stock repuesto)' : ''}`,
      auditOldData: { status: (line as any).status },
      auditNewData: { status: 'cancelled', reason: reason ?? null, restocked },
    } as any)
  }
)

export const cancelOnlineOrderAction = protectedAction<
  { orderId: string; restock?: boolean; reason?: string | null },
  { id: string; restockedLines: number }
>(
  {
    permission: 'orders.edit',
    auditModule: 'shop',
    auditAction: 'state_change',
    auditEntity: 'online_order',
    revalidate: ['/admin/tienda-online', '/admin/tienda-online/pedidos'],
  },
  async (ctx, { orderId, restock = true, reason }) => {
    if (!orderId) return failure('ID del pedido requerido', 'VALIDATION')

    const { data: order, error: ordErr } = await ctx.adminClient
      .from('online_orders')
      .select('id, order_number, status')
      .eq('id', orderId)
      .single()
    if (ordErr || !order) return failure('Pedido no encontrado', 'NOT_FOUND')

    const oldStatus = String((order as any).status)
    if (oldStatus === 'cancelled') {
      return failure('El pedido ya está cancelado', 'VALIDATION')
    }

    const { data: lines } = await ctx.adminClient
      .from('online_order_lines')
      .select('id, variant_id, quantity, status, stock_restored')
      .eq('order_id', orderId)

    let restockedCount = 0
    if (restock) {
      for (const l of (lines || []) as any[]) {
        if (l.status === 'cancelled' || l.stock_restored) continue
        const r = await restoreStockForLine(
          ctx.adminClient,
          { id: l.id, order_id: orderId, variant_id: l.variant_id, quantity: Number(l.quantity || 0) },
          `Cancelación pedido online ${(order as any).order_number}`,
        )
        if (r.restored) {
          restockedCount += 1
          await ctx.adminClient
            .from('online_order_lines')
            .update({ stock_restored: true })
            .eq('id', l.id)
        }
      }
    }

    await ctx.adminClient
      .from('online_order_lines')
      .update({
        status: 'cancelled',
        cancelled_at: new Date().toISOString(),
      })
      .eq('order_id', orderId)
      .neq('status', 'cancelled')

    const { error: updErr } = await ctx.adminClient
      .from('online_orders')
      .update({
        status: 'cancelled',
        cancelled_at: new Date().toISOString(),
        cancellation_reason: reason?.trim() || null,
      })
      .eq('id', orderId)
    if (updErr) return failure(updErr.message)

    return success({
      id: orderId,
      restockedLines: restockedCount,
      auditDescription: `Pedido online ${(order as any).order_number} cancelado${restockedCount > 0 ? ` (stock repuesto en ${restockedCount} línea${restockedCount === 1 ? '' : 's'})` : ''}`,
      auditOldData: { status: oldStatus },
      auditNewData: { status: 'cancelled', reason: reason ?? null, restockedLines: restockedCount },
    } as any)
  }
)

export const updateOnlineOrderInfoAction = protectedAction<
  {
    orderId: string
    shipping_address?: Record<string, unknown> | null
    tracking_number?: string | null
    carrier?: string | null
    notes?: string | null
  },
  { id: string }
>(
  {
    permission: 'orders.edit',
    auditModule: 'shop',
    auditAction: 'update',
    auditEntity: 'online_order',
    revalidate: ['/admin/tienda-online', '/admin/tienda-online/pedidos'],
  },
  async (ctx, { orderId, shipping_address, tracking_number, carrier, notes }) => {
    if (!orderId) return failure('ID del pedido requerido', 'VALIDATION')

    const { data: before, error: fErr } = await ctx.adminClient
      .from('online_orders')
      .select('id, order_number, shipping_address, shipping_tracking_number, shipping_carrier, notes')
      .eq('id', orderId)
      .single()
    if (fErr || !before) return failure('Pedido no encontrado', 'NOT_FOUND')

    const patch: Record<string, unknown> = {}
    if (shipping_address !== undefined) patch.shipping_address = shipping_address
    if (tracking_number !== undefined) {
      patch.shipping_tracking_number = tracking_number?.trim() || null
    }
    if (carrier !== undefined) {
      patch.shipping_carrier = carrier?.trim() || null
    }
    if (notes !== undefined) patch.notes = notes?.trim() || null

    if (Object.keys(patch).length === 0) {
      return success({ id: orderId, auditDescription: `Pedido ${(before as any).order_number}: sin cambios` } as any)
    }

    const { error: updErr } = await ctx.adminClient
      .from('online_orders')
      .update(patch)
      .eq('id', orderId)
    if (updErr) return failure(updErr.message)

    return success({
      id: orderId,
      auditDescription: `Pedido online ${(before as any).order_number}: información actualizada`,
      auditOldData: {
        shipping_address: (before as any).shipping_address,
        tracking_number: (before as any).shipping_tracking_number,
        carrier: (before as any).shipping_carrier,
        notes: (before as any).notes,
      },
      auditNewData: patch,
    } as any)
  }
)
