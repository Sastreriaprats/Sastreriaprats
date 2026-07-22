'use server'

import { createAdminClient } from '@/lib/supabase/admin'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { fetchEmployeeBilledLines } from '@/lib/reports/employee-billing'

export interface MySaleRow {
  sale_id: string
  ticket_number: string
  created_at: string
  /** Día natural en hora de Madrid, formato YYYY-MM-DD (para agrupar). */
  day: string
  store_name: string | null
  client_name: string | null
  sale_type: string | null
  from_reservation: boolean
  /** Importe SIN IVA (base imponible), neteando devoluciones. */
  amount_net: number
  /** PVP con IVA, neteando devoluciones. */
  amount_gross: number
}

export interface MyDayTotal {
  day: string
  count: number
  net: number
  gross: number
}

export interface MyEmployeeSales {
  sales: MySaleRow[]
  byDay: MyDayTotal[]
  totals: { count: number; net: number; gross: number }
}

// Día natural en hora de Madrid (los created_at se guardan en UTC).
const _madridDayFmt = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Europe/Madrid', year: 'numeric', month: '2-digit', day: '2-digit',
})
const madridDayKey = (iso: string): string => _madridDayFmt.format(new Date(iso))

/**
 * Ventas propias del empleado logueado en un rango de fechas, ticket a ticket e
 * INDEPENDIENTE de la tienda. Usa la definición CANÓNICA de facturación por
 * empleado (employee-billing.ts): atribución por línea (sale_lines.salesperson_id),
 * base sin IVA, excluye cobros de pedido de sastrería y netea devoluciones. Así
 * las cifras cuadran con el dashboard del vendedor, la ficha y el informe.
 *
 * Solo devuelve datos del propio usuario: no requiere permiso especial porque es
 * su propia información (basta con estar autenticado).
 */
export async function getMyEmployeeSales(
  input: { from: string; to: string },
): Promise<{ data?: MyEmployeeSales; error?: string }> {
  try {
    const supabase = await createServerSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { error: 'No autenticado' }

    const { from, to } = input
    if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) {
      return { error: 'Rango de fechas no válido' }
    }

    const admin = createAdminClient()
    const billedLines = await fetchEmployeeBilledLines(admin, {
      userId: user.id,
      from: `${from}T00:00:00`,
      to: `${to}T23:59:59`,
    })

    // Agrupar las líneas por venta (una fila por ticket).
    const bySale = new Map<string, MySaleRow>()
    const clientIds = new Set<string>()
    for (const l of billedLines) {
      let row = bySale.get(l.sale_id)
      if (!row) {
        row = {
          sale_id: l.sale_id,
          ticket_number: l.ticket_number,
          created_at: l.created_at,
          day: madridDayKey(l.created_at),
          store_name: l.store_name,
          client_name: null,
          sale_type: l.sale_type,
          from_reservation: l.from_reservation,
          amount_net: 0,
          amount_gross: 0,
        }
        bySale.set(l.sale_id, row)
      }
      row.amount_net += l.amount_net
      row.amount_gross += l.amount_gross
      row.from_reservation = row.from_reservation || l.from_reservation
      if (l.client_id) clientIds.add(l.client_id)
    }

    // Resolver nombres de cliente.
    if (clientIds.size > 0) {
      const { data: clients } = await admin
        .from('clients')
        .select('id, full_name')
        .in('id', [...clientIds])
      const nameById = new Map<string, string>()
      const clientRows = (clients ?? []) as { id: string; full_name: string | null }[]
      for (const c of clientRows) nameById.set(c.id, c.full_name ?? '')
      // La línea guarda client_id en billedLines; reasignamos por venta.
      for (const l of billedLines) {
        if (!l.client_id) continue
        const row = bySale.get(l.sale_id)
        if (row && !row.client_name) row.client_name = nameById.get(l.client_id) ?? null
      }
    }

    const sales = [...bySale.values()]
    for (const s of sales) {
      s.amount_net = Math.round(s.amount_net * 100) / 100
      s.amount_gross = Math.round(s.amount_gross * 100) / 100
    }
    // Más recientes primero.
    sales.sort((a, b) => (a.created_at < b.created_at ? 1 : a.created_at > b.created_at ? -1 : 0))

    // Totales por día.
    const dayMap = new Map<string, MyDayTotal>()
    for (const s of sales) {
      const d = dayMap.get(s.day) ?? { day: s.day, count: 0, net: 0, gross: 0 }
      d.count += 1
      d.net += s.amount_net
      d.gross += s.amount_gross
      dayMap.set(s.day, d)
    }
    const byDay = [...dayMap.values()]
      .map((d) => ({ ...d, net: Math.round(d.net * 100) / 100, gross: Math.round(d.gross * 100) / 100 }))
      .sort((a, b) => (a.day < b.day ? 1 : -1))

    const totals = {
      count: sales.length,
      net: Math.round(sales.reduce((acc, s) => acc + s.amount_net, 0) * 100) / 100,
      gross: Math.round(sales.reduce((acc, s) => acc + s.amount_gross, 0) * 100) / 100,
    }

    return { data: { sales, byDay, totals } }
  } catch (err) {
    console.error('[getMyEmployeeSales]', err)
    return { error: err instanceof Error ? err.message : 'Error al cargar tus ventas' }
  }
}
