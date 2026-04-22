'use server'

import { revalidatePath } from 'next/cache'
import { protectedAction } from '@/lib/server/action-wrapper'
import { queryList, queryById, getNextNumber } from '@/lib/server/query-helpers'
import { createAdminClient } from '@/lib/supabase/admin'
import { createTailoringOrderSchema, tailoringOrderLineSchema, changeOrderStatusSchema } from '@/lib/validations/orders'
import { success, failure } from '@/lib/errors'
import type { ListParams, ListResult } from '@/lib/server/query-helpers'
import { sendOrderConfirmation, sendTailoringStatusUpdate } from '@/lib/email/transactional'

const SELECT_ORDERS = `
  id, order_number, order_type, status, order_date,
  estimated_delivery_date, total, total_paid, total_pending,
  created_at,
  clients ( id, full_name, phone, email, category ),
  stores ( name, code )
`

/** Devuelve el siguiente número de talón (solo el número, ej. 46). */
export async function getNextTalonNumber(): Promise<number> {
  const supabase = createAdminClient()
  const { data } = await supabase
    .from('tailoring_orders')
    .select('order_number')
    .order('created_at', { ascending: false })
    .limit(1)
    .single()
  if (data?.order_number) {
    const match = String(data.order_number).match(/(\d+)$/)
    if (match) return parseInt(match[1], 10) + 1
  }
  return 1
}

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

/** Búsqueda de pedidos por número para vincular a pedido a proveedor. */
export const searchTailoringOrdersByNumber = protectedAction<
  { query: string },
  { id: string; order_number: string; client_name: string }[]
>(
  { permission: 'orders.view', auditModule: 'orders' },
  async (ctx, { query }) => {
    const q = (query || '').trim()
    if (q.length < 2) return success([])
    const { data, error } = await ctx.adminClient
      .from('tailoring_orders')
      .select('id, order_number, clients(full_name)')
      .ilike('order_number', `%${q}%`)
      .order('order_number', { ascending: false })
      .limit(10)
    if (error) return failure(error.message)
    const list = (data ?? []).map((r: any) => {
      const client = r.clients ?? (Array.isArray(r.clients) ? r.clients[0] : null)
      return {
        id: r.id,
        order_number: r.order_number ?? '',
        client_name: client?.full_name ?? '',
      }
    })
    return success(list)
  }
)

export const getOrder = protectedAction<string, any>(
  { permission: 'orders.view', auditModule: 'orders' },
  async (ctx, orderId) => {
    const admin = ctx.adminClient

    // Query base sin joins para evitar 400 por tablas/FKs problemáticas
    const { data: orderBase, error: baseError } = await admin
      .from('tailoring_orders')
      .select('id, order_number, total, total_paid, total_pending, client_id, status, order_type, order_date, estimated_delivery_date, subtotal, discount_amount, tax_amount, store_id, internal_notes, client_notes, created_at, updated_at, created_by')
      .eq('id', orderId)
      .single()

    if (baseError || !orderBase) {
      console.error('[getOrder] base query error:', baseError)
      return failure('Pedido no encontrado', 'NOT_FOUND')
    }

    const order = orderBase as Record<string, unknown>

    // Joins en paralelo — cada uno falla de forma independiente
    const clientId = order.client_id as string | undefined
    const storeId = order.store_id as string | undefined

    const [
      { data: clientData },
      { data: storeData },
      { data: orderLines },
      { data: stateHistory },
      { data: fittings },
    ] = await Promise.all([
      clientId
        ? admin.from('clients').select('id, full_name, first_name, last_name, phone, email, category, document_number').eq('id', clientId).maybeSingle()
        : Promise.resolve({ data: null, error: null }),
      storeId
        ? admin.from('stores').select('id, name, code').eq('id', storeId).maybeSingle()
        : Promise.resolve({ data: null, error: null }),
      admin.from('tailoring_order_lines').select('*').eq('tailoring_order_id', orderId),
      admin.from('tailoring_order_state_history').select('id, from_status, to_status, description, notes, changed_by_name, changed_at').eq('tailoring_order_id', orderId).order('changed_at', { ascending: false }),
      admin.from('tailoring_fittings').select('id, fitting_number, scheduled_date, scheduled_time, status, adjustments_needed').eq('tailoring_order_id', orderId).order('scheduled_date', { ascending: true }),
    ])

    order.clients = clientData ?? null
    order.stores = storeData ?? null
    order.tailoring_order_state_history = stateHistory ?? []
    order.tailoring_fittings = fittings ?? []

    // Enriquecer líneas con sus joins
    const lines = (orderLines ?? []) as Record<string, unknown>[]
    if (lines.length > 0) {
      const garmentTypeIds = [...new Set(lines.map(l => l.garment_type_id).filter(Boolean))] as string[]
      const fabricIds = [...new Set(lines.map(l => l.fabric_id).filter(Boolean))] as string[]
      const supplierIds = [...new Set(lines.map(l => l.supplier_id).filter(Boolean))] as string[]

      const [{ data: garmentTypes }, { data: fabrics }, { data: suppliers }] = await Promise.all([
        garmentTypeIds.length ? admin.from('garment_types').select('id, name, code').in('id', garmentTypeIds) : Promise.resolve({ data: [], error: null }),
        fabricIds.length ? admin.from('fabrics').select('id, fabric_code, name, composition').in('id', fabricIds) : Promise.resolve({ data: [], error: null }),
        supplierIds.length ? admin.from('suppliers').select('id, name').in('id', supplierIds) : Promise.resolve({ data: [], error: null }),
      ])

      const gtMap = Object.fromEntries((garmentTypes ?? []).map((g: Record<string, unknown>) => [g.id, g]))
      const fMap = Object.fromEntries((fabrics ?? []).map((f: Record<string, unknown>) => [f.id, f]))
      const sMap = Object.fromEntries((suppliers ?? []).map((s: Record<string, unknown>) => [s.id, s]))

      for (const line of lines) {
        line.garment_types = gtMap[line.garment_type_id as string] ?? null
        line.fabrics = fMap[line.fabric_id as string] ?? null
        line.suppliers = sMap[line.supplier_id as string] ?? null
      }
    }
    order.tailoring_order_lines = lines

    // Medidas del cliente
    if (clientId) {
      const { data: measurementsRows } = await admin
        .from('client_measurements')
        .select('values')
        .eq('client_id', clientId)
        .eq('is_current', true)
      const merged: Record<string, unknown> = {}
      for (const record of measurementsRows ?? []) {
        const v = (record as { values?: unknown }).values
        if (!v || typeof v !== 'object' || Array.isArray(v)) continue
        for (const [key, val] of Object.entries(v)) {
          if (val !== null && val !== undefined && val !== '') merged[key] = val
        }
      }
      order.clientMeasurements = { values: merged }
    }

    return success(order)
  }
)

