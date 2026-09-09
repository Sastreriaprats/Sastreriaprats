'use server'

import { revalidatePath } from 'next/cache'
import { protectedAction, type AdminClient } from '@/lib/server/action-wrapper'
import { queryList, queryById, getNextNumber, resolveClientIdsForSearch } from '@/lib/server/query-helpers'
import { createAdminClient } from '@/lib/supabase/admin'
import { createTailoringOrderSchema, tailoringOrderLineSchema, changeOrderStatusSchema } from '@/lib/validations/orders'
import { ALL_VISIBLE_STATUSES, classifyLinesForStatusChange, deriveOrderStatusFromLines, getStatusIndex, type OrderStatus } from '@/lib/orders/statuses'
import { getDefaultDeliveryDate } from '@/lib/orders/production-times'
import { success, failure } from '@/lib/errors'
import type { ListParams, ListResult } from '@/lib/server/query-helpers'
import { sendOrderDeliveredThanks } from '@/lib/email/transactional'
import { GOOGLE_REVIEW_URL } from '@/lib/constants'
import { normalizeSearchTerm, getOrderStatusLabel, formatDateTimeMadrid, countUnpricedGarments } from '@/lib/utils'
import { checkUserPermission } from '@/actions/auth'
import { syncOrderLineMeasurementsToClient } from '@/lib/measurements/sync-from-order'

/** Slug canónico de prenda desde code/name del garment_type ("Pantalón"→"pantalon"). */
function normalizeGarmentSlug(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().replace(/\s+/g, '_')
}

/** Mapas garment_type_id → slug y → nombre. El slug siembra `prenda`/`prendaSlug`
 *  en la configuration de las líneas (la ficha de confección las necesita para
 *  detectar el tipo de prenda; el wizard/edición no las persistían). El nombre
 *  se usa para re-etiquetar `prendaLabel` si el tipo de prenda cambia. */
async function buildGarmentMaps(
  admin: AdminClient,
  garmentTypeIds: (string | null | undefined)[],
): Promise<{ slugById: Map<string, string>; nameById: Map<string, string> }> {
  const ids = [...new Set(garmentTypeIds.filter((x): x is string => !!x))]
  const slugById = new Map<string, string>()
  const nameById = new Map<string, string>()
  if (!ids.length) return { slugById, nameById }
  const { data } = await admin.from('garment_types').select('id, code, name').in('id', ids)
  for (const g of (data ?? []) as { id: string; code?: string; name?: string }[]) {
    const slug = normalizeGarmentSlug(String(g.code || g.name || ''))
    if (slug) slugById.set(String(g.id), slug)
    if (g.name) nameById.set(String(g.id), String(g.name))
  }
  return { slugById, nameById }
}

/**
 * ¿El pedido está incluido en alguna factura VIGENTE (emitida y no anulada)?
 * Bloquea la edición de importes. Consulta el puente invoice_tailoring_orders
 * (mig 269, N:M): una factura conjunta cubre varios pedidos, así que el vínculo
 * ya no es la columna escalar invoices.tailoring_order_id sino el puente. Anular
 * la factura la deja en 'cancelled' → deja de bloquear.
 */
