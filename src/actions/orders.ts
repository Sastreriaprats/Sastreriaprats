'use server'

import { protectedAction } from '@/lib/server/action-wrapper'
import { queryList, queryById, getNextNumber } from '@/lib/server/query-helpers'
import { createTailoringOrderSchema, tailoringOrderLineSchema, changeOrderStatusSchema } from '@/lib/validations/orders'
import { success, failure } from '@/lib/errors'
import type { ListParams, ListResult } from '@/lib/server/query-helpers'

const SELECT_ORDERS = `
  id, order_number, order_type, status, order_date,
  estimated_delivery_date, total, total_paid, total_pending,
  created_at,
  clients ( id, full_name, phone, email, category ),
  stores ( name, code )
`

export const listOrders = protectedAction<ListParams & { status?: string }, ListResult<any>>(
  { permission: 'orders.view', auditModule: 'orders' },
  async (ctx, params) => {
    const statusFilter = params.filters?.status ?? params.status
    const isOverdue = statusFilter === 'overdue'
    const today = new Date().toISOString().split('T')[0]

    const filters: Record<string, any> = { ...params.filters }
    if (statusFilter && statusFilter !== 'all' && !isOverdue) {
      filters.status = statusFilter
    } else if (isOverdue) {
      delete filters.status
    }

    let result: Awaited<ReturnType<typeof queryList<any>>>

    if (isOverdue) {
      let query = ctx.adminClient
        .from('tailoring_orders')
        .select(SELECT_ORDERS, { count: 'exact' })
        .lt('estimated_delivery_date', today)
        .not('status', 'in', '("delivered","cancelled")')
      if (params.search) query = query.ilike('order_number', `%${params.search}%`)
      if (params.filters?.order_type) query = query.eq('order_type', params.filters.order_type)
      if (params.storeId) query = query.eq('store_id', params.storeId)
      query = query.order(params.sortBy || 'created_at', { ascending: params.sortOrder === 'asc' })
      const page = params.page || 1
      const pageSize = params.pageSize || 20
      const from = (page - 1) * pageSize
      const to = from + pageSize - 1
      const { data, count, error } = await query.range(from, to)
      if (error) {
        console.error('[listOrders] overdue:', error)
        return success({ data: [], total: 0, page, pageSize, totalPages: 0, statusCounts: {}, totalAll: 0 })
      }
      result = {
        data: (data || []) as any[],
        total: count ?? 0,
        page,
        pageSize,
        totalPages: Math.ceil((count ?? 0) / pageSize),
      }
    } else {
      result = await queryList('tailoring_orders', {
        ...params,
        filters,
        searchFields: ['order_number'],
      }, SELECT_ORDERS)
    }

    const countFilters = { ...filters }
    delete countFilters.status
    let statusQuery = ctx.adminClient.from('tailoring_orders').select('status')
    for (const [key, value] of Object.entries(countFilters)) {
      if (value === undefined || value === null || value === '') continue
      if (Array.isArray(value)) statusQuery = statusQuery.in(key, value)
      else if (typeof value === 'boolean') statusQuery = statusQuery.eq(key, value)
      else if (typeof value === 'string' && value.startsWith('>=')) statusQuery = statusQuery.gte(key, value.slice(2))
      else if (typeof value === 'string' && value.startsWith('<=')) statusQuery = statusQuery.lte(key, value.slice(2))
      else if (typeof value === 'string' && value.startsWith('!=')) statusQuery = statusQuery.neq(key, value.slice(2))
      else statusQuery = statusQuery.eq(key, value)
    }
    if (params.search) statusQuery = statusQuery.ilike('order_number', `%${params.search}%`)
    if (params.storeId) statusQuery = statusQuery.eq('store_id', params.storeId)
    const { data: statusData } = await statusQuery
    const statusCounts = (statusData || []).reduce((acc: Record<string, number>, o: { status: string }) => {
      acc[o.status] = (acc[o.status] || 0) + 1
      return acc
    }, {})

    const { count: overdueCount } = await ctx.adminClient
      .from('tailoring_orders')
      .select('id', { count: 'exact', head: true })
      .lt('estimated_delivery_date', today)
      .not('status', 'in', '("delivered","cancelled")')
    if (typeof overdueCount === 'number') (statusCounts as Record<string, number>)['overdue'] = overdueCount

    const totalAll = (statusData || []).length

    return success({ ...result, statusCounts, totalAll })
  }
)

export const getOrder = protectedAction<string, any>(
  { permission: 'orders.view', auditModule: 'orders' },
  async (ctx, orderId) => {
    const order = await queryById('tailoring_orders', orderId, `
      *,
      clients ( id, full_name, phone, email, category, document_number ),
      stores ( id, name, code ),
      tailoring_order_lines (
        *,
        garment_types ( id, name, code ),
        fabrics ( id, fabric_code, name, composition ),
        suppliers ( id, name )
      ),
      tailoring_order_state_history ( id, from_status, to_status, notes, changed_by_name, changed_at ),
      tailoring_fittings ( id, fitting_number, scheduled_date, scheduled_time, status, adjustments_needed )
    `)
    if (!order) return failure('Pedido no encontrado', 'NOT_FOUND')
    return success(order)
  }
)

