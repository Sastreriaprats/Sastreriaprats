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

const DEFAULT_DASHBOARD_STATS: DashboardStats = {
  salesToday: 0,
  salesThisMonth: 0,
  salesLastMonth: 0,
  monthGrowth: 0,
  activeOrders: 0,
  ordersInProduction: 0,
  ordersPendingDelivery: 0,
  ordersOverdue: 0,
  clientsTotal: 0,
  clientsNewThisMonth: 0,
  avgTicket: 0,
  cashSessionOpen: false,
  cashSessionTotal: 0,
  lowStockCount: 0,
  supplierDebtTotal: 0,
  overduePayments: 0,
  fittingsToday: 0,
  deliveriesToday: 0,
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
      const todayEnd = `${today}T23:59:59`

      // Queries 1–7 en paralelo (mismo resultado, menos latencia)
      const [
        salesRes,
        ordersRes,
        clientsRes,
        cashRes,
        stockRes,
        supplierRes,
        fittingsRes,
      ] = await Promise.all([
        admin.from('sales').select('total, created_at').gte('created_at', `${lastMonthStart}T00:00:00`).lte('created_at', todayEnd).eq('status', 'completed'),
        admin.from('tailoring_orders').select('id, status, estimated_delivery_date').not('status', 'in', '("delivered","cancelled")'),
        admin.from('clients').select('id, created_at').eq('is_active', true),
        admin.from('cash_sessions').select('total_sales').eq('status', 'open').limit(1).maybeSingle(),
        admin.from('stock_levels').select('id', { count: 'exact', head: true }).not('min_stock', 'is', null).lte('available', 0),
        admin.from('supplier_due_dates').select('amount, due_date').eq('is_paid', false),
        admin.from('tailoring_fittings').select('id', { count: 'exact', head: true }).eq('scheduled_date', today).eq('status', 'scheduled'),
      ])

      const salesRows = salesRes.data
      const ordersRows = ordersRes.data
      const clientsRows = clientsRes.data
      const cashRow = cashRes.data
      const lowStockCount = stockRes.count
      const supplierRows = supplierRes.data
      const fittingsToday = fittingsRes.count
      let salesToday = 0
      let salesThisMonth = 0
      let salesLastMonth = 0
      let avgTicketSum = 0
      let avgTicketCount = 0
      for (const row of salesRows || []) {
        const date = (row.created_at as string).split('T')[0]
        const t = Number((row as { total?: number }).total) || 0
        if (date === today) salesToday += t
        if (date >= monthStart) {
          salesThisMonth += t
          avgTicketSum += t
          avgTicketCount += 1
        }
        if (date >= lastMonthStart && date < monthStart) salesLastMonth += t
      }
      const monthGrowth = Number.isFinite(salesLastMonth) && salesLastMonth > 0
        ? Number(((salesThisMonth - salesLastMonth) / salesLastMonth * 100).toFixed(2))
        : 0
      const avgTicket = avgTicketCount > 0 ? Number((avgTicketSum / avgTicketCount).toFixed(2)) : 0

      // 2) Pedidos sastrería (ordersRows ya viene del Promise.all)
      const ordersList = (ordersRows || []) as { id: string; status: string; estimated_delivery_date: string | null }[]
      const activeOrders = ordersList.length
      const ordersInProduction = ordersList.filter(o => ['in_production', 'factory_ordered'].includes(o.status)).length
      const ordersPendingDelivery = ordersList.filter(o => o.status === 'finished').length
      const ordersOverdue = ordersList.filter(o => o.estimated_delivery_date != null && o.estimated_delivery_date < today).length
      const deliveriesToday = ordersList.filter(o => o.status === 'finished' && o.estimated_delivery_date === today).length

      // 3) Clientes (clientsRows ya viene del Promise.all)
      const clientsList = clientsRows || []
      const clientsTotal = clientsList.length
      const clientsNewThisMonth = clientsList.filter((c: { created_at?: string }) => (c.created_at || '').slice(0, 10) >= monthStart).length

      // 4) Sesión de caja abierta (ya en cashRow)
      const supplierList = (supplierRows || []) as { amount?: number; due_date?: string }[]
      const supplierDebtTotal = Math.max(0, Number(supplierList.reduce((s, r) => s + (Number(r.amount) || 0), 0).toFixed(2)))
      const overduePayments = supplierList.filter(r => r.due_date != null && r.due_date < today).length

      const safeN = (n: number) => (Number.isFinite(n) && !Number.isNaN(n) ? n : 0)
      const result: DashboardStats = {
        salesToday,
        salesThisMonth,
        salesLastMonth,
        monthGrowth,
        activeOrders: safeN(activeOrders),
        ordersInProduction: safeN(ordersInProduction),
        ordersPendingDelivery: safeN(ordersPendingDelivery),
        ordersOverdue: safeN(ordersOverdue),
        clientsTotal: safeN(clientsTotal),
        clientsNewThisMonth: safeN(clientsNewThisMonth),
        avgTicket,
        cashSessionOpen: cashRow != null,
        cashSessionTotal: Number.isFinite(Number((cashRow as { total_sales?: number })?.total_sales)) ? Number((cashRow as { total_sales: number }).total_sales) : 0,
        lowStockCount: safeN(lowStockCount ?? 0),
        supplierDebtTotal,
        overduePayments: safeN(overduePayments),
        fittingsToday: safeN(fittingsToday ?? 0),
        deliveriesToday: safeN(deliveriesToday),
      }
      return success(JSON.parse(JSON.stringify(result)))
    } catch (queryErr) {
      console.error('[getDashboardStats] Error en consultas:', queryErr)
      return success({ ...DEFAULT_DASHBOARD_STATS })
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
      const chartData = entries.map(([date, total]) => ({
        date: String(date),
        label: new Date(date + 'Z').toLocaleDateString('es-ES', { day: '2-digit', month: 'short' }),
        total: Number(total),
      }))
      return success(JSON.parse(JSON.stringify(chartData)))
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
    const payload: DashboardAlerts = {
      ordersOverdue: overdueOrdersRes?.count ?? 0,
      overduePayments: overduePaymentsRes?.count ?? 0,
      lowStockCount: lowStockRes?.count ?? 0,
    }
    return success(JSON.parse(JSON.stringify(payload)))
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

    const toStr = (v: unknown): string | null => v == null ? null : v instanceof Date ? v.toISOString() : String(v)
    const rows = (data ?? []).map((row: Record<string, unknown>) => ({
      id: String(row.id ?? ''),
      action: String(row.action ?? ''),
      module: String(row.module ?? ''),
      entity_display: row.entity_display != null ? String(row.entity_display) : null,
      description: row.description != null ? String(row.description) : null,
      created_at: toStr(row.created_at) ?? '',
      user_full_name: row.user_full_name != null ? String(row.user_full_name) : null,
    }))
    return success(JSON.parse(JSON.stringify(rows)))
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
  boutiqueSalesThisMonth: number
  sastreriaSalesThisMonth: number
  boutiqueTarget: number
  sastreriaTarget: number
}

