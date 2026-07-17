import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Definición CANÓNICA de "facturado por empleado" (jul-2026, acordada):
 *
 *  - Atribución por LÍNEA: `sale_lines.salesperson_id` (a quien vendió o
 *    reservó — mismo criterio que las comisiones, migs 122/245).
 *  - Importes SIN IVA: extraído del PVP con el `tax_rate` de cada línea; en
 *    ventas tax-free el PVP ya no lleva IVA y va tal cual.
 *  - EXCLUYE los cobros de pedido de sastrería tecleados en TPV
 *    (`sale_lines.tailoring_order_id` NOT NULL, migs 247/248): cobrar un
 *    pedido no es vender.
 *  - NETEA devoluciones: incluye ventas `partially_returned` y descuenta la
 *    parte devuelta de cada línea (`quantity_returned`). Antes, devolver UN
 *    artículo hacía desaparecer el ticket entero de las cifras del vendedor.
 *  - La sastrería cobrada en backoffice (`tailoring_order_payments`) NO es
 *    venta del cajero: se muestra aparte cuando procede.
 *
 * Todas las vistas por empleado (ficha "Ventas y comisiones", widget del
 * dashboard, dashboard del vendedor, informe "Por empleado") deben consumir
 * este módulo para dar LA MISMA cifra.
 */

export type EmployeeBilledLine = {
  salesperson_id: string
  /** Importe SIN IVA tras netear la parte devuelta. */
  amount_net: number
  /** PVP (con IVA) tras netear la parte devuelta. */
  amount_gross: number
  from_reservation: boolean
  sale_id: string
  ticket_number: string
  created_at: string
  store_id: string | null
  store_name: string | null
  client_id: string | null
  sale_total: number
  sale_type: string | null
}

const PAGE_SIZE = 1000

/**
 * Trae TODAS las líneas de venta atribuidas (paginado en bucle: sin el tope
 * silencioso de 1000 filas de Supabase que truncaba los históricos largos).
 */
export async function fetchEmployeeBilledLines(
  admin: SupabaseClient,
  opts: { userId?: string; from?: string; to?: string; storeId?: string } = {},
): Promise<EmployeeBilledLine[]> {
  const out: EmployeeBilledLine[] = []
  for (let offset = 0; ; offset += PAGE_SIZE) {
    let q = admin
      .from('sale_lines')
      .select(`
        id, sale_id, salesperson_id, line_total, tax_rate, quantity, quantity_returned, reservation_line_id,
        sales!inner(id, ticket_number, total, status, created_at, store_id, client_id, sale_type, is_tax_free, stores(name))
      `)
      .is('tailoring_order_id', null)
      .in('sales.status', ['completed', 'partially_returned'])
      .order('id', { ascending: true })
      .range(offset, offset + PAGE_SIZE - 1)
    if (opts.userId) q = q.eq('salesperson_id', opts.userId)
    else q = q.not('salesperson_id', 'is', null)
    if (opts.from) q = q.gte('sales.created_at', opts.from)
    if (opts.to) q = q.lte('sales.created_at', opts.to)
    if (opts.storeId) q = q.eq('sales.store_id', opts.storeId)

    const { data, error } = await q
    if (error) throw new Error(error.message || 'Error al consultar líneas de venta')

    for (const l of (data ?? []) as any[]) {
      const sale = l.sales
      if (!sale?.id || !l.salesperson_id) continue
      const qty = Number(l.quantity) || 1
      const qtyRet = Math.min(Math.max(Number(l.quantity_returned) || 0, 0), qty)
      const keptFactor = qty > 0 ? (qty - qtyRet) / qty : 1
      const gross = (Number(l.line_total) || 0) * keptFactor
      const taxRate = Number(l.tax_rate ?? 21)
      const net = sale.is_tax_free ? gross : gross / (1 + taxRate / 100)
      out.push({
        salesperson_id: String(l.salesperson_id),
        amount_net: net,
        amount_gross: gross,
        from_reservation: l.reservation_line_id != null,
        sale_id: String(sale.id),
        ticket_number: String(sale.ticket_number ?? ''),
        created_at: String(sale.created_at),
        store_id: sale.store_id ?? null,
        store_name: sale.stores?.name ?? null,
        client_id: sale.client_id ?? null,
        sale_total: Number(sale.total) || 0,
        sale_type: sale.sale_type ?? null,
      })
    }
    if (!data || data.length < PAGE_SIZE) break
  }
  return out
}
