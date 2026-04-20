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
      .select('id, total, status, created_by, profiles!tailoring_orders_created_by_fkey(full_name), tailoring_fittings(count)')
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
      const fittingsData = order.tailoring_fittings as unknown
      const fittingsCount = Array.isArray(fittingsData) && fittingsData.length > 0 && typeof fittingsData[0] === 'object' && fittingsData[0] !== null && 'count' in fittingsData[0]
        ? (fittingsData[0] as { count: number }).count
        : 0
      tailors[id].fittings += fittingsCount
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

export const getSalesByStore = protectedAction<
  { start_date: string; end_date: string },
  { store_id: string; store_name: string; pos: number; tailoring: number; total: number }[]
>(
  { permission: 'reports.view', auditModule: 'reports' },
  async (ctx, { start_date, end_date }) => {
    const [saleLinesRes, tailoringRes] = await Promise.all([
      ctx.adminClient
        .from('sale_lines')
        .select('line_total, sales!inner(store_id, stores(name), status, created_at)')
        .gte('sales.created_at', start_date)
        .lte('sales.created_at', end_date + 'T23:59:59')
        .eq('sales.status', 'completed'),
      ctx.adminClient
        .from('tailoring_orders')
        .select('total, store_id, stores(name)')
        .gte('created_at', start_date)
        .lte('created_at', end_date + 'T23:59:59')
        .not('status', 'eq', 'cancelled'),
    ])

    const stores: Record<string, { store_name: string; pos: number; tailoring: number }> = {}

    for (const line of saleLinesRes.data || []) {
      const sale = line.sales as any
      const storeId = sale?.store_id || 'unknown'
      const storeName = (sale?.stores as any)?.name || 'Sin tienda'
      if (!stores[storeId]) stores[storeId] = { store_name: storeName, pos: 0, tailoring: 0 }
      stores[storeId].pos += (line.line_total as number) || 0
    }

    for (const order of tailoringRes.data || []) {
      const storeId = (order.store_id as string) || 'unknown'
      const storeName = (order.stores as any)?.name || 'Sin tienda'
      if (!stores[storeId]) stores[storeId] = { store_name: storeName, pos: 0, tailoring: 0 }
      stores[storeId].tailoring += (order.total as number) || 0
    }

    return success(
      Object.entries(stores)
        .map(([store_id, d]) => ({ store_id, ...d, total: d.pos + d.tailoring }))
        .sort((a, b) => b.total - a.total)
    )
  }
)

export const getSalesByEmployee = protectedAction<
  { start_date: string; end_date: string },
  { employee_id: string; employee_name: string; pos_ops: number; pos_total: number; tailoring_ops: number; tailoring_total: number; total: number }[]
>(
  { permission: 'reports.view', auditModule: 'reports' },
  async (ctx, { start_date, end_date }) => {
    const [saleLinesRes, paymentsRes] = await Promise.all([
      ctx.adminClient
        .from('sale_lines')
        .select('sale_id, line_total, sales!inner(salesperson_id, status, created_at)')
        .gte('sales.created_at', start_date)
        .lte('sales.created_at', end_date + 'T23:59:59')
        .eq('sales.status', 'completed'),
      ctx.adminClient
        .from('tailoring_order_payments')
        .select('amount, created_by, created_at')
        .gte('created_at', start_date)
        .lte('created_at', end_date + 'T23:59:59'),
    ])

    const employees: Record<string, { name: string; saleIds: Set<string>; pos_total: number; tailoring_ops: number; tailoring_total: number }> = {}

    for (const line of saleLinesRes.data || []) {
      const sale = line.sales as any
      const empId = sale?.salesperson_id || 'unknown'
      if (!employees[empId]) employees[empId] = { name: empId, saleIds: new Set(), pos_total: 0, tailoring_ops: 0, tailoring_total: 0 }
      if (line.sale_id) employees[empId].saleIds.add(String(line.sale_id))
      employees[empId].pos_total += (line.line_total as number) || 0
    }

    for (const payment of paymentsRes.data || []) {
      const empId = (payment.created_by as string) || 'unknown'
      if (!employees[empId]) employees[empId] = { name: empId, saleIds: new Set(), pos_total: 0, tailoring_ops: 0, tailoring_total: 0 }
      employees[empId].tailoring_ops += 1
      employees[empId].tailoring_total += (payment.amount as number) || 0
    }

    // Resolve names in one batch query
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
        total: d.pos_total + d.tailoring_total,
      }))
      .sort((a, b) => b.total - a.total)

    return success(result)
  }
)