const BOUTIQUE_SALE_TYPES = ['boutique', 'online']
const SASTRERIA_SALE_TYPES = ['tailoring_deposit', 'tailoring_final', 'alteration']

export const getStoresWithStats = protectedAction<void, StoreStats[]>(
  { auditModule: 'dashboard' },
  async (ctx) => {
    const admin = ctx.adminClient
    const today = new Date().toISOString().split('T')[0]
    const monthStart = `${today.slice(0, 7)}-01`
    const [yearStr, monthStr] = today.split('-')
    const year = Number(yearStr)
    const month = Number(monthStr)

    const { data: stores } = await admin.from('stores').select('id, code, name').eq('is_active', true).order('name')
    if (!stores?.length) return success([])

    const storeIds = stores.map((s: { id: string }) => s.id)

    const [
      salesTodayRes,
      salesMonthRes,
      warehousesRes,
      goalsRes,
    ] = await Promise.all([
      admin.from('sales').select('store_id, total').in('store_id', storeIds).gte('created_at', `${today}T00:00:00`).eq('status', 'completed'),
      admin.from('sales').select('store_id, total, sale_type').in('store_id', storeIds).gte('created_at', `${monthStart}T00:00:00`).eq('status', 'completed'),
      admin.from('warehouses').select('id, store_id').in('store_id', storeIds),
      admin.from('store_monthly_goals').select('store_id, goal_type, target_amount').in('store_id', storeIds).eq('year', year).eq('month', month),
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
    const boutiqueByStore: Record<string, number> = {}
    const sastreriaByStore: Record<string, number> = {}
    for (const s of stores as { id: string }[]) {
      salesTodayByStore[s.id] = 0
      salesMonthByStore[s.id] = 0
      boutiqueByStore[s.id] = 0
      sastreriaByStore[s.id] = 0
    }
    for (const r of (salesTodayRes.data || []) as { store_id: string; total?: number }[]) {
      if (r.store_id) salesTodayByStore[r.store_id] = (salesTodayByStore[r.store_id] ?? 0) + (r.total ?? 0)
    }
    for (const r of (salesMonthRes.data || []) as { store_id: string; total?: number; sale_type?: string }[]) {
      if (!r.store_id) continue
      const t = r.total ?? 0
      salesMonthByStore[r.store_id] = (salesMonthByStore[r.store_id] ?? 0) + t
      const st = r.sale_type ?? ''
      if (BOUTIQUE_SALE_TYPES.includes(st)) {
        boutiqueByStore[r.store_id] = (boutiqueByStore[r.store_id] ?? 0) + t
      } else if (SASTRERIA_SALE_TYPES.includes(st)) {
        sastreriaByStore[r.store_id] = (sastreriaByStore[r.store_id] ?? 0) + t
      }
    }

    const boutiqueTargetByStore: Record<string, number> = {}
    const sastreriaTargetByStore: Record<string, number> = {}
    for (const g of (goalsRes.data || []) as { store_id: string; goal_type: string; target_amount: string | number }[]) {
      const amount = Number(g.target_amount) || 0
      if (g.goal_type === 'boutique') boutiqueTargetByStore[g.store_id] = amount
      else if (g.goal_type === 'sastreria') sastreriaTargetByStore[g.store_id] = amount
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
      code: store.code ?? '',
      name: store.name ?? '',
      salesToday: salesTodayByStore[store.id] ?? 0,
      salesThisMonth: salesMonthByStore[store.id] ?? 0,
      totalStockUnits: stockByStore[store.id]?.total ?? 0,
      lowStockCount: stockByStore[store.id]?.low ?? 0,
      boutiqueSalesThisMonth: boutiqueByStore[store.id] ?? 0,
      sastreriaSalesThisMonth: sastreriaByStore[store.id] ?? 0,
      boutiqueTarget: boutiqueTargetByStore[store.id] ?? 0,
      sastreriaTarget: sastreriaTargetByStore[store.id] ?? 0,
    }))

    return success(JSON.parse(JSON.stringify(result)))
  }
)

