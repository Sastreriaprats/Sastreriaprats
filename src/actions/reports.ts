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
        const date = new Date(rawDate)
        let key: string
        if (group_by === 'month') key = `${date.getFullYear()}-${(date.getMonth() + 1).toString().padStart(2, '0')}`
        else if (group_by === 'week') {
          const d = new Date(date)
          d.setDate(d.getDate() - d.getDay() + 1)
          key = d.toISOString().split('T')[0]
        } else key = date.toISOString().split('T')[0]
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
  { tailor_id: string; name: string; orders: number; revenue: number; fittings: number; completed: number; avgOrderValue: number; completionRate: number; paid: number; pending: number; paidRate: number }[]
>(
  { permission: 'reports.view', auditModule: 'reports' },
  async (ctx, { start_date, end_date, store_id, channel = 'all', tax_mode = 'with_tax' }) => {
    if (channel === 'boutique') return success([])
    const net = tax_mode === 'without_tax'
    let q = ctx.adminClient
      .from('tailoring_orders')
      .select('id, subtotal, total, total_paid, status, created_by, store_id, profiles!tailoring_orders_created_by_fkey(full_name), tailoring_fittings(count)')
      .gte('created_at', start_date)
      .lte('created_at', end_date + 'T23:59:59')
      .not('status', 'eq', 'cancelled')
    if (store_id) q = q.eq('store_id', store_id)
    const { data: orders } = await q

    const tailors: Record<string, { name: string; orders: number; revenue: number; fittings: number; completed: number; paid: number }> = {}
    for (const order of orders || []) {
      const id = (order.created_by as string) || 'unassigned'
      const profile = order.profiles as unknown as Record<string, unknown> | null
      const name = (profile?.full_name as string) || 'Sin asignar'
      if (!tailors[id]) tailors[id] = { name, orders: 0, revenue: 0, fittings: 0, completed: 0, paid: 0 }
      tailors[id].orders++
      tailors[id].revenue += net ? (Number((order as any).subtotal) || 0) : (Number(order.total) || 0)
      // Pago acumulado, prorrateado al modo IVA para que pending = revenue - paid sea coherente.
      const orderTotal = Number(order.total) || 0
      const orderPaid = Number((order as any).total_paid) || 0
      const orderSubtotal = Number((order as any).subtotal) || 0
      tailors[id].paid += net && orderTotal > 0
        ? orderPaid * (orderSubtotal / orderTotal)
        : orderPaid
      const fittingsData = order.tailoring_fittings as unknown
      const fittingsCount = Array.isArray(fittingsData) && fittingsData.length > 0 && typeof fittingsData[0] === 'object' && fittingsData[0] !== null && 'count' in fittingsData[0]
        ? (fittingsData[0] as { count: number }).count
        : 0
      tailors[id].fittings += fittingsCount
      if (['finished', 'delivered'].includes(order.status as string)) tailors[id].completed++
    }

    return success(
      Object.entries(tailors).map(([tid, d]) => {
        const pending = Math.max(0, d.revenue - d.paid)
        const paidRate = d.revenue > 0 ? Math.round((d.paid / d.revenue) * 100) : 0
        return {
          tailor_id: tid, ...d,
          avgOrderValue: d.orders > 0 ? d.revenue / d.orders : 0,
          completionRate: d.orders > 0 ? (d.completed / d.orders) * 100 : 0,
          pending,
          paidRate,
        }
      }).sort((a, b) => b.revenue - a.revenue)
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
    pos_ops: number; pos_total: number
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
      .select('sale_id, line_total, tax_rate, sales!inner(salesperson_id, status, store_id, created_at)')
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
      saleIds: Set<string>; pos_total: number
      tailoring_ops: number; tailoring_total: number
      tailor_orders_count: number; tailor_orders_revenue: number
    }> = {}

    const ensure = (id: string) => {
      if (!employees[id]) employees[id] = {
        name: id, saleIds: new Set(),
        pos_total: 0, tailoring_ops: 0, tailoring_total: 0,
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
      e.pos_total += net ? lineNet(lt, (line as any).tax_rate) : lt
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
      const d = new Date(dateStr)
      const hour = d.getHours()
      const dow = (d.getDay() + 6) % 7 // 0=Mon...6=Sun
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
  }
>(
  { permission: 'reports.view', auditModule: 'reports' },
  async (ctx, { start_date, end_date, tax_mode = 'with_tax' }) => {
    const net = tax_mode === 'without_tax'
    const { data } = await ctx.adminClient
      .from('manual_transactions')
      .select('category, amount, total, description, date')
      .eq('type', 'expense')
      .gte('date', start_date)
      .lte('date', end_date)
      .order('date', { ascending: false })

    const valueOf = (tx: any) => net ? (Number(tx.amount) || 0) : (Number(tx.total) || 0)

    const categories: Record<string, { count: number; total: number }> = {}
    for (const tx of data || []) {
      const cat = (tx.category as string) || 'Sin categoría'
      if (!categories[cat]) categories[cat] = { count: 0, total: 0 }
      categories[cat].count += 1
      categories[cat].total += valueOf(tx)
    }

    const byCategory = Object.entries(categories)
      .map(([category, d]) => ({ category, ...d }))
      .sort((a, b) => b.total - a.total)

    const recentExpenses = (data || []).slice(0, 5).map(tx => ({
      description: (tx.description as string) || '',
      category: (tx.category as string) || 'Sin categoría',
      total: valueOf(tx),
      date: (tx.date as string) || '',
    }))

    return success({ byCategory, grandTotal: byCategory.reduce((s, c) => s + c.total, 0), recentExpenses })
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
    const [currentRes, previousRes] = await Promise.all([
      ctx.adminClient.from('manual_transactions')
        .select(cols).eq('type', 'expense').gte('date', current_start).lte('date', current_end),
      ctx.adminClient.from('manual_transactions')
        .select(cols).eq('type', 'expense').gte('date', previous_start).lte('date', previous_end),
    ])
    const sumField = (rows: any[] | null) => (rows || []).reduce((s, t) => s + (Number(net ? t.amount : t.total) || 0), 0)
    const current = sumField(currentRes.data as any[])
    const previous = sumField(previousRes.data as any[])
    const change = previous === 0 ? (current > 0 ? 100 : 0) : ((current - previous) / previous) * 100
    return success({ current, previous, change })
  }
)

export const getClientsAnalytics = protectedAction<
  { start_date: string; end_date: string; store_id?: string },
  {
    newClients: number; totalClients: number
    sources: Record<string, number>
    topClients: { full_name: string; total_revenue: number }[]
    clientsWithPurchases: number
  }
>(
  { permission: 'reports.view', auditModule: 'reports' },
  async (ctx, { start_date, end_date, store_id }) => {
    let newClientsQ = ctx.adminClient.from('clients').select('id, source').gte('created_at', start_date).lte('created_at', end_date + 'T23:59:59')
    let totalQ = ctx.adminClient.from('clients').select('id', { count: 'exact' })
    let withPurchasesQ = ctx.adminClient.from('clients').select('id', { count: 'exact' }).gt('total_spent', 0)
    let topClientsQ = ctx.adminClient.from('clients').select('first_name, last_name, total_spent').gt('total_spent', 0).gte('created_at', start_date).lte('created_at', end_date + 'T23:59:59').order('total_spent', { ascending: false }).limit(10)
    if (store_id) {
      newClientsQ = newClientsQ.eq('home_store_id', store_id)
      totalQ = totalQ.eq('home_store_id', store_id)
      withPurchasesQ = withPurchasesQ.eq('home_store_id', store_id)
      topClientsQ = topClientsQ.eq('home_store_id', store_id)
    }
    const [newClientsRes, totalRes, withPurchasesRes, topClientsRes] = await Promise.all([
      newClientsQ, totalQ, withPurchasesQ, topClientsQ,
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
      totalClients: totalRes.count || 0,
      sources,
      topClients,
      clientsWithPurchases: withPurchasesRes.count || 0,
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

    // Periodos
    const now = new Date()
    const year = now.getFullYear()
    const month = now.getMonth() // 0-based
    const monthStart = new Date(year, month, 1).getTime()
    const yearStart = new Date(year, 0, 1).getTime()

    let mtdTotal = 0, mtdCount = 0
    let ytdTotal = 0, ytdCount = 0
    let allTotal = 0
    const byMonth = new Map<string, { year: number; month: number; total: number; sales_count: number }>()

    for (const s of sales) {
      const amount = s.lines_total_for_user
      allTotal += amount
      const t = new Date(s.created_at).getTime()
      if (t >= yearStart) { ytdTotal += amount; ytdCount += 1 }
      if (t >= monthStart) { mtdTotal += amount; mtdCount += 1 }

      const d = new Date(s.created_at)
      const key = `${d.getFullYear()}-${d.getMonth()}`
      const bm = byMonth.get(key)
      if (bm) { bm.total += amount; bm.sales_count += 1 }
      else byMonth.set(key, { year: d.getFullYear(), month: d.getMonth(), total: amount, sales_count: 1 })
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
      current_month: { year, month, label: `${monthLabels[month]} ${year}` },
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
