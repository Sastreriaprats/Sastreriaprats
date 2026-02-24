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
