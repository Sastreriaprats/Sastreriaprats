'use server'

import { protectedAction } from '@/lib/server/action-wrapper'
import { success, failure } from '@/lib/errors'

export type ReportChannel = 'all' | 'boutique' | 'tailoring'
export type TaxMode = 'with_tax' | 'without_tax'

const DEFAULT_TAX_RATE = 21

const lineNet = (lineTotal: number, taxRate: number | null | undefined) => {
  const r = Number(taxRate ?? DEFAULT_TAX_RATE)
  return lineTotal / (1 + r / 100)
}

// ── Agrupación temporal en hora de Madrid ───────────────────────────────────
// Los timestamps (created_at) se guardan en UTC. Agrupar con getHours()/getDay()/
// toISOString() depende de la TZ del PROCESO (UTC en Vercel) -> una venta de las
// 10:00 Madrid (08:00 UTC en verano) caía en la barra de las 8h, y una venta de
// madrugada podía caer en el día/mes equivocado. Estos helpers usan timeZone
// 'Europe/Madrid' EXPLÍCITO, así que no dependen de la TZ del proceso.
const MADRID_TZ = 'Europe/Madrid'
const _madridDateFmt = new Intl.DateTimeFormat('en-CA', { timeZone: MADRID_TZ, year: 'numeric', month: '2-digit', day: '2-digit' })
const _madridHourFmt = new Intl.DateTimeFormat('en-GB', { timeZone: MADRID_TZ, hour: '2-digit', hourCycle: 'h23' })

/** Fecha YYYY-MM-DD del instante, en hora de Madrid. */
const madridDateKey = (iso: string): string => _madridDateFmt.format(new Date(iso))
/** Mes YYYY-MM del instante, en Madrid. */
const madridMonthKey = (iso: string): string => madridDateKey(iso).slice(0, 7)
/** Hora 0-23 en Madrid. */
const madridHour = (iso: string): number => Number(_madridHourFmt.format(new Date(iso)))
/** Día de la semana en Madrid: 0=Lunes … 6=Domingo. */
const madridDow = (iso: string): number => {
  const [y, m, d] = madridDateKey(iso).split('-').map(Number)
  return (new Date(Date.UTC(y, m - 1, d, 12)).getUTCDay() + 6) % 7
}
/** Lunes (YYYY-MM-DD) de la semana del instante, en Madrid. */
const madridWeekKey = (iso: string): string => {
  const [y, m, d] = madridDateKey(iso).split('-').map(Number)
  const anchor = new Date(Date.UTC(y, m - 1, d, 12))
  anchor.setUTCDate(anchor.getUTCDate() - ((anchor.getUTCDay() + 6) % 7))
  return anchor.toISOString().split('T')[0]
}

export const getSalesReport = protectedAction<
  { start_date: string; end_date: string; store_id?: string; channel?: ReportChannel; group_by?: 'day' | 'week' | 'month'; tax_mode?: TaxMode },
  {
    chartData: { date: string; pos: number; online: number; tailoring: number; total: number }[]
    totals: { pos: number; online: number; tailoring: number; total: number; ticketCount: number; avgTicket: number }
  }
>(
  { permission: 'reports.view', auditModule: 'reports' },
  async (ctx, { start_date, end_date, store_id, channel = 'all', group_by = 'day', tax_mode = 'with_tax' }) => {
    const wantBoutique = channel === 'all' || channel === 'boutique'
    const wantTailoring = channel === 'all' || channel === 'tailoring'
    const net = tax_mode === 'without_tax'

    let saleLines: any[] | null = null
    if (wantBoutique) {
      let salesQuery = ctx.adminClient
        .from('sale_lines')
        .select('quantity, line_total, tax_rate, created_at, sales!inner(store_id, status, created_at)')
        .gte('sales.created_at', start_date)
        .lte('sales.created_at', end_date + 'T23:59:59')
        .eq('sales.status', 'completed')
      if (store_id) salesQuery = salesQuery.eq('sales.store_id', store_id)
      const res = await salesQuery
      saleLines = res.data
    }

    let onlineOrders: any[] | null = null
    if (wantBoutique && !store_id) {
      const res = await ctx.adminClient
        .from('online_orders')
        .select('subtotal, total, created_at, status')
        .gte('created_at', start_date)
        .lte('created_at', end_date + 'T23:59:59')
        .in('status', ['paid', 'processing', 'shipped', 'delivered'])
      onlineOrders = res.data
    }

    let tailoringOrders: any[] | null = null
    if (wantTailoring) {
      let tailoringQuery = ctx.adminClient
        .from('tailoring_orders')
        .select('subtotal, total, created_at, status, store_id')
        .gte('created_at', start_date)
        .lte('created_at', end_date + 'T23:59:59')
        .not('status', 'eq', 'cancelled')
      if (store_id) tailoringQuery = tailoringQuery.eq('store_id', store_id)
      const res = await tailoringQuery
      tailoringOrders = res.data
    }

    const valueOf = (item: any, valueField: string): number => {
      if (valueField === 'line_total') {
        const lt = Number(item.line_total) || 0
        return net ? lineNet(lt, item.tax_rate) : lt
      }
      if (valueField === 'total') {
        return net ? (Number(item.subtotal) || 0) : (Number(item.total) || 0)
      }
      return Number(item[valueField]) || 0
    }

    const groupData = (items: Record<string, unknown>[], valueField: string, nestedDate?: string) => {
      const groups: Record<string, number> = {}
      for (const item of items) {
        const rawDate = nestedDate
          ? (item[nestedDate] as Record<string, unknown>)?.created_at as string
          : item.created_at as string
        if (!rawDate) continue
        let key: string
        if (group_by === 'month') key = madridMonthKey(rawDate)
        else if (group_by === 'week') key = madridWeekKey(rawDate)
        else key = madridDateKey(rawDate)
        groups[key] = (groups[key] || 0) + valueOf(item, valueField)
      }
      return groups
    }

    const posGrouped = groupData(saleLines || [], 'line_total', 'sales')
    const onlineGrouped = groupData(onlineOrders || [], 'total')
    const tailoringGrouped = groupData(tailoringOrders || [], 'total')

    const allDates = new Set([...Object.keys(posGrouped), ...Object.keys(onlineGrouped), ...Object.keys(tailoringGrouped)])
    const chartData = Array.from(allDates).sort().map(date => ({
      date,
      pos: posGrouped[date] || 0,
      online: onlineGrouped[date] || 0,
      tailoring: tailoringGrouped[date] || 0,
      total: (posGrouped[date] || 0) + (onlineGrouped[date] || 0) + (tailoringGrouped[date] || 0),
    }))

    const totalPos = (saleLines || []).reduce((s, l) => s + valueOf(l, 'line_total'), 0)
    const totalOnline = (onlineOrders || []).reduce((s, o) => s + valueOf(o, 'total'), 0)
    const totalTailoring = (tailoringOrders || []).reduce((s, o) => s + valueOf(o, 'total'), 0)
    const saleIds = new Set((saleLines || []).map(l => (l.sales as unknown as Record<string, unknown>)?.created_at))
    const ticketCount = saleIds.size + (onlineOrders || []).length + (tailoringOrders || []).length
    const grandTotal = totalPos + totalOnline + totalTailoring

    return success({
      chartData,
      totals: {
        pos: totalPos, online: totalOnline, tailoring: totalTailoring,
        total: grandTotal,
        ticketCount,
        avgTicket: ticketCount > 0 ? grandTotal / ticketCount : 0,
      },
    })
  }
)

