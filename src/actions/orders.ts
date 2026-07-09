'use server'

import { revalidatePath } from 'next/cache'
import { protectedAction, type AdminClient } from '@/lib/server/action-wrapper'
import { queryList, queryById, getNextNumber, resolveClientIdsForSearch } from '@/lib/server/query-helpers'
import { createAdminClient } from '@/lib/supabase/admin'
import { createTailoringOrderSchema, tailoringOrderLineSchema, changeOrderStatusSchema } from '@/lib/validations/orders'
import { ALL_VISIBLE_STATUSES, classifyLinesForStatusChange, deriveOrderStatusFromLines, type OrderStatus } from '@/lib/orders/statuses'
import { success, failure } from '@/lib/errors'
import type { ListParams, ListResult } from '@/lib/server/query-helpers'
import { sendOrderConfirmation, sendTailoringStatusUpdate } from '@/lib/email/transactional'
import { normalizeSearchTerm, getOrderStatusLabel, formatDateTimeMadrid } from '@/lib/utils'
import { checkUserPermission } from '@/actions/auth'
import { syncOrderLineMeasurementsToClient } from '@/lib/measurements/sync-from-order'

/** Slug canónico de prenda desde code/name del garment_type ("Pantalón"→"pantalon"). */
function normalizeGarmentSlug(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().replace(/\s+/g, '_')
}

/** Mapa garment_type_id → slug, para sembrar `prenda`/`prendaSlug` en la
 *  configuration de las líneas (la ficha de confección las necesita para
 *  detectar el tipo de prenda; el wizard/edición no las persistían). */
async function buildGarmentSlugMap(admin: AdminClient, garmentTypeIds: (string | null | undefined)[]): Promise<Map<string, string>> {
  const ids = [...new Set(garmentTypeIds.filter((x): x is string => !!x))]
  if (!ids.length) return new Map()
  const { data } = await admin.from('garment_types').select('id, code, name').in('id', ids)
  const map = new Map<string, string>()
  for (const g of (data ?? []) as { id: string; code?: string; name?: string }[]) {
    const slug = normalizeGarmentSlug(String(g.code || g.name || ''))
    if (slug) map.set(String(g.id), slug)
  }
  return map
}

/** Devuelve la configuration con `prenda`/`prendaSlug` añadidos si faltan. */
function withPrendaSlug(configuration: unknown, slug: string | undefined): Record<string, unknown> {
  const cfg = (configuration ?? {}) as Record<string, unknown>
  if (!slug || cfg.prenda || cfg.prendaSlug) return cfg
  return { ...cfg, prenda: slug, prendaSlug: slug }
}

