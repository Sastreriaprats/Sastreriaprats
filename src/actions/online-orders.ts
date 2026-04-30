'use server'

import { protectedAction } from '@/lib/server/action-wrapper'
import { success, failure } from '@/lib/errors'
import { sendShippingConfirmation } from '@/lib/email/transactional'

const ALLOWED_STATUSES = [
  'pending_payment', 'paid', 'processing', 'shipped', 'delivered', 'cancelled', 'refunded',
] as const
export type OnlineOrderStatus = typeof ALLOWED_STATUSES[number]

export interface OnlineOrderRow {
  id: string
  order_number: string
  status: string
  total: number
  payment_method: string | null
  paid_at: string | null
  created_at: string
}

export const getOnlineOrdersList = protectedAction<
  { limit?: number; status?: string } | undefined,
  OnlineOrderRow[]
>(
  { permission: 'shop.view', auditModule: 'cms' },
  async (ctx, opts) => {
    const admin = ctx.adminClient
    const limit = opts?.limit ?? 50
    let q = admin
      .from('online_orders')
      .select('id, order_number, status, total, payment_method, paid_at, created_at')
      .order('created_at', { ascending: false })
      .limit(limit)
    if (opts?.status) q = q.eq('status', opts.status)
    const { data, error } = await q
    if (error) return failure(error.message)
    return success((data || []) as OnlineOrderRow[])
  }
)

export interface OnlineOrderLineRow {
  id: string
  order_id: string
  product_name: string | null
  variant_sku: string | null
  quantity: number
  unit_price: number
  total: number
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
  lines: OnlineOrderLineRow[]
  client?: { email: string; first_name: string | null; last_name: string | null; phone: string | null }
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
        shipping_address, shipping_tracking_number
      `)
      .eq('id', orderId)
      .single()
    if (orderError || !order) return success(null)
    const { data: lines, error: linesError } = await admin
      .from('online_order_lines')
      .select('id, order_id, product_name, variant_sku, quantity, unit_price, total')
      .eq('order_id', orderId)
      .order('id', { ascending: true })
    if (linesError) return failure(linesError.message)
    let client: OnlineOrderDetail['client'] = undefined
    if ((order as Record<string, unknown>).client_id) {
      const { data: c } = await admin
        .from('clients')
        .select('email, first_name, last_name, phone')
        .eq('id', (order as Record<string, unknown>).client_id)
        .single()
      if (c) client = c as OnlineOrderDetail['client']
    }
    return success({
      ...(order as Record<string, unknown>),
      lines: (lines || []) as OnlineOrderLineRow[],
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
        // Fallback: email en shipping_address (clientes invitados del checkout)
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
        // No bloqueamos el cambio de estado por un fallo en el email.
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