export type TailoringCategoryKey =
  | 'sastreria_artesanal' | 'sastreria_industrial'
  | 'camiseria_artesanal' | 'camiseria_industrial'

export type TailoringCategoryRow = { category: TailoringCategoryKey; label: string; amount: number; garments: number }

const TAILORING_CATEGORY_LABELS: Record<TailoringCategoryKey, string> = {
  sastreria_artesanal: 'Sastrería Artesanal',
  sastreria_industrial: 'Sastrería Industrial',
  camiseria_artesanal: 'Camisería Artesanal',
  camiseria_industrial: 'Camisería Industrial',
}

/**
 * Desglose de ventas (facturado) por las 4 combinaciones que cruza el negocio:
 *   Sastrería/Camisería  ×  Artesanal/Industrial.
 *
 * Se calcula a nivel de LÍNEA (una prenda puede ser camisería dentro de un
 * pedido artesanal): eje sastrería/camisería = `garment_types.category`;
 * eje artesanal/industrial = `tailoring_order_lines.line_type` (con fallback al
 * `order_type` del pedido por si alguna línea no lo tuviera). Importe = NETO por
 * línea (`line_total / (1 + tax_rate/100)`; `line_total` es bruto/con IVA),
 * prendas = nº de líneas. Excluye pedidos y líneas canceladas.
 *
 * Filtra por `created_at` del pedido (mismo criterio que getSalesByStore, para
 * que el tab "Ventas por tipo" cuadre con la columna Sastrería de "Por tienda")
 * y, opcionalmente, por tienda.
 */
export const getTailoringByCategory = protectedAction<
  { start_date: string; end_date: string; store_id?: string },
  { breakdown: TailoringCategoryRow[]; total: { amount: number; garments: number } }
>(
  { permission: 'reports.view', auditModule: 'reports' },
  async (ctx, { start_date, end_date, store_id }) => {
    let query = ctx.adminClient
      .from('tailoring_order_lines')
      .select('line_type, line_total, tax_rate, status, garment_types(category), tailoring_orders!inner(created_at, store_id, status, order_type)')
      .neq('status', 'cancelled')
      .neq('tailoring_orders.status', 'cancelled')
      .gte('tailoring_orders.created_at', start_date)
      .lte('tailoring_orders.created_at', end_date + 'T23:59:59')
    if (store_id) query = query.eq('tailoring_orders.store_id', store_id)

    const { data, error } = await query.limit(20000)
    if (error) return failure(error.message)

    const buckets: Record<TailoringCategoryKey, { amount: number; garments: number }> = {
      sastreria_artesanal: { amount: 0, garments: 0 },
      sastreria_industrial: { amount: 0, garments: 0 },
      camiseria_artesanal: { amount: 0, garments: 0 },
      camiseria_industrial: { amount: 0, garments: 0 },
    }

    for (const row of (data ?? []) as any[]) {
      const gt = Array.isArray(row.garment_types) ? row.garment_types[0] : row.garment_types
      const order = Array.isArray(row.tailoring_orders) ? row.tailoring_orders[0] : row.tailoring_orders
      const isCamiseria = gt?.category === 'camiseria'
      const ai = row.line_type || order?.order_type
      const isIndustrial = ai === 'industrial'
      const key: TailoringCategoryKey = `${isCamiseria ? 'camiseria' : 'sastreria'}_${isIndustrial ? 'industrial' : 'artesanal'}`
      // Importe NETO (sin IVA): line_total es bruto, lo dividimos por (1 + IVA).
      // Se acumula en crudo y se redondea solo al final, por bucket.
      const tr = Number(row.tax_rate ?? 21)
      buckets[key].amount += Number(row.line_total ?? 0) / (1 + tr / 100)
      buckets[key].garments += 1
    }

    const orderKeys: TailoringCategoryKey[] = ['sastreria_artesanal', 'sastreria_industrial', 'camiseria_artesanal', 'camiseria_industrial']
    const breakdown = orderKeys.map((k) => ({
      category: k, label: TAILORING_CATEGORY_LABELS[k], amount: Math.round(buckets[k].amount * 100) / 100, garments: buckets[k].garments,
    }))
    const total = breakdown.reduce((acc, b) => ({ amount: acc.amount + b.amount, garments: acc.garments + b.garments }), { amount: 0, garments: 0 })
    return success({ breakdown, total })
  }
)

export const getComparePeriods = protectedAction<
  { current_start: string; current_end: string; previous_start: string; previous_end: string; store_id?: string; channel?: ReportChannel; tax_mode?: TaxMode },
  {
    current: { revenue: number; newClients: number; ordersCount: number }
    previous: { revenue: number; newClients: number; ordersCount: number }
    changes: { revenue: number; newClients: number; ordersCount: number }
  }
>(
  { permission: 'reports.view', auditModule: 'reports' },
  async (ctx, { current_start, current_end, previous_start, previous_end, store_id, channel = 'all', tax_mode = 'with_tax' }) => {
    const minStart = [current_start, previous_start].sort()[0]
    const maxEnd = [current_end, previous_end].sort()[1]
    const rangeEnd = maxEnd + 'T23:59:59'

    const wantBoutique = channel === 'all' || channel === 'boutique'
    const wantTailoring = channel === 'all' || channel === 'tailoring'
    const net = tax_mode === 'without_tax'

    let saleLinesQ = ctx.adminClient.from('sale_lines')
      .select('line_total, tax_rate, sales!inner(status, store_id, created_at)')
      .gte('sales.created_at', minStart).lte('sales.created_at', rangeEnd)
      .eq('sales.status', 'completed')
    if (store_id) saleLinesQ = saleLinesQ.eq('sales.store_id', store_id)

    let tailoringQ = ctx.adminClient.from('tailoring_orders')
      .select('subtotal, total, created_at, store_id')
      .gte('created_at', minStart).lte('created_at', rangeEnd)
      .not('status', 'eq', 'cancelled')
    if (store_id) tailoringQ = tailoringQ.eq('store_id', store_id)

    let clientsQ = ctx.adminClient.from('clients')
      .select('id, created_at, home_store_id')
      .gte('created_at', minStart).lte('created_at', rangeEnd)
    if (store_id) clientsQ = clientsQ.eq('home_store_id', store_id)

    const [saleLinesRes, onlineRes, tailoringRes, clientsRes] = await Promise.all([
      wantBoutique ? saleLinesQ : Promise.resolve({ data: [] }),
      wantBoutique && !store_id
        ? ctx.adminClient.from('online_orders')
          .select('subtotal, total, created_at')
          .gte('created_at', minStart).lte('created_at', rangeEnd)
          .in('status', ['paid', 'processing', 'shipped', 'delivered'])
        : Promise.resolve({ data: [] }),
      wantTailoring ? tailoringQ : Promise.resolve({ data: [] }),
      clientsQ,
    ])

    const inCurrent = (d: string) => d >= current_start && d <= current_end + 'T23:59:59'
    const inPrevious = (d: string) => d >= previous_start && d <= previous_end + 'T23:59:59'
    const dateOfSaleLine = (x: { created_at?: string; sales?: { created_at?: string } | Array<{ created_at?: string }> }) => {
      const s = Array.isArray(x.sales) ? x.sales[0] : x.sales
      return (s?.created_at ?? x.created_at ?? '').slice(0, 10)
    }

    let currentRevenue = 0
    let previousRevenue = 0
    for (const l of saleLinesRes.data || []) {
      const d = dateOfSaleLine(l)
      const lt = Number(l.line_total) || 0
      const v = net ? lineNet(lt, (l as any).tax_rate) : lt
      if (inCurrent(d)) currentRevenue += v
      if (inPrevious(d)) previousRevenue += v
    }
    for (const o of onlineRes.data || []) {
      const d = (o.created_at ?? '').slice(0, 10)
      const v = net ? (Number((o as any).subtotal) || 0) : (Number(o.total) || 0)
      if (inCurrent(d)) currentRevenue += v
      if (inPrevious(d)) previousRevenue += v
    }
    let currentOrders = 0
    let previousOrders = 0
    for (const t of tailoringRes.data || []) {
      const d = (t.created_at ?? '').slice(0, 10)
      const v = net ? (Number((t as any).subtotal) || 0) : (Number(t.total) || 0)
      if (inCurrent(d)) {
        currentRevenue += v
        currentOrders += 1
      }
      if (inPrevious(d)) {
        previousRevenue += v
        previousOrders += 1
      }
    }
    let currentClients = 0
    let previousClients = 0
    for (const c of clientsRes.data || []) {
      const d = (c.created_at ?? '').slice(0, 10)
      if (inCurrent(d)) currentClients += 1
      if (inPrevious(d)) previousClients += 1
    }

    const current = { revenue: currentRevenue, newClients: currentClients, ordersCount: currentOrders }
    const previous = { revenue: previousRevenue, newClients: previousClients, ordersCount: previousOrders }

    const pct = (curr: number, prev: number) => prev === 0 ? (curr > 0 ? 100 : 0) : ((curr - prev) / prev) * 100

    return success({
      current, previous,
      changes: {
        revenue: pct(current.revenue, previous.revenue),
        newClients: pct(current.newClients, previous.newClients),
        ordersCount: pct(current.ordersCount, previous.ordersCount),
      },
    })
  }
)

