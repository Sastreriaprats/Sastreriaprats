'use server'

import { protectedAction } from '@/lib/server/action-wrapper'
import { success, failure } from '@/lib/errors'

interface DashboardStats {
  salesToday: number
  salesThisMonth: number
  salesLastMonth: number
  monthGrowth: number
  activeOrders: number
  ordersInProduction: number
  ordersPendingDelivery: number
  ordersOverdue: number
  clientsTotal: number
  clientsNewThisMonth: number
  avgTicket: number
  cashSessionOpen: boolean
  cashSessionTotal: number
  lowStockCount: number
  supplierDebtTotal: number
  overduePayments: number
  fittingsToday: number
  deliveriesToday: number
}

export const getDashboardStats = protectedAction<string | undefined, DashboardStats>(
  { auditModule: 'dashboard' },
  async (ctx, _storeId) => {
    try {
      const admin = ctx.adminClient
      const today = new Date().toISOString().split('T')[0]
      const monthStart = `${today.slice(0, 7)}-01`
      const lastMonth = new Date()
      lastMonth.setMonth(lastMonth.getMonth() - 1)
      const lastMonthStart = `${lastMonth.toISOString().slice(0, 7)}-01`
      const lastMonthEnd = `${today.slice(0, 7)}-01`

      const [
        salesTodayRes,
        salesMonthRes,
        salesLastMonthRes,
        activeOrdersRes,
        productionOrdersRes,
        deliveryOrdersRes,
        overdueOrdersRes,
        clientsTotalRes,
        newClientsRes,
        avgTicketRes,
        cashSessionRes,
        lowStockRes,
        supplierDebtRes,
        overduePaymentsRes,
        fittingsTodayRes,
        deliveriesTodayRes,
      ] = await Promise.all([
        admin.from('sales').select('total').gte('created_at', `${today}T00:00:00`).eq('status', 'completed'),
        admin.from('sales').select('total').gte('created_at', `${monthStart}T00:00:00`).eq('status', 'completed'),
        admin.from('sales').select('total').gte('created_at', `${lastMonthStart}T00:00:00`).lt('created_at', `${lastMonthEnd}T00:00:00`).eq('status', 'completed'),
        admin.from('tailoring_orders').select('id', { count: 'exact' }).not('status', 'in', '("delivered","cancelled")'),
        admin.from('tailoring_orders').select('id', { count: 'exact' }).in('status', ['in_production', 'factory_ordered']),
        admin.from('tailoring_orders').select('id', { count: 'exact' }).eq('status', 'finished'),
        admin.from('tailoring_orders').select('id', { count: 'exact' }).lt('estimated_delivery_date', today).not('status', 'in', '("delivered","cancelled")'),
        admin.from('clients').select('id', { count: 'exact' }).eq('is_active', true),
        admin.from('clients').select('id', { count: 'exact' }).gte('created_at', `${monthStart}T00:00:00`),
        admin.from('sales').select('total').gte('created_at', `${monthStart}T00:00:00`).eq('status', 'completed'),
        admin.from('cash_sessions').select('total_sales').eq('status', 'open').limit(1).maybeSingle(),
        admin.from('stock_levels').select('id', { count: 'exact' }).not('min_stock', 'is', null).lte('available', 0),
        admin.from('supplier_due_dates').select('amount').eq('is_paid', false),
        admin.from('supplier_due_dates').select('id', { count: 'exact' }).eq('is_paid', false).lt('due_date', today),
        admin.from('tailoring_fittings').select('id', { count: 'exact' }).eq('scheduled_date', today).eq('status', 'scheduled'),
        admin.from('tailoring_orders').select('id', { count: 'exact' }).eq('estimated_delivery_date', today).eq('status', 'finished'),
      ])

      const salesToday = (salesTodayRes.data || []).reduce((sum: number, s: { total: number }) => sum + (s.total || 0), 0)
      const salesThisMonth = (salesMonthRes.data || []).reduce((sum: number, s: { total: number }) => sum + (s.total || 0), 0)
      const salesLastMonth = (salesLastMonthRes.data || []).reduce((sum: number, s: { total: number }) => sum + (s.total || 0), 0)
      const monthGrowth = salesLastMonth > 0 ? ((salesThisMonth - salesLastMonth) / salesLastMonth) * 100 : 0
      const avgTicketSales = avgTicketRes.data || []
      const avgTicket = avgTicketSales.length > 0 ? avgTicketSales.reduce((sum: number, s: { total: number }) => sum + (s.total || 0), 0) / avgTicketSales.length : 0
      const supplierDebtTotal = (supplierDebtRes.data || []).reduce((sum: number, d: { amount: number }) => sum + (d.amount || 0), 0)

      return success({
        salesToday,
        salesThisMonth,
        salesLastMonth,
        monthGrowth,
        activeOrders: activeOrdersRes.count || 0,
        ordersInProduction: productionOrdersRes.count || 0,
        ordersPendingDelivery: deliveryOrdersRes.count || 0,
        ordersOverdue: overdueOrdersRes.count || 0,
        clientsTotal: clientsTotalRes.count || 0,
        clientsNewThisMonth: newClientsRes.count || 0,
        avgTicket,
        cashSessionOpen: !!cashSessionRes.data,
        cashSessionTotal: (cashSessionRes.data as { total_sales?: number } | null)?.total_sales || 0,
        lowStockCount: lowStockRes.count || 0,
        supplierDebtTotal,
        overduePayments: overduePaymentsRes.count || 0,
        fittingsToday: fittingsTodayRes.count || 0,
        deliveriesToday: deliveriesTodayRes.count || 0,
      })
    } catch (e: any) {
      return failure(e?.message ?? 'Error al cargar estadísticas del dashboard')
    }
  }
)

