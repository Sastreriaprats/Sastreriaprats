/* eslint-disable @typescript-eslint/no-explicit-any -- el cliente admin de Supabase es any por diseño; las filas leídas se castean puntualmente */
// Ingresos de la tienda online documentados con TICKET (mig 286, sep-2026).
//
// Hasta sep-2026 cada pedido online pagado generaba una factura W y los motores
// de ingresos (Resumen, IVA trimestral, Dashboard, escenario C) sumaban lo
// online a través de esas facturas. Desde la mig 286 el pedido recibe un nº de
// ticket CLP-T (`online_orders.ticket_ref`) y NO factura, así que aquí se leen
// esos pedidos como ingreso.
//
// Sin doble conteo:
//   · Las facturas W de pedidos con ticket se EXCLUYEN (`ticketedOrderIds`): si
//     más adelante se factura un pedido con ticket a petición del cliente, el
//     ingreso sigue contándose por el ticket, no por la factura.
//   · Los pedidos antiguos no tienen ticket_ref y siguen entrando por su W.
//   · No hay fila en `sales`, así que no se solapan con los tickets de TPV.
//
// Importes: mismo criterio que el asiento online y la factura W — base e IVA se
// derivan del TOTAL cobrado al 21% (el tratamiento OSS sigue pendiente).
// Fecha contable: paid_at. Un pedido cancelado o reembolsado deja de sumar.

type AdminClient = { from: (table: string) => any }

export type OnlineTicketIncome = {
  orderId: string
  orderNumber: string
  ticketRef: string
  /** YYYY-MM-DD (fecha del cobro) */
  date: string
  /** Importe cobrado, con IVA. */
  total: number
  base: number
  vat: number
  clientName: string | null
}

const TAX_RATE = 21
const PAGE = 1000
/** Estados en los que el pedido cuenta como venta cobrada. */
export const ONLINE_INCOME_STATUSES = ['paid', 'processing', 'shipped', 'delivered']

const r2 = (n: number) => Math.round(n * 100) / 100

export function splitOnlineTotal(total: number): { base: number; vat: number } {
  const t = r2(total)
  const base = r2(t / (1 + TAX_RATE / 100))
  return { base, vat: r2(t - base) }
}

async function readAll(build: (from: number, to: number) => any): Promise<any[]> {
  const rows: any[] = []
  for (let offset = 0; ; offset += PAGE) {
    const { data, error } = await build(offset, offset + PAGE - 1)
    if (error) throw new Error(error.message || 'Error al consultar pedidos online')
    const batch = (data ?? []) as any[]
    rows.push(...batch)
    if (batch.length < PAGE) break
  }
  return rows
}

/**
 * Pedidos online con ticket cobrados en [fromDate, toDate] (YYYY-MM-DD, ambos
 * incluidos) + ids de TODOS los pedidos con ticket, para excluir sus facturas W.
 */
export async function loadOnlineTicketIncome(
  admin: AdminClient,
  fromDate: string,
  toDate: string,
): Promise<{ rows: OnlineTicketIncome[]; ticketedOrderIds: Set<string> }> {
  const from = fromDate.slice(0, 10)
  const to = toDate.slice(0, 10)
  const [inRange, ticketed] = await Promise.all([
    readAll((f, t) => admin
      .from('online_orders')
      .select('id, order_number, ticket_ref, total, paid_at, shipping_address, clients:client_id(full_name)')
      .not('ticket_ref', 'is', null)
      .in('status', ONLINE_INCOME_STATUSES)
      .gte('paid_at', `${from}T00:00:00`)
      .lte('paid_at', `${to}T23:59:59`)
      .order('id', { ascending: true })
      .range(f, t)),
    readAll((f, t) => admin
      .from('online_orders')
      .select('id')
      .not('ticket_ref', 'is', null)
      .order('id', { ascending: true })
      .range(f, t)),
  ])

  const rows: OnlineTicketIncome[] = inRange.map((o) => {
    const total = Number(o.total) || 0
    const { base, vat } = splitOnlineTotal(total)
    const addr = (o.shipping_address && typeof o.shipping_address === 'object' ? o.shipping_address : {}) as Record<string, unknown>
    const addrName = [addr.first_name, addr.last_name].filter(Boolean).join(' ').trim()
    return {
      orderId: String(o.id),
      orderNumber: String(o.order_number ?? ''),
      ticketRef: String(o.ticket_ref),
      date: String(o.paid_at).slice(0, 10),
      total: r2(total),
      base,
      vat,
      clientName: (o.clients?.full_name as string | undefined)?.trim() || addrName || null,
    }
  })
  return { rows, ticketedOrderIds: new Set(ticketed.map((o) => String(o.id))) }
}