const SELECT_ORDERS = `
  id, order_number, order_type, status, order_date,
  estimated_delivery_date, payment_date, total, total_paid, total_pending,
  created_at,
  clients ( id, full_name, phone, email, category ),
  stores ( name, code ),
  tailoring_order_lines ( id, sort_order, configuration, garment_types ( name ) )
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

    // Búsqueda por nº de pedido o por nombre/teléfono del cliente. Como
    // PostgREST no permite ilike directo en tablas embebidas, pre-buscamos los
    // client_id que coinciden contra `clients.search_text` (unaccent + lower)
    // y los añadimos al OR como `client_id.in.(...)`.
    const normalizedSearch = normalizeSearchTerm(params.search || '')
    // Sanitizamos caracteres que pueden romper el parser .or() de PostgREST.
    const safeSearch = normalizedSearch.replace(/[,()*%:/\\]/g, ' ').trim()
    let searchOr: string | undefined
    if (safeSearch) {
      // Substring sobre clients.search_text y, si no hay match, fallback difuso.
      const clientIds = await resolveClientIdsForSearch(ctx.adminClient, safeSearch)
      // order_number es ASCII (PIN-2026-0053) — basta con un ilike directo.
      const parts = [`order_number.ilike.%${safeSearch}%`]
      if (clientIds.length > 0) parts.push(`client_id.in.(${clientIds.join(',')})`)
      searchOr = parts.join(',')
    }

    let result: Awaited<ReturnType<typeof queryList<any>>>

    if (isOverdue) {
      let query = ctx.adminClient
        .from('tailoring_orders')
        .select(SELECT_ORDERS, { count: 'exact' })
        .lt('estimated_delivery_date', today)
        .not('status', 'in', '("delivered","cancelled")')
      if (searchOr) query = query.or(searchOr)
      if (params.filters?.order_type) query = query.eq('order_type', params.filters.order_type)
      const overdueDateRange = params.filters?.order_date
      if (overdueDateRange && typeof overdueDateRange === 'object') {
        const r = overdueDateRange as Record<string, unknown>
        if (r.gte !== undefined && r.gte !== '') query = query.gte('order_date', r.gte)
        if (r.lte !== undefined && r.lte !== '') query = query.lte('order_date', r.lte)
      }
      if (params.storeId) query = query.eq('store_id', params.storeId)
      query = query.order(params.sortBy || 'order_date', { ascending: params.sortOrder === 'asc' })
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
        customSearchOr: searchOr,
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
      else if (typeof value === 'object') {
        const r = value as Record<string, unknown>
        if (r.gte !== undefined && r.gte !== '') statusQuery = statusQuery.gte(key, r.gte)
        if (r.lte !== undefined && r.lte !== '') statusQuery = statusQuery.lte(key, r.lte)
        if (r.gt !== undefined && r.gt !== '') statusQuery = statusQuery.gt(key, r.gt)
        if (r.lt !== undefined && r.lt !== '') statusQuery = statusQuery.lt(key, r.lt)
      }
      else statusQuery = statusQuery.eq(key, value)
    }
    if (searchOr) statusQuery = statusQuery.or(searchOr)
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

    // Sumatorios del conjunto filtrado COMPLETO (no solo la página visible), para
    // pintar la fila de totales del listado. Se replican exactamente las mismas
    // condiciones que la consulta de datos, sin paginar (tope de seguridad 100k).
    let sumsQuery = ctx.adminClient
      .from('tailoring_orders')
      .select('total, total_paid, total_pending')
    if (isOverdue) {
      sumsQuery = sumsQuery
        .lt('estimated_delivery_date', today)
        .not('status', 'in', '("delivered","cancelled")')
      if (params.filters?.order_type) sumsQuery = sumsQuery.eq('order_type', params.filters.order_type)
      const dr = params.filters?.order_date
      if (dr && typeof dr === 'object') {
        const r = dr as Record<string, unknown>
        if (r.gte !== undefined && r.gte !== '') sumsQuery = sumsQuery.gte('order_date', r.gte)
        if (r.lte !== undefined && r.lte !== '') sumsQuery = sumsQuery.lte('order_date', r.lte)
      }
    } else {
      for (const [key, value] of Object.entries(filters)) {
        if (value === undefined || value === null || value === '') continue
        if (Array.isArray(value)) sumsQuery = sumsQuery.in(key, value)
        else if (typeof value === 'boolean') sumsQuery = sumsQuery.eq(key, value)
        else if (typeof value === 'string' && value.startsWith('>=')) sumsQuery = sumsQuery.gte(key, value.slice(2))
        else if (typeof value === 'string' && value.startsWith('<=')) sumsQuery = sumsQuery.lte(key, value.slice(2))
        else if (typeof value === 'string' && value.startsWith('!=')) sumsQuery = sumsQuery.neq(key, value.slice(2))
        else if (typeof value === 'object') {
          const r = value as Record<string, unknown>
          if (r.gte !== undefined && r.gte !== '') sumsQuery = sumsQuery.gte(key, r.gte)
          if (r.lte !== undefined && r.lte !== '') sumsQuery = sumsQuery.lte(key, r.lte)
          if (r.gt !== undefined && r.gt !== '') sumsQuery = sumsQuery.gt(key, r.gt)
          if (r.lt !== undefined && r.lt !== '') sumsQuery = sumsQuery.lt(key, r.lt)
        }
        else sumsQuery = sumsQuery.eq(key, value)
      }
    }
    if (searchOr) sumsQuery = sumsQuery.or(searchOr)
    if (params.storeId) sumsQuery = sumsQuery.eq('store_id', params.storeId)
    const { data: sumsData } = await sumsQuery.range(0, 99999)
    const aggregates = (sumsData || []).reduce(
      (
        acc: { total: number; total_paid: number; total_pending: number },
        r: { total: number | string | null; total_paid: number | string | null; total_pending: number | string | null },
      ) => {
        acc.total += Number(r.total) || 0
        acc.total_paid += Number(r.total_paid) || 0
        acc.total_pending += Number(r.total_pending) || 0
        return acc
      },
      { total: 0, total_paid: 0, total_pending: 0 },
    )

    return success({ ...result, statusCounts, totalAll, aggregates })
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
      .select('id, order_number, total, total_paid, total_pending, client_id, status, order_type, order_date, estimated_delivery_date, payment_date, subtotal, discount_amount, tax_amount, store_id, internal_notes, client_notes, created_at, updated_at, created_by')
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
      admin.from('tailoring_order_lines').select('*').eq('tailoring_order_id', orderId)
        .order('sort_order', { ascending: true }).order('created_at', { ascending: true }),
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

    // Defense-in-depth: ocultar coste y margen a quien no tenga el permiso.
    // El gateo en UI no basta: cualquier rol con 'orders.view' que invoque
    // esta action recibiría las cifras en el JSON. Aquí las anulamos.
    const canViewCosts = await checkUserPermission(ctx.userId, 'orders.view_costs')
    if (!canViewCosts) {
      order.total_material_cost = null
      order.total_labor_cost = null
      order.total_factory_cost = null
      order.total_cost = null
      const linesArr = order.tailoring_order_lines as Record<string, unknown>[] | undefined
      if (Array.isArray(linesArr)) {
        for (const line of linesArr) {
          line.material_cost = null
          line.labor_cost = null
          line.factory_cost = null
        }
      }
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

    const initialStatus: OrderStatus = 'created'

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
        status: initialStatus,
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

    const gtSlugMap = await buildGarmentSlugMap(ctx.adminClient, processedLines.map((l: any) => l.garment_type_id))
    const linesToInsert = processedLines.map((line: any) => ({
      ...line,
      configuration: withPrendaSlug(line.configuration, gtSlugMap.get(line.garment_type_id)),
      tailoring_order_id: order.id,
    }))

    const { error: linesError } = await ctx.adminClient
      .from('tailoring_order_lines')
      .insert(linesToInsert)

    if (linesError) return failure(linesError.message)

    // Descontar metros de tela (no bloquear el pedido si falla)
    const fabricUsage = new Map<string, number>()
    for (const line of linesToInsert as Array<{ fabric_id?: string | null; fabric_meters?: number | null }>) {
      const fId = line.fabric_id || null
      const meters = Number(line.fabric_meters) || 0
      if (fId && meters > 0) {
        fabricUsage.set(fId, (fabricUsage.get(fId) || 0) + meters)
      }
    }
    if (fabricUsage.size > 0) {
      await applyFabricStockDelta(ctx.adminClient, fabricUsage, { orderId: order.id, userId: ctx.userId })
    }

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
      to_status: initialStatus,
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

/**
 * Recalcula el estado del PEDIDO a partir del de sus prendas (regla derivada,
 * `deriveOrderStatusFromLines`) y lo persiste SOLO si cambió. Registra la
 * transición en el historial con `note` (por defecto "Automático…") e incluye los
 * efectos de los estados terminales: `delivered` → fecha de entrega + email al
 * cliente; `cancelled` (todas las prendas canceladas) → repone stock de tejido.
 * No reactiva pedidos ya `cancelled`. Lo usan las dos acciones (admin y sastre).
 */
async function recalcOrderStatusFromLines(
  admin: AdminClient,
  orderId: string,
  ctx: { userId: string | null; userName: string | null },
  note = 'Automático (derivado de prendas)',
): Promise<string | null> {
  const { data: order } = await admin
    .from('tailoring_orders').select('status, order_type').eq('id', orderId).single()
  if (!order) return null
  const fromStatus = (order as any).status as string
  // 'cancelled' es terminal: no se reactiva por derivación.
  if (fromStatus === 'cancelled') return fromStatus
  const { data: lines } = await admin
    .from('tailoring_order_lines').select('status').eq('tailoring_order_id', orderId)
  const derived = deriveOrderStatusFromLines((order as any).order_type, (lines ?? []).map((l: any) => l.status))
  if (!derived || derived === fromStatus) return fromStatus

  await admin.from('tailoring_orders').update({
    status: derived,
    ...(derived === 'delivered' ? { actual_delivery_date: new Date().toISOString().split('T')[0] } : {}),
  }).eq('id', orderId)

  // Todas las prendas canceladas → repone stock de tejido (coherente con el
  // cancelar manual; revertFabricStockForOrder es idempotente).
  if (derived === 'cancelled') {
    await revertFabricStockForOrder(admin, orderId, ctx.userId)
  }

  await admin.from('tailoring_order_state_history').insert({
    tailoring_order_id: orderId,
    from_status: fromStatus,
    to_status: derived,
    notes: note,
    changed_by: ctx.userId,
    changed_by_name: ctx.userName,
  })

  if (derived === 'delivered') {
    const { data: ow } = await admin
      .from('tailoring_orders')
      .select('order_number, clients(email, full_name, first_name, last_name)')
      .eq('id', orderId).single()
    const client = (ow as { clients?: { email?: string; full_name?: string; first_name?: string; last_name?: string } | null } | null)?.clients
    if (client?.email) {
      const clientName = client.full_name || [client.first_name, client.last_name].filter(Boolean).join(' ') || 'Cliente'
      try {
        await sendTailoringStatusUpdate({
          client_name: clientName, client_email: client.email,
          order_number: (ow as { order_number: string }).order_number, new_status: 'delivered',
        })
      } catch (e) { console.error('[recalcOrderStatusFromLines] email:', e) }
    }
  }
  return derived
}

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

    const { order_id, line_id, line_ids, new_status, notes } = parsed.data

    // Prendas objetivo: `line_ids` (multi-selección) tiene prioridad; si no,
    // `line_id` (una sola, compat). Vacío/ninguno => cambio a nivel de pedido.
    const targetLineIds = (line_ids && line_ids.length > 0)
      ? Array.from(new Set(line_ids))
      : (line_id ? [line_id] : [])

    let fromStatus: string | null = null
    let changedLinesCount = 0
    let aheadLinesCount = 0
    if (targetLineIds.length > 0) {
      // Solo prendas que pertenezcan REALMENTE a este pedido (evita cambiar
      // líneas de otro pedido pasando ids ajenos).
      const { data: lineRows } = await ctx.adminClient
        .from('tailoring_order_lines').select('id, status')
        .eq('tailoring_order_id', order_id).in('id', targetLineIds)
      const lines = (lineRows ?? []) as { id: string; status: string }[]
      if (lines.length === 0) return failure('Línea de pedido no encontrada')
      fromStatus = lines[0].status ?? null

      await ctx.adminClient
        .from('tailoring_order_lines').update({ status: new_status })
        .in('id', lines.map((l) => l.id))

      await ctx.adminClient.from('tailoring_order_state_history').insert(
        lines.map((l) => ({
          tailoring_order_id: order_id,
          tailoring_order_line_id: l.id,
          from_status: l.status,
          to_status: new_status,
          notes,
          changed_by: ctx.userId,
          changed_by_name: ctx.userName,
        }))
      )
      changedLinesCount = lines.length

      // El estado del PEDIDO se DERIVA del mínimo de sus prendas (regla Ismael).
      await recalcOrderStatusFromLines(ctx.adminClient, order_id, ctx)
    } else {
      const { data: order } = await ctx.adminClient
        .from('tailoring_orders').select('status, order_type').eq('id', order_id).single()
      if (!order) return failure('Pedido no encontrado')
      fromStatus = (order as any).status ?? null

      // 'cancelled' es estado TERMINAL: no se puede reactivar.
      if (fromStatus === 'cancelled' && new_status !== 'cancelled') {
        return failure('No se puede reactivar un pedido cancelado. Crea un pedido nuevo si es necesario.', 'VALIDATION')
      }

      const { data: lineRows } = await ctx.adminClient
        .from('tailoring_order_lines').select('id, status').eq('tailoring_order_id', order_id)
      const lines = (lineRows ?? []) as { id: string; status: string }[]

      if (new_status === 'cancelled' || new_status === 'incident') {
        // Acciones MANUALES a nivel pedido (no derivables del mínimo de prendas).
        // R2-A: reembolsar los cobros ANTES de marcar 'cancelled' (para que el guard
        // de _revert_order_money lea el estado REAL). delivered/sin-cobro -> no-op interno.
        // Atómico (la RPC reusa rpc_remove_order_payment en una sola transacción).
        if (new_status === 'cancelled' && fromStatus !== 'cancelled') {
          const { error: revErr } = await ctx.adminClient.rpc('_revert_order_money', { p_order_id: order_id })
          if (revErr) return failure(revErr.message || 'No se pudieron reembolsar los cobros del pedido', 'INTERNAL')
        }
        await ctx.adminClient
          .from('tailoring_orders').update({ status: new_status }).eq('id', order_id)
        const prop = classifyLinesForStatusChange(new_status, (order as any).order_type, lines)
        if (prop.toUpdate.length > 0) {
          await ctx.adminClient
            .from('tailoring_order_lines').update({ status: new_status }).in('id', prop.toUpdate)
        }
        changedLinesCount = prop.toUpdate.length
        aheadLinesCount = prop.aheadCount
        if (new_status === 'cancelled' && fromStatus !== 'cancelled') {
          await revertFabricStockForOrder(ctx.adminClient, order_id, ctx.userId)
        }
        await ctx.adminClient.from('tailoring_order_state_history').insert({
          tailoring_order_id: order_id, from_status: order.status, to_status: new_status,
          notes, changed_by: ctx.userId, changed_by_name: ctx.userName,
        })
      } else {
        // Botón "Cambiar estado" reconvertido a "avanzar TODAS las prendas a X":
        // propagación forward y, a partir de ahí, el estado del pedido se DERIVA
        // del mínimo de las prendas (no se fija a mano).
        const prop = classifyLinesForStatusChange(new_status, (order as any).order_type, lines)
        if (prop.toUpdate.length > 0) {
          await ctx.adminClient
            .from('tailoring_order_lines').update({ status: new_status }).in('id', prop.toUpdate)
        }
        changedLinesCount = prop.toUpdate.length
        aheadLinesCount = prop.aheadCount
        await recalcOrderStatusFromLines(ctx.adminClient, order_id, ctx, 'Avanzar prendas (derivado)')
      }
      fromStatus = fromStatus ?? (order as any).status ?? null
    }

    // Resolver número de pedido para descripción legible
    const { data: orderRow } = await ctx.adminClient
      .from('tailoring_orders').select('order_number').eq('id', order_id).single()
    const orderNumber = (orderRow as any)?.order_number ?? order_id
    const fromEs = fromStatus ? getOrderStatusLabel(fromStatus) : '—'
    const toEs = getOrderStatusLabel(new_status)
    const scope = targetLineIds.length === 0
      ? ''
      : targetLineIds.length === 1 ? ' (línea)' : ` (${targetLineIds.length} prendas)`
    return success({
      order_id,
      new_status,
      changed_lines_count: changedLinesCount,
      ahead_lines_count: aheadLinesCount,
      auditEntityId: order_id,
      auditDescription: `Pedido ${orderNumber}: ${fromEs} → ${toEs}${scope}`,
      auditOldData: { estado: fromStatus },
      auditNewData: { estado: new_status },
      auditMetadata: {
        ...(notes ? { notas: notes } : {}),
        lineas_ids: targetLineIds.length > 0 ? targetLineIds : null,
      },
    })
  }
)

/**
 * Corrige la FECHA (changed_at) de una entrada del historial de estados, por si
 * se registró con fecha equivocada. Solo informativo/trazabilidad: los informes
 * datan por created_at, no por estas fechas. Reglas:
 *  - Solo entradas de TRANSICIÓN de estado (from != to); las de auditoría de
 *    datos (from == to) no se editan.
 *  - La nueva fecha no puede ser futura ni romper el orden cronológico (debe
 *    quedar entre la transición anterior y la siguiente del mismo pedido).
 *  - Si la entrada es 'delivered', se actualiza también actual_delivery_date.
 *  - Queda registrada en audit_logs (Seguimiento) vía la auditoría del wrapper.
 */
export const updateStateHistoryDate = protectedAction<{ historyId: string; newDate: string }, any>(
  {
    permission: 'orders.edit',
    auditModule: 'orders',
    auditEntity: 'tailoring_order',
    auditAction: 'update',
    revalidate: ['/admin/pedidos'],
  },
  async (ctx, { historyId, newDate }) => {
    if (!historyId?.trim()) return failure('Entrada de historial requerida', 'VALIDATION')
    const when = new Date(newDate)
    if (isNaN(when.getTime())) return failure('Fecha no válida', 'VALIDATION')
    if (when.getTime() > Date.now()) return failure('La fecha no puede ser futura', 'VALIDATION')

    const { data: entry, error: entryErr } = await ctx.adminClient
      .from('tailoring_order_state_history')
      .select('id, tailoring_order_id, from_status, to_status, changed_at')
      .eq('id', historyId)
      .single()
    if (entryErr || !entry) return failure('Entrada de historial no encontrada', 'NOT_FOUND')

    const e = entry as { tailoring_order_id: string; from_status: string | null; to_status: string; changed_at: string }
    // Solo transiciones de estado; las entradas de auditoría de datos (from == to) no se editan.
    if (e.from_status === e.to_status) {
      return failure('Esta entrada es un registro de edición de datos, no un cambio de estado: su fecha no se edita', 'VALIDATION')
    }

    // Orden cronológico: la nueva fecha debe quedar entre la transición anterior y la siguiente.
    const { data: rows } = await ctx.adminClient
      .from('tailoring_order_state_history')
      .select('id, from_status, to_status, changed_at')
      .eq('tailoring_order_id', e.tailoring_order_id)
      .order('changed_at', { ascending: true })
    const transitions = ((rows ?? []) as Array<{ id: string; from_status: string | null; to_status: string; changed_at: string }>)
      .filter((h) => h.from_status !== h.to_status)
    const idx = transitions.findIndex((h) => h.id === historyId)
    const prev = idx > 0 ? transitions[idx - 1] : null
    const next = idx >= 0 && idx < transitions.length - 1 ? transitions[idx + 1] : null
    if (prev && when.getTime() < new Date(prev.changed_at).getTime()) {
      return failure(`La fecha debe ser posterior a la del estado anterior (${formatDateTimeMadrid(prev.changed_at)})`, 'VALIDATION')
    }
    if (next && when.getTime() > new Date(next.changed_at).getTime()) {
      return failure(`La fecha debe ser anterior a la del estado siguiente (${formatDateTimeMadrid(next.changed_at)})`, 'VALIDATION')
    }

    const oldChangedAt = e.changed_at
    const { error: updErr } = await ctx.adminClient
      .from('tailoring_order_state_history')
      .update({ changed_at: when.toISOString() })
      .eq('id', historyId)
    if (updErr) return failure(updErr.message || 'Error al actualizar la fecha', 'INTERNAL')

    // Coherencia: la fecha de entrega del pedido sigue a la del estado 'delivered'.
    if (e.to_status === 'delivered') {
      await ctx.adminClient
        .from('tailoring_orders')
        .update({ actual_delivery_date: when.toISOString().slice(0, 10) })
        .eq('id', e.tailoring_order_id)
    }

    const { data: ord } = await ctx.adminClient
      .from('tailoring_orders').select('order_number').eq('id', e.tailoring_order_id).single()
    const estado = getOrderStatusLabel(e.to_status)
    return success({
      ok: true,
      auditEntityId: e.tailoring_order_id,
      auditDescription: `Pedido ${(ord as { order_number?: string })?.order_number ?? ''}: fecha del estado "${estado}" corregida a ${formatDateTimeMadrid(when)}`,
      auditOldData: { estado: e.to_status, fecha: oldChangedAt },
      auditNewData: { estado: e.to_status, fecha: when.toISOString() },
      auditMetadata: {
        history_id: historyId,
        ...(e.to_status === 'delivered' ? { actual_delivery_date: when.toISOString().slice(0, 10) } : {}),
      },
    })
  }
)

/**
 * Re-numera un pedido al SIGUIENTE número libre del prefijo de su tienda actual
 * (getNextNumber). Pensado para corregir el prefijo cuando se ha movido el pedido
 * a otra tienda y el order_number quedó con el prefijo viejo (caso Teresa).
 *
 * PROTECCIÓN: si el pedido YA tiene cobros (total_paid > 0) se BLOQUEA. Los espejos
 * de caja en manual_transactions se enlazan por el TEXTO del order_number (no hay FK
 * uuid), y rpc_remove/update_order_payment los localizan por ese texto: renumerar
 * dejaría esos apuntes huérfanos → descuadre de caja. El manejo de pedidos con
 * cobros se decide aparte; aquí, de momento, no se permite.
 */
export const renumberOrderToStore = protectedAction<{ orderId: string }, { order_number: string }>(
  {
    permission: 'orders.edit',
    auditModule: 'orders',
    auditEntity: 'tailoring_order',
    auditAction: 'update',
    revalidate: ['/admin/pedidos'],
  },
  async (ctx, { orderId }) => {
    if (!orderId?.trim()) return failure('Pedido requerido', 'VALIDATION')

    const { data: order, error: orderErr } = await ctx.adminClient
      .from('tailoring_orders')
      .select('id, order_number, store_id')
      .eq('id', orderId)
      .single()
    if (orderErr || !order) return failure('Pedido no encontrado', 'NOT_FOUND')
    const o = order as { order_number: string; store_id: string | null }

    // Renumerar pedidos CON cobros está permitido (R8): la RPC refresca el texto de
    // los espejos de caja al nº nuevo en la MISMA transacción, así que ni el reverso
    // por FK ni el fallback por texto (rpc_remove) ni la edición de cobro
    // (rpc_update_tailoring_payment, que localiza por texto) quedan descuadrados.
    if (!o.store_id) return failure('El pedido no tiene tienda asignada', 'VALIDATION')

    const { data: store } = await ctx.adminClient
      .from('stores').select('order_prefix').eq('id', o.store_id).single()
    const prefix = (store as { order_prefix?: string } | null)?.order_prefix || 'ORD'
    const currentPrefix = String(o.order_number).split('-')[0]
    if (currentPrefix === prefix) {
      // Ya coincide: nada que hacer (no-op idempotente).
      return success({ order_number: o.order_number })
    }

    const newNumber = await getNextNumber('tailoring_orders', 'order_number', prefix)
    // Renumerado + refresco de espejos ATÓMICO (una sola transacción en la RPC):
    // si fallara el refresco, no se aplica el renumerado → nunca quedan espejos con
    // el nº viejo.
    const { error: rpcErr } = await ctx.adminClient.rpc('rpc_renumber_order', {
      p_order_id: orderId,
      p_new_number: newNumber,
    })
    if (rpcErr) return failure(rpcErr.message || 'Error al renumerar', 'INTERNAL')

    return success({
      order_number: newNumber,
      auditEntityId: orderId,
      auditDescription: `Pedido renumerado por cambio de tienda: ${o.order_number} → ${newNumber}`,
      auditOldData: { order_number: o.order_number },
      auditNewData: { order_number: newNumber },
    } as unknown as { order_number: string })
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

    const { data: order } = await ctx.adminClient
      .from('tailoring_orders')
      .select('order_number')
      .eq('id', input.orderId)
      .maybeSingle()
    const orderNumber = (order as { order_number?: string } | null)?.order_number ?? input.orderId

    return success({
      ...(fitting as Record<string, unknown>),
      auditEntityId: input.orderId,
      auditDescription: `Prueba ${(fitting as { fitting_number?: number }).fitting_number} programada · pedido ${orderNumber}`,
    })
  }
)

export const markLineDelivered = protectedAction<string, { orderId: string; auditEntityId: string; auditDescription: string }>(
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
      .select('id, tailoring_order_id, tailoring_order:tailoring_orders(order_number)')
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
    const orderNumber =
      (line as { tailoring_order?: { order_number?: string } | null }).tailoring_order?.order_number ?? orderId
    revalidatePath(`/sastre/pedidos/${orderId}`)
    return success({
      orderId,
      auditEntityId: orderId,
      auditDescription: `Prenda entregada · pedido ${orderNumber}`,
    })
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

    const trimmedStatus = newStatus.trim()
    if (!ALL_VISIBLE_STATUSES.includes(trimmedStatus as OrderStatus)) {
      return failure(`Estado no válido: ${trimmedStatus}`, 'VALIDATION')
    }

    let fromStatus: string | null = null
    let changedLinesCount = 0
    let aheadLinesCount = 0
    if (lineId?.trim()) {
      const { data: prevLine } = await ctx.adminClient
        .from('tailoring_order_lines').select('status').eq('id', lineId.trim()).single()
      fromStatus = (prevLine as any)?.status ?? null
      const { error } = await ctx.adminClient
        .from('tailoring_order_lines')
        .update({ status: trimmedStatus })
        .eq('id', lineId.trim())
        .eq('tailoring_order_id', orderId.trim())
      if (error) return failure(error.message, 'INTERNAL')

      // Historial de la transición de la prenda.
      await ctx.adminClient.from('tailoring_order_state_history').insert({
        tailoring_order_id: orderId.trim(), tailoring_order_line_id: lineId.trim(),
        from_status: fromStatus, to_status: trimmedStatus,
        changed_by: ctx.userId, changed_by_name: ctx.userName,
      })
      // El estado del PEDIDO se DERIVA del mínimo de sus prendas (regla Ismael).
      await recalcOrderStatusFromLines(ctx.adminClient, orderId.trim(), ctx)
    } else {
      const { data: prevOrder } = await ctx.adminClient
        .from('tailoring_orders').select('status, order_type').eq('id', orderId.trim()).single()
      fromStatus = (prevOrder as any)?.status ?? null

      // 'cancelled' es estado TERMINAL: no se puede reactivar.
      if (fromStatus === 'cancelled' && trimmedStatus !== 'cancelled') {
        return failure('No se puede reactivar un pedido cancelado. Crea un pedido nuevo si es necesario.', 'VALIDATION')
      }

      const { data: lineRows } = await ctx.adminClient
        .from('tailoring_order_lines').select('id, status').eq('tailoring_order_id', orderId.trim())
      const lines = (lineRows ?? []) as { id: string; status: string }[]

      if (trimmedStatus === 'cancelled' || trimmedStatus === 'incident') {
        // Acciones MANUALES a nivel pedido (no derivables del mínimo).
        // R2-A: reembolsar los cobros ANTES de marcar 'cancelled' (guard lee estado real;
        // delivered/sin-cobro -> no-op). Atómico vía _revert_order_money.
        if (trimmedStatus === 'cancelled' && fromStatus !== 'cancelled') {
          const { error: revErr } = await ctx.adminClient.rpc('_revert_order_money', { p_order_id: orderId.trim() })
          if (revErr) return failure(revErr.message || 'No se pudieron reembolsar los cobros del pedido', 'INTERNAL')
        }
        const { error } = await ctx.adminClient
          .from('tailoring_orders').update({ status: trimmedStatus }).eq('id', orderId.trim())
        if (error) return failure(error.message, 'INTERNAL')
        const prop = classifyLinesForStatusChange(trimmedStatus, (prevOrder as any)?.order_type, lines)
        if (prop.toUpdate.length > 0) {
          await ctx.adminClient
            .from('tailoring_order_lines').update({ status: trimmedStatus }).in('id', prop.toUpdate)
        }
        changedLinesCount = prop.toUpdate.length
        aheadLinesCount = prop.aheadCount
        if (trimmedStatus === 'cancelled' && fromStatus !== 'cancelled') {
          await revertFabricStockForOrder(ctx.adminClient, orderId.trim(), ctx.userId)
        }
        await ctx.adminClient.from('tailoring_order_state_history').insert({
          tailoring_order_id: orderId.trim(), tailoring_order_line_id: null,
          from_status: fromStatus, to_status: trimmedStatus,
          changed_by: ctx.userId, changed_by_name: ctx.userName,
        })
      } else {
        // "Avanzar todas las prendas a X" + derivar el estado del pedido.
        const prop = classifyLinesForStatusChange(trimmedStatus, (prevOrder as any)?.order_type, lines)
        if (prop.toUpdate.length > 0) {
          await ctx.adminClient
            .from('tailoring_order_lines').update({ status: trimmedStatus }).in('id', prop.toUpdate)
        }
        changedLinesCount = prop.toUpdate.length
        aheadLinesCount = prop.aheadCount
        await recalcOrderStatusFromLines(ctx.adminClient, orderId.trim(), ctx, 'Avanzar prendas (derivado)')
      }
    }

    revalidatePath(`/sastre/pedidos/${orderId}`)
    const { data: ord } = await ctx.adminClient
      .from('tailoring_orders').select('order_number').eq('id', orderId.trim()).single()
    const orderNumber = (ord as any)?.order_number ?? orderId
    const fromEs = fromStatus ? getOrderStatusLabel(fromStatus) : '—'
    const toEs = getOrderStatusLabel(trimmedStatus)
    return success({
      orderId,
      changed_lines_count: changedLinesCount,
      ahead_lines_count: aheadLinesCount,
      auditEntityId: orderId,
      auditDescription: `Pedido ${orderNumber}: ${fromEs} → ${toEs}${lineId ? ' (línea)' : ''}`,
      auditOldData: { estado: fromStatus },
      auditNewData: { estado: trimmedStatus },
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
  'official_id',
] as const

/**
 * Aplica un delta de metros a fabrics.stock_meters por cada fabric_id.
 *   delta > 0 → consumo (resta del stock)
 *   delta < 0 → devolución (suma al stock)
 * El stock no baja de 0 (clamp). Errores se logean pero no propagan: el
 * pedido NO se aborta si falla el descuento de tela.
 */
async function applyFabricStockDelta(
  admin: AdminClient,
  deltas: Map<string, number>,
  opts?: { orderId?: string | null; userId?: string | null },
): Promise<void> {
  const orderId = opts?.orderId ?? null
  const userId = opts?.userId && opts.userId !== 'system' ? opts.userId : null

  for (const [fabricId, delta] of deltas) {
    if (!fabricId || !Number.isFinite(delta) || delta === 0) continue
    try {
      const { data, error: fetchErr } = await admin
        .from('fabrics')
        .select('stock_meters')
        .eq('id', fabricId)
        .single()
      if (fetchErr || !data) {
        console.error('[applyFabricStockDelta] fetch failed for fabric', fabricId, fetchErr)
        continue
      }
      const current = Number(data.stock_meters) || 0
      const newStock = Math.max(0, current - delta)
      const { error: updErr } = await admin
        .from('fabrics')
        .update({ stock_meters: newStock })
        .eq('id', fabricId)
      if (updErr) {
        console.error('[applyFabricStockDelta] update failed for fabric', fabricId, updErr)
        continue
      }

      // Trazabilidad: registrar el movimiento en fabric_stock_movements
      // para que el histórico distinga consumos (negativos) y devoluciones
      // (positivos) automáticos por ficha de los ajustes manuales.
      // delta > 0  → consumo            → quantity_delta negativo
      // delta < 0  → revert (devolución) → quantity_delta positivo
      const quantityDelta = newStock - current
      const movementType = quantityDelta < 0 ? 'consumption' : 'consumption_revert'
      const { error: movementError } = await admin
        .from('fabric_stock_movements')
        .insert({
          fabric_id: fabricId,
          movement_type: movementType,
          quantity_delta: quantityDelta,
          stock_before: current,
          stock_after: newStock,
          reason: null,
          reference_type: orderId ? 'tailoring_order' : null,
          reference_id: orderId,
          created_by: userId,
        })
      if (movementError) {
        console.error('[applyFabricStockDelta] failed to log movement for fabric', fabricId, movementError)
      }
    } catch (err) {
      console.error('[applyFabricStockDelta] unexpected error for fabric', fabricId, err)
    }
  }
}

/**
 * Repone al stock de tejidos los metros consumidos por las líneas de un
 * pedido. Idempotente: si tailoring_orders.fabric_stock_reverted_at ya
 * está poblado, no hace nada (evita doble reposición si se cancela dos
 * veces o se borra un pedido ya cancelado).
 *
 * Llamadas: changeOrderStatus/updateOrderStatus cuando status→'cancelled'
 * y deleteOrder antes de eliminar las líneas.
 *
 * La trazabilidad la hereda gratis de applyFabricStockDelta, que ya
 * inserta una fila en fabric_stock_movements con movement_type
 * 'consumption_revert' y reference_id = orderId (mig 160).
 */
async function revertFabricStockForOrder(
  admin: AdminClient,
  orderId: string,
  userId: string | null,
): Promise<void> {
  const { data: order, error: fetchErr } = await admin
    .from('tailoring_orders')
    .select('fabric_stock_reverted_at')
    .eq('id', orderId)
    .single()
  if (fetchErr || !order) {
    console.error('[revertFabricStockForOrder] order fetch failed', orderId, fetchErr)
    return
  }
  if ((order as { fabric_stock_reverted_at?: string | null }).fabric_stock_reverted_at) return

  const { data: lines } = await admin
    .from('tailoring_order_lines')
    .select('fabric_id, fabric_meters')
    .eq('tailoring_order_id', orderId)

  const revert = new Map<string, number>()
  for (const l of (lines ?? []) as Array<{ fabric_id: string | null; fabric_meters: number | string | null }>) {
    const fId = l.fabric_id
    const m = Number(l.fabric_meters) || 0
    if (fId && m > 0) revert.set(fId, (revert.get(fId) || 0) + m)
  }

  if (revert.size > 0) {
    // applyFabricStockDelta resta lo que recibe; pasamos NEGATIVO para sumar al stock.
    const deltas = new Map<string, number>()
    for (const [fId, m] of revert) deltas.set(fId, -m)
    await applyFabricStockDelta(admin, deltas, { orderId, userId })
  }

  await admin
    .from('tailoring_orders')
    .update({ fabric_stock_reverted_at: new Date().toISOString() })
    .eq('id', orderId)
}

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
    // Editabilidad: un pedido cancelado no se edita. Los DATOS de confección
    // (medidas, tejido, cortador, notas…) siempre son editables. Los IMPORTES solo
    // se bloquean si el pedido tiene una factura VIGENTE (emitida y no anulada):
    // editar el precio descuadraría una factura ya emitida. El PAGO no bloquea —
    // un pedido pagado pero sin factura se puede reajustar; la red de seguridad
    // 2.b impide que el nuevo total quede por debajo de lo ya cobrado. Para editar
    // un pedido facturado hay que anular antes la factura (genera nota de abono):
    // al quedar 'cancelled' deja de ser vigente y se vuelve a poder editar.
    const ob = orderBefore as Record<string, unknown>
    const totalPaidBefore = Number(ob.total_paid) || 0
    if (currentStatus === 'cancelled') {
      return failure('No se puede editar un pedido cancelado', 'CONFLICT')
    }
    // Factura vigente = emitida y no anulada (cualquier status salvo draft/cancelled).
    // El vínculo real es invoices.tailoring_order_id (la columna tailoring_orders.invoice_id
    // está en desuso). Anular la factura la deja en 'cancelled' → ya no bloquea.
    const { data: vigentInvoices } = await admin
      .from('invoices')
      .select('id')
      .eq('tailoring_order_id', input.orderId)
      .not('status', 'in', '(draft,cancelled)')
      .limit(1)
    const priceLocked = (vigentInvoices?.length ?? 0) > 0

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

    // 2.a Rechazo SELECTIVO de cambios de importe en pedidos pagados/facturados
    // (ANTES de tocar nada, para no persistir parcial). Se permite editar confección;
    // solo se bloquea si el update intenta cambiar el PRECIO: descuento de cabecera,
    // o (en alguna línea) unit_price / descuento / IVA, o añadir/quitar líneas.
    if (priceLocked) {
      let monetaryChange = false
      if (headerUpdate.discount_percentage !== undefined &&
          Number(headerUpdate.discount_percentage) !== (Number(ob.discount_percentage) || 0)) {
        monetaryChange = true
      }
      if (!monetaryChange && input.lines !== undefined) {
        const beforeById = new Map(linesBeforeArr.map((l) => [String(l.id), l]))
        const incomingIds = new Set(input.lines.map((l) => l.id).filter(Boolean) as string[])
        if (input.lines.some((l) => !l.id)) {
          monetaryChange = true // línea nueva → cambia el total
        } else if (linesBeforeArr.some((l) => !incomingIds.has(String(l.id)))) {
          monetaryChange = true // línea eliminada → cambia el total
        } else {
          for (const l of input.lines) {
            const b = beforeById.get(String(l.id))
            if (!b) { monetaryChange = true; break }
            if ((Number(l.unit_price) || 0) !== (Number(b.unit_price) || 0)) { monetaryChange = true; break }
            if ((Number(l.discount_percentage) || 0) !== (Number(b.discount_percentage) || 0)) { monetaryChange = true; break }
            if (Number(l.tax_rate ?? 21) !== Number(b.tax_rate ?? 21)) { monetaryChange = true; break }
          }
        }
      }
      if (monetaryChange) {
        return failure(
          'No se puede cambiar el precio de un pedido facturado (descuadraría la factura emitida). Anula antes la factura (se generará una nota de abono) y podrás editar el precio. El resto de datos (confección, medidas, tejido, notas…) sí se puede editar.',
          'CONFLICT',
        )
      }
    }

    // 2.b Protección de cobros (ANTES de tocar líneas/stock, para no persistir nada
    // si se rechaza): si ya hay algo cobrado, el nuevo total no puede quedar por
    // debajo de lo pagado. Calculamos el total proyectado con la misma fórmula que
    // el recálculo posterior (líneas entrantes si vienen, si no las actuales).
    if (!priceLocked && totalPaidBefore > 0) {
      const projectedSubtotalLines = input.lines !== undefined
        ? input.lines.reduce((s, l) => {
            const up = Number(l.unit_price) || 0
            const da = round2(up * (Number(l.discount_percentage) || 0) / 100)
            return s + round2(up - da)
          }, 0)
        : linesBeforeArr.reduce((s, l) => s + Number(l.line_total || 0), 0)
      const projDiscountPct = headerUpdate.discount_percentage ?? ob.discount_percentage ?? 0
      const projectedTotal = round2(projectedSubtotalLines * (1 - Number(projDiscountPct) / 100))
      if (projectedTotal < totalPaidBefore) {
        return failure(
          `El nuevo total (${projectedTotal}€) no puede ser menor que lo ya cobrado (${round2(totalPaidBefore)}€). Para bajar más, primero ajusta/anula el cobro.`,
          'CONFLICT',
        )
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
      const gtSlugMap = await buildGarmentSlugMap(admin, incomingLines.map((l: any) => l.garment_type_id))
      for (let i = 0; i < incomingLines.length; i++) {
        const line = incomingLines[i]
        const unitPrice = Number(line.unit_price) || 0
        const discountPct = Number(line.discount_percentage) || 0
        const discountAmount = round2(unitPrice * discountPct / 100)
        const lineTotal = round2(unitPrice - discountAmount)
        const sortOrder = line.sort_order ?? i

        // Config ACTUAL de BD de esta línea (estado fresco). Fusionamos la config
        // entrante DEBAJO para que un guardado de PEDIDO nunca pise las opciones de
        // ficha (bragueta/pliegues/bolsillos/conf*) que SOLO edita el diálogo de
        // ficha y que "Editar pedido" no toca. Las claves que ese diálogo SÍ posee
        // (cortador, oficial, medidas, tejido) llegan en line.configuration y ganan
        // en el overlay. Si la ficha vació una opción, BD ya la tiene vacía y el
        // merge la respeta (no la resucita). Defensa en el único punto que escribe
        // configuration de líneas → cubre el diálogo actual y cualquier caller futuro.
        const before = line.id ? linesBeforeArr.find((l) => String(l.id) === line.id) : undefined
        const beforeConfig = (before as { configuration?: Record<string, unknown> } | undefined)?.configuration ?? {}
        const mergedConfiguration = before
          ? { ...beforeConfig, ...((line.configuration as Record<string, unknown>) ?? {}) }
          : line.configuration

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
          // Escalares descriptivos: si el caller NO manda el campo (undefined) se
          // conserva el valor actual de BD — mismo criterio defensivo que el merge
          // de configuration. Solo un valor explícito (aunque sea null/'') lo cambia.
          fabric_id: line.fabric_id !== undefined ? (line.fabric_id || null) : ((before as any)?.fabric_id ?? null),
          fabric_description: line.fabric_description !== undefined ? (line.fabric_description?.toString().trim() || null) : ((before as any)?.fabric_description ?? null),
          fabric_meters: line.fabric_meters !== undefined ? (line.fabric_meters ?? null) : ((before as any)?.fabric_meters ?? null),
          supplier_id: line.supplier_id !== undefined ? (line.supplier_id || null) : ((before as any)?.supplier_id ?? null),
          model_name: line.model_name !== undefined ? (line.model_name?.toString().trim() || null) : ((before as any)?.model_name ?? null),
          model_size: line.model_size !== undefined ? (line.model_size?.toString().trim() || null) : ((before as any)?.model_size ?? null),
          finishing_notes: line.finishing_notes !== undefined ? (line.finishing_notes?.toString().trim() || null) : ((before as any)?.finishing_notes ?? null),
          configuration: withPrendaSlug(mergedConfiguration, gtSlugMap.get(line.garment_type_id)),
          sort_order: sortOrder,
        }

        if (line.id) {
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

    // 3.b Sincronizar medidas a client_measurements (no bloqueante).
    // Cuando el sastre edita la ficha de una prenda y guarda valores en
    // tailoring_order_lines.configuration, esos valores deben reflejarse
    // también en la ficha del cliente con versionado (historial).
    if (input.lines !== undefined) {
      const clientId = (orderBefore as { client_id?: string | null }).client_id ?? null
      if (clientId) {
        const synced: Array<{ garmentTypeId: string; configuration: unknown }> = []
        for (const diff of linesAfterDiff) {
          if (diff.action === 'delete') continue
          const after = diff.after as { garment_type_id?: string; configuration?: unknown } | undefined
          if (!after?.garment_type_id) continue
          synced.push({ garmentTypeId: String(after.garment_type_id), configuration: after.configuration })
        }
        // Deduplicar por garment_type_id (si el pedido tiene varias prendas del
        // mismo tipo, la última gana — coherente con cómo el dialog reemplaza).
        const byGarment = new Map<string, unknown>()
        for (const s of synced) byGarment.set(s.garmentTypeId, s.configuration)
        for (const [garmentTypeId, configuration] of byGarment) {
          await syncOrderLineMeasurementsToClient(admin, {
            clientId: String(clientId),
            lineGarmentTypeId: garmentTypeId,
            configuration: (configuration ?? {}) as Record<string, unknown>,
            userId: ctx.userId,
          })
        }
      }
    }

    // 3.c Calcular delta de metros de tela (antes vs. después) y aplicarlo.
    // No bloquea el guardado del pedido si falla.
    if (input.lines !== undefined) {
      const beforeMeters = new Map<string, number>()
      for (const l of linesBeforeArr) {
        const fId = (l as any).fabric_id as string | null
        const m = Number((l as any).fabric_meters) || 0
        if (fId && m > 0) beforeMeters.set(fId, (beforeMeters.get(fId) || 0) + m)
      }
      const { data: linesAfterFabric } = await admin
        .from('tailoring_order_lines')
        .select('fabric_id, fabric_meters')
        .eq('tailoring_order_id', input.orderId)
      const afterMeters = new Map<string, number>()
      for (const l of (linesAfterFabric || []) as Array<{ fabric_id: string | null; fabric_meters: number | string | null }>) {
        const fId = l.fabric_id
        const m = Number(l.fabric_meters) || 0
        if (fId && m > 0) afterMeters.set(fId, (afterMeters.get(fId) || 0) + m)
      }
      const fabricIds = new Set<string>([...beforeMeters.keys(), ...afterMeters.keys()])
      const deltas = new Map<string, number>()
      for (const fId of fabricIds) {
        const delta = (afterMeters.get(fId) || 0) - (beforeMeters.get(fId) || 0)
        if (delta !== 0) deltas.set(fId, delta)
      }
      if (deltas.size > 0) {
        await applyFabricStockDelta(admin, deltas, { orderId: input.orderId, userId: ctx.userId })
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

    // Pedido con precio bloqueado (pagado/facturado): ya validamos arriba que el
    // update NO cambia importes, así que NO reescribimos la cabecera monetaria
    // (la preservamos tal cual, sin riesgo de drift por el recálculo).
    if (!priceLocked) {
      headerUpdate.subtotal = subtotal
      headerUpdate.discount_amount = discountAmount
      headerUpdate.tax_amount = taxAmount
      headerUpdate.total = total
    }
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

    // 6. Devolver datos para auditoría (protectedAction registra audit_logs)
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

    const initialStatus = 'created'

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
    const complemento = (garmentTypes ?? []).find((g: { code?: string }) =>
      g.code?.toLowerCase() === 'complemento' || g.code?.toLowerCase() === 'boutique')
    const complementGarmentTypeId = complemento?.id ?? camiseria?.id ?? firstType?.id

    if (!mainGarmentTypeId) return failure('No hay tipos de prenda configurados')

    const entregaNum = Number(input.entregaACuenta) || 0
    if (entregaNum > 0 && !input.metodoPago) return failure('Indica el método de pago para la entrega a cuenta.')

    // NOTA: ya NO exigimos caja abierta para crear el pedido ni para su entrega
    // a cuenta. El cobro se registra siempre vía rpc_add_order_payment (mig 135),
    // que localiza la sesión por FECHA del pago; si no hay ninguna que cubra hoy,
    // el pago queda con cash_session_id = NULL (se guarda en el pedido y en
    // total_paid, pero no entra en el arqueo de ninguna sesión). Así se pueden
    // meter pedidos con la caja cerrada sin perder el registro del cobro.

    // Mapping de método de pago (UI → BD). Bizum tiene su propia columna
    // total_bizum_sales: NO mapear a 'card'. Si entrega > 0 la validación de
    // arriba (input.metodoPago obligatorio) garantiza que llegamos aquí con
    // método definido; si entrega == 0 el valor no se usa luego.
    const PAYMENT_METHOD_MAP = {
      efectivo: 'cash',
      tarjeta: 'card',
      transferencia: 'transfer',
      bizum: 'bizum',
    } as const
    const paymentMethodDb = input.metodoPago ? PAYMENT_METHOD_MAP[input.metodoPago] : null

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
        order_date: (input.fichaCommon?.fechaEmision as string) || undefined,
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

    // Extraer fabric_id / fabric_meters / fabric_description desde configuration
    // (tejidoStockId / tejidoMetros / tejidoStockNombre|tejidoCatalogo|tejido)
    // y persistirlos también en sus columnas dedicadas para poder descontar stock
    // y para que el render del admin (que lee de las columnas, no del JSON) los muestre.
    const linesPayload = linesToInsert.map((l) => {
      const cfg = (l.configuration ?? {}) as Record<string, unknown>
      const fabricIdRaw = (cfg.tejidoStockId ?? cfg.fabric_id) as unknown
      const fabricId = typeof fabricIdRaw === 'string' && fabricIdRaw.trim() !== '' ? fabricIdRaw : null
      const fabricMetersRaw = (cfg.tejidoMetros ?? cfg.fabric_meters) as unknown
      const fabricMetersNum = Number(fabricMetersRaw)
      const fabricMeters = Number.isFinite(fabricMetersNum) && fabricMetersNum > 0 ? fabricMetersNum : null
      // Descripción legible del tejido: si está en stock, su nombre; si no, lo escrito
      // en el input "Tejido de catálogo"; como último fallback, el campo `tejido`
      // (que es donde camisería antigua guardaba el texto libre).
      const fabricDescription =
        (typeof cfg.tejidoStockNombre === 'string' && cfg.tejidoStockNombre.trim()) ||
        (typeof cfg.tejidoCatalogo === 'string' && cfg.tejidoCatalogo.trim()) ||
        (typeof cfg.tejido === 'string' && cfg.tejido.trim()) ||
        null
      // Coste material calculado en la ficha (precio €/m × metros). Si la ficha
      // ya lo trae, gana sobre el material_cost previo de la línea.
      const cfgCosteRaw = Number(cfg.tejidoCosteMaterial as unknown as number)
      const cfgCoste = Number.isFinite(cfgCosteRaw) && cfgCosteRaw > 0 ? cfgCosteRaw : null
      return {
        tailoring_order_id: l.tailoring_order_id,
        garment_type_id: l.garment_type_id,
        line_type: l.line_type,
        unit_price: l.unit_price,
        line_total: l.line_total,
        material_cost: cfgCoste ?? l.material_cost ?? 0,
        finishing_notes: l.finishing_notes,
        configuration: l.configuration,
        sort_order: l.sort_order,
        fabric_id: fabricId,
        fabric_meters: fabricMeters,
        fabric_description: fabricDescription,
      }
    })

    const { error: linesError } = await ctx.adminClient
      .from('tailoring_order_lines')
      .insert(linesPayload)

    if (linesError) return failure(linesError.message)

    // Sincronizar medidas hacia client_measurements (no bloqueante).
    // Deduplicamos por garment_type_id: si una ficha tiene varias prendas del
    // mismo tipo, la última gana.
    if (input.clientId) {
      const byGarment = new Map<string, Record<string, unknown>>()
      for (const row of linesPayload) {
        if (!row.garment_type_id) continue
        byGarment.set(String(row.garment_type_id), (row.configuration ?? {}) as Record<string, unknown>)
      }
      for (const [garmentTypeId, configuration] of byGarment) {
        await syncOrderLineMeasurementsToClient(ctx.adminClient, {
          clientId: String(input.clientId),
          lineGarmentTypeId: garmentTypeId,
          configuration,
          userId: ctx.userId,
        })
      }
    }

    // Descontar metros de tela (no bloquear el pedido si falla)
    const fabricUsage = new Map<string, number>()
    for (const row of linesPayload) {
      if (row.fabric_id && row.fabric_meters && row.fabric_meters > 0) {
        fabricUsage.set(row.fabric_id, (fabricUsage.get(row.fabric_id) || 0) + row.fabric_meters)
      }
    }
    if (fabricUsage.size > 0) {
      await applyFabricStockDelta(ctx.adminClient, fabricUsage, { orderId: order.id, userId: ctx.userId })
    }

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
      to_status: initialStatus,
      changed_by: ctx.userId,
      changed_by_name: ctx.userName,
    })

    if (entrega > 0) {
      // El método ya está garantizado por la validación de arriba (línea ~1134).
      if (!paymentMethodDb) return failure('Falta el método de pago de la entrega a cuenta.')

      // Fecha del cobro: la "Fecha cobro" elegida en la ficha (viaja en
      // fichaCommon; en el flujo legacy, en input.fechaCobro); si falta, la
      // fecha de emisión del pedido; último recurso, hoy. Antes se forzaba
      // SIEMPRE hoy y la fecha elegida se ignoraba (caso PIN-2026-0271:
      // pedido emitido el 07/07 cuyo cobro quedó registrado el 09/07).
      // rpc_add_order_payment (mig 135) vincula el cobro a la caja de esa fecha.
      const isIsoDate = (s: unknown): s is string =>
        typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s)
      const fc = input.fichaCommon as Record<string, unknown> | undefined
      const paymentDate = isIsoDate(fc?.fechaCobro) ? fc.fechaCobro
        : isIsoDate(input.fechaCobro) ? input.fechaCobro
        : isIsoDate(fc?.fechaEmision) ? fc.fechaEmision
        : new Date().toISOString().split('T')[0]

      // Delegar TODO el registro contable del cobro en la RPC canónica
      // rpc_add_order_payment (mig 135). Beneficios frente al inline antiguo:
      //   - Un único camino que escribe tailoring_order_payments,
      //     manual_transactions y cash_sessions.total_*_sales → imposible
      //     que diverjan (caso PIN-2026-0082: tarjeta en el pedido, efectivo
      //     en el cierre).
      //   - Mapea bien `bizum` a total_bizum_sales (antes se mapeaba a card).
      //   - Vincula a la sesión por fecha de pago, no por "open actual".
      const { error: rpcError } = await ctx.adminClient.rpc('rpc_add_order_payment', {
        p_tailoring_order_id: order.id,
        p_payment_date: paymentDate,
        p_payment_method: paymentMethodDb,
        p_amount: entrega,
        p_reference: `Entrega a cuenta - ${orderNumber}`,
        p_notes: `Entrega a cuenta - ${orderNumber}`,
        p_next_payment_date: null,
        p_store_id: input.storeId ?? null,
        p_user_id: ctx.userId,
      })
      if (rpcError) {
        // La ficha y sus líneas ya están creadas; no rompemos el flujo, pero
        // dejamos rastro para que el descuadre se pueda investigar igual que
        // antes (el insert manual antiguo también log-only en errores).
        console.error('[createFichaOrder] rpc_add_order_payment error:', rpcError)
      }
    }

    // Auditoría: identificar el pedido (nº + cliente) y, si la hubo, la entrega a
    // cuenta con su método. Sin estos campos el wrapper guardaba "Crear Pedido"
    // con entity_id NULL (no se podía saber qué pedido era).
    let clientName = 'Sin cliente'
    if (input.clientId) {
      const { data: client } = await ctx.adminClient
        .from('clients')
        .select('full_name, first_name, last_name')
        .eq('id', input.clientId)
        .single()
      if (client) clientName = (client as any).full_name || [ (client as any).first_name, (client as any).last_name ].filter(Boolean).join(' ') || 'Sin nombre'
    }
    const PAYMENT_METHOD_ES: Record<string, string> = { cash: 'efectivo', card: 'tarjeta', transfer: 'transferencia', bizum: 'bizum' }
    const auditDescription = entrega > 0 && paymentMethodDb
      ? `Pedido ${orderNumber} · Cliente: ${clientName} · Total ${total.toFixed(2)}€ · Entrega a cuenta ${entrega.toFixed(2)}€ (${PAYMENT_METHOD_ES[paymentMethodDb] ?? paymentMethodDb})`
      : `Pedido ${orderNumber} · Cliente: ${clientName} · Total ${total.toFixed(2)}€`

    return success({
      orderId: order.id,
      orderNumber,
      auditEntityId: order.id,
      auditDescription,
    } as unknown as { orderId: string; orderNumber: string })
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
      .or(`name.ilike.%${q}%,sku.ilike.%${q}%`)
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

/**
 * Actualiza la fecha de pago (payment_date) de un pedido de sastrería.
 * Es un dato editable manualmente; se permite incluso en pedidos entregados
 * (el cobro puede registrarse después de la entrega), por eso no reutiliza
 * updateOrderAction (que bloquea estados delivered/cancelled).
 */
export const updateOrderPaymentDate = protectedAction<
  { orderId: string; payment_date: string | null },
  { id: string; auditEntityId: string; auditDescription: string }
>(
  {
    permission: 'orders.edit',
    auditModule: 'orders',
    auditAction: 'update',
    auditEntity: 'tailoring_order',
    revalidate: ['/admin/pedidos'],
  },
  async (ctx, { orderId, payment_date }) => {
    if (!orderId?.trim()) return failure('orderId requerido', 'VALIDATION')
    const paymentDate = payment_date?.trim() || null
    if (paymentDate) {
      const d = new Date(paymentDate)
      if (isNaN(d.getTime())) return failure('Fecha de pago no válida', 'VALIDATION')
    }
    const { data, error } = await ctx.adminClient
      .from('tailoring_orders')
      .update({ payment_date: paymentDate })
      .eq('id', orderId)
      .select('id, order_number')
      .single()
    if (error || !data) return failure(error?.message || 'Pedido no encontrado', 'NOT_FOUND')
    const orderNumber = (data as { order_number?: string }).order_number ?? data.id
    return success({
      id: data.id,
      auditEntityId: data.id,
      auditDescription: `Fecha de pago del pedido ${orderNumber}`,
    })
  }
)

export const deleteOrder = protectedAction<string, void>(
  { permission: 'orders.delete', auditModule: 'orders', auditEntity: 'tailoring_order', auditAction: 'delete' },
  async (ctx, orderId) => {
    const admin = ctx.adminClient

    // Verificar que el pedido existe. Capturamos la cabecera COMPLETA (no solo
    // id/order_number) porque al borrar se pierde todo por CASCADE: el snapshot
    // que guardamos en auditoría es la única vía para identificar y reconstruir
    // el pedido después. (Antes el log de borrado salía con todos los campos en
    // null y era imposible saber qué pedido se había eliminado.)
    const { data: order, error: fetchError } = await admin
      .from('tailoring_orders')
      .select('*')
      .eq('id', orderId)
      .single()

    if (fetchError || !order) {
      return failure('Pedido no encontrado', 'NOT_FOUND')
    }

    // Snapshot de líneas y cobros para el registro de auditoría (append-only).
    const { data: snapshotLines } = await admin
      .from('tailoring_order_lines')
      .select('*')
      .eq('tailoring_order_id', orderId)
    const { data: snapshotPayments } = await admin
      .from('tailoring_order_payments')
      .select('*')
      .eq('tailoring_order_id', orderId)

    // 1. Reponer stock de tejido ANTES de borrar las líneas (necesita leerlas
    //    para saber qué metros volver al stock). Idempotente.
    await revertFabricStockForOrder(admin, orderId, ctx.userId)

    // 2. Limpiar cobros de sastrería vía RPC simétrica (mig 150). Reverte
    //    cash_sessions.total_*_sales y borra los manual_transactions espejo.
    //    Si algún pago vive en una sesión de caja ya cerrada, la RPC lanza
    //    excepción y se aborta el borrado para no descuadrar caja.
    const { data: orderPayments } = await admin
      .from('tailoring_order_payments')
      .select('id')
      .eq('tailoring_order_id', orderId)

    for (const p of (orderPayments ?? []) as Array<{ id: string }>) {
      const { error: rpcErr } = await admin.rpc('rpc_remove_order_payment', { p_payment_id: p.id })
      if (rpcErr) {
        console.error('[deleteOrder] rpc_remove_order_payment error:', rpcErr)
        return failure(
          'No se puede borrar este pedido: tiene cobros vinculados a una sesión de caja ya cerrada. Si necesitas eliminarlo, contacta con administración.',
          'VALIDATION',
        )
      }
    }

    // 3. Borrar líneas del pedido
    await admin.from('tailoring_order_lines').delete().eq('tailoring_order_id', orderId)

    // 4. Borrar pagos legacy (tabla `payments`, distinta de tailoring_order_payments)
    await admin.from('payments').delete().eq('tailoring_order_id', orderId)

    // 5. Borrar el pedido (ON DELETE CASCADE limpia el resto)
    const { error: deleteError } = await admin
      .from('tailoring_orders')
      .delete()
      .eq('id', orderId)

    if (deleteError) {
      console.error('[deleteOrder]', deleteError)
      return failure('Error al eliminar el pedido')
    }

    revalidatePath('/admin/pedidos')
    return success({
      auditEntityId: orderId,
      auditEntityDisplay: `tailoring_order: ${(order as { order_number?: string }).order_number ?? orderId}`,
      auditDescription: `Eliminó el pedido ${(order as { order_number?: string }).order_number ?? orderId}`,
      auditOldData: {
        order,
        lines: snapshotLines ?? [],
        payments: snapshotPayments ?? [],
      },
      auditMetadata: {
        order_number: (order as { order_number?: string }).order_number ?? null,
        lines_count: snapshotLines?.length ?? 0,
        payments_count: snapshotPayments?.length ?? 0,
      },
    } as unknown as void)
  }
)