async function orderHasVigentInvoice(admin: AdminClient, orderId: string): Promise<boolean> {
  const { data } = await admin
    .from('invoice_tailoring_orders')
    .select('invoice_id, invoices!inner(status)')
    .eq('tailoring_order_id', orderId)
    .not('invoices.status', 'in', '(draft,cancelled)')
    .limit(1)
  return (data?.length ?? 0) > 0
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
  internal_notes,
  created_at,
  clients ( id, full_name, phone, email, category ),
  stores ( name, code ),
  tailoring_order_lines ( id, sort_order, line_type, configuration, is_gift, unit_price, garment_types ( name, code ) )
`

/** Devuelve el siguiente número de talón (solo el número, ej. 46) de la SERIE de
 *  la tienda. Antes miraba "el último pedido creado" de toda la tabla, así que un
 *  pedido de Wellington hacía que la ficha de Pinzón propusiera el talón de la
 *  otra serie (y dos tiendas podían acabar proponiendo el mismo número). Se
 *  calcula con el MISMO helper que numera los pedidos (getNextNumber = máximo+1
 *  de la serie del prefijo). Sin storeId se conserva el comportamiento anterior. */
export async function getNextTalonNumber(storeId?: string): Promise<number> {
  const supabase = createAdminClient()
  if (storeId) {
    const { data: store } = await supabase
      .from('stores')
      .select('order_prefix')
      .eq('id', storeId)
      .single()
    const prefix = (store as { order_prefix?: string } | null)?.order_prefix
    if (prefix) {
      const next = await getNextNumber('tailoring_orders', 'order_number', prefix)
      const match = String(next).match(/(\d+)$/)
      if (match) return parseInt(match[1], 10)
    }
  }
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
    // Filtro "solo pedidos con prendas sin precio". Viaja en la URL como escalar
    // (`unpriced=true`, vía urlFilterKeys). Se evalúa en JS (la excepción de
    // conjuntos/trajes no es expresable en SQL), así que lo extraemos aquí para
    // que no llegue a los constructores de query como una columna inexistente.
    const unpricedOnly =
      params.filters?.unpriced === 'true' || params.filters?.unpriced === true
    if (params.filters && 'unpriced' in params.filters) {
      const restFilters = { ...params.filters }
      delete restFilters.unpriced
      params = { ...params, filters: restFilters }
    }

    // El rango de fechas viaja en la URL como dos escalares serializables
    // (`date_from`/`date_to`, vía urlFilterKeys del hook useList) para que se
    // preserven al volver del detalle. Aquí los reconstruimos en el objeto
    // `order_date: { gte, lte }` que entiende toda la lógica de consulta,
    // contadores y sumatorios de abajo.
    if (params.filters && (params.filters.date_from || params.filters.date_to)) {
      const { date_from, date_to, ...rest } = params.filters
      params = {
        ...params,
        filters: {
          ...rest,
          order_date: {
            ...(date_from ? { gte: date_from } : {}),
            ...(date_to ? { lte: date_to } : {}),
          },
        },
      }
    }

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

    // Rama "solo sin precio": traemos TODOS los pedidos que cumplen el resto de
    // filtros (menos el de estado, para poder contar las píldoras por estado) con
    // sus líneas, y filtramos en JS por `countUnpricedGarments > 0` — que ya
    // aplica la excepción de conjuntos (el pantalón de un traje cuyo precio va en
    // la americana NO cuenta como pendiente). Paginamos en memoria. Es un filtro
    // puntual de uso admin, de ahí el tope de seguridad de 100k.
    if (unpricedOnly) {
      let evalQuery = ctx.adminClient.from('tailoring_orders').select(SELECT_ORDERS)
      if (searchOr) evalQuery = evalQuery.or(searchOr)
      if (params.filters?.order_type) evalQuery = evalQuery.eq('order_type', params.filters.order_type)
      const evalRange = params.filters?.order_date
      if (evalRange && typeof evalRange === 'object') {
        const r = evalRange as Record<string, unknown>
        if (r.gte !== undefined && r.gte !== '') evalQuery = evalQuery.gte('order_date', r.gte)
        if (r.lte !== undefined && r.lte !== '') evalQuery = evalQuery.lte('order_date', r.lte)
      }
      if (params.storeId) evalQuery = evalQuery.eq('store_id', params.storeId)
      evalQuery = evalQuery.order(params.sortBy || 'order_date', { ascending: params.sortOrder === 'asc' })

      const page = params.page || 1
      const pageSize = params.pageSize || 25
      const { data: evalData, error: evalError } = await evalQuery.range(0, 99999)
      if (evalError) {
        // Antes se devolvia un listado vacio con exito: la pantalla decia "no
        // hay pedidos sin precio" y los contadores a 0 como si fuera el dato
        // real. useList ya muestra el error y conserva la pagina anterior.
        console.error('[listOrders] unpriced eval:', evalError)
        return failure(evalError.message || 'No se pudo cargar el listado de pedidos')
      }

      const allUnpriced = (evalData || []).filter(
        (o: any) => countUnpricedGarments(o.tailoring_order_lines) > 0,
      )

      // Contadores por estado sobre el conjunto SIN precio, ignorando el filtro de
      // estado (mismo criterio que la rama normal: las píldoras muestran cuántos
      // hay de cada estado dentro del resto de filtros activos).
      const statusCounts = allUnpriced.reduce((acc: Record<string, number>, o: any) => {
        acc[o.status] = (acc[o.status] || 0) + 1
        return acc
      }, {} as Record<string, number>)
      const overdueUnpriced = allUnpriced.filter(
        (o: any) => o.estimated_delivery_date && o.estimated_delivery_date < today && !['delivered', 'cancelled'].includes(o.status),
      )
      statusCounts['overdue'] = overdueUnpriced.length
      const totalAll = allUnpriced.length

      // Subconjunto mostrado según el filtro de estado activo.
      let shown = allUnpriced
      if (isOverdue) shown = overdueUnpriced
      else if (statusFilter && statusFilter !== 'all') shown = allUnpriced.filter((o: any) => o.status === statusFilter)

      const aggregates = shown.reduce(
        (acc: { total: number; total_paid: number; total_pending: number }, r: any) => {
          acc.total += Number(r.total) || 0
          acc.total_paid += Number(r.total_paid) || 0
          acc.total_pending += Number(r.total_pending) || 0
          return acc
        },
        { total: 0, total_paid: 0, total_pending: 0 },
      )

      const from = (page - 1) * pageSize
      const paged = shown.slice(from, from + pageSize)

      return success({
        data: paged,
        total: shown.length,
        page,
        pageSize,
        totalPages: Math.ceil(shown.length / pageSize),
        statusCounts,
        totalAll,
        aggregates,
      })
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
        return failure(error.message || 'No se pudo cargar el listado de pedidos retrasados')
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
    // PostgREST corta toda consulta en 1.000 filas y `range(0, 99999)` NO lo
    // evita (se traduce a offset+limit y el servidor lo vuelve a recortar): en
    // cuanto los filtros dejasen pasar mas de 1.000 pedidos, la fila de Totales
    // sumaba solo los 1.000 primeros. Leemos por paginas con un orden estable,
    // porque sin `order` el reparto entre paginas no esta garantizado y se
    // pueden repetir o perder filas. El `.order` va fuera del bucle: acumula.
    const SUMS_PAGE = 1000
    sumsQuery = sumsQuery.order('id', { ascending: true })
    const sumsData: Array<{ total: number | string | null; total_paid: number | string | null; total_pending: number | string | null }> = []
    for (let offset = 0; ; offset += SUMS_PAGE) {
      const { data: sumsChunk, error: sumsError } = await sumsQuery.range(offset, offset + SUMS_PAGE - 1)
      if (sumsError) {
        console.error('[listOrders] sums:', sumsError)
        return failure(sumsError.message || 'No se pudieron calcular los totales del listado')
      }
      const batch = (sumsChunk || []) as unknown as typeof sumsData
      sumsData.push(...batch)
      if (batch.length < SUMS_PAGE) break
    }
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

    // Cobros del pedido, el más reciente primero. `tailoring_orders` NO guarda
    // forma de pago, así que sin esto el ticket de complementos/boutique no
    // tenía de dónde sacarla y estampaba "Tarjeta" por defecto.
    const { data: orderPaymentsRows } = await admin
      .from('tailoring_order_payments')
      .select('payment_method, amount, payment_date')
      .eq('tailoring_order_id', orderId)
      .order('payment_date', { ascending: false })
    order.tailoring_order_payments = orderPaymentsRows ?? []

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
          line.lining_cost = null
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
      // Un 0 € solo es válido si la prenda es regalo (evita pedidos a 0 por
      // error de tecleo); un regalo, a su vez, siempre va a 0.
      if (!line.is_gift && Number(line.unit_price) <= 0) {
        return failure('Hay una prenda sin precio: indica el PVP o márcala como regalo', 'VALIDATION')
      }
      if (line.is_gift) line.unit_price = 0
    }

    const { data: store } = await ctx.adminClient
      .from('stores').select('order_prefix').eq('id', parsedOrder.data.store_id).single()
    const prefix = store?.order_prefix || 'ORD'

    const orderNumber = await getNextNumber('tailoring_orders', 'order_number', prefix)

    const initialStatus: OrderStatus = 'created'

    // Modelo canónico: unit_price/line_total son PVP (IVA incluido), igual que
    // createFichaOrder y updateOrderAction. La cabecera extrae el IVA del PVP
    // (misma fórmula que el recálculo de updateOrderAction).
    let subtotalLines = 0
    const processedLines = linesInput.map((line: any, idx: number) => {
      const lineDiscount = line.unit_price * (line.discount_percentage || 0) / 100
      const lineTotal = line.unit_price - lineDiscount
      subtotalLines += lineTotal
      return { ...line, discount_amount: lineDiscount, line_total: lineTotal, sort_order: idx }
    })

    const discountPct = parsedOrder.data.discount_percentage || 0
    const total = Math.round(subtotalLines * (1 - discountPct / 100) * 100) / 100
    const orderDiscount = Math.round((subtotalLines - total) * 100) / 100
    let taxAmount = 0
    for (const line of processedLines) {
      const tr = Number(line.tax_rate ?? 21)
      const ltAfter = Number(line.line_total || 0) * (1 - discountPct / 100)
      taxAmount += ltAfter * tr / (100 + tr)
    }
    taxAmount = Math.round(taxAmount * 100) / 100
    const subtotal = Math.round((total - taxAmount) * 100) / 100

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

    const { slugById: gtSlugMap } = await buildGarmentMaps(ctx.adminClient, processedLines.map((l: any) => l.garment_type_id))
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

    // Sin email de confirmación al crear el pedido: en sastrería el cliente sale
    // de la tienda sabiendo lo que ha encargado y lo comentamos en persona. El
    // ÚNICO correo automático de este flujo es el de la entrega
    // (sendOrderDeliveredThanks). Decisión de Sastrería Prats, sep-2026.
    // La tienda online sigue con su confirmación propia (webhooks Stripe/RedSys).

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
    // El asistente lo usa para avisar de que el pedido ha nacido sin prendas
    // (flujo industrial/oficial: primero la cabecera, las prendas despues).
    return success({ ...order, lines_count: linesInput.length, auditDescription })
  }
)

/**
 * Enlace donde el cliente deja la reseña, según la tienda del pedido. La ficha
 * de Google Maps del negocio es donde está el botón de reseñas; si la tienda
 * tiene `google_maps_url` en su configuración, ese manda sobre este.
 */
function getStoreReviewUrl(storeCode: string | null | undefined): string {
  // Enlace directo al formulario de reseña (el mismo para las dos tiendas: solo
  // hay una ficha de Google). Si algún día Wellington tiene el suyo, basta con
  // rellenar `google_maps_url` de esa tienda, que manda sobre este.
  void storeCode
  return GOOGLE_REVIEW_URL
}

/**
 * Recalcula el estado del PEDIDO a partir del de sus prendas (regla derivada,
 * `deriveOrderStatusFromLines`) y lo persiste SOLO si cambió. Registra la
 * transición en el historial con `note` (por defecto "Automático…") e incluye los
 * efectos de los estados terminales: `delivered` → fecha de entrega + email al
 * cliente; `cancelled` (todas las prendas canceladas) → repone stock de tejido.
 *
 * REACTIVACIÓN (sep-2026): un pedido `cancelled` vuelve a la vida en cuanto
 * alguna de sus prendas deja de estar cancelada. Antes era terminal y una
 * cancelación por error solo se arreglaba tocando la base de datos. Al
 * reactivar se deshace la reposición de tejido; los cobros que se reembolsaran
 * al cancelar NO se recrean (habría que volver a registrarlos a mano).
 *
 * Lo usan las dos acciones (admin y sastre).
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
  const { data: lines } = await admin
    .from('tailoring_order_lines').select('status').eq('tailoring_order_id', orderId)
  const derived = deriveOrderStatusFromLines((order as any).order_type, (lines ?? []).map((l: any) => l.status))
  if (!derived || derived === fromStatus) return fromStatus

  await admin.from('tailoring_orders').update({
    status: derived,
    // La fecha de entrega sigue al estado en los dos sentidos: al derivar
    // 'delivered' se sella y al salir de ahí (entrega deshecha) se borra.
    ...(derived === 'delivered'
      ? { actual_delivery_date: new Date().toISOString().split('T')[0] }
      : (fromStatus === 'delivered' ? { actual_delivery_date: null } : {})),
  }).eq('id', orderId)

  // Reactivación: el pedido sale de 'cancelled' → el tejido vuelve a consumirse.
  if (fromStatus === 'cancelled' && derived !== 'cancelled') {
    await restoreFabricStockForOrder(admin, orderId, ctx.userId)
  }

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

  // Al cliente solo se le escribe cuando el pedido queda ENTREGADO: agradecer y
  // pedir reseña. Los estados intermedios no generan ningún email (sep-2026).
  if (derived === 'delivered') {
    const { data: ow } = await admin
      .from('tailoring_orders')
      .select('order_number, clients(email, full_name, first_name, last_name), stores(code, google_maps_url)')
      .eq('id', orderId).single()
    const client = (ow as { clients?: { email?: string; full_name?: string; first_name?: string; last_name?: string } | null } | null)?.clients
    if (client?.email) {
      const clientName = client.full_name || [client.first_name, client.last_name].filter(Boolean).join(' ') || 'Cliente'
      const store = (ow as { stores?: { code?: string | null; google_maps_url?: string | null } | null } | null)?.stores
      try {
        await sendOrderDeliveredThanks({
          client_name: clientName, client_email: client.email,
          order_number: (ow as { order_number: string }).order_number,
          store_review_url: store?.google_maps_url || getStoreReviewUrl(store?.code),
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

      // Retroceso: borra los sellos de entrega/terminación que dejó el estado
      // anterior (si no, la prenda vuelve a confección pero sigue devengando
      // comisión de oficial por `finished_at`).
      const { data: orderTypeRow } = await ctx.adminClient
        .from('tailoring_orders').select('order_type').eq('id', order_id).single()
      const retreatingLineIds = lines
        .filter((l) => {
          const iFrom = getStatusIndex(l.status, (orderTypeRow as any)?.order_type)
          const iTo = getStatusIndex(new_status, (orderTypeRow as any)?.order_type)
          return iFrom >= 0 && iTo >= 0 && iTo < iFrom
        })
        .map((l) => l.id)
      await clearCompletionStamps(ctx.adminClient, retreatingLineIds, new_status, (orderTypeRow as any)?.order_type)

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

      const { data: lineRows } = await ctx.adminClient
        .from('tailoring_order_lines').select('id, status').eq('tailoring_order_id', order_id)
      const lines = (lineRows ?? []) as { id: string; status: string }[]

      // REACTIVAR un pedido cancelado: se sacan también las prendas de
      // 'cancelled' (si no, el estado derivado volvería a caer a cancelado) y se
      // vuelve a consumir el tejido que repuso la cancelación. Los cobros
      // reembolsados al cancelar NO se recrean: hay que registrarlos de nuevo.
      if (fromStatus === 'cancelled' && new_status !== 'cancelled') {
        const cancelledLineIds = lines.filter((l) => l.status === 'cancelled').map((l) => l.id)
        if (cancelledLineIds.length > 0) {
          await ctx.adminClient
            .from('tailoring_order_lines').update({ status: new_status }).in('id', cancelledLineIds)
          await ctx.adminClient.from('tailoring_order_state_history').insert(
            cancelledLineIds.map((id) => ({
              tailoring_order_id: order_id, tailoring_order_line_id: id,
              from_status: 'cancelled', to_status: new_status,
              notes: notes ?? 'Reactivación del pedido',
              changed_by: ctx.userId, changed_by_name: ctx.userName,
            }))
          )
          await clearCompletionStamps(ctx.adminClient, cancelledLineIds, new_status, (order as any).order_type)
        }
        await ctx.adminClient
          .from('tailoring_orders').update({ status: new_status }).eq('id', order_id)
        await restoreFabricStockForOrder(ctx.adminClient, order_id, ctx.userId)
        await ctx.adminClient.from('tailoring_order_state_history').insert({
          tailoring_order_id: order_id, from_status: 'cancelled', to_status: new_status,
          notes: notes ?? 'Pedido reactivado', changed_by: ctx.userId, changed_by_name: ctx.userName,
        })
        // Si alguna prenda seguía viva y más atrasada, el pedido baja a ese
        // mínimo: el estado del pedido siempre es el de la prenda menos avanzada.
        await recalcOrderStatusFromLines(ctx.adminClient, order_id, ctx, 'Reactivación (derivado)')
        changedLinesCount = cancelledLineIds.length
        aheadLinesCount = 0
        const { data: reactivated } = await ctx.adminClient
          .from('tailoring_orders').select('order_number').eq('id', order_id).single()
        return success({
          order_id,
          new_status,
          changed_lines_count: changedLinesCount,
          ahead_lines_count: 0,
          reactivated: true,
          auditEntityId: order_id,
          auditDescription: `Pedido ${(reactivated as any)?.order_number ?? order_id} REACTIVADO: Cancelado → ${getOrderStatusLabel(new_status)}`,
          auditOldData: { estado: 'cancelled' },
          auditNewData: { estado: new_status },
        })
      }

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
        if (lines.length === 0) {
          // Pedido SIN prendas todavía (el asistente industrial crea primero la
          // cabecera y las prendas se añaden después). Sin líneas no hay mínimo
          // del que derivar el estado, así que se fija en la cabecera: antes el
          // botón respondía "Estado cambiado" y el pedido no se movía de
          // "Creado", sin forma de sacarlo de ahí.
          const { error: hdrErr } = await ctx.adminClient
            .from('tailoring_orders').update({ status: new_status }).eq('id', order_id)
          if (hdrErr) return failure(hdrErr.message || 'No se pudo cambiar el estado del pedido')
          await ctx.adminClient.from('tailoring_order_state_history').insert({
            tailoring_order_id: order_id, from_status: fromStatus, to_status: new_status,
            notes, changed_by: ctx.userId, changed_by_name: ctx.userName,
          })
          changedLinesCount = 0
          aheadLinesCount = 0
        } else {
          if (prop.toUpdate.length > 0) {
            // Estado ANTERIOR de cada prenda: hace falta para saber cuáles
            // retroceden (deshacer una entrega, p. ej.) y limpiarles los sellos.
            const movedFrom = new Map(lines.map((l) => [l.id, l.status]))
            await ctx.adminClient
              .from('tailoring_order_lines').update({ status: new_status }).in('id', prop.toUpdate)
            const retreatingLineIds = prop.toUpdate.filter((id) => {
              const iFrom = getStatusIndex(movedFrom.get(id) ?? '', (order as any).order_type)
              const iTo = getStatusIndex(new_status, (order as any).order_type)
              return iFrom >= 0 && iTo >= 0 && iTo < iFrom
            })
            await clearCompletionStamps(ctx.adminClient, retreatingLineIds, new_status, (order as any).order_type)
          }
          changedLinesCount = prop.toUpdate.length
          aheadLinesCount = prop.aheadCount
          await recalcOrderStatusFromLines(ctx.adminClient, order_id, ctx, 'Avanzar prendas (derivado)')
        }
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

      // Retroceso: quitar los sellos de entrega/terminación (ver clearCompletionStamps).
      const { data: otRow } = await ctx.adminClient
        .from('tailoring_orders').select('order_type').eq('id', orderId.trim()).single()
      const iFrom = getStatusIndex(fromStatus ?? '', (otRow as any)?.order_type)
      const iTo = getStatusIndex(trimmedStatus, (otRow as any)?.order_type)
      if (iFrom >= 0 && iTo >= 0 && iTo < iFrom) {
        await clearCompletionStamps(ctx.adminClient, [lineId.trim()], trimmedStatus, (otRow as any)?.order_type)
      }

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

      // Reactivar un pedido cancelado toca stock de tejido y cobros: se hace
      // desde la ficha del pedido (admin), no desde el panel del sastre.
      if (fromStatus === 'cancelled' && trimmedStatus !== 'cancelled') {
        return failure('Este pedido está cancelado. Para reactivarlo, hazlo desde la ficha del pedido en Administración.', 'VALIDATION')
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
          const movedFrom = new Map(lines.map((l) => [l.id, l.status]))
          await ctx.adminClient
            .from('tailoring_order_lines').update({ status: trimmedStatus }).in('id', prop.toUpdate)
          const retreatingLineIds = prop.toUpdate.filter((id) => {
            const iFrom = getStatusIndex(movedFrom.get(id) ?? '', (prevOrder as any)?.order_type)
            const iTo = getStatusIndex(trimmedStatus, (prevOrder as any)?.order_type)
            return iFrom >= 0 && iTo >= 0 && iTo < iFrom
          })
          await clearCompletionStamps(ctx.adminClient, retreatingLineIds, trimmedStatus, (prevOrder as any)?.order_type)
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
    is_gift?: boolean
    discount_percentage?: number
    tax_rate?: number
    material_cost?: number
    /** Coste del forro, separado del tejido (mig 284). */
    lining_cost?: number
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
    /** Lo envía el diálogo pero se IGNORA: la FK la resuelve el trigger
     *  trg_resolve_line_official_id desde configuration.oficial (mig 227). */
    official_id?: string | null
  }>
  /** Ids de las prendas que el diálogo tenía al abrirse. Control de concurrencia
   *  optimista: `lines` viaja como estado COMPLETO y lo que no venga se BORRA,
   *  así que si otro usuario añadió una prenda mientras tanto este guardado la
   *  haría desaparecer. Opcional: sin él, el comportamiento no cambia. */
  knownLineIds?: string[]
}

const HEADER_EDITABLE_FIELDS = [
  'client_id', 'store_id', 'order_type', 'estimated_delivery_date',
  'delivery_method', 'delivery_address', 'delivery_city', 'delivery_postal_code',
  'discount_percentage', 'internal_notes', 'client_notes',
] as const

// Campos que updateOrderAction escribe en el row y compara para detectar
// cambios. official_id NO está: lo resuelve el trigger de BD desde
// configuration.oficial (compararlo contra un row que no lo trae marcaba
// SIEMPRE como modificada cualquier línea con la FK poblada).
const LINE_EDITABLE_FIELDS = [
  'garment_type_id', 'line_type', 'unit_price', 'is_gift', 'discount_percentage', 'tax_rate',
  'material_cost', 'lining_cost', 'labor_cost', 'factory_cost',
  'fabric_id', 'fabric_description', 'fabric_meters', 'supplier_id',
  'model_name', 'model_size', 'finishing_notes', 'configuration', 'sort_order',
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

/**
 * Inverso de `revertFabricStockForOrder`: vuelve a descontar del stock los
 * metros de las prendas VIVAS cuando un pedido cancelado se REACTIVA. Sin esto
 * el tejido se quedaba contado dos veces (la cancelación lo repuso y el pedido
 * vuelve a consumirlo).
 *
 * Idempotente por el mismo flag: si `fabric_stock_reverted_at` es NULL no hay
 * reposición que deshacer y no hace nada. Llamarlo DESPUÉS de actualizar el
 * estado de las líneas, para que "vivas" ya sea el conjunto definitivo.
 */
async function restoreFabricStockForOrder(
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
    console.error('[restoreFabricStockForOrder] order fetch failed', orderId, fetchErr)
    return
  }
  if (!(order as { fabric_stock_reverted_at?: string | null }).fabric_stock_reverted_at) return

  const { data: lines } = await admin
    .from('tailoring_order_lines')
    .select('fabric_id, fabric_meters, status')
    .eq('tailoring_order_id', orderId)

  const deltas = new Map<string, number>()
  for (const l of (lines ?? []) as Array<{ fabric_id: string | null; fabric_meters: number | string | null; status: string }>) {
    if (l.status === 'cancelled') continue
    const fId = l.fabric_id
    const m = Number(l.fabric_meters) || 0
    if (fId && m > 0) deltas.set(fId, (deltas.get(fId) || 0) + m)
  }

  // applyFabricStockDelta resta lo que recibe: positivo = consumo.
  if (deltas.size > 0) await applyFabricStockDelta(admin, deltas, { orderId, userId })

  await admin
    .from('tailoring_orders')
    .update({ fabric_stock_reverted_at: null })
    .eq('id', orderId)
}

/**
 * Borra los sellos de terminación/entrega de las prendas que RETROCEDEN por
 * debajo de `finished`/`delivered`. Sin esto, deshacer una entrega marcada por
 * error dejaba la prenda "en confección" pero con `finished_at` puesto — y ese
 * campo es el DEVENGO de la comisión del oficial (mig 226), así que la prenda
 * seguía contando como terminada en el informe y en la liquidación.
 *
 * `finished_at` solo se limpia si la línea NO está liquidada (`settlement_id`
 * nulo): lo ya pagado al oficial no se toca nunca.
 */
async function clearCompletionStamps(
  admin: AdminClient,
  lineIds: string[],
  targetStatus: string,
  orderType: string | null | undefined,
): Promise<void> {
  if (lineIds.length === 0) return
  // Solo aplica a retrocesos dentro del pipeline: 'delivered' es el destino que
  // pone los sellos, y 'cancelled'/'incident' son transversales (no los tocan).
  if (targetStatus === 'delivered' || targetStatus === 'cancelled' || targetStatus === 'incident') return

  // Las entregadas que retroceden pierden el sello de entrega.
  await admin
    .from('tailoring_order_lines')
    .update({ delivered_at: null, delivered_by: null })
    .in('id', lineIds)

  // Y el de terminación solo si el destino queda por DEBAJO de 'finished'.
  const idxTarget = getStatusIndex(targetStatus, orderType)
  const idxFinished = getStatusIndex('finished', orderType)
  const beforeFinished = idxTarget >= 0 && idxFinished >= 0 && idxTarget < idxFinished
  if (!beforeFinished) return

  await admin
    .from('tailoring_order_lines')
    .update({ finished_at: null })
    .in('id', lineIds)
    .is('settlement_id', null)
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
    // El vínculo es el puente invoice_tailoring_orders (mig 269, N:M): una factura
    // conjunta cubre varios pedidos. Anular la factura la deja en 'cancelled' → ya no bloquea.
    const priceLocked = await orderHasVigentInvoice(admin, input.orderId)

    const { data: linesBefore } = await admin
      .from('tailoring_order_lines')
      .select('*')
      .eq('tailoring_order_id', input.orderId)
      .order('sort_order', { ascending: true })

    const linesBeforeArr = (linesBefore || []) as Array<Record<string, any>>

    // 1.b Concurrencia: si en BD hay prendas que el diálogo no conocía, otro
    // usuario las añadió después de abrirse la ventana y este guardado las
    // borraría sin aviso (el bloque 3 elimina todo lo que no venga en `lines`).
    // Se comprueba ANTES de escribir nada para no dejar el pedido a medias.
    if (input.lines !== undefined && input.knownLineIds) {
      const known = new Set(input.knownLineIds.map((id) => String(id)))
      const desconocidas = linesBeforeArr.filter((l) => !known.has(String(l.id)))
      if (desconocidas.length > 0) {
        return failure(
          'El pedido ha cambiado desde que abriste la ventana (tiene prendas nuevas). Recarga la página y vuelve a guardar.',
          'CONFLICT',
        )
      }
    }

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

      // Toda línea que venga con `id` tiene que ser de ESTE pedido: el UPDATE de
      // más abajo filtra sólo por id y podía pisar la prenda de otro pedido (que
      // además quedaría con la cabecera descuadrada, porque no se recalcula).
      // Se valida el array ENTERO aquí: hacerlo dentro del bucle dejaría el
      // pedido con las prendas ya borradas por el DELETE de justo debajo.
      const beforeIds = new Set(linesBeforeArr.map((l) => String(l.id)))
      if (incomingLines.some((l) => l.id && !beforeIds.has(String(l.id)))) {
        return failure('Una de las prendas no pertenece a este pedido', 'VALIDATION')
      }

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
      // Costes (material/obra/fábrica): getOrder los REDACTA a null para quien no
      // tiene orders.view_costs (panel sastre), así que su diálogo de edición los
      // enviaba como 0 y los machacaba al guardar (caso PIN-2026-0258: una edición
      // de notas internas borró 1.006,23 € de costes). Regla: solo un usuario CON
      // permiso de costes puede cambiarlos; para el resto se conservan los de BD.
      const canEditCosts = await checkUserPermission(ctx.userId, 'orders.view_costs')
      const costFrom = (incoming: number | undefined, beforeVal: unknown): number =>
        canEditCosts && incoming !== undefined ? (Number(incoming) || 0) : (Number(beforeVal ?? 0) || 0)
      // Precios €/m de los tejidos NUESTROS (de stock) implicados, para poder
      // autocompletar el coste de MATERIAL de las líneas cuyo tejido es de stock
      // pero cuyo material_cost quedó a 0 (ver red de seguridad más abajo).
      // Reunimos los fabric_id entrantes y los de BD (el diálogo puede reenviar
      // un fabric_id sin tocarlo). Una sola consulta, tolerante a fallo.
      // Idem para el FORRO de stock (mig 284): su id vive en configuration
      // (forroStockId), no en columna propia, pero el precio sale del mismo
      // catálogo de tejidos.
      const liningFabricIdOf = (configuration: unknown): string | null => {
        const cfg = (configuration ?? {}) as Record<string, unknown>
        const raw = cfg.forroStockId
        return typeof raw === 'string' && raw.trim() !== '' ? raw.trim() : null
      }
      const fabricIdsForCost = new Set<string>()
      for (const l of incomingLines) if (l.fabric_id) fabricIdsForCost.add(String(l.fabric_id))
      for (const l of linesBeforeArr) if ((l as any).fabric_id) fabricIdsForCost.add(String((l as any).fabric_id))
      for (const l of incomingLines) { const id = liningFabricIdOf(l.configuration); if (id) fabricIdsForCost.add(id) }
      for (const l of linesBeforeArr) { const id = liningFabricIdOf((l as any).configuration); if (id) fabricIdsForCost.add(id) }
      const fabricPriceById = new Map<string, number>()
      if (fabricIdsForCost.size > 0) {
        const { data: fabricRows } = await admin
          .from('fabrics')
          .select('id, price_per_meter')
          .in('id', Array.from(fabricIdsForCost))
        for (const f of (fabricRows ?? []) as any[]) {
          const p = Number(f.price_per_meter) || 0
          if (f.id) fabricPriceById.set(String(f.id), p)
        }
      }
      const { slugById: gtSlugMap, nameById: gtNameMap } = await buildGarmentMaps(admin, incomingLines.map((l: any) => l.garment_type_id))
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

        // Si cambia el TIPO de prenda de una línea existente, sincronizamos las
        // claves derivadas de la configuration: prenda/prendaSlug (las lee la
        // ficha y la referencia de boleta) y el prefijo de prendaLabel (lo pinta
        // la tarjeta de la prenda). withPrendaSlug solo las rellena si FALTAN,
        // así que sin esto la prenda seguía mostrándose con el tipo antiguo
        // aunque la FK sí cambiara (caso PIN-2026-0245: chaleco → pantalón).
        if (before && String((before as any).garment_type_id) !== String(line.garment_type_id)) {
          const cfg = (mergedConfiguration ?? {}) as Record<string, unknown>
          const newSlug = gtSlugMap.get(line.garment_type_id)
          if (newSlug) {
            cfg.prenda = newSlug
            cfg.prendaSlug = newSlug
          }
          const newName = gtNameMap.get(line.garment_type_id)
          const label = String(cfg.prendaLabel ?? '').trim()
          if (newName && label) {
            // "Chaleco — Traje con chaleco" → "Pantalón — Traje con chaleco";
            // solo em/en dash (mismo separador que escribe la ficha).
            const m = label.match(/\s*(?:—|–)\s*(.+)$/)
            cfg.prendaLabel = m ? `${newName} — ${m[1].trim()}` : newName
          }
        }

        // Boleta = tarjeta: la ficha de confección imprime el tejido desde
        // configuration (tejidoStockNombre → tejidoCatalogo → tejido). Si
        // "Editar pedido" cambia el TEJIDO registrado (fabric_description
        // explícito distinto del que dice la ficha), sincronizamos la config
        // para que la boleta no siga imprimiendo el antiguo (caso
        // PIN-2026-0238 AMER-TRJ2: registrada VITALE, boleta LOROPIANA).
        // El guardado de ficha envía fabric_description YA derivado de su
        // config (94a6461): en ese flujo coinciden y esto no toca nada.
        if (
          line.fabric_description !== undefined &&
          String(line.fabric_description ?? '').trim() &&
          mergedConfiguration && typeof mergedConfiguration === 'object'
        ) {
          const cfg = mergedConfiguration as Record<string, unknown>
          const incomingFabric = String(line.fabric_description).trim()
          const cfgTejido = [cfg.tejidoStockNombre, cfg.tejidoCatalogo, cfg.tejido]
            .map((v) => String(v ?? '').trim())
            .find(Boolean) ?? ''
          if (cfgTejido !== incomingFabric) cfg.tejidoStockNombre = incomingFabric
        }

        const row: Record<string, any> = {
          garment_type_id: line.garment_type_id,
          line_type: line.line_type,
          unit_price: unitPrice,
          discount_percentage: discountPct,
          discount_amount: discountAmount,
          line_total: lineTotal,
          // Sin is_gift en el row, el update lo descartaba y el check «Regalo»
          // del diálogo de edición nunca persistía (solo el alta lo guardaba).
          is_gift: line.is_gift !== undefined ? line.is_gift === true : ((before as any)?.is_gift ?? false),
          tax_rate: Number(line.tax_rate ?? 21),
          material_cost: costFrom(line.material_cost, (before as any)?.material_cost),
          lining_cost: costFrom(line.lining_cost, (before as any)?.lining_cost),
          labor_cost: costFrom(line.labor_cost, (before as any)?.labor_cost),
          factory_cost: costFrom(line.factory_cost, (before as any)?.factory_cost),
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
          // official_id NO se escribe aquí a propósito: la fuente de verdad del
          // oficial es el TEXTO configuration.oficial y la FK es un espejo que
          // resuelve el trigger trg_resolve_line_official_id (mig 227) en BD.
          // Escribirla desde el cliente crearía un segundo escritor y drift
          // texto↔FK cuando el texto no cambia.
          sort_order: sortOrder,
        }

        // Red de seguridad del coste de MATERIAL para tejido NUESTRO (de stock).
        // Si la línea acaba con un fabric_id de stock y metros pero su
        // material_cost quedó a 0, lo derivamos del precio €/m del tejido
        // (price_per_meter × metros). Cubre el flujo "Editar ficha", que asigna
        // el tejido de stock pero NO calcula el coste (no tiene ni campo de
        // metros ni de coste), y cualquier alta previa sin coste. Solo RELLENA
        // el hueco: nunca pisa un coste ya introducido (>0), así que respeta los
        // overrides manuales. Petición del cliente: "que salte el coste del
        // tejido en Material cuando el tejido es nuestro".
        if ((Number(row.material_cost) || 0) <= 0 && row.fabric_id) {
          const meters = Number(row.fabric_meters) || 0
          const ppm = fabricPriceById.get(String(row.fabric_id)) || 0
          if (meters > 0 && ppm > 0) {
            row.material_cost = round2(ppm * meters)
          }
        }

        // Misma red de seguridad para el coste del FORRO (mig 284). La ficha del
        // sastre ya calcula forroCosteMaterial (€/m × metros del forro de stock)
        // y hasta ahora ese importe se quedaba muerto dentro de configuration.
        // Si la línea acaba sin coste de forro, se deriva: primero del catálogo
        // vivo (precio actual × metros), y si no, del importe que calculó la
        // ficha. Solo RELLENA el hueco: nunca pisa un coste ya introducido.
        if ((Number(row.lining_cost) || 0) <= 0) {
          const cfg = (row.configuration ?? {}) as Record<string, unknown>
          const liningId = liningFabricIdOf(cfg)
          const liningMeters = Number(cfg.forroMetros) || 0
          const liningPpm = liningId ? (fabricPriceById.get(liningId) || 0) : 0
          if (liningMeters > 0 && liningPpm > 0) {
            row.lining_cost = round2(liningPpm * liningMeters)
          } else {
            const fromFicha = Number(cfg.forroCosteMaterial) || 0
            if (fromFicha > 0) row.lining_cost = round2(fromFicha)
          }
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
            // Cinturón, además de la validación previa del array: el id por sí
            // solo no garantiza que la línea sea de este pedido.
            .eq('tailoring_order_id', input.orderId)
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

// ─── Duplicar pedidos y prendas ──────────────────────────────────────────────

/** Campos de línea que se COPIAN al duplicar (el resto se resetea). */
function cloneLineForDuplicate(l: Record<string, any>, targetOrderId: string, sortOrder: number) {
  return {
    tailoring_order_id: targetOrderId,
    garment_type_id: l.garment_type_id,
    line_type: l.line_type,
    measurement_id: l.measurement_id ?? null,
    configuration: l.configuration ?? {},
    fabric_id: l.fabric_id ?? null,
    fabric_description: l.fabric_description ?? null,
    fabric_meters: l.fabric_meters ?? null,
    supplier_id: l.supplier_id ?? null,
    unit_price: l.unit_price,
    is_gift: l.is_gift === true,
    discount_percentage: l.discount_percentage ?? 0,
    discount_amount: l.discount_amount ?? 0,
    tax_rate: l.tax_rate ?? 21,
    line_total: l.line_total,
    material_cost: l.material_cost ?? 0,
    lining_cost: l.lining_cost ?? 0,
    labor_cost: l.labor_cost ?? 0,
    factory_cost: l.factory_cost ?? 0,
    model_name: l.model_name ?? null,
    model_size: l.model_size ?? null,
    finishing_notes: l.finishing_notes ?? null,
    sort_order: sortOrder,
    official_id: l.official_id ?? null,
    // RESET: status='created' (default), delivered_at/by, finished_at,
    // settlement_id, photos, supplier_order_id — nada de eso se copia.
    status: 'created',
  }
}

/**
 * Duplica un pedido completo: nuevo número, mismas prendas/medidas/configuración
 * y costes, SIN cobros, firmas, estados avanzados ni fechas de entrega. Descuenta
 * tejido como cualquier pedido nuevo (la prenda duplicada consumirá tela real).
 * No envía email al cliente. Todo en servidor: los datos de UI llegan redactados
 * (costes a null sin orders.view_costs) y la copia los perdería.
 */
export const duplicateOrderAction = protectedAction<string, { orderId: string; orderNumber: string }>(
  {
    permission: 'orders.create',
    auditModule: 'orders',
    auditAction: 'create',
    auditEntity: 'tailoring_order',
    revalidate: ['/admin/pedidos', '/sastre/pedidos'],
  },
  async (ctx, sourceOrderId) => {
    if (!sourceOrderId?.trim()) return failure('ID del pedido obligatorio', 'VALIDATION')
    const admin = ctx.adminClient

    const { data: src, error: srcErr } = await admin
      .from('tailoring_orders')
      .select('*')
      .eq('id', sourceOrderId.trim())
      .single()
    if (srcErr || !src) return failure('Pedido no encontrado', 'NOT_FOUND')

    const { data: srcLines, error: linesErr } = await admin
      .from('tailoring_order_lines')
      .select('*')
      .eq('tailoring_order_id', sourceOrderId.trim())
      .order('sort_order')
    if (linesErr) return failure(linesErr.message)

    const { data: store } = await admin
      .from('stores').select('order_prefix').eq('id', (src as any).store_id).single()
    const prefix = (store as any)?.order_prefix || 'ORD'
    const orderNumber = await getNextNumber('tailoring_orders', 'order_number', prefix)

    const { data: newOrder, error: orderErr } = await admin
      .from('tailoring_orders')
      .insert({
        // COPIA
        client_id: (src as any).client_id,
        order_type: (src as any).order_type,
        recipient_type: (src as any).recipient_type,
        recipient_name: (src as any).recipient_name,
        official_id: (src as any).official_id,
        store_id: (src as any).store_id,
        delivery_method: (src as any).delivery_method,
        delivery_address: (src as any).delivery_address,
        delivery_city: (src as any).delivery_city,
        delivery_postal_code: (src as any).delivery_postal_code,
        discount_percentage: (src as any).discount_percentage,
        subtotal: (src as any).subtotal,
        discount_amount: (src as any).discount_amount,
        tax_amount: (src as any).tax_amount,
        total: (src as any).total,
        total_material_cost: (src as any).total_material_cost,
        total_labor_cost: (src as any).total_labor_cost,
        total_factory_cost: (src as any).total_factory_cost,
        total_cost: (src as any).total_cost,
        internal_notes: (src as any).internal_notes,
        client_notes: (src as any).client_notes,
        // RESET / NUEVO (total_pending es columna generada: no se incluye)
        status: 'created',
        order_number: orderNumber,
        estimated_delivery_date: null,
        actual_delivery_date: null,
        payment_date: null,
        total_paid: 0,
        signature_url: null,
        signed_at: null,
        parent_order_id: (src as any).id, // trazabilidad hacia el original
        invoice_id: null,
        created_by: ctx.userId,
      })
      .select('id, order_number, client_id')
      .single()
    if (orderErr || !newOrder) return failure(orderErr?.message ?? 'Error al duplicar el pedido')

    const linesToInsert = ((srcLines ?? []) as any[]).map((l, idx) =>
      cloneLineForDuplicate(l, (newOrder as any).id, l.sort_order ?? idx))
    if (linesToInsert.length > 0) {
      const { error: insErr } = await admin.from('tailoring_order_lines').insert(linesToInsert)
      if (insErr) return failure(insErr.message)
    }

    // Descontar tejido como cualquier pedido nuevo (no bloqueante)
    const fabricUsage = new Map<string, number>()
    for (const l of linesToInsert) {
      const meters = Number(l.fabric_meters) || 0
      if (l.fabric_id && meters > 0) fabricUsage.set(l.fabric_id, (fabricUsage.get(l.fabric_id) || 0) + meters)
    }
    if (fabricUsage.size > 0) {
      await applyFabricStockDelta(admin, fabricUsage, { orderId: (newOrder as any).id, userId: ctx.userId })
    }

    await admin.from('tailoring_order_state_history').insert({
      tailoring_order_id: (newOrder as any).id,
      to_status: 'created',
      changed_by: ctx.userId,
      changed_by_name: ctx.userName,
      notes: `Duplicado del pedido ${(src as any).order_number}`,
    })

    let clientName = 'Sin cliente'
    if ((newOrder as any).client_id) {
      const { data: client } = await admin
        .from('clients').select('full_name, first_name, last_name')
        .eq('id', (newOrder as any).client_id).single()
      if (client) clientName = (client as any).full_name || [(client as any).first_name, (client as any).last_name].filter(Boolean).join(' ') || 'Sin nombre'
    }

    return success({
      orderId: (newOrder as any).id,
      orderNumber,
      auditEntityId: (newOrder as any).id,
      auditDescription: `Pedido ${orderNumber} duplicado de ${(src as any).order_number} · Cliente: ${clientName}`,
    } as { orderId: string; orderNumber: string })
  }
)

/**
 * Duplica UNA prenda dentro del mismo pedido. La copia nace en 'created', con
 * la etiqueta renombrada («… (copia)») para que la ref de talón derivada
 * (line-refs.ts) no coincida con la original, y la cabecera se recalcula con
 * la fórmula canónica (PVP IVA-incluido).
 */
export const duplicateOrderLineAction = protectedAction<
  { orderId: string; lineId: string },
  { newLineId: string }
>(
  {
    permission: 'orders.edit',
    auditModule: 'orders',
    auditAction: 'update',
    auditEntity: 'tailoring_order',
    revalidate: ['/admin/pedidos', '/sastre/pedidos'],
  },
  async (ctx, { orderId, lineId }) => {
    const admin = ctx.adminClient

    const { data: order, error: ordErr } = await admin
      .from('tailoring_orders')
      .select('id, order_number, status, discount_percentage')
      .eq('id', orderId)
      .single()
    if (ordErr || !order) return failure('Pedido no encontrado', 'NOT_FOUND')
    if ((order as any).status === 'cancelled') return failure('El pedido está cancelado', 'VALIDATION')

    // Añadir una prenda cambia importes: bloqueado con factura vigente (mismo
    // criterio que updateOrderAction; el pago ya no bloquea).
    if (await orderHasVigentInvoice(admin, orderId)) {
      return failure('El pedido tiene una factura vigente: anúlala antes de añadir prendas', 'VALIDATION')
    }

    const { data: line, error: lineErr } = await admin
      .from('tailoring_order_lines')
      .select('*')
      .eq('id', lineId)
      .eq('tailoring_order_id', orderId)
      .single()
    if (lineErr || !line) return failure('Prenda no encontrada en este pedido', 'NOT_FOUND')

    const { data: maxSortRow } = await admin
      .from('tailoring_order_lines')
      .select('sort_order')
      .eq('tailoring_order_id', orderId)
      .order('sort_order', { ascending: false })
      .limit(1)
      .maybeSingle()
    const nextSort = ((maxSortRow as any)?.sort_order ?? 0) + 1

    const clone = cloneLineForDuplicate(line as any, orderId, nextSort)
    // Renombrar la etiqueta: line-refs deriva la ref de talón del prendaLabel y
    // dos prendas con el mismo label recibirían la MISMA ref (AMER-TRJ1).
    const cfg = { ...(clone.configuration as Record<string, unknown>) }
    if (typeof cfg.prendaLabel === 'string' && cfg.prendaLabel.trim()) {
      cfg.prendaLabel = `${cfg.prendaLabel} (copia)`
    }
    clone.configuration = cfg

    const { data: newLine, error: insErr } = await admin
      .from('tailoring_order_lines')
      .insert(clone)
      .select('id')
      .single()
    if (insErr || !newLine) return failure(insErr?.message ?? 'Error al duplicar la prenda')

    // Recalcular cabecera (fórmula canónica de updateOrderAction: PVP IVA incl.)
    const { data: finalLines } = await admin
      .from('tailoring_order_lines')
      .select('line_total, tax_rate')
      .eq('tailoring_order_id', orderId)
    const discountPct = Number((order as any).discount_percentage) || 0
    const subtotalLines = ((finalLines ?? []) as any[]).reduce((s, l) => s + Number(l.line_total || 0), 0)
    const total = round2(subtotalLines * (1 - discountPct / 100))
    const discountAmount = round2(subtotalLines - total)
    let taxAmount = 0
    for (const l of (finalLines ?? []) as any[]) {
      const lt = Number(l.line_total || 0)
      const tr = Number(l.tax_rate ?? 21)
      taxAmount += lt * (1 - discountPct / 100) * tr / (100 + tr)
    }
    taxAmount = round2(taxAmount)
    const { error: updErr } = await admin
      .from('tailoring_orders')
      .update({
        subtotal: round2(total - taxAmount),
        discount_amount: discountAmount,
        tax_amount: taxAmount,
        total,
        updated_at: new Date().toISOString(),
      })
      .eq('id', orderId)
    if (updErr) return failure(updErr.message)

    const label = (cfg.prendaLabel as string) || 'Prenda'
    await admin.from('tailoring_order_state_history').insert({
      tailoring_order_id: orderId,
      from_status: (order as any).status,
      to_status: (order as any).status,
      changed_by: ctx.userId,
      changed_by_name: ctx.userName,
      notes: `Prenda duplicada: ${label}`,
    })

    return success({
      newLineId: (newLine as any).id,
      auditEntityId: orderId,
      auditDescription: `Prenda duplicada (${label}) en pedido ${(order as any).order_number}`,
    } as { newLineId: string })
  }
)

export interface PrendaLineaInput {
  slug: string
  label: string
  precio: number
  /** Prenda regalada: se guarda a 0 € con is_gift=true (mig 261). */
  regalo?: boolean
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
    regalo?: boolean
    [key: string]: unknown
  }>
  complementos: Array<{ product_variant_id: string; nombre: string; cantidad: number; precio: number; regalo?: boolean; cost_price?: number }>
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
    // La camisería sigue el flujo de su tipo real: 'camiseria' es artesanal
    // (corte y prueba en tienda) y 'camiseria_industrial' es industrial
    // (fábrica y recepción en tienda). Igual que hace el alta desde admin
    // (create-order-wizard: isCamiseriaType). Antes se colapsaba cualquier
    // valor != 'artesanal' a 'industrial', lo que marcaba como Industrial las
    // camiserías artesanales (bug reportado jul-2026).
    const orderTypeDb: 'artesanal' | 'industrial' =
      input.orderType === 'industrial' || input.orderType === 'camiseria_industrial'
        ? 'industrial'
        : 'artesanal'

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

    // Un pedido a 0 € solo es válido si es regalo (evita 0 por error de tecleo,
    // como los wipes de precios ya sufridos). Validación en SERVIDOR: la de la
    // UI se puede saltar.
    const totalInputs =
      (input.prendasSastreria?.reduce((s, p) => s + (Number(p.precio) || 0), 0) ?? (Number(input.precioPrenda) || 0)) +
      (input.camisas || []).reduce((s, c) => s + (Number(c.precio) || 0), 0) +
      (input.complementos || []).reduce((s, c) => s + (Number(c.precio) || 0) * Math.max(1, Number(c.cantidad) || 1), 0)
    const hayRegalo =
      (input.prendasSastreria || []).some((p) => p.regalo === true) ||
      (input.camisas || []).some((c) => c.regalo === true) ||
      (input.complementos || []).some((c) => c.regalo === true)
    const hayItems =
      (input.prendasSastreria?.length ?? 0) > 0 || (input.camisas?.length ?? 0) > 0 ||
      (input.complementos?.length ?? 0) > 0 || input.prendasSastreria === undefined
    if (totalInputs <= 0 && !hayRegalo && hayItems) {
      return failure('El total es 0 €: indica el precio o marca las prendas como regalo', 'VALIDATION')
    }

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
      is_gift: boolean
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
        // La entrega estimada es la que dispara las alarmas de retraso: NO es la
        // fecha de próxima visita (esa es la prueba). Si la ficha no la manda
        // (clientes antiguos, rutas legacy) se aplica el plazo de producción por
        // defecto del tipo de pedido. Ver src/lib/orders/production-times.ts.
        estimated_delivery_date:
          (input.fichaCommon?.fechaEntregaEstimada as string)
          || input.fechaCompromiso
          || getDefaultDeliveryDate(input.orderType),
        subtotal,
        discount_amount: 0,
        tax_amount: 0,
        total: subtotal,
        // total_paid lo fija rpc_add_order_payment al registrar la entrega
        // (recalcula SUM de cobros). Escribirlo aquí de forma optimista dejaba
        // un "pagado" fantasma si la RPC luego fallaba.
        total_paid: 0,
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
          unit_price: prendaInput.regalo ? 0 : Number(prendaInput.precio) || 0,
          line_total: prendaInput.regalo ? 0 : Number(prendaInput.precio) || 0,
          is_gift: prendaInput.regalo === true,
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
        is_gift: false,
        material_cost: 0,
        finishing_notes: (input.notas || '').trim() || null,
        configuration: mainConfig,
        sort_order: sortOrder++,
      })
    }
    // Si prendasSastreria === [] (solo camisería), no se crea línea artesanal

    for (const camisa of input.camisas || []) {
      const esRegalo = camisa.regalo === true
      const precio = esRegalo ? 0 : Number(camisa.precio) || 0
      subtotalLines += precio
      const { precio: _p, coste: _c, regalo: _r, ...config } = camisa as { precio: number; coste?: number; regalo?: boolean; [k: string]: unknown }
      linesToInsert.push({
        tailoring_order_id: order.id,
        garment_type_id: camiseriaGarmentTypeId,
        // Hereda el tipo real del pedido (artesanal/industrial). Antes estaba
        // fijado a 'industrial', por eso las camisas de camisería artesanal
        // salían con badge "Industrial".
        line_type: orderTypeDb,
        unit_price: precio,
        line_total: precio,
        is_gift: esRegalo,
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
      const esRegalo = comp.regalo === true
      const precio = esRegalo ? 0 : Number(comp.precio) || 0
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
          is_gift: esRegalo,
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
    let entregaError: string | null = null

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
      // Coste del FORRO (mig 284): la ficha lo calcula igual que el del tejido
      // (€/m × metros del forro de stock). Antes se perdía dentro del JSON:
      // ninguna columna lo recogía y no sumaba al coste del pedido.
      const liningCostRaw = Number(cfg.forroCosteMaterial as unknown as number)
      const liningCost = Number.isFinite(liningCostRaw) && liningCostRaw > 0 ? liningCostRaw : 0
      return {
        tailoring_order_id: l.tailoring_order_id,
        garment_type_id: l.garment_type_id,
        line_type: l.line_type,
        unit_price: l.unit_price,
        line_total: l.line_total,
        is_gift: l.is_gift,
        material_cost: cfgCoste ?? l.material_cost ?? 0,
        lining_cost: liningCost,
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

    // total_paid NO se escribe aquí: lo recalcula rpc_add_order_payment al
    // registrar la entrega a cuenta (SUM de cobros reales).
    const { error: totalsUpdateError } = await ctx.adminClient
      .from('tailoring_orders')
      .update({
        subtotal: subtotalNoTax,
        tax_amount: taxAmountCalc,
        total: subtotalLines,
      })
      .eq('id', order.id)
    if (totalsUpdateError) console.error(`[createFichaOrder] totales del pedido ${orderNumber} no actualizados: ${totalsUpdateError.message}`)

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
        // La ficha y sus líneas ya están creadas; no rompemos el flujo, pero el
        // cobro NO quedó registrado (y total_paid ya no se pre-escribe, así que
        // el pedido muestra la deuda real). Se avisa en el resultado para que
        // la tienda registre el cobro desde la ficha.
        console.error('[createFichaOrder] rpc_add_order_payment error:', rpcError)
        entregaError = `La entrega a cuenta de ${entrega.toFixed(2)}€ NO quedó registrada (${rpcError.message}). Regístrala desde la ficha del pedido (Cobros).`
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
    const auditDescription = entrega > 0 && paymentMethodDb && !entregaError
      ? `Pedido ${orderNumber} · Cliente: ${clientName} · Total ${total.toFixed(2)}€ · Entrega a cuenta ${entrega.toFixed(2)}€ (${PAYMENT_METHOD_ES[paymentMethodDb] ?? paymentMethodDb})`
      : `Pedido ${orderNumber} · Cliente: ${clientName} · Total ${total.toFixed(2)}€${entregaError ? ' · ⚠ entrega a cuenta SIN registrar' : ''}`

    return success({
      orderId: order.id,
      orderNumber,
      payment_error: entregaError,
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