// ── Citas para el widget de calendario del dashboard ─────────────────────

export interface DashboardAppointment {
  id: string
  type: string
  title: string
  date: string
  start_time: string
  end_time: string
  status: string
  client_name: string | null
  client_id: string | null
  tailor_name: string | null
  store_name: string | null
  order_number: string | null
}

export const getDashboardAppointments = protectedAction<void, { appointments: DashboardAppointment[]; todayCount: number; weekCount: number }>(
  { auditModule: 'dashboard' },
  async (ctx) => {
    const today = new Date().toISOString().split('T')[0]
    // Calcular fin de semana (domingo)
    const now = new Date()
    const dayOfWeek = now.getDay()
    const daysUntilSunday = dayOfWeek === 0 ? 6 : 7 - dayOfWeek
    const endOfWeek = new Date(now)
    endOfWeek.setDate(now.getDate() + daysUntilSunday)
    const endDate = endOfWeek.toISOString().split('T')[0]

    const { data, error } = await ctx.adminClient
      .from('appointments')
      .select(`
        id, type, title, date, start_time, end_time, status,
        client_id,
        clients ( full_name ),
        profiles!appointments_tailor_id_fkey ( full_name ),
        stores ( name ),
        tailoring_orders ( order_number )
      `)
      .gte('date', today)
      .lte('date', endDate)
      .neq('status', 'cancelled')
      .order('date')
      .order('start_time')

    if (error) return failure(error.message)

    const appointments: DashboardAppointment[] = ((data || []) as Record<string, unknown>[]).map((a) => ({
      id: String(a.id),
      type: String(a.type),
      title: String(a.title),
      date: String(a.date),
      start_time: String(a.start_time || '').slice(0, 5),
      end_time: String(a.end_time || '').slice(0, 5),
      status: String(a.status),
      client_name: (a.clients as Record<string, unknown> | null)?.full_name as string | null,
      client_id: a.client_id as string | null,
      tailor_name: (a.profiles as Record<string, unknown> | null)?.full_name as string | null,
      store_name: (a.stores as Record<string, unknown> | null)?.name as string | null,
      order_number: (a.tailoring_orders as Record<string, unknown> | null)?.order_number as string | null,
    }))

    const todayCount = appointments.filter(a => a.date === today).length
    const weekCount = appointments.length

    return success(JSON.parse(JSON.stringify({ appointments, todayCount, weekCount })))
  }
)