export const createOrderAction = protectedAction<{ order: any; lines: any[] }, any>(
  {
    permission: 'orders.create',
    auditModule: 'orders',
    auditAction: 'create',
    auditEntity: 'tailoring_order',
    revalidate: ['/admin/pedidos', '/sastre/pedidos'],
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

    if (order.client_id) {
      const { data: client } = await ctx.adminClient
        .from('clients')
        .select('email, full_name, first_name, last_name')
        .eq('id', order.client_id)
        .single()
      const clientEmail = (client as { email?: string } | null)?.email
      if (clientEmail) {
        const { data: linesWithTypes } = await ctx.adminClient
          .from('tailoring_order_lines')
          .select('garment_types(name)')
          .eq('tailoring_order_id', order.id)
          .limit(100)
        const items = (linesWithTypes ?? []).map((l: unknown) => {
          const gt = (l as { garment_types?: { name?: string } | null }).garment_types
          return (typeof gt === 'object' && gt && 'name' in gt ? gt.name : null) ?? 'Prenda'
        })
        const clientName = (client as { full_name?: string; first_name?: string; last_name?: string })?.full_name ||
          [(client as { first_name?: string })?.first_name, (client as { last_name?: string })?.last_name].filter(Boolean).join(' ') || 'Cliente'
        try {
          await sendOrderConfirmation({
            order_number: order.order_number,
            client_name: clientName,
            client_email: clientEmail,
            total: Number(order.total),
            items: items.length ? items : ['Pedido sastrería'],
          })
        } catch (e) {
          console.error('[createOrderAction] sendOrderConfirmation:', e)
        }
      }
    }

    await ctx.adminClient.from('tailoring_order_state_history').insert({
      tailoring_order_id: order.id,
      to_status: 'created',
      changed_by: ctx.userId,
      changed_by_name: ctx.userName,
    })

    let clientName = 'Sin cliente'
    if (order.client_id) {
      const { data: client } = await ctx.adminClient
        .from('clients')
        .select('full_name, first_name, last_name')
        .eq('id', order.client_id)
        .single()
      if (client) clientName = (client as any).full_name || [ (client as any).first_name, (client as any).last_name ].filter(Boolean).join(' ') || 'Sin nombre'
    }
    const auditDescription = `Pedido ${orderNumber} · Cliente: ${clientName}`
    return success({ ...order, auditDescription })
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

    let fromStatus: string | null = null
    if (line_id) {
      const { data: line } = await ctx.adminClient
        .from('tailoring_order_lines').select('status').eq('id', line_id).single()
      if (!line) return failure('Línea de pedido no encontrada')
      fromStatus = (line as any).status ?? null

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
      fromStatus = (order as any).status ?? null

      await ctx.adminClient
        .from('tailoring_orders')
        .update({
          status: new_status,
          ...(new_status === 'delivered' ? { actual_delivery_date: new Date().toISOString().split('T')[0] } : {}),
        })
        .eq('id', order_id)

      await ctx.adminClient
        .from('tailoring_order_lines').update({ status: new_status }).eq('tailoring_order_id', order_id).eq('status', 'created')
      fromStatus = fromStatus ?? (order as any).status ?? null

      await ctx.adminClient.from('tailoring_order_state_history').insert({
        tailoring_order_id: order_id,
        from_status: order.status,
        to_status: new_status,
        notes,
        changed_by: ctx.userId,
        changed_by_name: ctx.userName,
      })

      const { data: orderWithClient } = await ctx.adminClient
        .from('tailoring_orders')
        .select('order_number, clients(email, full_name, first_name, last_name)')
        .eq('id', order_id)
        .single()
      const client = (orderWithClient as { clients?: { email?: string; full_name?: string; first_name?: string; last_name?: string } | null } | null)?.clients
      const clientEmail = client?.email
      if (clientEmail && new_status === 'delivered') {
        const clientName = client?.full_name || [client?.first_name, client?.last_name].filter(Boolean).join(' ') || 'Cliente'
        try {
          await sendTailoringStatusUpdate({
            client_name: clientName,
            client_email: clientEmail,
            order_number: (orderWithClient as { order_number: string }).order_number,
            new_status,
            message: notes ?? undefined,
          })
        } catch (e) {
          console.error('[changeOrderStatus] sendTailoringStatusUpdate:', e)
        }
      }
    }

    // Resolver número de pedido para descripción legible
    const { data: orderRow } = await ctx.adminClient
      .from('tailoring_orders').select('order_number').eq('id', order_id).single()
    const orderNumber = (orderRow as any)?.order_number ?? order_id
    const statusEs: Record<string, string> = {
      created: 'Creado', in_progress: 'En progreso', in_production: 'En producción',
      ready: 'Listo', delivered: 'Entregado', cancelled: 'Cancelado', pending: 'Pendiente',
    }
    const fromEs = fromStatus ? (statusEs[fromStatus] ?? fromStatus) : '—'
    const toEs = statusEs[new_status] ?? new_status
    return success({
      order_id,
      new_status,
      auditEntityId: order_id,
      auditDescription: `Pedido ${orderNumber}: ${fromEs} → ${toEs}${line_id ? ' (línea)' : ''}`,
      auditOldData: { estado: fromStatus },
      auditNewData: { estado: new_status },
      auditMetadata: notes ? { notas: notes, linea_id: line_id ?? null } : { linea_id: line_id ?? null },
    })
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

export const markLineDelivered = protectedAction<string, { orderId: string }>(
  {
    permission: 'orders.edit',
    auditModule: 'orders',
    auditAction: 'update',
    auditEntity: 'tailoring_order_line',
    revalidate: ['/sastre/pedidos'],
  },
  async (ctx, lineId) => {
    if (!lineId?.trim()) return failure('ID de línea no válido', 'VALIDATION')

    const { data: line } = await ctx.adminClient
      .from('tailoring_order_lines')
      .select('id, tailoring_order_id')
      .eq('id', lineId.trim())
      .single()

    if (!line) return failure('Línea de pedido no encontrada', 'NOT_FOUND')

    const { error } = await ctx.adminClient
      .from('tailoring_order_lines')
      .update({
        delivered_at: new Date().toISOString(),
        delivered_by: ctx.userId,
      })
      .eq('id', lineId.trim())

    if (error) return failure(error.message, 'INTERNAL')

    const orderId = (line as { tailoring_order_id: string }).tailoring_order_id
    revalidatePath(`/sastre/pedidos/${orderId}`)
    return success({ orderId })
  }
)

export const updateOrderStatus = protectedAction<
  { orderId: string; newStatus: string; lineId?: string },
  { orderId: string }
>(
  {
    permission: 'orders.edit',
    auditModule: 'orders',
    auditAction: 'state_change',
    auditEntity: 'tailoring_order',
    revalidate: ['/sastre/pedidos'],
  },
  async (ctx, { orderId, newStatus, lineId }) => {
    if (!orderId?.trim() || !newStatus?.trim()) return failure('Parámetros no válidos', 'VALIDATION')

    let fromStatus: string | null = null
    if (lineId?.trim()) {
      const { data: prevLine } = await ctx.adminClient
        .from('tailoring_order_lines')
        .select('status')
        .eq('id', lineId.trim())
        .single()
      fromStatus = (prevLine as any)?.status ?? null
      const { error } = await ctx.adminClient
        .from('tailoring_order_lines')
        .update({ status: newStatus.trim() })
        .eq('id', lineId.trim())
        .eq('tailoring_order_id', orderId.trim())

      if (error) return failure(error.message, 'INTERNAL')
    } else {
      const { data: prevOrder } = await ctx.adminClient
        .from('tailoring_orders')
        .select('status')
        .eq('id', orderId.trim())
        .single()
      fromStatus = (prevOrder as any)?.status ?? null
      const { error } = await ctx.adminClient
        .from('tailoring_orders')
        .update({ status: newStatus.trim() })
        .eq('id', orderId.trim())

      if (error) return failure(error.message, 'INTERNAL')
    }

    revalidatePath(`/sastre/pedidos/${orderId}`)
    const { data: ord } = await ctx.adminClient
      .from('tailoring_orders').select('order_number').eq('id', orderId.trim()).single()
    const orderNumber = (ord as any)?.order_number ?? orderId
    const statusEs: Record<string, string> = {
      created: 'Creado', in_progress: 'En progreso', in_production: 'En producción',
      ready: 'Listo', delivered: 'Entregado', cancelled: 'Cancelado', pending: 'Pendiente',
    }
    const fromEs = fromStatus ? (statusEs[fromStatus] ?? fromStatus) : '—'
    const toEs = statusEs[newStatus.trim()] ?? newStatus.trim()
    return success({
      orderId,
      auditEntityId: orderId,
      auditDescription: `Pedido ${orderNumber}: ${fromEs} → ${toEs}${lineId ? ' (línea)' : ''}`,
      auditOldData: { estado: fromStatus },
      auditNewData: { estado: newStatus.trim() },
      auditMetadata: { linea_id: lineId ?? null },
    })
  }
)

// ─── Edición completa de pedido existente ──────────────────────────────────

export interface UpdateOrderInput {
  orderId: string
  // Cabecera (todos opcionales — solo se aplican los definidos)
  client_id?: string | null
  store_id?: string
  order_type?: 'artesanal' | 'industrial'
  estimated_delivery_date?: string | null
  delivery_method?: 'store' | 'home'
  delivery_address?: string | null
  delivery_city?: string | null
  delivery_postal_code?: string | null
  discount_percentage?: number
  internal_notes?: string | null
  client_notes?: string | null
  // Líneas — si se pasa, reemplaza el estado completo: update/insert/delete
  lines?: Array<{
    id?: string
    garment_type_id: string
    line_type: 'artesanal' | 'industrial'
    unit_price: number
    discount_percentage?: number
    tax_rate?: number
    material_cost?: number
    labor_cost?: number
    factory_cost?: number
    fabric_id?: string | null
    fabric_description?: string | null
    fabric_meters?: number | null
    supplier_id?: string | null
    model_name?: string | null
    model_size?: string | null
    finishing_notes?: string | null
    configuration?: Record<string, unknown>
    sort_order?: number
  }>
}

const HEADER_EDITABLE_FIELDS = [
  'client_id', 'store_id', 'order_type', 'estimated_delivery_date',
  'delivery_method', 'delivery_address', 'delivery_city', 'delivery_postal_code',
  'discount_percentage', 'internal_notes', 'client_notes',
] as const

const LINE_EDITABLE_FIELDS = [
  'garment_type_id', 'line_type', 'unit_price', 'discount_percentage', 'tax_rate',
  'material_cost', 'labor_cost', 'factory_cost',
  'fabric_id', 'fabric_description', 'fabric_meters', 'supplier_id',
  'model_name', 'model_size', 'finishing_notes', 'configuration', 'sort_order',
] as const

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

function buildChangeSummary(
  headerDiff: Record<string, { old: unknown; new: unknown }>,
  lineChanges: { added: number; removed: number; modified: number },
): string {
  const parts: string[] = []
  const entries = Object.entries(headerDiff)
  if (entries.length > 0) {
    const labelMap: Record<string, string> = {
      client_id: 'cliente',
      store_id: 'tienda',
      order_type: 'tipo',
      estimated_delivery_date: 'fecha entrega',
      delivery_method: 'método de entrega',
      delivery_address: 'dirección',
      delivery_city: 'ciudad',
      delivery_postal_code: 'CP',
      discount_percentage: 'descuento',
      internal_notes: 'notas internas',
      client_notes: 'notas cliente',
    }
    parts.push(entries.map(([k]) => labelMap[k] ?? k).join(', '))
  }
  const lineBits: string[] = []
  if (lineChanges.added > 0) lineBits.push(`${lineChanges.added} línea${lineChanges.added === 1 ? '' : 's'} añadida${lineChanges.added === 1 ? '' : 's'}`)
  if (lineChanges.removed > 0) lineBits.push(`${lineChanges.removed} eliminada${lineChanges.removed === 1 ? '' : 's'}`)
  if (lineChanges.modified > 0) lineBits.push(`${lineChanges.modified} modificada${lineChanges.modified === 1 ? '' : 's'}`)
  if (lineBits.length > 0) parts.push(`Prendas: ${lineBits.join(', ')}`)
  if (parts.length === 0) return 'Editado (sin cambios detectados)'
  return 'Editado: ' + parts.join(' · ')
}

export const updateOrderAction = protectedAction<UpdateOrderInput, any>(
  {
    permission: 'orders.edit',
    auditModule: 'orders',
    auditAction: 'update',
    auditEntity: 'tailoring_order',
    revalidate: ['/admin/pedidos'],
  },
  async (ctx, input) => {
    if (!input.orderId) return failure('orderId requerido', 'VALIDATION')

    const admin = ctx.adminClient

    // 1. Leer pedido actual completo (cabecera + líneas)
    const { data: orderBefore, error: orderErr } = await admin
      .from('tailoring_orders')
      .select('*')
      .eq('id', input.orderId)
      .single()
    if (orderErr || !orderBefore) return failure('Pedido no encontrado', 'NOT_FOUND')

    const currentStatus = String((orderBefore as any).status)
    if (currentStatus === 'delivered' || currentStatus === 'cancelled') {
      return failure(`No se puede editar un pedido en estado "${currentStatus}"`, 'CONFLICT')
    }

    const { data: linesBefore } = await admin
      .from('tailoring_order_lines')
      .select('*')
      .eq('tailoring_order_id', input.orderId)
      .order('sort_order', { ascending: true })

    const linesBeforeArr = (linesBefore || []) as Array<Record<string, any>>

    // 2. Aplicar cambios en cabecera
    const headerUpdate: Record<string, any> = {}
    const headerDiff: Record<string, { old: unknown; new: unknown }> = {}
    for (const field of HEADER_EDITABLE_FIELDS) {
      const incoming = (input as any)[field]
      if (incoming === undefined) continue
      const current = (orderBefore as any)[field]
      // Normalización blanda: null/'' equivalentes para textuales
      const norm = (v: any) => (v === undefined || v === '' ? null : v)
      if (norm(incoming) !== norm(current)) {
        headerUpdate[field] = incoming
        headerDiff[field] = { old: current, new: incoming }
      }
    }

    // 3. Procesar líneas si vienen en el input
    const lineChanges = { added: 0, removed: 0, modified: 0 }
    const linesAfterDiff: Array<{ id: string; action: 'insert' | 'update' | 'delete'; before?: any; after?: any }> = []

    if (input.lines !== undefined) {
      const incomingLines = input.lines
      const incomingIds = new Set(incomingLines.map((l) => l.id).filter(Boolean) as string[])

      // DELETE: líneas que existían antes pero ya no están
      const toDelete = linesBeforeArr.filter((l) => !incomingIds.has(String(l.id)))
      if (toDelete.length > 0) {
        const { error: delErr } = await admin
          .from('tailoring_order_lines')
          .delete()
          .in('id', toDelete.map((l) => l.id))
        if (delErr) return failure(`Error al eliminar líneas: ${delErr.message}`)
        lineChanges.removed = toDelete.length
        for (const l of toDelete) linesAfterDiff.push({ id: String(l.id), action: 'delete', before: l })
      }

      // UPDATE / INSERT
      for (let i = 0; i < incomingLines.length; i++) {
        const line = incomingLines[i]
        const unitPrice = Number(line.unit_price) || 0
        const discountPct = Number(line.discount_percentage) || 0
        const discountAmount = round2(unitPrice * discountPct / 100)
        const lineTotal = round2(unitPrice - discountAmount)
        const sortOrder = line.sort_order ?? i

        const row: Record<string, any> = {
          garment_type_id: line.garment_type_id,
          line_type: line.line_type,
          unit_price: unitPrice,
          discount_percentage: discountPct,
          discount_amount: discountAmount,
          line_total: lineTotal,
          tax_rate: Number(line.tax_rate ?? 21),
          material_cost: Number(line.material_cost ?? 0),
          labor_cost: Number(line.labor_cost ?? 0),
          factory_cost: Number(line.factory_cost ?? 0),
          fabric_id: line.fabric_id || null,
          fabric_description: line.fabric_description?.toString().trim() || null,
          fabric_meters: line.fabric_meters ?? null,
          supplier_id: line.supplier_id || null,
          model_name: line.model_name?.toString().trim() || null,
          model_size: line.model_size?.toString().trim() || null,
          finishing_notes: line.finishing_notes?.toString().trim() || null,
          configuration: line.configuration ?? {},
          sort_order: sortOrder,
        }

        if (line.id) {
          const before = linesBeforeArr.find((l) => String(l.id) === line.id)
          // Detectar si hubo cambio real comparando campos editables
          let changed = false
          if (before) {
            for (const k of LINE_EDITABLE_FIELDS) {
              const a = (before as any)[k]
              const b = (row as any)[k]
              if (JSON.stringify(a ?? null) !== JSON.stringify(b ?? null)) { changed = true; break }
            }
          }
          const { error: updErr } = await admin
            .from('tailoring_order_lines')
            .update(row)
            .eq('id', line.id)
          if (updErr) return failure(`Error al actualizar línea: ${updErr.message}`)
          if (changed) {
            lineChanges.modified++
            linesAfterDiff.push({ id: line.id, action: 'update', before, after: row })
          }
        } else {
          const { data: inserted, error: insErr } = await admin
            .from('tailoring_order_lines')
            .insert({ ...row, tailoring_order_id: input.orderId })
            .select('id')
            .single()
          if (insErr) return failure(`Error al insertar línea: ${insErr.message}`)
          lineChanges.added++
          linesAfterDiff.push({ id: String((inserted as any)?.id ?? ''), action: 'insert', after: row })
        }
      }
    }

    // 4. Recalcular totales de cabecera (tras procesar líneas)
    const { data: finalLines } = await admin
      .from('tailoring_order_lines')
      .select('line_total, tax_rate')
      .eq('tailoring_order_id', input.orderId)
    const subtotalLines = (finalLines || []).reduce(
      (s: number, l: any) => s + Number(l.line_total || 0), 0,
    )
    const discountPct = headerUpdate.discount_percentage ?? (orderBefore as any).discount_percentage ?? 0
    const subtotalAfterHeaderDiscount = round2(subtotalLines * (1 - Number(discountPct) / 100))
    const discountAmount = round2(subtotalLines - subtotalAfterHeaderDiscount)
    // IVA ponderado por tax_rate de cada línea
    let taxAmount = 0
    for (const l of (finalLines || []) as any[]) {
      const lt = Number(l.line_total || 0)
      const tr = Number(l.tax_rate ?? 21)
      const ltAfter = lt * (1 - Number(discountPct) / 100)
      taxAmount += ltAfter * tr / (100 + tr)
    }
    taxAmount = round2(taxAmount)
    const total = subtotalAfterHeaderDiscount
    const subtotal = round2(total - taxAmount)

    headerUpdate.subtotal = subtotal
    headerUpdate.discount_amount = discountAmount
    headerUpdate.tax_amount = taxAmount
    headerUpdate.total = total
    headerUpdate.updated_at = new Date().toISOString()

    const { data: orderAfter, error: updOrderErr } = await admin
      .from('tailoring_orders')
      .update(headerUpdate)
      .eq('id', input.orderId)
      .select('*')
      .single()
    if (updOrderErr) return failure(updOrderErr.message)

    // 5. Registrar entrada de edición en el historial
    const description = buildChangeSummary(headerDiff, lineChanges)
    await admin.from('tailoring_order_state_history').insert({
      tailoring_order_id: input.orderId,
      from_status: currentStatus,
      to_status: currentStatus,
      description,
      notes: JSON.stringify({ header: headerDiff, lines: linesAfterDiff }),
      changed_by: ctx.userId,
      changed_by_name: ctx.userName,
    })

    // 6. Devolver datos para auditoría (protectedAction registra audit_log)
    return success({
      ...(orderAfter as any),
      auditDescription: `Pedido ${(orderBefore as any).order_number}: ${description}`,
      auditOldData: {
        header: Object.fromEntries(Object.entries(headerDiff).map(([k, v]) => [k, v.old])),
        lines: linesAfterDiff.map((d) => d.before).filter(Boolean),
      },
      auditNewData: {
        header: Object.fromEntries(Object.entries(headerDiff).map(([k, v]) => [k, v.new])),
        lines: linesAfterDiff.map((d) => d.after).filter(Boolean),
      },
      auditMetadata: { line_changes: lineChanges },
    })
  },
)

// ─── Nueva venta (ficha) ────────────────────────────────────────────────────

export interface PrendaLineaInput {
  slug: string
  label: string
  precio: number
  oficial: string
  configuration: Record<string, unknown>
  /** Coste estimado opcional (material + mano de obra) — se guarda en material_cost de la línea. */
  coste?: number
}

export interface CreateFichaOrderInput {
  clientId: string
  orderType: 'artesanal' | 'industrial' | 'camiseria' | 'camiseria_industrial'
  storeId: string
  precioPrenda?: number
  notas: string
  /** Una línea artesanal por sub-prenda (americana, pantalón, chaleco…). Si se pasa, se ignoran prenda/oficial/fichaData. */
  prendasSastreria?: PrendaLineaInput[]
  /** Campos comunes a todas las líneas de sastrería (tejido, cortador, domicilio…). */
  fichaCommon?: Record<string, unknown>
  /** Descripción de la ficha (alternativa a notas para el PDF). */
  descripcion?: string
  /** Cada elemento es una línea de camisa; la configuration se guarda completa. */
  camisas: Array<{
    precio: number
    [key: string]: unknown
  }>
  complementos: Array<{ product_variant_id: string; nombre: string; cantidad: number; precio: number; cost_price?: number }>
  entregaACuenta: number
  /** Método de pago cuando entregaACuenta > 0 (efectivo, tarjeta, transferencia, bizum). */
  metodoPago?: 'efectivo' | 'tarjeta' | 'transferencia' | 'bizum'
  /** Campos adicionales ficha de confección (cabecera y secciones) */
  prenda?: string
  cortador?: string
  oficial?: string
  fechaCompromiso?: string
  situacionTrabajo?: string
  fechaCobro?: string
  fichaData?: Record<string, unknown>
}

export const createFichaOrder = protectedAction<CreateFichaOrderInput, { orderId: string; orderNumber: string }>(
  {
    permission: 'orders.create',
    auditModule: 'orders',
    auditAction: 'create',
    auditEntity: 'tailoring_order',
    revalidate: ['/sastre/pedidos'],
  },
  async (ctx, input) => {
    const orderTypeDb: 'artesanal' | 'industrial' =
      input.orderType === 'artesanal' ? 'artesanal' : 'industrial'

    const initialStatus =
      input.orderType === 'artesanal' ? 'in_production'
      : input.orderType === 'industrial' ? 'factory_ordered'
      : input.orderType === 'camiseria' ? 'in_production'
      : 'created'

    const { data: garmentTypes } = await ctx.adminClient
      .from('garment_types')
      .select('id, name, code')
      .eq('is_active', true)

    const americana = (garmentTypes ?? []).find((g: { name?: string; code?: string }) =>
      (g.name && g.name.toLowerCase().includes('americana')) || (g.code && g.code.toLowerCase() === 'americana'))
    const camiseria = (garmentTypes ?? []).find((g: { name?: string; code?: string }) =>
      (g.name && g.name.toLowerCase().includes('camiser')) || (g.code && g.code.toLowerCase() === 'camiseria'))
    const firstType = garmentTypes?.[0]

    const findGarmentTypeByCode = (code: string) =>
      (garmentTypes ?? []).find((g: any) => g.code?.toLowerCase() === code.toLowerCase())

    const mainGarmentTypeId = americana?.id ?? firstType?.id
    const camiseriaGarmentTypeId = camiseria?.id ?? firstType?.id
    const complementGarmentTypeId = camiseria?.id ?? firstType?.id

    if (!mainGarmentTypeId) return failure('No hay tipos de prenda configurados')

    const entregaNum = Number(input.entregaACuenta) || 0
    if (entregaNum > 0 && !input.metodoPago) return failure('Indica el método de pago para la entrega a cuenta.')

    if (entregaNum > 0) {
      let sessionCheck = ctx.adminClient
        .from('cash_sessions')
        .select('id')
        .eq('status', 'open')
        .limit(1)
      if (input.storeId) sessionCheck = sessionCheck.eq('store_id', input.storeId)
      const { data: openSession } = await sessionCheck.maybeSingle()
      if (!openSession) return failure('No hay una caja abierta. Abre la caja antes de registrar una entrega a cuenta.')
    }

    const paymentMethodDb = input.metodoPago
      ? { efectivo: 'cash', tarjeta: 'card', transferencia: 'transfer', bizum: 'card' }[input.metodoPago] ?? 'cash'
      : 'cash'

    const { data: store } = await ctx.adminClient
      .from('stores').select('order_prefix').eq('id', input.storeId).single()
    const prefix = store?.order_prefix || 'ORD'
    const orderNumber = await getNextNumber('tailoring_orders', 'order_number', prefix)

    const precioConfeccion = input.prendasSastreria !== undefined
      ? input.prendasSastreria.reduce((s, p) => s + (Number(p.precio) || 0), 0)
      : Number(input.precioPrenda) || 0
    const totalCamisas = (input.camisas || []).reduce((s, c) => s + (Number(c.precio) || 0), 0)
    let totalComplementos = 0
    for (const comp of input.complementos || []) {
      const cantidad = Math.max(1, Math.floor(Number(comp.cantidad) || 1))
      totalComplementos += (Number(comp.precio) || 0) * cantidad
    }
    const subtotal = precioConfeccion + totalCamisas + totalComplementos
    const entregadoACuenta = Number(input.entregaACuenta) || 0

    let subtotalLines = precioConfeccion
    const linesToInsert: Array<{
      tailoring_order_id: string
      garment_type_id: string
      line_type: 'artesanal' | 'industrial'
      unit_price: number
      line_total: number
      material_cost: number
      finishing_notes: string | null
      configuration: Record<string, unknown>
      sort_order: number
    }> = []

    const { data: order, error: orderError } = await ctx.adminClient
      .from('tailoring_orders')
      .insert({
        client_id: input.clientId,
        order_type: orderTypeDb,
        store_id: input.storeId,
        status: initialStatus,
        order_number: orderNumber,
        estimated_delivery_date: (input.fichaCommon?.fechaProximaVisita as string) || input.fechaCompromiso || null,
        subtotal,
        discount_amount: 0,
        tax_amount: 0,
        total: subtotal,
        total_paid: entregadoACuenta,
        created_by: ctx.userId,
      })
      .select('id')
      .single()

    if (orderError || !order) return failure(orderError?.message ?? 'Error al crear el pedido')

    let sortOrder = 0

    if (input.prendasSastreria !== undefined && input.prendasSastreria.length > 0) {
      // Nueva arquitectura: una línea por sub-prenda
      for (const prendaInput of input.prendasSastreria) {
        const gtId = findGarmentTypeByCode(prendaInput.slug)?.id ?? mainGarmentTypeId
        linesToInsert.push({
          tailoring_order_id: order.id,
          garment_type_id: gtId,
          line_type: orderTypeDb,
          unit_price: Number(prendaInput.precio) || 0,
          line_total: Number(prendaInput.precio) || 0,
          material_cost: Number(prendaInput.coste) || 0,
          finishing_notes: (input.notas || '').trim() || null,
          configuration: {
            ...(input.fichaCommon ?? {}),
            ...prendaInput.configuration,
            prenda: prendaInput.slug,
            prendaLabel: prendaInput.label,
            oficial: prendaInput.oficial,
          },
          sort_order: sortOrder++,
        })
      }
    } else if (input.prendasSastreria === undefined) {
      // Ruta legacy: una sola línea artesanal
      const mainConfig: Record<string, unknown> = {
        ...(input.fichaData || {}),
        prenda: input.prenda,
        cortador: input.cortador,
        oficial: input.oficial,
        fechaCompromiso: input.fechaCompromiso,
        situacionTrabajo: input.situacionTrabajo,
        fechaCobro: input.fechaCobro,
        descripcion: (input.notas ?? input.descripcion ?? '').toString().trim() || undefined,
        observaciones: (input.notas || '').trim(),
      }
      linesToInsert.push({
        tailoring_order_id: order.id,
        garment_type_id: mainGarmentTypeId,
        line_type: orderTypeDb,
        unit_price: Number(input.precioPrenda) || 0,
        line_total: Number(input.precioPrenda) || 0,
        material_cost: 0,
        finishing_notes: (input.notas || '').trim() || null,
        configuration: mainConfig,
        sort_order: sortOrder++,
      })
    }
    // Si prendasSastreria === [] (solo camisería), no se crea línea artesanal

    for (const camisa of input.camisas || []) {
      const precio = Number(camisa.precio) || 0
      subtotalLines += precio
      const { precio: _p, coste: _c, ...config } = camisa as { precio: number; coste?: number; [k: string]: unknown }
      linesToInsert.push({
        tailoring_order_id: order.id,
        garment_type_id: camiseriaGarmentTypeId,
        line_type: 'industrial',
        unit_price: precio,
        line_total: precio,
        material_cost: Number((camisa as { coste?: number }).coste) || 0,
        finishing_notes: null,
        configuration: { ...config, tipo: 'camiseria' },
        sort_order: sortOrder++,
      })
    }

    // Si algún complemento no trae cost_price, lo buscamos en la BD (fallback).
    const complementsMissingCost = (input.complementos || []).filter(
      (c) => !(typeof c.cost_price === 'number' && c.cost_price > 0) && c.product_variant_id,
    )
    const costByVariantId = new Map<string, number>()
    if (complementsMissingCost.length > 0) {
      const variantIds = Array.from(new Set(complementsMissingCost.map((c) => c.product_variant_id)))
      const { data: variantsWithCost } = await ctx.adminClient
        .from('product_variants')
        .select('id, products(cost_price)')
        .in('id', variantIds)
      for (const v of (variantsWithCost || []) as any[]) {
        const parent = Array.isArray(v.products) ? v.products[0] : v.products
        const cost = Number(parent?.cost_price) || 0
        if (v.id) costByVariantId.set(String(v.id), cost)
      }
    }

    for (const comp of input.complementos || []) {
      const precio = Number(comp.precio) || 0
      const cantidad = Math.max(1, Math.floor(Number(comp.cantidad) || 1))
      const unitCost = typeof comp.cost_price === 'number' && comp.cost_price > 0
        ? Number(comp.cost_price)
        : (costByVariantId.get(comp.product_variant_id) ?? 0)
      for (let i = 0; i < cantidad; i++) {
        linesToInsert.push({
          tailoring_order_id: order.id,
          garment_type_id: complementGarmentTypeId,
          line_type: 'industrial',
          unit_price: precio,
          line_total: precio,
          material_cost: unitCost,
          finishing_notes: null,
          configuration: { product_variant_id: comp.product_variant_id, product_name: comp.nombre },
          sort_order: sortOrder++,
        })
      }
      subtotalLines += precio * cantidad
    }

    const total = subtotalLines
    const entrega = Number(input.entregaACuenta) || 0
    const totalPaid = entrega

    const { error: linesError } = await ctx.adminClient
      .from('tailoring_order_lines')
      .insert(linesToInsert.map((l) => ({
        tailoring_order_id: l.tailoring_order_id,
        garment_type_id: l.garment_type_id,
        line_type: l.line_type,
        unit_price: l.unit_price,
        line_total: l.line_total,
        material_cost: l.material_cost ?? 0,
        finishing_notes: l.finishing_notes,
        configuration: l.configuration,
        sort_order: l.sort_order,
      })))

    if (linesError) return failure(linesError.message)

    // Todos los precios incluyen IVA (21%) — desglosar para contabilidad
    const taxAmountCalc = Math.round((subtotalLines - subtotalLines / 1.21) * 100) / 100
    const subtotalNoTax = Math.round((subtotalLines / 1.21) * 100) / 100

    await ctx.adminClient
      .from('tailoring_orders')
      .update({
        subtotal: subtotalNoTax,
        tax_amount: taxAmountCalc,
        total: subtotalLines,
        total_paid: totalPaid,
      })
      .eq('id', order.id)

    await ctx.adminClient.from('tailoring_order_state_history').insert({
      tailoring_order_id: order.id,
      to_status: 'created',
      changed_by: ctx.userId,
      changed_by_name: ctx.userName,
    })

    if (entrega > 0) {
      const today = new Date().toISOString().split('T')[0]
      await ctx.adminClient.from('tailoring_order_payments').insert({
        tailoring_order_id: order.id,
        payment_date: today,
        payment_method: paymentMethodDb,
        amount: entrega,
        reference: `Entrega a cuenta - ${orderNumber}`,
        notes: `Entrega a cuenta - ${orderNumber}`,
        created_by: ctx.userId,
      })
      const baseAmount = entrega / 1.21
      const taxAmountManual = entrega - baseAmount
      let sessionQuery = ctx.adminClient
        .from('cash_sessions')
        .select('id')
        .eq('status', 'open')
        .limit(1)
      if (input.storeId) sessionQuery = sessionQuery.eq('store_id', input.storeId)
      const { data: activeSession } = await sessionQuery.maybeSingle()
      const activeSessionId = activeSession?.id ?? null
      const { error: mtError2 } = await ctx.adminClient.from('manual_transactions').insert({
        type: 'income',
        date: today,
        description: `Entrega a cuenta - ${orderNumber}`,
        category: 'sastreria',
        amount: baseAmount,
        tax_rate: 21,
        tax_amount: taxAmountManual,
        total: entrega,
        notes: `Pedido ${orderNumber} - ${input.metodoPago ?? 'efectivo'}`,
        created_by: ctx.userId,
        cash_session_id: activeSessionId,
      })
      if (mtError2) console.error('[createFichaOrder] manual_transactions error:', mtError2)
      if (activeSessionId) {
        const methodMap: Record<string, string> = {
          cash: 'total_cash_sales',
          card: 'total_card_sales',
          transfer: 'total_transfer_sales',
          bizum: 'total_bizum_sales',
        }
        const field = input.metodoPago === 'bizum' ? 'total_bizum_sales' : methodMap[paymentMethodDb]
        if (field) {
          const { data: currentSession } = await ctx.adminClient
            .from('cash_sessions')
            .select(`total_sales, ${field}`)
            .eq('id', activeSessionId)
            .single()
          if (currentSession) {
            const session = currentSession as unknown as { total_sales?: number; [k: string]: unknown }
            await ctx.adminClient
              .from('cash_sessions')
              .update({
                total_sales: (session.total_sales || 0) + entrega,
                [field]: ((session[field] as number) || 0) + entrega,
              })
              .eq('id', activeSessionId)
          }
        }
      }
    }

    return success({ orderId: order.id, orderNumber })
  }
)

/** Búsqueda de productos para complementos (boutique) en nueva venta.
 * Busca en products con product_type = 'boutique' por nombre (ILIKE).
 * Devuelve un resultado por producto usando la primera variante para id/sku/stock; precio desde products.price_with_tax.
 */
export const searchComplementProducts = protectedAction<
  { query: string; storeId?: string },
  Array<{ id: string; name: string; sku: string; price_with_tax: number; tax_rate: number; cost_price: number; stock: number }>
>(
  { permission: 'orders.create' },
  async (ctx, { query, storeId }) => {
    const q = (query || '').trim()
    if (q.length < 2) return success([])

    const { data: productsData, error: productsError } = await ctx.adminClient
      .from('products')
      .select('id, name, sku, price_with_tax, tax_rate, cost_price')
      .eq('product_type', 'boutique')
      .ilike('name', `%${q}%`)
      .limit(20)

    if (productsError) {
      console.error('[searchComplementProducts] products:', productsError)
      return success([])
    }
    const products = productsData ?? []
    if (products.length === 0) return success([])

    const productIds = products.map((p: { id: string }) => p.id)
    const { data: variantsData, error: variantsError } = await ctx.adminClient
      .from('product_variants')
      .select('id, product_id, variant_sku')
      .in('product_id', productIds)
      .order('created_at', { ascending: true })

    if (variantsError) {
      console.error('[searchComplementProducts] variants:', variantsError)
      return success([])
    }
    const variants = (variantsData ?? []) as Array<{ id: string; product_id: string; variant_sku: string }>
    const variantByProductId: Record<string, (typeof variants)[0]> = {}
    for (const v of variants) {
      if (!variantByProductId[v.product_id]) variantByProductId[v.product_id] = v
    }

    const variantIds = Object.values(variantByProductId).map((v) => v.id)
    let stockMap: Record<string, number> = {}
    if (variantIds.length > 0 && storeId) {
      const { data: wh } = await ctx.adminClient
        .from('warehouses')
        .select('id')
        .eq('store_id', storeId)
        .eq('is_main', true)
        .single()
      if (wh) {
        const { data: levels } = await ctx.adminClient
          .from('stock_levels')
          .select('product_variant_id, quantity')
          .eq('warehouse_id', wh.id)
          .in('product_variant_id', variantIds)
        for (const l of levels ?? []) {
          const row = l as { product_variant_id: string; quantity: number }
          stockMap[row.product_variant_id] = Number(row.quantity ?? 0)
        }
      }
    }

    const result = products
      .filter((p: { id: string }) => variantByProductId[p.id])
      .map((p: { id: string; name: string; sku: string | null; price_with_tax: unknown; tax_rate: unknown; cost_price: unknown }) => {
        const v = variantByProductId[p.id]
        return {
          id: v.id,
          name: p.name ?? '—',
          sku: v.variant_sku ?? p.sku ?? '—',
          price_with_tax: Number(p.price_with_tax) || 0,
          tax_rate: Number(p.tax_rate) || 0,
          cost_price: Number(p.cost_price) || 0,
          stock: stockMap[v.id] ?? 0,
        }
      })
    return success(result)
  }
)

export const deleteOrder = protectedAction<string, void>(
  { permission: 'orders.delete', auditModule: 'orders', auditAction: 'delete' },
  async (ctx, orderId) => {
    const admin = ctx.adminClient

    // Verificar que el pedido existe
    const { data: order, error: fetchError } = await admin
      .from('tailoring_orders')
      .select('id, order_number')
      .eq('id', orderId)
      .single()

    if (fetchError || !order) {
      return failure('Pedido no encontrado', 'NOT_FOUND')
    }

    // Borrar líneas del pedido
    await admin.from('tailoring_order_lines').delete().eq('tailoring_order_id', orderId)

    // Borrar pagos asociados
    await admin.from('payments').delete().eq('tailoring_order_id', orderId)

    // Borrar el pedido
    const { error: deleteError } = await admin
      .from('tailoring_orders')
      .delete()
      .eq('id', orderId)

    if (deleteError) {
      console.error('[deleteOrder]', deleteError)
      return failure('Error al eliminar el pedido')
    }

    revalidatePath('/admin/pedidos')
    return success(undefined)
  }
)
