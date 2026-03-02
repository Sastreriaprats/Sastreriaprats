'use server'

import { protectedAction } from '@/lib/server/action-wrapper'
import { success, failure } from '@/lib/errors'

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