export const getTopProducts = protectedAction<
  { start_date: string; end_date: string; store_id?: string; channel?: ReportChannel; limit?: number; tax_mode?: TaxMode },
  { name: string; sku: string; units: number; revenue: number }[]
>(
  { permission: 'reports.view', auditModule: 'reports' },
  async (ctx, { start_date, end_date, store_id, channel = 'all', limit = 10, tax_mode = 'with_tax' }) => {
    if (channel === 'tailoring') return success([])
    const net = tax_mode === 'without_tax'
    let q = ctx.adminClient
      .from('sale_lines')
      .select('description, sku, quantity, line_total, tax_rate, sales!inner(created_at, status, store_id)')
      .gte('sales.created_at', start_date)
      .lte('sales.created_at', end_date + 'T23:59:59')
      .eq('sales.status', 'completed')
    if (store_id) q = q.eq('sales.store_id', store_id)
    const { data } = await q

    // Excluir cobros pendientes — no son productos vendidos
    const filteredLines = (data || []).filter(
      (line: any) => !String(line.description || '').startsWith('Cobro pendiente')
    )

    const products: Record<string, { name: string; sku: string; units: number; revenue: number }> = {}
    for (const line of filteredLines) {
      const key = (line.description as string) || (line.sku as string) || 'Desconocido'
      if (!products[key]) products[key] = { name: key, sku: (line.sku as string) || '', units: 0, revenue: 0 }
      products[key].units += (line.quantity as number) || 1
      const lt = (line.line_total as number) || 0
      products[key].revenue += net ? lineNet(lt, (line as any).tax_rate) : lt
    }

    return success(
      Object.values(products).sort((a, b) => b.revenue - a.revenue).slice(0, limit)
    )
  }
)

export const getTailorPerformance = protectedAction<
  { start_date: string; end_date: string; store_id?: string; channel?: ReportChannel; tax_mode?: TaxMode },
  {
    tailor_id: string
    name: string
    orders: number
    revenue: number
    fittings: number
    completed: number
    avgOrderValue: number
    completionRate: number
    /** Cobros REGISTRADOS en el periodo, agrupados por sastre del pedido
     *  (independientemente de quién registró el cobro físicamente). */
    paid_in_period: number
    /** Lo que falta por cobrar de los pedidos creados en el periodo
     *  (revenue − total_paid acumulado de esos pedidos hasta hoy). */
    pending_of_period_orders: number
    /** % cobrado del periodo sobre la facturación del periodo. */
    paidRate: number
  }[]
>(
  { permission: 'reports.view', auditModule: 'reports' },
  async (ctx, { start_date, end_date, store_id, channel = 'all', tax_mode = 'with_tax' }) => {
    if (channel === 'boutique') return success([])
    const net = tax_mode === 'without_tax'
    const stripDefault = (gross: number) => gross / (1 + DEFAULT_TAX_RATE / 100)

    // 1) Pedidos creados en el periodo (revenue, completados, pruebas y
    //    total_paid acumulado de esos pedidos — usado para "pendiente real").
    let q = ctx.adminClient
      .from('tailoring_orders')
      .select('id, subtotal, total, total_paid, status, created_by, store_id, profiles!tailoring_orders_created_by_fkey(full_name), tailoring_fittings(count)')
      .gte('created_at', start_date)
      .lte('created_at', end_date + 'T23:59:59')
      .not('status', 'eq', 'cancelled')
    if (store_id) q = q.eq('store_id', store_id)
    const { data: orders } = await q

    type TailorAccum = {
      name: string
      orders: number
      revenue: number
      fittings: number
      completed: number
      paid_of_period_orders: number   // total_paid acumulado de pedidos del periodo
      paid_in_period: number          // cobros realizados en el periodo (cualquier pedido)
    }
    const tailors: Record<string, TailorAccum> = {}

    for (const order of orders || []) {
      const id = (order.created_by as string) || 'unassigned'
      const profile = order.profiles as unknown as Record<string, unknown> | null
      const name = (profile?.full_name as string) || 'Sin asignar'
      if (!tailors[id]) tailors[id] = { name, orders: 0, revenue: 0, fittings: 0, completed: 0, paid_of_period_orders: 0, paid_in_period: 0 }
      tailors[id].orders++
      tailors[id].revenue += net ? (Number((order as any).subtotal) || 0) : (Number(order.total) || 0)
      // total_paid prorrateado al modo IVA para que pending = revenue − paid_of_period_orders sea coherente.
      const orderTotal = Number(order.total) || 0
      const orderPaid = Number((order as any).total_paid) || 0
      const orderSubtotal = Number((order as any).subtotal) || 0
      tailors[id].paid_of_period_orders += net && orderTotal > 0
        ? orderPaid * (orderSubtotal / orderTotal)
        : orderPaid
      const fittingsData = order.tailoring_fittings as unknown
      const fittingsCount = Array.isArray(fittingsData) && fittingsData.length > 0 && typeof fittingsData[0] === 'object' && fittingsData[0] !== null && 'count' in fittingsData[0]
        ? (fittingsData[0] as { count: number }).count
        : 0
      tailors[id].fittings += fittingsCount
      if (['finished', 'delivered'].includes(order.status as string)) tailors[id].completed++
    }

    // 2) Cobros realizados en el periodo, agrupados por el sastre del pedido.
    //    Esta query SUSTITUYE el bug anterior (que usaba total_paid acumulado
    //    filtrado por created_at del pedido — métrica semánticamente errónea).
    //    Ahora suma exactamente los pagos cuyo created_at cae en el periodo,
    //    independientemente de cuándo se creó el pedido. Se atribuye al sastre
    //    del pedido (no al cajero que registró el cobro).
    let paymentsQ = ctx.adminClient
      .from('tailoring_order_payments')
      .select('amount, tailoring_orders!inner(created_by, store_id)')
      .gte('created_at', start_date)
      .lte('created_at', end_date + 'T23:59:59')
    if (store_id) paymentsQ = paymentsQ.eq('tailoring_orders.store_id', store_id)
    const { data: payments } = await paymentsQ

    for (const p of payments || []) {
      const orderRef = (p as any).tailoring_orders as { created_by?: string } | null
      const sastreId = orderRef?.created_by
      if (!sastreId) continue
      if (!tailors[sastreId]) {
        // Sastre con cobros en el periodo pero sin pedidos creados en el periodo.
        // Aparece en la tabla con orders=0, revenue=0.
        tailors[sastreId] = { name: '', orders: 0, revenue: 0, fittings: 0, completed: 0, paid_of_period_orders: 0, paid_in_period: 0 }
      }
      const amt = Number((p as any).amount) || 0
      tailors[sastreId].paid_in_period += net ? stripDefault(amt) : amt
    }

    // 3) Resolver nombres de sastres añadidos por la query de payments que no
    //    tenían pedido en el periodo.
    const missingIds = Object.entries(tailors).filter(([, t]) => !t.name).map(([id]) => id)
    if (missingIds.length > 0) {
      const { data: profs } = await ctx.adminClient.from('profiles').select('id, full_name').in('id', missingIds)
      for (const p of profs || []) {
        const t = tailors[(p as { id: string }).id]
        if (t) t.name = (p as { full_name?: string }).full_name || (p as { id: string }).id
      }
    }

    return success(
      Object.entries(tailors).map(([tid, d]) => {
        const pending_of_period_orders = Math.max(0, d.revenue - d.paid_of_period_orders)
        // % cobrado del periodo sobre la facturación del periodo. Puede
        // superar 100 si el sastre cobra mucho de pedidos antiguos y poco
        // de pedidos nuevos (señal de que su carga del periodo es residual).
        const paidRate = d.revenue > 0 ? Math.round((d.paid_in_period / d.revenue) * 100) : 0
        return {
          tailor_id: tid,
          name: d.name || 'Sin asignar',
          orders: d.orders,
          revenue: d.revenue,
          fittings: d.fittings,
          completed: d.completed,
          paid_in_period: d.paid_in_period,
          pending_of_period_orders,
          paidRate,
          avgOrderValue: d.orders > 0 ? d.revenue / d.orders : 0,
          completionRate: d.orders > 0 ? (d.completed / d.orders) * 100 : 0,
        }
      }).sort((a, b) => b.revenue - a.revenue || b.paid_in_period - a.paid_in_period)
    )
  }
)