export const getSalesByTimePattern = protectedAction<
  { start_date: string; end_date: string },
  {
    byHour: { hour: number; total: number; count: number }[]
    byDayOfWeek: { day: number; label: string; total: number; count: number }[]
  }
>(
  { permission: 'reports.view', auditModule: 'reports' },
  async (ctx, { start_date, end_date }) => {
    const [saleLinesRes, paymentsRes] = await Promise.all([
      ctx.adminClient
        .from('sale_lines')
        .select('line_total, sales!inner(created_at, status)')
        .gte('sales.created_at', start_date)
        .lte('sales.created_at', end_date + 'T23:59:59')
        .eq('sales.status', 'completed'),
      ctx.adminClient
        .from('tailoring_order_payments')
        .select('amount, created_at')
        .gte('created_at', start_date)
        .lte('created_at', end_date + 'T23:59:59'),
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
      if (sale?.created_at) accumulate(sale.created_at, (line.line_total as number) || 0)
    }
    for (const payment of paymentsRes.data || []) {
      if (payment.created_at) accumulate(payment.created_at as string, (payment.amount as number) || 0)
    }

    return success({ byHour: hourMap, byDayOfWeek: dayMap })
  }
)

export const getExpensesReport = protectedAction<
  { start_date: string; end_date: string },
  {
    byCategory: { category: string; count: number; total: number }[]
    grandTotal: number
    recentExpenses: { description: string; category: string; total: number; date: string }[]
  }
>(
  { permission: 'reports.view', auditModule: 'reports' },
  async (ctx, { start_date, end_date }) => {
    const { data } = await ctx.adminClient
      .from('manual_transactions')
      .select('category, total, description, date')
      .eq('type', 'expense')
      .gte('date', start_date)
      .lte('date', end_date)
      .order('date', { ascending: false })

    const categories: Record<string, { count: number; total: number }> = {}
    for (const tx of data || []) {
      const cat = (tx.category as string) || 'Sin categoría'
      if (!categories[cat]) categories[cat] = { count: 0, total: 0 }
      categories[cat].count += 1
      categories[cat].total += (tx.total as number) || 0
    }

    const byCategory = Object.entries(categories)
      .map(([category, d]) => ({ category, ...d }))
      .sort((a, b) => b.total - a.total)

    const recentExpenses = (data || []).slice(0, 5).map(tx => ({
      description: (tx.description as string) || '',
      category: (tx.category as string) || 'Sin categoría',
      total: (tx.total as number) || 0,
      date: (tx.date as string) || '',
    }))

    return success({ byCategory, grandTotal: byCategory.reduce((s, c) => s + c.total, 0), recentExpenses })
  }
)

export const getExpensesComparison = protectedAction<
  { current_start: string; current_end: string; previous_start: string; previous_end: string },
  { current: number; previous: number; change: number }
>(
  { permission: 'reports.view', auditModule: 'reports' },
  async (ctx, { current_start, current_end, previous_start, previous_end }) => {
    const [currentRes, previousRes] = await Promise.all([
      ctx.adminClient.from('manual_transactions')
        .select('total').eq('type', 'expense').gte('date', current_start).lte('date', current_end),
      ctx.adminClient.from('manual_transactions')
        .select('total').eq('type', 'expense').gte('date', previous_start).lte('date', previous_end),
    ])
    const current = (currentRes.data || []).reduce((s, t) => s + ((t.total as number) || 0), 0)
    const previous = (previousRes.data || []).reduce((s, t) => s + ((t.total as number) || 0), 0)
    const change = previous === 0 ? (current > 0 ? 100 : 0) : ((current - previous) / previous) * 100
    return success({ current, previous, change })
  }
)

export const getClientsAnalytics = protectedAction<
  { start_date: string; end_date: string },
  {
    newClients: number; totalClients: number
    sources: Record<string, number>
    topClients: { full_name: string; total_revenue: number }[]
    clientsWithPurchases: number
  }
>(
  { permission: 'reports.view', auditModule: 'reports' },
  async (ctx, { start_date, end_date }) => {
    const [newClientsRes, totalRes, withPurchasesRes, topClientsRes] = await Promise.all([
      ctx.adminClient.from('clients').select('id, source').gte('created_at', start_date).lte('created_at', end_date + 'T23:59:59'),
      ctx.adminClient.from('clients').select('id', { count: 'exact' }),
      ctx.adminClient.from('clients').select('id', { count: 'exact' }).gt('total_spent', 0),
      ctx.adminClient.from('clients').select('first_name, last_name, total_spent').gt('total_spent', 0).gte('created_at', start_date).lte('created_at', end_date + 'T23:59:59').order('total_spent', { ascending: false }).limit(10),
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
