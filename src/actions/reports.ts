'use server'

import { protectedAction } from '@/lib/server/action-wrapper'
import { success } from '@/lib/errors'

export const getSalesReport = protectedAction<
  { start_date: string; end_date: string; store_id?: string; group_by?: 'day' | 'week' | 'month' },
  {
    chartData: { date: string; pos: number; online: number; tailoring: number; total: number }[]
    totals: { pos: number; online: number; tailoring: number; total: number; ticketCount: number; avgTicket: number }
  }
>(
  { permission: 'reports.view', auditModule: 'reports' },
  async (ctx, { start_date, end_date, store_id, group_by = 'day' }) => {
    let salesQuery = ctx.adminClient
      .from('sale_lines')
      .select('quantity, line_total, created_at, sales!inner(store_id, status, created_at)')
      .gte('sales.created_at', start_date)
      .lte('sales.created_at', end_date + 'T23:59:59')
      .eq('sales.status', 'completed')
    if (store_id) salesQuery = salesQuery.eq('sales.store_id', store_id)
    const { data: saleLines } = await salesQuery

    const { data: onlineOrders } = await ctx.adminClient
      .from('online_orders')
      .select('total, created_at, status')
      .gte('created_at', start_date)
      .lte('created_at', end_date + 'T23:59:59')
      .in('status', ['paid', 'processing', 'shipped', 'delivered'])

    let tailoringQuery = ctx.adminClient
      .from('tailoring_orders')
      .select('total, created_at, status, store_id')
      .gte('created_at', start_date)
      .lte('created_at', end_date + 'T23:59:59')
      .not('status', 'eq', 'cancelled')
    if (store_id) tailoringQuery = tailoringQuery.eq('store_id', store_id)
    const { data: tailoringOrders } = await tailoringQuery

    const groupData = (items: Record<string, unknown>[], dateField: string, valueField: string, nestedDate?: string) => {
      const groups: Record<string, number> = {}
      for (const item of items) {
        const rawDate = nestedDate
          ? (item[nestedDate] as Record<string, unknown>)?.created_at as string
          : item[dateField] as string
        if (!rawDate) continue
        const date = new Date(rawDate)
        let key: string
        if (group_by === 'month') key = `${date.getFullYear()}-${(date.getMonth() + 1).toString().padStart(2, '0')}`
        else if (group_by === 'week') {
          const d = new Date(date)
          d.setDate(d.getDate() - d.getDay() + 1)
          key = d.toISOString().split('T')[0]
        } else key = date.toISOString().split('T')[0]
        groups[key] = (groups[key] || 0) + ((item[valueField] as number) || 0)
      }
      return groups
    }

    const posGrouped = groupData(saleLines || [], 'created_at', 'line_total', 'sales')
    const onlineGrouped = groupData(onlineOrders || [], 'created_at', 'total')
    const tailoringGrouped = groupData(tailoringOrders || [], 'created_at', 'total')

    const allDates = new Set([...Object.keys(posGrouped), ...Object.keys(onlineGrouped), ...Object.keys(tailoringGrouped)])
    const chartData = Array.from(allDates).sort().map(date => ({
      date,
      pos: posGrouped[date] || 0,
      online: onlineGrouped[date] || 0,
      tailoring: tailoringGrouped[date] || 0,
      total: (posGrouped[date] || 0) + (onlineGrouped[date] || 0) + (tailoringGrouped[date] || 0),
    }))

    const totalPos = (saleLines || []).reduce((s, l) => s + ((l.line_total as number) || 0), 0)
    const totalOnline = (onlineOrders || []).reduce((s, o) => s + ((o.total as number) || 0), 0)
    const totalTailoring = (tailoringOrders || []).reduce((s, o) => s + ((o.total as number) || 0), 0)
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
  { current_start: string; current_end: string; previous_start: string; previous_end: string; store_id?: string },
  {
    current: { revenue: number; newClients: number; ordersCount: number }
    previous: { revenue: number; newClients: number; ordersCount: number }
    changes: { revenue: number; newClients: number; ordersCount: number }
  }
>(
  { permission: 'reports.view', auditModule: 'reports' },
  async (ctx, { current_start, current_end, previous_start, previous_end }) => {
    const minStart = [current_start, previous_start].sort()[0]
    const maxEnd = [current_end, previous_end].sort()[1]
    const rangeEnd = maxEnd + 'T23:59:59'

    const [
      saleLinesRes,
      onlineRes,
      tailoringRes,
      clientsRes,
    ] = await Promise.all([
      ctx.adminClient.from('sale_lines')
        .select('line_total, sales!inner(status, created_at)')
        .gte('sales.created_at', minStart).lte('sales.created_at', rangeEnd)
        .eq('sales.status', 'completed'),
      ctx.adminClient.from('online_orders')
        .select('total, created_at')
        .gte('created_at', minStart).lte('created_at', rangeEnd)
        .in('status', ['paid', 'processing', 'shipped', 'delivered']),
      ctx.adminClient.from('tailoring_orders')
        .select('total, created_at')
        .gte('created_at', minStart).lte('created_at', rangeEnd)
        .not('status', 'eq', 'cancelled'),
      ctx.adminClient.from('clients')
        .select('id, created_at')
        .gte('created_at', minStart).lte('created_at', rangeEnd),
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
      const v = (l.line_total as number) || 0
      if (inCurrent(d)) currentRevenue += v
      if (inPrevious(d)) previousRevenue += v
    }
    for (const o of onlineRes.data || []) {
      const d = (o.created_at ?? '').slice(0, 10)
      const v = (o.total as number) || 0
      if (inCurrent(d)) currentRevenue += v
      if (inPrevious(d)) previousRevenue += v
    }
    let currentOrders = 0
    let previousOrders = 0
    for (const t of tailoringRes.data || []) {
      const d = (t.created_at ?? '').slice(0, 10)
      const v = (t.total as number) || 0
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
  { start_date: string; end_date: string; limit?: number },
  { name: string; sku: string; units: number; revenue: number }[]
>(
  { permission: 'reports.view', auditModule: 'reports' },
  async (ctx, { start_date, end_date, limit = 10 }) => {
    const { data } = await ctx.adminClient
      .from('sale_lines')
      .select('description, sku, quantity, line_total, sales!inner(created_at, status)')
      .gte('sales.created_at', start_date)
      .lte('sales.created_at', end_date + 'T23:59:59')
      .eq('sales.status', 'completed')

    const products: Record<string, { name: string; sku: string; units: number; revenue: number }> = {}
    for (const line of data || []) {
      const key = (line.description as string) || (line.sku as string) || 'Desconocido'
      if (!products[key]) products[key] = { name: key, sku: (line.sku as string) || '', units: 0, revenue: 0 }
      products[key].units += (line.quantity as number) || 1
      products[key].revenue += (line.line_total as number) || 0
    }

    return success(
      Object.values(products).sort((a, b) => b.revenue - a.revenue).slice(0, limit)
    )
  }
)

export const getTailorPerformance = protectedAction<
  { start_date: string; end_date: string },
  { tailor_id: string; name: string; orders: number; revenue: number; fittings: number; completed: number; avgOrderValue: number; completionRate: number }[]
>(
  { permission: 'reports.view', auditModule: 'reports' },
  async (ctx, { start_date, end_date }) => {
    const { data: orders } = await ctx.adminClient
      .from('tailoring_orders')
      .select('id, total, status, created_by, profiles!tailoring_orders_created_by_fkey(full_name), tailoring_fittings(id)')
      .gte('created_at', start_date)
      .lte('created_at', end_date + 'T23:59:59')
      .not('status', 'eq', 'cancelled')

    const tailors: Record<string, { name: string; orders: number; revenue: number; fittings: number; completed: number }> = {}
    for (const order of orders || []) {
      const id = (order.created_by as string) || 'unassigned'
      const profile = order.profiles as unknown as Record<string, unknown> | null
      const name = (profile?.full_name as string) || 'Sin asignar'
      if (!tailors[id]) tailors[id] = { name, orders: 0, revenue: 0, fittings: 0, completed: 0 }
      tailors[id].orders++
      tailors[id].revenue += (order.total as number) || 0
      tailors[id].fittings += (order.tailoring_fittings as unknown[])?.length || 0
      if (['finished', 'delivered'].includes(order.status as string)) tailors[id].completed++
    }

    return success(
      Object.entries(tailors).map(([tid, d]) => ({
        tailor_id: tid, ...d,
        avgOrderValue: d.orders > 0 ? d.revenue / d.orders : 0,
        completionRate: d.orders > 0 ? (d.completed / d.orders) * 100 : 0,
      })).sort((a, b) => b.revenue - a.revenue)
    )
  }
)

export const getClientsAnalytics = protectedAction<
  { start_date: string; end_date: string },
  { newClients: number; totalClients: number; sources: Record<string, number>; topClients: { full_name: string; total_revenue: number }[] }
>(
  { permission: 'reports.view', auditModule: 'reports' },
  async (ctx, { start_date, end_date }) => {
    const { data: newClients } = await ctx.adminClient.from('clients')
      .select('id, source')
      .gte('created_at', start_date).lte('created_at', end_date + 'T23:59:59')

    const sources: Record<string, number> = {}
    for (const c of newClients || []) {
      const src = (c.source as string) || 'unknown'
      sources[src] = (sources[src] || 0) + 1
    }

    const { count: totalClients } = await ctx.adminClient.from('clients').select('id', { count: 'exact' })

    const { data: topClientsData } = await ctx.adminClient
      .from('clients')
      .select('first_name, last_name, total_spent')
      .gt('total_spent', 0)
      .order('total_spent', { ascending: false })
      .limit(10)

    const topClients = (topClientsData || []).map(c => ({
      full_name: `${c.first_name} ${c.last_name}`,
      total_revenue: (c.total_spent as number) || 0,
    }))

    return success({
      newClients: newClients?.length || 0,
      totalClients: totalClients || 0,
      sources,
      topClients,
    })
  }
)