export const getSalesByStore = protectedAction<
  { start_date: string; end_date: string; store_id?: string; channel?: ReportChannel; tax_mode?: TaxMode },
  { store_id: string; store_name: string; pos: number; tailoring: number; total: number }[]
>(
  { permission: 'reports.view', auditModule: 'reports' },
  async (ctx, { start_date, end_date, store_id, channel = 'all', tax_mode = 'with_tax' }) => {
    const wantBoutique = channel === 'all' || channel === 'boutique'
    const wantTailoring = channel === 'all' || channel === 'tailoring'
    const net = tax_mode === 'without_tax'

    let saleLinesQ = ctx.adminClient
      .from('sale_lines')
      .select('line_total, tax_rate, sales!inner(store_id, stores(name), status, created_at)')
      .gte('sales.created_at', start_date)
      .lte('sales.created_at', end_date + 'T23:59:59')
      .eq('sales.status', 'completed')
    if (store_id) saleLinesQ = saleLinesQ.eq('sales.store_id', store_id)

    let tailoringQ = ctx.adminClient
      .from('tailoring_orders')
      .select('subtotal, total, store_id, stores(name)')
      .gte('created_at', start_date)
      .lte('created_at', end_date + 'T23:59:59')
      .not('status', 'eq', 'cancelled')
    if (store_id) tailoringQ = tailoringQ.eq('store_id', store_id)

    const [saleLinesRes, tailoringRes] = await Promise.all([
      wantBoutique ? saleLinesQ : Promise.resolve({ data: [] as any[] }),
      wantTailoring ? tailoringQ : Promise.resolve({ data: [] as any[] }),
    ])

    const stores: Record<string, { store_name: string; pos: number; tailoring: number }> = {}

    for (const line of saleLinesRes.data || []) {
      const sale = line.sales as any
      const storeId = sale?.store_id || 'unknown'
      const storeName = (sale?.stores as any)?.name || 'Sin tienda'
      if (!stores[storeId]) stores[storeId] = { store_name: storeName, pos: 0, tailoring: 0 }
      const lt = (line.line_total as number) || 0
      stores[storeId].pos += net ? lineNet(lt, (line as any).tax_rate) : lt
    }

    for (const order of tailoringRes.data || []) {
      const storeId = (order.store_id as string) || 'unknown'
      const storeName = (order.stores as any)?.name || 'Sin tienda'
      if (!stores[storeId]) stores[storeId] = { store_name: storeName, pos: 0, tailoring: 0 }
      stores[storeId].tailoring += net ? (Number((order as any).subtotal) || 0) : (Number(order.total) || 0)
    }

    return success(
      Object.entries(stores)
        .map(([store_id, d]) => ({ store_id, ...d, total: d.pos + d.tailoring }))
        .sort((a, b) => b.total - a.total)
    )
  }
)

export const getSalesByEmployee = protectedAction<
  { start_date: string; end_date: string; store_id?: string; channel?: ReportChannel; tax_mode?: TaxMode },
  {
    employee_id: string; employee_name: string
    pos_ops: number; pos_total: number; boutique_total: number
    tailoring_ops: number; tailoring_total: number
    tailor_orders_count: number; tailor_orders_revenue: number
    total: number
  }[]
