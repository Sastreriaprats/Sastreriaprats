'use server'

import { createAdminClient } from '@/lib/supabase/admin'
import { createServerSupabaseClient } from '@/lib/supabase/server'

export interface VendorDashboardStats {
  storeGoal: {
    storeId: string
    storeName: string
    target: number
    actual: number
  } | null
  employeeMonthSales: number
  employeeYearSales: number
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

    // Ventas del propio vendedor (subtotal, sin IVA) — mes y año en paralelo.
    const [monthSalesRes, yearSalesRes] = await Promise.all([
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
    ])

    if (monthSalesRes.error) return { error: monthSalesRes.error.message }
    if (yearSalesRes.error) return { error: yearSalesRes.error.message }

    const sumSubtotal = (rows: { subtotal: number | string | null }[] | null) =>
      (rows || []).reduce((acc, r) => acc + (Number(r.subtotal) || 0), 0)

    const employeeMonthSales = sumSubtotal(monthSalesRes.data)
    const employeeYearSales = sumSubtotal(yearSalesRes.data)

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
          .eq('month', month),
        admin
          .from('sales')
          .select('total')
          .eq('store_id', storeId)
          .eq('status', 'completed')
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
        let actual = (storeSalesRes.data || []).reduce(
          (acc: number, s: { total: number | string | null }) => acc + (Number(s.total) || 0),
          0,
        )
        // Si la tienda hospeda canal online, añadir ventas online del mes.
        if (storeRes.data.code === ONLINE_HOST_STORE_CODE) {
          const { data: onlineRes } = await admin
            .from('online_orders')
            .select('total')
            .in('status', ONLINE_COUNTED_STATUSES)
            .gte('created_at', monthStart)
            .lt('created_at', nextMonthStart)
          actual += (onlineRes || []).reduce(
            (acc: number, o: { total: number | string | null }) => acc + (Number(o.total) || 0),
            0,
          )
        }
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
      },
    }
  } catch (err) {
    console.error('[getVendorDashboardStats]', err)
    return { error: err instanceof Error ? err.message : 'Error al cargar estadísticas' }
  }
}
