import type { AdminClient } from '@/lib/server/action-wrapper'
import { readAllPaged } from '@/lib/server/paged'
import { isPedidoCobroDescription } from '@/lib/accounting/pedido-cobro-lines'

// ─── Clientes NUEVOS y REINCIDENTES + frecuencia de compra (sep-2026) ────────
// Definición de la tienda: "un cliente pasa a ser reincidente cuando realiza su
// segunda compra".
//
//  - Compra = un DÍA en que el cliente compra algo, sume lo que sume ese día:
//    ticket de boutique o tarjeta regalo (no devuelto entero, y no si solo es el
//    cobro de un pedido), pedido de sastrería no cancelado (order_date) o pedido
//    online no cancelado. Todas las tiendas y canales cuentan para el historial.
//  - Clientes de la base anterior (importados al arrancar la plataforma o desde
//    las fichas de papel): ya eran clientes, así que su primera compra en la
//    plataforma NO los hace nuevos.
//  - En el periodo, cada cliente con compra es:
//      nuevo           → su primera compra cae en el periodo
//      nuevo que repite → además ya ha hecho la segunda dentro del periodo
//      reincidente     → ya había comprado antes del periodo
//    Nuevos + reincidentes = clientes con compra (no se solapan).
//  - Con filtro de tienda, las compras DEL PERIODO se limitan a esa tienda, pero
//    "ya había comprado antes" mira todas (comprar antes en otra tienda no te
//    hace nuevo).

const IMPORT_CUTOFF = '2026-04-01' // la base anterior se cargó el 31-mar-2026

const madridFmt = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Madrid', year: 'numeric', month: '2-digit', day: '2-digit' })
const madridDay = (iso: string) => madridFmt.format(new Date(iso))
const daysBetween = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / 86400000)

export type RetentionStatus = 'nuevo' | 'nuevo_repite' | 'reincidente'
export type RetentionChannel = 'boutique' | 'sastreria' | 'online'

export type RetentionClientRow = {
  id: string
  name: string
  status: RetentionStatus
  /** Venía de la base anterior a la plataforma. */
  legacy: boolean
  purchases_period: number
  purchases_total: number
  first_purchase: string
  last_purchase: string
  /** Días medios entre compras (histórico en la plataforma); null con una sola compra. */
  avg_days_between: number | null
  channels: RetentionChannel[]
}

export type ClientRetentionReport = {
  totals: {
    buyers: number
    new_clients: number
    new_repeated: number
    returning: number
    returning_legacy: number
  }
  monthly: { month: string; buyers: number; new_clients: number; returning: number }[]
  /** Clientes del periodo según cuántas compras hicieron en él. */
  distribution: { label: string; clients: number }[]
  avg_purchases_per_buyer: number
  /** Mediana de días entre compras de los clientes con 2+ compras (histórico). */
  median_days_between: number | null
  clients: RetentionClientRow[]
}

type Purchase = { day: string; store: string | null; channel: RetentionChannel }