>(
  { permission: 'reports.view', auditModule: 'reports' },
  async (ctx, { start_date, end_date, store_id, channel = 'all', tax_mode = 'with_tax' }) => {
    const wantBoutique = channel === 'all' || channel === 'boutique'
    const wantTailoring = channel === 'all' || channel === 'tailoring'
    const net = tax_mode === 'without_tax'
    const stripDefault = (gross: number) => gross / (1 + DEFAULT_TAX_RATE / 100)

    let saleLinesQ = ctx.adminClient
      .from('sale_lines')
      .select('sale_id, line_total, tax_rate, sales!inner(salesperson_id, status, store_id, created_at, sale_type)')
      .gte('sales.created_at', start_date)
      .lte('sales.created_at', end_date + 'T23:59:59')
      .eq('sales.status', 'completed')
    if (store_id) saleLinesQ = saleLinesQ.eq('sales.store_id', store_id)

    let paymentsQ = ctx.adminClient
      .from('tailoring_order_payments')
      .select('amount, created_by, created_at, tailoring_orders!inner(store_id)')
      .gte('created_at', start_date)
      .lte('created_at', end_date + 'T23:59:59')
    if (store_id) paymentsQ = paymentsQ.eq('tailoring_orders.store_id', store_id)

    let tailoringOrdersQ = ctx.adminClient
      .from('tailoring_orders')
      .select('subtotal, total, created_by, status, store_id, created_at')
      .gte('created_at', start_date)
      .lte('created_at', end_date + 'T23:59:59')
      .not('status', 'eq', 'cancelled')
    if (store_id) tailoringOrdersQ = tailoringOrdersQ.eq('store_id', store_id)

    const [saleLinesRes, paymentsRes, tailoringOrdersRes] = await Promise.all([
      wantBoutique ? saleLinesQ : Promise.resolve({ data: [] as any[] }),
      wantTailoring ? paymentsQ : Promise.resolve({ data: [] as any[] }),
      wantTailoring ? tailoringOrdersQ : Promise.resolve({ data: [] as any[] }),
    ])

    const employees: Record<string, {
      name: string
      saleIds: Set<string>; pos_total: number; boutique_total: number
      tailoring_ops: number; tailoring_total: number
      tailor_orders_count: number; tailor_orders_revenue: number
    }> = {}

    const ensure = (id: string) => {
      if (!employees[id]) employees[id] = {
        name: id, saleIds: new Set(),
        pos_total: 0, boutique_total: 0, tailoring_ops: 0, tailoring_total: 0,
        tailor_orders_count: 0, tailor_orders_revenue: 0,
      }
      return employees[id]
    }

    for (const line of saleLinesRes.data || []) {
      const sale = line.sales as any
      const empId = sale?.salesperson_id || 'unknown'
      const e = ensure(empId)
      if (line.sale_id) e.saleIds.add(String(line.sale_id))
      const lt = (line.line_total as number) || 0
      const amount = net ? lineNet(lt, (line as any).tax_rate) : lt
      e.pos_total += amount
      // Boutique = ventas de producto de tienda (sale_type 'boutique'), separadas
      // del resto de operaciones del TPV (sastrería cobrada en caja, etc.).
      if ((sale?.sale_type ?? '') === 'boutique') e.boutique_total += amount
    }

    for (const payment of paymentsRes.data || []) {
      const empId = (payment.created_by as string) || 'unknown'
      const e = ensure(empId)
      e.tailoring_ops += 1
      const amt = (payment.amount as number) || 0
      e.tailoring_total += net ? stripDefault(amt) : amt
    }

    for (const order of tailoringOrdersRes.data || []) {
      const empId = (order.created_by as string) || 'unknown'
      const e = ensure(empId)
      e.tailor_orders_count += 1
      e.tailor_orders_revenue += net ? (Number((order as any).subtotal) || 0) : (Number(order.total) || 0)
    }

    const empIds = Object.keys(employees).filter(id => id !== 'unknown')
    if (empIds.length > 0) {
      const { data: profiles } = await ctx.adminClient
        .from('profiles')
        .select('id, full_name')
        .in('id', empIds)
      for (const p of profiles || []) {
        if (employees[p.id]) employees[p.id].name = (p.full_name as string) || p.id
      }
    }

    const result = Object.entries(employees)
      .map(([employee_id, d]) => ({
        employee_id,
        employee_name: d.name,
        pos_ops: d.saleIds.size,
        pos_total: d.pos_total,
        boutique_total: d.boutique_total,
        tailoring_ops: d.tailoring_ops,
        tailoring_total: d.tailoring_total,
        tailor_orders_count: d.tailor_orders_count,
        tailor_orders_revenue: d.tailor_orders_revenue,
        total: d.pos_total + d.tailoring_total,
      }))
      .sort((a, b) => b.total - a.total)

    return success(result)
  }
)

/**
 * Comisiones por vendedor: agrupa `sale_lines` por `sale_lines.salesperson_id`
 * (propagado desde la reserva cuando la línea la cumple, o desde la cabecera
 * cuando es venta directa) y suma `line_total` en el rango y tienda indicados.
 */
export const getCommissionsByEmployee = protectedAction<
  { start_date: string; end_date: string; store_id?: string | null },
  {
    salesperson_id: string
    salesperson_name: string
    lines_total: number
    from_reservation_total: number
    direct_total: number
    lines_count: number
    sales_count: number
  }[]
>(
  { permission: 'reports.view', auditModule: 'reports' },
  async (ctx, { start_date, end_date, store_id }) => {
    let query = ctx.adminClient
      .from('sale_lines')
      .select('sale_id, line_total, salesperson_id, reservation_line_id, sales!inner(status, store_id, created_at)')
      .gte('sales.created_at', start_date)
      .lte('sales.created_at', end_date + 'T23:59:59')
      .eq('sales.status', 'completed')

    if (store_id) query = query.eq('sales.store_id', store_id)

    const { data, error } = await query
    if (error) return failure(error.message || 'Error al consultar comisiones', 'INTERNAL')

    const byEmployee: Record<string, {
      lines_total: number
      from_reservation_total: number
      direct_total: number
      lines_count: number
      saleIds: Set<string>
    }> = {}

    for (const line of data || []) {
      const empId = (line.salesperson_id as string | null) || 'unknown'
      if (!byEmployee[empId]) {
        byEmployee[empId] = {
          lines_total: 0,
          from_reservation_total: 0,
          direct_total: 0,
          lines_count: 0,
          saleIds: new Set(),
        }
      }
      const amount = Number(line.line_total) || 0
      byEmployee[empId].lines_total += amount
      byEmployee[empId].lines_count += 1
      if (line.sale_id) byEmployee[empId].saleIds.add(String(line.sale_id))
      if (line.reservation_line_id) byEmployee[empId].from_reservation_total += amount
      else byEmployee[empId].direct_total += amount
    }

    const empIds = Object.keys(byEmployee).filter((id) => id !== 'unknown')
    const names: Record<string, string> = {}
    if (empIds.length > 0) {
      const { data: profiles } = await ctx.adminClient
        .from('profiles')
        .select('id, full_name')
        .in('id', empIds)
      for (const p of profiles || []) names[p.id as string] = (p.full_name as string) || (p.id as string)
    }

    const result = Object.entries(byEmployee)
      .map(([salesperson_id, d]) => ({
        salesperson_id,
        salesperson_name: names[salesperson_id] || (salesperson_id === 'unknown' ? 'Sin asignar' : salesperson_id),
        lines_total: Math.round(d.lines_total * 100) / 100,
        from_reservation_total: Math.round(d.from_reservation_total * 100) / 100,
        direct_total: Math.round(d.direct_total * 100) / 100,
        lines_count: d.lines_count,
        sales_count: d.saleIds.size,
      }))
      .sort((a, b) => b.lines_total - a.lines_total)

    return success(result)
  }
)

export const getSalesByTimePattern = protectedAction<
  { start_date: string; end_date: string; store_id?: string; channel?: ReportChannel; tax_mode?: TaxMode },
  {
    byHour: { hour: number; total: number; count: number }[]
    byDayOfWeek: { day: number; label: string; total: number; count: number }[]
  }
