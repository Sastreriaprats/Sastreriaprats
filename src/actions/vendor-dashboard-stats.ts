'use server'

import { createAdminClient } from '@/lib/supabase/admin'
import { createServerSupabaseClient } from '@/lib/supabase/server'

export interface VendorTodaySaleRow {
  id: string
  ticket_number: string
  created_at: string
  total: number
  payment_method: string
  client_name: string | null
  status: string
}

export interface VendorDashboardStats {
  storeGoal: {
    storeId: string
    storeName: string
    target: number
    actual: number
  } | null
  employeeMonthSales: number
  employeeYearSales: number
  todaySales: VendorTodaySaleRow[]
  todayTotal: number
  todayCount: number
}

// Estados de online_orders que cuentan como facturación.
const ONLINE_COUNTED_STATUSES = ['paid', 'processing', 'shipped', 'delivered']
const ONLINE_HOST_STORE_CODE = 'PIN'

/**
 * Devuelve estadísticas para el dashboard del vendedor:
 *  - Objetivo y ventas reales (con IVA) de la tienda activa en el mes actual.
 *  - Subtotal (sin IVA) de las ventas completadas del propio vendedor en el mes.
 *  - Subtotal (sin IVA) de las ventas completadas del propio vendedor en el año.
 */
export async function getVendorDashboardStats(
  storeId: string | null,
): Promise<{ data?: VendorDashboardStats; error?: string }> {
  try {
    const supabase = await createServerSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { error: 'No autenticado' }

    const admin = createAdminClient()
    const now = new Date()
    const year = now.getFullYear()
    const month = now.getMonth() + 1
    const pad = (n: number) => String(n).padStart(2, '0')
    const monthStart = `${year}-${pad(month)}-01T00:00:00`
    const nextMonth = month === 12 ? { y: year + 1, m: 1 } : { y: year, m: month + 1 }
    const nextMonthStart = `${nextMonth.y}-${pad(nextMonth.m)}-01T00:00:00`
    const yearStart = `${year}-01-01T00:00:00`
    const nextYearStart = `${year + 1}-01-01T00:00:00`
    const day = now.getDate()
    const todayStart = `${year}-${pad(month)}-${pad(day)}T00:00:00`
    const tomorrow = new Date(year, month - 1, day + 1)
    const tomorrowStart = `${tomorrow.getFullYear()}-${pad(tomorrow.getMonth() + 1)}-${pad(tomorrow.getDate())}T00:00:00`

    // Ventas del propio vendedor (subtotal, sin IVA) — mes, año y hoy en paralelo.
    const [monthSalesRes, yearSalesRes, todaySalesRes] = await Promise.all([
      admin
        .from('sales')
        .select('subtotal')
        .eq('salesperson_id', user.id)
        .eq('status', 'completed')
        .gte('created_at', monthStart)
        .lt('created_at', nextMonthStart),
      admin
        .from('sales')
        .select('subtotal')
        .eq('salesperson_id', user.id)
        .eq('status', 'completed')
        .gte('created_at', yearStart)
        .lt('created_at', nextYearStart),
      admin
        .from('sales')
        .select('id, ticket_number, created_at, total, payment_method, status, clients(full_name)')
        .eq('salesperson_id', user.id)
        .eq('status', 'completed')
        .gte('created_at', todayStart)
        .lt('created_at', tomorrowStart)
        .order('created_at', { ascending: false }),
    ])

    if (monthSalesRes.error) return { error: monthSalesRes.error.message }
    if (yearSalesRes.error) return { error: yearSalesRes.error.message }
    if (todaySalesRes.error) return { error: todaySalesRes.error.message }

    const sumSubtotal = (rows: { subtotal: number | string | null }[] | null) =>
      (rows || []).reduce((acc, r) => acc + (Number(r.subtotal) || 0), 0)

    const employeeMonthSales = sumSubtotal(monthSalesRes.data)
    const employeeYearSales = sumSubtotal(yearSalesRes.data)

    const todaySales: VendorTodaySaleRow[] = ((todaySalesRes.data ?? []) as any[]).map((s) => ({
      id: s.id,
      ticket_number: s.ticket_number,
      created_at: s.created_at,
      total: Number(s.total) || 0,
      payment_method: s.payment_method,
      status: s.status,
      client_name: (s.clients as any)?.full_name ?? null,
    }))
    const todayTotal = todaySales.reduce((acc, s) => acc + s.total, 0)
    const todayCount = todaySales.length

    // Objetivo y ventas reales de la tienda activa (si se recibe storeId).
    let storeGoal: VendorDashboardStats['storeGoal'] = null
    if (storeId) {
      const [storeRes, goalsRes, storeSalesRes] = await Promise.all([
        admin.from('stores').select('id, code, name').eq('id', storeId).maybeSingle(),
        admin
          .from('store_monthly_goals')
          .select('goal_type, target_amount')
          .eq('store_id', storeId)
          .eq('year', year)
          .eq('month', month)
          .eq('goal_type', 'boutique'),
        admin
          .from('sales')
          .select('subtotal')
          .eq('store_id', storeId)
          .eq('status', 'completed')
          .eq('sale_type', 'boutique')
          .gte('created_at', monthStart)
          .lt('created_at', nextMonthStart),
      ])

      if (storeRes.error) return { error: storeRes.error.message }
      if (goalsRes.error) return { error: goalsRes.error.message }
      if (storeSalesRes.error) return { error: storeSalesRes.error.message }

      if (storeRes.data) {
        const target = (goalsRes.data || []).reduce(
          (acc: number, g: { target_amount: number | string | null }) =>
            acc + (Number(g.target_amount) || 0),
          0,
        )
        const actual = (storeSalesRes.data || []).reduce(
          (acc: number, s: { subtotal: number | string | null }) => acc + (Number(s.subtotal) || 0),
          0,
        )
        storeGoal = {
          storeId: storeRes.data.id,
          storeName: storeRes.data.name,
          target,
          actual,
        }
      }
    }

    return {
      data: {
        storeGoal,
        employeeMonthSales,
        employeeYearSales,
        todaySales,
        todayTotal,
        todayCount,
      },
    }
  } catch (err) {
    console.error('[getVendorDashboardStats]', err)
    return { error: err instanceof Error ? err.message : 'Error al cargar estadísticas' }
  }
}
