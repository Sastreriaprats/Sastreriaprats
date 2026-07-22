'use server'

import { createAdminClient } from '@/lib/supabase/admin'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { fetchEmployeeBilledLines } from '@/lib/reports/employee-billing'

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
  employeeTodaySales: number
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

    // "Mis ventas" con la definición canónica (employee-billing.ts): atribución
    // por línea, sin IVA, sin cobros de pedido, neteando devoluciones. Así el
    // vendedor ve LA MISMA cifra que el admin en la ficha y el informe.
    const [billedLines, todaySalesRes] = await Promise.all([
      fetchEmployeeBilledLines(admin, { userId: user.id, from: yearStart, to: nextYearStart }),
      admin
        .from('sales')
        .select('id, ticket_number, created_at, total, payment_method, status, clients(full_name)')
        .eq('salesperson_id', user.id)
        .eq('status', 'completed')
        .gte('created_at', todayStart)
        .lt('created_at', tomorrowStart)
        .order('created_at', { ascending: false }),
    ])

    if (todaySalesRes.error) return { error: todaySalesRes.error.message }

    // Mes y día en hora de Madrid (los created_at son UTC). Así "hoy" usa la
    // MISMA vara neta que mes/año, no el total con IVA de la tabla de tickets.
    const madridMonth = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Europe/Madrid', year: 'numeric', month: '2-digit',
    })
    const madridDay = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Europe/Madrid', year: 'numeric', month: '2-digit', day: '2-digit',
    })
    const currentMonthKey = madridMonth.format(now)
    const currentDayKey = madridDay.format(now)
    let employeeTodaySales = 0
    let employeeMonthSales = 0
    let employeeYearSales = 0
    for (const l of billedLines) {
      employeeYearSales += l.amount_net
      const created = new Date(l.created_at)
      if (madridMonth.format(created) === currentMonthKey) {
        employeeMonthSales += l.amount_net
      }
      if (madridDay.format(created) === currentDayKey) {
        employeeTodaySales += l.amount_net
      }
    }
    employeeTodaySales = Math.round(employeeTodaySales * 100) / 100
    employeeMonthSales = Math.round(employeeMonthSales * 100) / 100
    employeeYearSales = Math.round(employeeYearSales * 100) / 100

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
        employeeTodaySales,
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