>(
  { permission: 'reports.view', auditModule: 'reports' },
  async (ctx, { start_date, end_date, store_id, channel = 'all', tax_mode = 'with_tax' }) => {
    const wantBoutique = channel === 'all' || channel === 'boutique'
    const wantTailoring = channel === 'all' || channel === 'tailoring'
    const net = tax_mode === 'without_tax'
    const stripDefault = (gross: number) => gross / (1 + DEFAULT_TAX_RATE / 100)

    let saleLinesQ = ctx.adminClient
      .from('sale_lines')
      .select('line_total, tax_rate, sales!inner(created_at, status, store_id)')
      .gte('sales.created_at', start_date)
      .lte('sales.created_at', end_date + 'T23:59:59')
      .eq('sales.status', 'completed')
    if (store_id) saleLinesQ = saleLinesQ.eq('sales.store_id', store_id)

    let paymentsQ = ctx.adminClient
      .from('tailoring_order_payments')
      .select('amount, created_at, tailoring_orders!inner(store_id)')
      .gte('created_at', start_date)
      .lte('created_at', end_date + 'T23:59:59')
    if (store_id) paymentsQ = paymentsQ.eq('tailoring_orders.store_id', store_id)

    const [saleLinesRes, paymentsRes] = await Promise.all([
      wantBoutique ? saleLinesQ : Promise.resolve({ data: [] as any[] }),
      wantTailoring ? paymentsQ : Promise.resolve({ data: [] as any[] }),
    ])

    const DAY_LABELS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom']
    const hourMap = Array.from({ length: 24 }, (_, i) => ({ hour: i, total: 0, count: 0 }))
    const dayMap = Array.from({ length: 7 }, (_, i) => ({ day: i, label: DAY_LABELS[i], total: 0, count: 0 }))

    const accumulate = (dateStr: string, amount: number) => {
      const hour = madridHour(dateStr) // hora en Madrid, no en la TZ del proceso
      const dow = madridDow(dateStr)   // 0=Lun…6=Dom, en Madrid
      hourMap[hour].total += amount
      hourMap[hour].count += 1
      dayMap[dow].total += amount
      dayMap[dow].count += 1
    }

    for (const line of saleLinesRes.data || []) {
      const sale = line.sales as any
      if (sale?.created_at) {
        const lt = (line.line_total as number) || 0
        accumulate(sale.created_at, net ? lineNet(lt, (line as any).tax_rate) : lt)
      }
    }
    for (const payment of paymentsRes.data || []) {
      if (payment.created_at) {
        const amt = (payment.amount as number) || 0
        accumulate(payment.created_at as string, net ? stripDefault(amt) : amt)
      }
    }

    return success({ byHour: hourMap, byDayOfWeek: dayMap })
  }
)

export const getExpensesReport = protectedAction<
  { start_date: string; end_date: string; tax_mode?: TaxMode },
  {
    byCategory: { category: string; count: number; total: number }[]
    grandTotal: number
    recentExpenses: { description: string; category: string; total: number; date: string }[]
    // Desglose de la categoría "proveedores": nivel 1 por tipo de proveedor, nivel
    // 2 (invoices) por factura. La suma de los tipos = el total de "proveedores".
    providersBreakdown: {
      type: string
      label: string
      total: number
      count: number
      invoices: { invoice_number: string; supplier_name: string; total: number; count: number }[]
    }[]
  }
>(
  { permission: 'reports.view', auditModule: 'reports' },
  async (ctx, { start_date, end_date, tax_mode = 'with_tax' }) => {
    const net = tax_mode === 'without_tax'
    const { data } = await ctx.adminClient
      .from('manual_transactions')
      .select('category, amount, total, description, date, withdrawal_id, ap_supplier_invoice_id')
      .eq('type', 'expense')
      .gte('date', start_date)
      .lte('date', end_date)
      .order('date', { ascending: false })

    // Excluir retiradas de efectivo de tipo 'extraccion' (sacar/entregar dinero):
    // no son gasto. Su espejo en manual_transactions se conserva (ledger de caja),
    // pero no debe contar en el informe de gastos. Las de tipo 'gasto' (compras
    // pagadas con caja) sí cuentan.
    const { data: extr } = await ctx.adminClient
      .from('cash_withdrawals').select('id').eq('withdrawal_type', 'extraccion')
    const extractionIds = new Set((extr ?? []).map((r: any) => r.id as string))
    const expenses = (data || []).filter((tx: any) => !tx.withdrawal_id || !extractionIds.has(tx.withdrawal_id))

    const valueOf = (tx: any) => net ? (Number(tx.amount) || 0) : (Number(tx.total) || 0)

    const categories: Record<string, { count: number; total: number }> = {}
    for (const tx of expenses) {
      const cat = (tx.category as string) || 'Sin categoría'
      if (!categories[cat]) categories[cat] = { count: 0, total: 0 }
      categories[cat].count += 1
      categories[cat].total += valueOf(tx)
    }

    const byCategory = Object.entries(categories)
      .map(([category, d]) => ({ category, ...d }))
      .sort((a, b) => b.total - a.total)

    const recentExpenses = expenses.slice(0, 5).map(tx => ({
      description: (tx.description as string) || '',
      category: (tx.category as string) || 'Sin categoría',
      total: valueOf(tx),
      date: (tx.date as string) || '',
    }))

    // ── Desglose de "proveedores": por tipo de proveedor y por factura ──────────
    // Vía manual_transactions.ap_supplier_invoice_id -> ap_supplier_invoices.supplier_id
    // -> suppliers.expense_type. Los pagos sin enlace caen en "Sin clasificar".
    const providerExpenses = expenses.filter((tx: any) => (tx.category as string) === 'proveedores')
    const invoiceIds = [...new Set(providerExpenses.map((tx: any) => tx.ap_supplier_invoice_id).filter(Boolean) as string[])]
    const invoiceMap = new Map<string, { invoice_number: string; supplier_name: string; supplier_id: string | null }>()
    if (invoiceIds.length > 0) {
      const { data: invs } = await ctx.adminClient
        .from('ap_supplier_invoices').select('id, invoice_number, supplier_name, supplier_id').in('id', invoiceIds)
      for (const i of (invs ?? []) as any[]) {
        invoiceMap.set(String(i.id), { invoice_number: String(i.invoice_number ?? ''), supplier_name: String(i.supplier_name ?? ''), supplier_id: i.supplier_id ?? null })
      }
    }
    const supplierIds = [...new Set([...invoiceMap.values()].map((v) => v.supplier_id).filter(Boolean) as string[])]
    const supplierTypeMap = new Map<string, string>()
    if (supplierIds.length > 0) {
      const { data: sups } = await ctx.adminClient.from('suppliers').select('id, expense_type').in('id', supplierIds)
      for (const s of (sups ?? []) as any[]) supplierTypeMap.set(String(s.id), String(s.expense_type ?? 'general'))
    }

    const TYPE_LABELS: Record<string, string> = { general: 'General', alquiler: 'Alquiler', compras: 'Compras', sin_clasificar: 'Sin clasificar' }
    const descRe = /^Pago (?:cuota )?factura (.+?) · (.+)$/
    type InvAgg = { invoice_number: string; supplier_name: string; total: number; count: number }
    const byType: Record<string, { total: number; count: number; invoices: Map<string, InvAgg> }> = {}
    for (const tx of providerExpenses as any[]) {
      const inv = tx.ap_supplier_invoice_id ? invoiceMap.get(String(tx.ap_supplier_invoice_id)) : null
      const type = inv ? (supplierTypeMap.get(inv.supplier_id ?? '') ?? 'general') : 'sin_clasificar'
      let invKey: string, invNum: string, supName: string
      if (inv) {
        invKey = String(tx.ap_supplier_invoice_id); invNum = inv.invoice_number; supName = inv.supplier_name
      } else {
        const m = descRe.exec(String(tx.description ?? ''))
        invNum = m ? m[1] : (String(tx.description ?? '—')); supName = m ? m[2] : '—'
        invKey = `desc:${invNum}·${supName}`
      }
      if (!byType[type]) byType[type] = { total: 0, count: 0, invoices: new Map() }
      const v = valueOf(tx)
      byType[type].total += v; byType[type].count += 1
      const cur = byType[type].invoices.get(invKey)
      if (cur) { cur.total += v; cur.count += 1 }
      else byType[type].invoices.set(invKey, { invoice_number: invNum, supplier_name: supName, total: v, count: 1 })
    }
    const TYPE_ORDER = ['general', 'alquiler', 'compras', 'sin_clasificar']
    const providersBreakdown = Object.entries(byType)
      .map(([type, d]) => ({
        type, label: TYPE_LABELS[type] ?? type, total: Math.round(d.total * 100) / 100, count: d.count,
        invoices: [...d.invoices.values()].map((i) => ({ ...i, total: Math.round(i.total * 100) / 100 })).sort((a, b) => b.total - a.total),
      }))
      .sort((a, b) => TYPE_ORDER.indexOf(a.type) - TYPE_ORDER.indexOf(b.type))

    return success({ byCategory, grandTotal: byCategory.reduce((s, c) => s + c.total, 0), recentExpenses, providersBreakdown })
  }
)