export async function computeClientRetentionReport(
  adminClient: AdminClient,
  { start_date, end_date, store_id }: { start_date: string; end_date: string; store_id?: string },
): Promise<ClientRetentionReport> {
  const [sales, orders, online, clients] = await Promise.all([
    readAllPaged<any>((f, t) => adminClient
      .from('sales')
      .select('client_id, store_id, created_at, sale_lines(description, tailoring_order_id)')
      .not('client_id', 'is', null)
      .in('sale_type', ['boutique', 'gift_card'])
      .in('status', ['completed', 'partially_returned'])
      .order('id', { ascending: true })
      .range(f, t), 'getClientRetentionReport.sales'),
    readAllPaged<any>((f, t) => adminClient
      .from('tailoring_orders')
      .select('client_id, store_id, order_date')
      .not('client_id', 'is', null)
      .neq('status', 'cancelled')
      .order('id', { ascending: true })
      .range(f, t), 'getClientRetentionReport.orders'),
    readAllPaged<any>((f, t) => adminClient
      .from('online_orders')
      .select('client_id, created_at')
      .not('client_id', 'is', null)
      .neq('status', 'cancelled')
      .order('id', { ascending: true })
      .range(f, t), 'getClientRetentionReport.online'),
    readAllPaged<any>((f, t) => adminClient
      .from('clients')
      .select('id, first_name, last_name, created_at, migration_batch')
      .order('id', { ascending: true })
      .range(f, t), 'getClientRetentionReport.clients'),
  ])

  const byClient = new Map<string, Purchase[]>()
  const push = (clientId: string, p: Purchase) => {
    const arr = byClient.get(clientId) ?? []
    arr.push(p)
    byClient.set(clientId, arr)
  }

  for (const s of sales) {
    // Un ticket que solo cobra un pedido de sastrería (o una deuda) no es una compra nueva.
    const lines = (s.sale_lines ?? []) as { description: string | null; tailoring_order_id: string | null }[]
    const isOnlyCollection = lines.length > 0 && lines.every((l) => {
      const d = String(l.description ?? '')
      return l.tailoring_order_id != null || d.startsWith('Cobro pendiente') || isPedidoCobroDescription(d)
    })
    if (isOnlyCollection || !s.created_at) continue
    push(String(s.client_id), { day: madridDay(s.created_at), store: s.store_id ?? null, channel: 'boutique' })
  }
  for (const o of orders) {
    if (!o.order_date) continue
    push(String(o.client_id), { day: String(o.order_date).slice(0, 10), store: o.store_id ?? null, channel: 'sastreria' })
  }
  for (const o of online) {
    if (!o.created_at) continue
    push(String(o.client_id), { day: madridDay(o.created_at), store: null, channel: 'online' })
  }

  const clientInfo = new Map<string, { name: string; legacy: boolean }>()
  for (const c of clients) {
    clientInfo.set(String(c.id), {
      name: `${c.first_name ?? ''} ${c.last_name ?? ''}`.trim() || '(sin nombre)',
      legacy: c.migration_batch != null || String(c.created_at ?? '') < IMPORT_CUTOFF,
    })
  }

  const inPeriod = (p: Purchase) => p.day >= start_date && p.day <= end_date && (!store_id || p.store === store_id)

  const rows: RetentionClientRow[] = []
  const monthly = new Map<string, { buyers: Set<string>; newIds: Set<string> }>()
  const allGaps: number[] = []

  for (const [clientId, purchases] of byClient) {
    // Días distintos con compra, en orden (varias compras el mismo día = una visita).
    const days = [...new Set(purchases.map((p) => p.day))].sort()
    const avg = days.length >= 2 ? daysBetween(days[0], days[days.length - 1]) / (days.length - 1) : null

    const periodDays = [...new Set(purchases.filter(inPeriod).map((p) => p.day))].sort()
    if (periodDays.length === 0) continue
    if (avg != null) allGaps.push(avg)

    const info = clientInfo.get(clientId) ?? { name: '(cliente borrado)', legacy: false }
    const firstDay = days[0]
    const isNew = !info.legacy && firstDay >= start_date && firstDay <= end_date
    // ¿Ha hecho ya la 2ª compra dentro del periodo? (cualquier tienda: la 2ª compra es del cliente)
    const secondInPeriod = days.length >= 2 && days[1] <= end_date
    const status: RetentionStatus = isNew ? (secondInPeriod ? 'nuevo_repite' : 'nuevo') : 'reincidente'

    rows.push({
      id: clientId,
      name: info.name,
      status,
      legacy: info.legacy,
      purchases_period: periodDays.length,
      purchases_total: days.length,
      first_purchase: firstDay,
      last_purchase: days[days.length - 1],
      avg_days_between: avg != null ? Math.round(avg) : null,
      channels: (['boutique', 'sastreria', 'online'] as RetentionChannel[]).filter((ch) => purchases.some((p) => p.channel === ch)),
    })

    // Evolución mes a mes: en cada mes, nuevo = su primera compra es de ese mes.
    for (const day of periodDays) {
      const month = day.slice(0, 7)
      const m = monthly.get(month) ?? { buyers: new Set<string>(), newIds: new Set<string>() }
      m.buyers.add(clientId)
      if (!info.legacy && firstDay.slice(0, 7) === month) m.newIds.add(clientId)
      monthly.set(month, m)
    }
  }

  const newRows = rows.filter((r) => r.status !== 'reincidente')
  const returning = rows.filter((r) => r.status === 'reincidente')
  const dist = [
    { label: '1 compra', test: (n: number) => n === 1 },
    { label: '2 compras', test: (n: number) => n === 2 },
    { label: '3 compras', test: (n: number) => n === 3 },
    { label: '4 o más', test: (n: number) => n >= 4 },
  ].map((d) => ({ label: d.label, clients: rows.filter((r) => d.test(r.purchases_period)).length }))

  const sortedGaps = [...allGaps].sort((a, b) => a - b)
  const median = sortedGaps.length === 0
    ? null
    : Math.round(sortedGaps.length % 2
      ? sortedGaps[(sortedGaps.length - 1) / 2]
      : (sortedGaps[sortedGaps.length / 2 - 1] + sortedGaps[sortedGaps.length / 2]) / 2)

  const statusOrder: Record<RetentionStatus, number> = { reincidente: 0, nuevo_repite: 1, nuevo: 2 }

  return ({
    totals: {
      buyers: rows.length,
      new_clients: newRows.length,
      new_repeated: newRows.filter((r) => r.status === 'nuevo_repite').length,
      returning: returning.length,
      returning_legacy: returning.filter((r) => r.legacy).length,
    },
    monthly: [...monthly.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([month, m]) => ({
      month,
      buyers: m.buyers.size,
      new_clients: m.newIds.size,
      returning: m.buyers.size - m.newIds.size,
    })),
    distribution: dist,
    avg_purchases_per_buyer: rows.length ? Math.round((rows.reduce((s, r) => s + r.purchases_period, 0) / rows.length) * 100) / 100 : 0,
    median_days_between: median,
    clients: rows.sort((a, b) =>
      b.purchases_period - a.purchases_period
      || statusOrder[a.status] - statusOrder[b.status]
      || b.last_purchase.localeCompare(a.last_purchase)),
  })
}