export const createOrderAction = protectedAction<{ order: any; lines: any[] }, any>(
  {
    permission: 'orders.create',
    auditModule: 'orders',
    auditAction: 'create',
    auditEntity: 'tailoring_order',
    revalidate: ['/admin/pedidos'],
  },
  async (ctx, { order: orderInput, lines: linesInput }) => {
    const parsedOrder = createTailoringOrderSchema.safeParse(orderInput)
    if (!parsedOrder.success) return failure(parsedOrder.error.issues[0].message, 'VALIDATION')

    for (const line of linesInput) {
      const parsed = tailoringOrderLineSchema.safeParse(line)
      if (!parsed.success) return failure(`Línea inválida: ${parsed.error.issues[0].message}`, 'VALIDATION')
    }

    const { data: store } = await ctx.adminClient
      .from('stores').select('order_prefix').eq('id', parsedOrder.data.store_id).single()
    const prefix = store?.order_prefix || 'ORD'

    const orderNumber = await getNextNumber('tailoring_orders', 'order_number', prefix)

    let subtotal = 0
    const processedLines = linesInput.map((line: any, idx: number) => {
      const lineDiscount = line.unit_price * (line.discount_percentage || 0) / 100
      const lineTotal = line.unit_price - lineDiscount
      subtotal += lineTotal
      return { ...line, discount_amount: lineDiscount, line_total: lineTotal, sort_order: idx }
    })

    const orderDiscount = subtotal * (parsedOrder.data.discount_percentage || 0) / 100
    const taxableAmount = subtotal - orderDiscount
    const taxAmount = taxableAmount * 0.21
    const total = taxableAmount + taxAmount

    const { data: order, error: orderError } = await ctx.adminClient
      .from('tailoring_orders')
      .insert({
        ...parsedOrder.data,
        order_number: orderNumber,
        subtotal,
        discount_amount: orderDiscount,
        tax_amount: taxAmount,
        total,
        created_by: ctx.userId,
      })
      .select()
      .single()

    if (orderError) return failure(orderError.message)

    const linesToInsert = processedLines.map((line: any) => ({
      ...line,
      tailoring_order_id: order.id,
    }))

    const { error: linesError } = await ctx.adminClient
      .from('tailoring_order_lines')
      .insert(linesToInsert)

    if (linesError) return failure(linesError.message)

    await ctx.adminClient.from('tailoring_order_state_history').insert({
      tailoring_order_id: order.id,
      to_status: 'created',
      changed_by: ctx.userId,
      changed_by_name: ctx.userName,
    })

    return success(order)
  }
)

export const changeOrderStatus = protectedAction<any, any>(
  {
    permission: 'orders.edit',
    auditModule: 'orders',
    auditAction: 'state_change',
    auditEntity: 'tailoring_order',
    revalidate: ['/admin/pedidos'],
  },
  async (ctx, input) => {
    const parsed = changeOrderStatusSchema.safeParse(input)
    if (!parsed.success) return failure(parsed.error.issues[0].message, 'VALIDATION')

    const { order_id, line_id, new_status, notes } = parsed.data

    if (line_id) {
      const { data: line } = await ctx.adminClient
        .from('tailoring_order_lines').select('status').eq('id', line_id).single()
      if (!line) return failure('Línea de pedido no encontrada')

      await ctx.adminClient
        .from('tailoring_order_lines').update({ status: new_status }).eq('id', line_id)

      await ctx.adminClient.from('tailoring_order_state_history').insert({
        tailoring_order_id: order_id,
        tailoring_order_line_id: line_id,
        from_status: line.status,
        to_status: new_status,
        notes,
        changed_by: ctx.userId,
        changed_by_name: ctx.userName,
      })
    } else {
      const { data: order } = await ctx.adminClient
        .from('tailoring_orders').select('status').eq('id', order_id).single()
      if (!order) return failure('Pedido no encontrado')

      await ctx.adminClient
        .from('tailoring_orders')
        .update({
          status: new_status,
          ...(new_status === 'delivered' ? { actual_delivery_date: new Date().toISOString().split('T')[0] } : {}),
        })
        .eq('id', order_id)

      await ctx.adminClient
        .from('tailoring_order_lines').update({ status: new_status }).eq('tailoring_order_id', order_id)

      await ctx.adminClient.from('tailoring_order_state_history').insert({
        tailoring_order_id: order_id,
        from_status: order.status,
        to_status: new_status,
        notes,
        changed_by: ctx.userId,
        changed_by_name: ctx.userName,
      })
    }

    return success({ order_id, new_status })
  }
)

export const scheduleFitting = protectedAction<{
  orderId: string; lineId?: string; date: string; time: string;
  storeId: string; tailorId?: string; notes?: string;
}, any>(
  {
    permission: 'orders.edit',
    auditModule: 'orders',
    auditAction: 'create',
    auditEntity: 'fitting',
    revalidate: ['/admin/pedidos', '/admin/calendario'],
  },
  async (ctx, input) => {
    const { data: existing } = await ctx.adminClient
      .from('tailoring_fittings')
      .select('fitting_number')
      .eq('tailoring_order_id', input.orderId)
      .order('fitting_number', { ascending: false })
      .limit(1)

    const nextNumber = existing && existing.length > 0 ? existing[0].fitting_number + 1 : 1

    const { data: fitting, error } = await ctx.adminClient
      .from('tailoring_fittings')
      .insert({
        tailoring_order_id: input.orderId,
        tailoring_order_line_id: input.lineId || null,
        fitting_number: nextNumber,
        scheduled_date: input.date,
        scheduled_time: input.time,
        store_id: input.storeId,
        tailor_id: input.tailorId || null,
        notes: input.notes || null,
      })
      .select()
      .single()

    if (error) return failure(error.message)
    return success(fitting)
  }
)