export const getExpensesComparison = protectedAction<
  { current_start: string; current_end: string; previous_start: string; previous_end: string; tax_mode?: TaxMode },
  { current: number; previous: number; change: number }
>(
  { permission: 'reports.view', auditModule: 'reports' },
  async (ctx, { current_start, current_end, previous_start, previous_end, tax_mode = 'with_tax' }) => {
    const net = tax_mode === 'without_tax'
    const cols = net ? 'amount' : 'total'
    // Excluir retiradas 'extraccion' (no son gasto) — igual que getExpensesReport.
    const { data: extr } = await ctx.adminClient
      .from('cash_withdrawals').select('id').eq('withdrawal_type', 'extraccion')
    const extractionIds = new Set((extr ?? []).map((r: any) => r.id as string))
    const [currentRes, previousRes] = await Promise.all([
      ctx.adminClient.from('manual_transactions')
        .select(`${cols}, withdrawal_id`).eq('type', 'expense').gte('date', current_start).lte('date', current_end),
      ctx.adminClient.from('manual_transactions')
        .select(`${cols}, withdrawal_id`).eq('type', 'expense').gte('date', previous_start).lte('date', previous_end),
    ])
    const sumField = (rows: any[] | null) => (rows || [])
      .filter((t: any) => !t.withdrawal_id || !extractionIds.has(t.withdrawal_id))
      .reduce((s, t) => s + (Number(net ? t.amount : t.total) || 0), 0)
    const current = sumField(currentRes.data as any[])
    const previous = sumField(previousRes.data as any[])
    const change = previous === 0 ? (current > 0 ? 100 : 0) : ((current - previous) / previous) * 100
    return success({ current, previous, change })
  }
)

export const getClientsAnalytics = protectedAction<
  { start_date: string; end_date: string; store_id?: string },
  {
    newClients: number
    totalClientsHistorical: number
    sources: Record<string, number>
    topClients: { full_name: string; total_revenue: number }[]
    clientsWithPurchases: number
  }
>(
  { permission: 'reports.view', auditModule: 'reports' },
  async (ctx, { start_date, end_date, store_id }) => {
    // Clientes NUEVOS = creados en el periodo (atributo clients.created_at)
    let newClientsQ = ctx.adminClient.from('clients').select('id, source').gte('created_at', start_date).lte('created_at', end_date + 'T23:59:59')
    // TOTAL HISTÓRICO de clients (sin filtro de fecha — la UI lo etiqueta
    // como "Total clientes (BBDD)" para que se entienda que no es del periodo).
    let totalQ = ctx.adminClient.from('clients').select('id', { count: 'exact' })
    // TODO: topClients tiene un sesgo conocido — filtra por created_at del
    // cliente (solo nuevos en el periodo) y por clients.total_spent histórico
    // (que NO se actualiza desde tailoring_orders). Para un "top clientes
    // del periodo" correcto habría que agregar sales+tailoring_orders por
    // client_id sumando totales. Fuera de scope del fix actual.
    let topClientsQ = ctx.adminClient.from('clients').select('first_name, last_name, total_spent').gt('total_spent', 0).gte('created_at', start_date).lte('created_at', end_date + 'T23:59:59').order('total_spent', { ascending: false }).limit(10)
    if (store_id) {
      newClientsQ = newClientsQ.eq('home_store_id', store_id)
      totalQ = totalQ.eq('home_store_id', store_id)
      topClientsQ = topClientsQ.eq('home_store_id', store_id)
    }

    // "Con compras en el periodo" — clientes únicos con AL MENOS una venta
    // en sales o tailoring_orders dentro del rango (filtrado por store_id si
    // procede). Antes esto consultaba clients.total_spent > 0, que es un
    // histórico acumulativo y no se mantiene desde tailoring_orders → daba 0
    // aunque hubiera tráfico en el periodo.
    const [salesRes, tailoringRes] = await Promise.all([
      (() => {
        let q = ctx.adminClient
          .from('sales')
          .select('client_id')
          .not('client_id', 'is', null)
          .gte('created_at', start_date)
          .lte('created_at', end_date + 'T23:59:59')
        if (store_id) q = q.eq('store_id', store_id)
        return q
      })(),
      (() => {
        let q = ctx.adminClient
          .from('tailoring_orders')
          .select('client_id')
          .not('client_id', 'is', null)
          .gte('created_at', start_date)
          .lte('created_at', end_date + 'T23:59:59')
        if (store_id) q = q.eq('store_id', store_id)
        return q
      })(),
    ])
    const uniqueIds = new Set<string>()
    for (const r of (salesRes.data ?? []) as Array<{ client_id: string | null }>) {
      if (r.client_id) uniqueIds.add(r.client_id)
    }
    for (const r of (tailoringRes.data ?? []) as Array<{ client_id: string | null }>) {
      if (r.client_id) uniqueIds.add(r.client_id)
    }
    const clientsWithPurchases = uniqueIds.size

    const [newClientsRes, totalRes, topClientsRes] = await Promise.all([
      newClientsQ, totalQ, topClientsQ,
    ])

    const sources: Record<string, number> = {}
    for (const c of newClientsRes.data || []) {
      const src = (c.source as string) || 'unknown'
      sources[src] = (sources[src] || 0) + 1
    }

    const topClients = (topClientsRes.data || []).map(c => ({
      full_name: `${c.first_name} ${c.last_name}`,
      total_revenue: (c.total_spent as number) || 0,
    }))

    return success({
      newClients: newClientsRes.data?.length || 0,
      totalClientsHistorical: totalRes.count || 0,
      sources,
      topClients,
      clientsWithPurchases,
    })
  }
)

// ── Análisis avanzado de clientes (RPC agregado, 1 round-trip) ──────────────
export type ClientsAdvancedAnalytics = {
  with_purchases: number
  granularity: 'day' | 'week' | 'month'
  by_store: Array<{ store_id: string; store_name: string; clients_count: number }>
  by_day: Array<{ day: string; clients_count: number }>
  new_vs_returning: { new_count: number; returning_count: number; total: number }
}

export const getClientsAdvancedAnalytics = protectedAction<
  { start_date: string; end_date: string; store_id?: string },
  ClientsAdvancedAnalytics
>(
  { permission: 'reports.view', auditModule: 'reports' },
  async (ctx, { start_date, end_date, store_id }) => {
    // RPC clients_advanced_analytics (mig 158): devuelve JSONB con 4
    // estructuras en una sola llamada (with_purchases, by_store, by_day,
    // new_vs_returning) + granularity (day/week/month según rango).
    const { data, error } = await ctx.adminClient.rpc('clients_advanced_analytics', {
      p_start: start_date,
      p_end: end_date + 'T23:59:59',
      p_store: store_id || null,
    })
    if (error) return failure(error.message || 'Error al consultar analytics de clientes')
    const payload = (data ?? {}) as Partial<ClientsAdvancedAnalytics>
    return success({
      with_purchases: Number(payload.with_purchases ?? 0),
      granularity: (payload.granularity ?? 'day') as ClientsAdvancedAnalytics['granularity'],
      by_store: Array.isArray(payload.by_store) ? payload.by_store : [],
      by_day: Array.isArray(payload.by_day) ? payload.by_day : [],
      new_vs_returning: payload.new_vs_returning ?? { new_count: 0, returning_count: 0, total: 0 },
    })
  }
)