/** Ventas del mes actual: un día por entrada desde día 1 hasta hoy. */
export const getSalesChartData = protectedAction<void, { date: string; label: string; total: number }[]>(
  { auditModule: 'dashboard' },
  async (ctx) => {
    try {
      const admin = ctx.adminClient
      const now = new Date()
      const today = now.toISOString().split('T')[0]
      const monthStart = `${today.slice(0, 7)}-01`

      const { data: sales } = await admin
        .from('sales')
        .select('total, created_at')
        .gte('created_at', `${monthStart}T00:00:00`)
        .lte('created_at', `${today}T23:59:59`)
        .eq('status', 'completed')
        .order('created_at')

      const dailyMap: Record<string, number> = {}
      const [y, m] = today.split('-').map(Number)
      const lastDay = new Date(y, m, 0).getDate()
      const todayDay = parseInt(today.slice(8, 10), 10)
      for (let d = 1; d <= Math.min(todayDay, lastDay); d++) {
        const date = `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
        dailyMap[date] = 0
      }
      for (const sale of sales || []) {
        const day = (sale.created_at as string).split('T')[0]
        if (dailyMap[day] !== undefined) {
          dailyMap[day] += sale.total || 0
        }
      }

      const entries = Object.entries(dailyMap).sort(([a], [b]) => a.localeCompare(b))
      return success(entries.map(([date, total]) => ({
        date,
        label: new Date(date + 'Z').toLocaleDateString('es-ES', { day: '2-digit', month: 'short' }),
        total,
      })))
    } catch (e: any) {
      return failure(e?.message ?? 'Error al cargar gráfico de ventas')
    }
  }
)

export interface DashboardAlerts {
  ordersOverdue: number
  overduePayments: number
  lowStockCount: number
}

export const getDashboardAlerts = protectedAction<void, DashboardAlerts>(
  { auditModule: 'dashboard' },
  async (ctx) => {
    const admin = ctx.adminClient
    const today = new Date().toISOString().split('T')[0]
    const [overdueOrdersRes, overduePaymentsRes, lowStockRes] = await Promise.all([
      admin.from('tailoring_orders').select('id', { count: 'exact' }).lt('estimated_delivery_date', today).not('status', 'in', '("delivered","cancelled")'),
      admin.from('supplier_due_dates').select('id', { count: 'exact' }).eq('is_paid', false).lt('due_date', today),
      admin.from('stock_levels').select('id', { count: 'exact' }).not('min_stock', 'is', null).lte('available', 0),
    ])
    return success({
      ordersOverdue: overdueOrdersRes.count || 0,
      overduePayments: overduePaymentsRes.count || 0,
      lowStockCount: lowStockRes.count || 0,
    })
  }
)

export const getRecentActivity = protectedAction<void, { id: string; action: string; module: string; entity_display: string | null; description: string | null; created_at: string; user_full_name: string | null }[]>(
  { auditModule: 'dashboard' },
  async (ctx) => {
    const { data } = await ctx.adminClient
      .from('audit_logs')
      .select('id, action, module, entity_display, description, created_at, user_full_name')
      .order('created_at', { ascending: false })
      .limit(15)

    return success((data || []) as { id: string; action: string; module: string; entity_display: string | null; description: string | null; created_at: string; user_full_name: string | null }[])
  }
)

export interface StoreStats {
  id: string
  code: string
  name: string
  salesToday: number
  salesThisMonth: number
  totalStockUnits: number
  lowStockCount: number
}

export const getStoresWithStats = protectedAction<void, StoreStats[]>(
  { auditModule: 'dashboard' },
  async (ctx) => {
    const admin = ctx.adminClient
    const today = new Date().toISOString().split('T')[0]
    const monthStart = `${today.slice(0, 7)}-01`

    const { data: stores } = await admin.from('stores').select('id, code, name').eq('is_active', true).order('name')
    if (!stores?.length) return success([])

    const storeIds = stores.map((s: { id: string }) => s.id)

    const [
      salesTodayRes,
      salesMonthRes,
      warehousesRes,
    ] = await Promise.all([
      admin.from('sales').select('store_id, total').in('store_id', storeIds).gte('created_at', `${today}T00:00:00`).eq('status', 'completed'),
      admin.from('sales').select('store_id, total').in('store_id', storeIds).gte('created_at', `${monthStart}T00:00:00`).eq('status', 'completed'),
      admin.from('warehouses').select('id, store_id').in('store_id', storeIds),
    ])

    const warehouses = (warehousesRes.data || []) as { id: string; store_id: string }[]
    const warehouseIds = warehouses.map((w) => w.id)
    const warehouseToStore = Object.fromEntries(warehouses.map((w) => [w.id, w.store_id]))

    let levelsData: { warehouse_id: string; quantity?: number; available?: number; min_stock?: number }[] = []
    if (warehouseIds.length > 0) {
      const { data: levels } = await admin.from('stock_levels').select('warehouse_id, quantity, available, min_stock').in('warehouse_id', warehouseIds)
      levelsData = (levels || []) as typeof levelsData
    }

    const salesTodayByStore: Record<string, number> = {}
    const salesMonthByStore: Record<string, number> = {}
    for (const s of stores as { id: string }[]) {
      salesTodayByStore[s.id] = 0
      salesMonthByStore[s.id] = 0
    }
    for (const r of (salesTodayRes.data || []) as { store_id: string; total?: number }[]) {
      if (r.store_id) salesTodayByStore[r.store_id] = (salesTodayByStore[r.store_id] ?? 0) + (r.total ?? 0)
    }
    for (const r of (salesMonthRes.data || []) as { store_id: string; total?: number }[]) {
      if (r.store_id) salesMonthByStore[r.store_id] = (salesMonthByStore[r.store_id] ?? 0) + (r.total ?? 0)
    }

    const stockByStore: Record<string, { total: number; low: number }> = {}
    for (const s of stores as { id: string }[]) {
      stockByStore[s.id] = { total: 0, low: 0 }
    }
    for (const l of levelsData) {
      const storeId = warehouseToStore[l.warehouse_id]
      if (!storeId) continue
      const q = l.quantity ?? 0
      const min = l.min_stock
      const available = l.available ?? 0
      stockByStore[storeId].total += q
      if (min != null && available <= min) stockByStore[storeId].low += 1
    }

    const result: StoreStats[] = (stores as { id: string; code: string; name: string }[]).map((store) => ({
      id: store.id,
      code: store.code,
      name: store.name,
      salesToday: salesTodayByStore[store.id] ?? 0,
      salesThisMonth: salesMonthByStore[store.id] ?? 0,
      totalStockUnits: stockByStore[store.id]?.total ?? 0,
      lowStockCount: stockByStore[store.id]?.low ?? 0,
    }))

    return success(result)
  }
)