/**
 * Resumen de ventas de UN vendedor concreto: totales del mes actual, del año
 * y acumulados, más listado de ventas recientes. Se usa para mostrar el
 * histórico en la ficha del usuario.
 *
 * Fuente: `sale_lines.salesperson_id` (permite comisiones por línea incluso
 * si la venta la cerró otra persona; ver migración 122).
 */
export const getUserSalesSummary = protectedAction<
  { user_id: string; recent_limit?: number },
  {
    user: { id: string; full_name: string | null; email: string | null } | null
    mtd: { total: number; sales_count: number }
    ytd: { total: number; sales_count: number }
    all_time: { total: number; sales_count: number }
    current_month: { year: number; month: number; label: string }
    recent_sales: Array<{
      sale_id: string
      ticket_number: string
      created_at: string
      sale_total: number
      lines_total_for_user: number
      client_name: string | null
      store_name: string | null
    }>
    by_month: Array<{ year: number; month: number; label: string; total: number; sales_count: number }>
  }
>(
  { permission: 'reports.view', auditModule: 'reports' },
  async (ctx, { user_id, recent_limit = 20 }) => {
    if (!user_id) return failure('user_id requerido', 'VALIDATION')

    // Perfil
    const { data: profile } = await ctx.adminClient
      .from('profiles')
      .select('id, full_name, email')
      .eq('id', user_id)
      .maybeSingle()

    // Traer TODAS las líneas asignadas a este vendedor (completed).
    // Para una sastrería con miles de ventas al año, esto es manejable.
    const { data: lines, error: linesErr } = await ctx.adminClient
      .from('sale_lines')
      .select(`
        sale_id,
        line_total,
        sales!inner(id, ticket_number, total, status, created_at, store_id, client_id)
      `)
      .eq('salesperson_id', user_id)
      .eq('sales.status', 'completed')
    if (linesErr) return failure(linesErr.message || 'Error al consultar ventas', 'INTERNAL')

    // Agregar por venta
    type SaleAgg = {
      sale_id: string
      ticket_number: string
      sale_total: number
      created_at: string
      store_id: string | null
      client_id: string | null
      lines_total_for_user: number
    }
    const bySale = new Map<string, SaleAgg>()
    for (const l of (lines ?? []) as any[]) {
      const s = l.sales
      if (!s?.id) continue
      const existing = bySale.get(s.id)
      const lineAmount = Number(l.line_total) || 0
      if (existing) {
        existing.lines_total_for_user += lineAmount
      } else {
        bySale.set(s.id, {
          sale_id: s.id,
          ticket_number: s.ticket_number,
          sale_total: Number(s.total) || 0,
          created_at: s.created_at,
          store_id: s.store_id ?? null,
          client_id: s.client_id ?? null,
          lines_total_for_user: lineAmount,
        })
      }
    }

    const sales = [...bySale.values()].sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    )

    // Periodos (en hora de Madrid, no en la TZ del proceso): comparamos por la
    // clave de mes/año de Madrid en vez de límites de timestamp en TZ local.
    const nowDateKey = madridDateKey(new Date().toISOString())
    const nowYear = nowDateKey.slice(0, 4)
    const nowMonthKey = nowDateKey.slice(0, 7)
    const currentYearNum = Number(nowYear)
    const currentMonthNum = Number(nowMonthKey.slice(5, 7)) - 1 // 0-based

    let mtdTotal = 0, mtdCount = 0
    let ytdTotal = 0, ytdCount = 0
    let allTotal = 0
    const byMonth = new Map<string, { year: number; month: number; total: number; sales_count: number }>()

    for (const s of sales) {
      const amount = s.lines_total_for_user
      allTotal += amount
      const mk = madridMonthKey(s.created_at) // YYYY-MM en Madrid
      if (mk.slice(0, 4) === nowYear) { ytdTotal += amount; ytdCount += 1 }
      if (mk === nowMonthKey) { mtdTotal += amount; mtdCount += 1 }

      const [y, mo] = mk.split('-').map(Number)
      const key = `${y}-${mo - 1}` // formato existente: month 0-based
      const bm = byMonth.get(key)
      if (bm) { bm.total += amount; bm.sales_count += 1 }
      else byMonth.set(key, { year: y, month: mo - 1, total: amount, sales_count: 1 })
    }

    // Nombres de tienda y cliente para las ventas recientes
    const recent = sales.slice(0, recent_limit)
    const storeIds = [...new Set(recent.map((s) => s.store_id).filter(Boolean) as string[])]
    const clientIds = [...new Set(recent.map((s) => s.client_id).filter(Boolean) as string[])]

    const [storesRes, clientsRes] = await Promise.all([
      storeIds.length > 0
        ? ctx.adminClient.from('stores').select('id, name').in('id', storeIds)
        : Promise.resolve({ data: [] as any[] }),
      clientIds.length > 0
        ? ctx.adminClient.from('clients').select('id, first_name, last_name, company_name').in('id', clientIds)
        : Promise.resolve({ data: [] as any[] }),
    ])
    const storeNameById = new Map<string, string>()
    for (const s of (storesRes.data as any[]) ?? []) storeNameById.set(s.id, s.name)
    const clientNameById = new Map<string, string>()
    for (const c of (clientsRes.data as any[]) ?? []) {
      const name = c.company_name || [c.first_name, c.last_name].filter(Boolean).join(' ') || null
      clientNameById.set(c.id, name ?? '—')
    }

    const monthLabels = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre']

    return success({
      user: profile
        ? { id: (profile as any).id, full_name: (profile as any).full_name, email: (profile as any).email }
        : null,
      mtd: { total: Math.round(mtdTotal * 100) / 100, sales_count: mtdCount },
      ytd: { total: Math.round(ytdTotal * 100) / 100, sales_count: ytdCount },
      all_time: { total: Math.round(allTotal * 100) / 100, sales_count: sales.length },
      current_month: { year: currentYearNum, month: currentMonthNum, label: `${monthLabels[currentMonthNum]} ${currentYearNum}` },
      recent_sales: recent.map((s) => ({
        sale_id: s.sale_id,
        ticket_number: s.ticket_number,
        created_at: s.created_at,
        sale_total: s.sale_total,
        lines_total_for_user: Math.round(s.lines_total_for_user * 100) / 100,
        client_name: s.client_id ? (clientNameById.get(s.client_id) ?? null) : null,
        store_name: s.store_id ? (storeNameById.get(s.store_id) ?? null) : null,
      })),
      by_month: [...byMonth.values()]
        .sort((a, b) => (b.year - a.year) || (b.month - a.month))
        .slice(0, 12)
        .map((b) => ({
          ...b,
          label: `${monthLabels[b.month]} ${b.year}`,
          total: Math.round(b.total * 100) / 100,
        })),
    })
  }
)

// ─── Alterations report — deshabilitado ─────────────────────────────
// El módulo de arreglos es ficha de seguimiento de confección y NO gestiona
// cobros. El getter `getAlterationsReport` (que agrupaba por importe) se
// retira del export hasta que se decida si caja se vincula con arreglos.
// La columna `alterations.amount` sigue en BBDD por si se rehabilita.
