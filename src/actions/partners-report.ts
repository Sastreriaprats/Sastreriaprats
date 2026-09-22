'use server'

import { protectedAction } from '@/lib/server/action-wrapper'
import { success, failure } from '@/lib/errors'
import { readAllPaged } from '@/lib/server/paged'
import { loadPedidoCobroBaseBySale } from '@/lib/accounting/pedido-cobro-lines'
import { loadReservationPayments } from '@/lib/accounting/reservation-payments'

/**
 * INFORME PARA SOCIOS (petición de Mónica, 22-sep-2026).
 *
 * «Los socios quieren que mensualmente salgan las ventas reales de cada mes
 *  identificadas por tienda y por boutique / sastrería / online, y si están
 *  cobradas o no cobradas. Por otro lado, las ventas cobradas que sean de otro
 *  mes. Los gastos reales del mes. Y el beneficio.»
 *
 * CRITERIO — se mide por DEVENGO, no por caja:
 *   · Boutique  = tickets de TPV con fecha del mes (`sales.created_at`).
 *   · Sastrería = pedidos con fecha de pedido del mes (`tailoring_orders.order_date`),
 *                 por su importe COMPLETO, esté cobrado o no. Es la diferencia
 *                 con el resto de informes, que miden sastrería por COBROS
 *                 ([[informes-reestructura-monica]]): aquí hace falta saber qué
 *                 se ha vendido y cuánto de eso está pendiente de cobro.
 *   · Online    = pedidos web pagados, por su fecha de pago.
 *
 * De cada venta se dice cuánto está COBRADO a día de hoy y cuánto no, que es lo
 * que pedían los socios.
 *
 * Los COBROS DE OTROS MESES van en su propio bloque: dinero que ha entrado este
 * mes pero que corresponde a ventas de meses anteriores (o posteriores). No se
 * suma a las ventas del mes; sumarlo sería contar dos veces la misma venta.
 *
 * Las SEÑALES DE RESERVA son dinero cobrado sin venta todavía (anticipos): van
 * aparte y solo cuentan como venta el mes en que la reserva se convierte en
 * ticket.
 *
 * GASTOS = facturas de proveedor recibidas con fecha del mes
 * (`ap_supplier_invoices`, sin proformas), el mismo criterio que Contabilidad.
 * NO incluye nóminas, alquileres ni nada que no entre como factura de proveedor:
 * la pantalla lo avisa para que nadie lea el beneficio como un resultado fiscal.
 *
 * BENEFICIO = ventas del mes − gastos del mes.
 */

type TaxMode = 'with_tax' | 'without_tax'
export type PartnerChannel = 'boutique' | 'sastreria' | 'online'

export type PartnerSalesRow = {
  store_id: string
  store_name: string
  channel: PartnerChannel
  /** Importe vendido en el mes (devengo). */
  sales: number
  /** De ese importe, cuánto está cobrado a día de hoy. */
  collected: number
  /** Lo que queda por cobrar. */
  pending: number
  /** Nº de documentos (tickets / pedidos / pedidos web). */
  count: number
}

export type PartnerOtherMonthRow = {
  store_id: string
  store_name: string
  channel: PartnerChannel
  /** Mes al que pertenece la venta que se ha cobrado (YYYY-MM). */
  origin_month: string
  amount: number
}

export type PartnerExpenseRow = {
  store_id: string
  store_name: string
  amount: number
  count: number
}

export type PartnerMonth = {
  /** YYYY-MM */
  key: string
  label: string
  rows: PartnerSalesRow[]
  totals: { sales: number; collected: number; pending: number }
  other_months: { rows: PartnerOtherMonthRow[]; total: number }
  reservation_advances: { total: number; count: number }
  /** Tarjetas regalo vendidas: dinero cobrado que aún no es venta de género. */
  gift_cards: { total: number; count: number }
  expenses: { rows: PartnerExpenseRow[]; by_supplier: Array<{ supplier: string; amount: number }>; total: number; count: number }
  profit: number
  /** Dinero realmente entrado en el mes (ventas del mes cobradas + otros meses + señales). */
  cash_in: number
}

export type PartnersReport = {
  tax_mode: TaxMode
  start_date: string
  end_date: string
  months: PartnerMonth[]
  totals: {
    sales: number
    collected: number
    pending: number
    other_months: number
    reservation_advances: number
    gift_cards: number
    expenses: number
    profit: number
  }
}

const MONTH_NAMES = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
]

/** YYYY-MM de una fecha o timestamp, en local (las fechas del sistema ya lo son). */
function monthKey(value: string | null | undefined): string | null {
  if (!value) return null
  const s = String(value)
  if (s.length < 7) return null
  return s.slice(0, 7)
}

function monthLabel(key: string): string {
  const [y, m] = key.split('-')
  const idx = Number(m) - 1
  return `${MONTH_NAMES[idx] ?? m} ${y}`
}

/** Todos los meses entre dos fechas, ambos incluidos. */
function monthsBetween(start: string, end: string): string[] {
  const out: string[] = []
  let [y, m] = [Number(start.slice(0, 4)), Number(start.slice(5, 7))]
  const endY = Number(end.slice(0, 4))
  const endM = Number(end.slice(5, 7))
  while (y < endY || (y === endY && m <= endM)) {
    out.push(`${y}-${String(m).padStart(2, '0')}`)
    m++
    if (m > 12) { m = 1; y++ }
  }
  return out
}

export const getPartnersReport = protectedAction<
  { start_date: string; end_date: string; tax_mode?: TaxMode },
  PartnersReport
>(
  { permission: 'reports.view', auditModule: 'reports' },
  async (ctx, { start_date, end_date, tax_mode = 'without_tax' }) => {
    if (!start_date || !end_date) return failure('Falta el periodo del informe', 'VALIDATION')
    const net = tax_mode === 'without_tax'
    const startTs = `${start_date}T00:00:00`
    const endTs = `${end_date}T23:59:59`

    const [
      storesRes,
      salesRows,
      cobroBaseBySale,
      orderRows,
      onlineRows,
      salePayments,
      orderPayments,
      reservationPays,
      expenseRows,
    ] = await Promise.all([
      ctx.adminClient
        .from('stores')
        .select('id, name, display_name, store_type, is_active')
        .eq('is_active', true)
        .order('name'),

      // Boutique: cabeceras de ticket (misma fórmula que Dashboard/Contabilidad).
      readAllPaged<any>((f, t) => ctx.adminClient
        .from('sales')
        .select('id, created_at, store_id, subtotal, total, total_returned, amount_paid, sale_type, payment_status')
        .gte('created_at', startTs)
        .lte('created_at', endTs)
        .in('status', ['completed', 'partially_returned'])
        .order('created_at', { ascending: true })
        .range(f, t), 'partners.sales'),

      // Cobros de pedido embebidos en un ticket: ese dinero es del PEDIDO, no de
      // la boutique. Sin restarlo, la misma operación saldría en los dos canales.
      loadPedidoCobroBaseBySale(ctx.adminClient, startTs, endTs),

      // Sastrería: pedidos del mes por su importe completo.
      readAllPaged<any>((f, t) => ctx.adminClient
        .from('tailoring_orders')
        .select('id, order_date, store_id, subtotal, total, total_paid, total_pending, status')
        .gte('order_date', start_date)
        .lte('order_date', end_date)
        .neq('status', 'cancelled')
        .order('order_date', { ascending: true })
        .range(f, t), 'partners.orders'),

      // Tienda online: siempre cobrada (se paga en el checkout).
      readAllPaged<any>((f, t) => ctx.adminClient
        .from('online_orders')
        .select('id, order_number, subtotal, total, paid_at')
        .gte('paid_at', startTs)
        .lte('paid_at', endTs)
        .in('status', ['paid', 'processing', 'shipped', 'delivered'])
        .order('paid_at', { ascending: true })
        .range(f, t), 'partners.online'),

      // Cobros de TICKET del periodo, con la fecha del ticket al que pertenecen.
      readAllPaged<any>((f, t) => ctx.adminClient
        .from('sale_payments')
        .select('id, amount, created_at, sale:sales!inner(id, created_at, store_id, subtotal, total, status)')
        .gte('created_at', startTs)
        .lte('created_at', endTs)
        .in('sale.status', ['completed', 'partially_returned'])
        .order('created_at', { ascending: true })
        .range(f, t), 'partners.sale_payments'),

      // Cobros de PEDIDO del periodo, con la fecha del pedido al que pertenecen.
      readAllPaged<any>((f, t) => ctx.adminClient
        .from('tailoring_order_payments')
        .select('id, amount, payment_date, tailoring_order:tailoring_orders!inner(id, order_date, store_id, subtotal, total, status)')
        .gte('payment_date', start_date)
        .lte('payment_date', end_date)
        .order('payment_date', { ascending: true })
        .range(f, t), 'partners.order_payments'),

      // Señales de reserva: dinero cobrado sin venta todavía.
      loadReservationPayments(ctx.adminClient, start_date, end_date),

      // Gastos: facturas recibidas del periodo (sin proformas), como Contabilidad.
      readAllPaged<any>((f, t) => ctx.adminClient
        .from('ap_supplier_invoices')
        .select('id, invoice_date, store_id, supplier_name, amount, tax_amount, total_amount, is_proforma')
        .eq('is_proforma', false)
        .gte('invoice_date', start_date)
        .lte('invoice_date', end_date)
        .order('invoice_date', { ascending: true })
        .range(f, t), 'partners.expenses'),
    ])

    const storeNames = new Map<string, string>()
    for (const s of ((storesRes as any).data ?? []) as any[]) {
      storeNames.set(String(s.id), s.display_name || s.name || 'Tienda')
    }
    const storeName = (id: string | null | undefined): string => {
      if (!id) return 'Sin tienda'
      return storeNames.get(String(id)) ?? 'Tienda dada de baja'
    }

    // ── Acumuladores por mes ────────────────────────────────────────────────
    const months = new Map<string, PartnerMonth>()
    const ensureMonth = (key: string): PartnerMonth => {
      let m = months.get(key)
      if (!m) {
        m = {
          key,
          label: monthLabel(key),
          rows: [],
          totals: { sales: 0, collected: 0, pending: 0 },
          other_months: { rows: [], total: 0 },
          reservation_advances: { total: 0, count: 0 },
          gift_cards: { total: 0, count: 0 },
          expenses: { rows: [], by_supplier: [], total: 0, count: 0 },
          profit: 0,
          cash_in: 0,
        }
        months.set(key, m)
      }
      return m
    }
    for (const key of monthsBetween(start_date, end_date)) ensureMonth(key)

    const salesKey = (monthK: string, storeId: string, channel: PartnerChannel) => `${monthK}|${storeId}|${channel}`
    const salesAcc = new Map<string, PartnerSalesRow>()
    const addSale = (
      monthK: string,
      storeId: string | null,
      channel: PartnerChannel,
      sales: number,
      collected: number,
    ) => {
      const sid = storeId ?? 'sin-tienda'
      const k = salesKey(monthK, sid, channel)
      let row = salesAcc.get(k)
      if (!row) {
        row = { store_id: sid, store_name: storeName(storeId), channel, sales: 0, collected: 0, pending: 0, count: 0 }
        salesAcc.set(k, row)
      }
      row.sales += sales
      row.collected += Math.min(collected, sales)
      row.pending += Math.max(0, sales - collected)
      row.count += 1
      return row
    }

    // ── Boutique ────────────────────────────────────────────────────────────
    for (const sale of salesRows) {
      const key = monthKey(sale.created_at)
      if (!key) continue
      const total = Number(sale.total) || 0
      const returned = Number(sale.total_returned) || 0
      const alive = total > 0 ? Math.max(0, (total - returned) / total) : 0

      // Las líneas de cobro de pedido van al 0% de IVA: su importe es base pura
      // y se resta igual del bruto y de la base.
      const cobroBase = cobroBaseBySale.get(String(sale.id)) || 0
      const bruto = Math.max(0, total * alive - cobroBase * alive)
      const base = Math.max(0, (Number(sale.subtotal) || 0) * alive - cobroBase * alive)
      const amount = net ? base : bruto
      if (amount <= 0) continue

      // Vender una tarjeta regalo no es vender género: es dinero cobrado a
      // cuenta. La venta se reconoce cuando el cliente canjea la tarjeta (ese
      // ticket sí entra como boutique). Contarla aquí la sumaría dos veces.
      if (sale.sale_type === 'gift_card') {
        const m = ensureMonth(key)
        m.gift_cards.total += amount
        m.gift_cards.count += 1
        continue
      }

      // Cobrado del ticket, prorrateado igual que el importe.
      const paid = Number(sale.amount_paid ?? 0) || 0
      const paidShare = total > 0 ? Math.min(1, paid / total) : 0
      addSale(key, sale.store_id ?? null, 'boutique', amount, amount * paidShare)
    }

    // ── Sastrería (pedidos del mes, por su importe completo) ────────────────
    for (const order of orderRows) {
      const key = monthKey(order.order_date)
      if (!key) continue
      const total = Number(order.total) || 0
      if (total <= 0) continue
      const amount = net ? (Number(order.subtotal) || 0) : total
      const paid = Math.min(total, Number(order.total_paid ?? 0) || 0)
      const paidShare = total > 0 ? paid / total : 0
      addSale(key, order.store_id ?? null, 'sastreria', amount, amount * paidShare)
    }

    // ── Tienda online (no tiene tienda física) ──────────────────────────────
    for (const web of onlineRows) {
      const key = monthKey(web.paid_at)
      if (!key) continue
      const amount = net ? (Number(web.subtotal) || 0) : (Number(web.total) || 0)
      if (amount <= 0) continue
      addSale(key, null, 'online', amount, amount)
    }

    // ── Cobros que son de OTRO mes ──────────────────────────────────────────
    const otherAcc = new Map<string, PartnerOtherMonthRow>()
    const addOther = (
      monthK: string,
      storeId: string | null,
      channel: PartnerChannel,
      originMonth: string,
      amount: number,
    ) => {
      const sid = storeId ?? 'sin-tienda'
      const k = `${monthK}|${sid}|${channel}|${originMonth}`
      let row = otherAcc.get(k)
      if (!row) {
        row = { store_id: sid, store_name: storeName(storeId), channel, origin_month: originMonth, amount: 0 }
        otherAcc.set(k, row)
      }
      row.amount += amount
      return row
    }

    for (const p of salePayments) {
      const paidMonth = monthKey(p.created_at)
      const sale = p.sale
      const saleMonth = monthKey(sale?.created_at)
      if (!paidMonth || !saleMonth || paidMonth === saleMonth) continue
      const total = Number(sale?.total) || 0
      const subtotal = Number(sale?.subtotal) || 0
      // El cobro llega con IVA: para el informe sin IVA se lleva a base con la
      // proporción del propio ticket, igual que en Contabilidad.
      const ratio = net && total > 0 ? subtotal / total : 1
      addOther(paidMonth, sale?.store_id ?? null, 'boutique', saleMonth, (Number(p.amount) || 0) * ratio)
    }

    for (const p of orderPayments) {
      const paidMonth = monthKey(p.payment_date)
      const order = p.tailoring_order
      const orderMonth = monthKey(order?.order_date)
      if (!paidMonth || !orderMonth || paidMonth === orderMonth) continue
      if (order?.status === 'cancelled') continue
      const total = Number(order?.total) || 0
      const subtotal = Number(order?.subtotal) || 0
      const ratio = net && total > 0 ? subtotal / total : 1
      addOther(paidMonth, order?.store_id ?? null, 'sastreria', orderMonth, (Number(p.amount) || 0) * ratio)
    }

    // ── Señales de reserva (dinero sin venta todavía) ───────────────────────
    for (const r of reservationPays) {
      const key = monthKey(r.paymentDate)
      if (!key) continue
      const m = ensureMonth(key)
      m.reservation_advances.total += net ? r.base : r.amount
      m.reservation_advances.count += 1
    }

    // ── Gastos ──────────────────────────────────────────────────────────────
    const expenseAcc = new Map<string, PartnerExpenseRow>()
    const supplierAcc = new Map<string, { supplier: string; amount: number }>()
    for (const inv of expenseRows) {
      const key = monthKey(inv.invoice_date)
      if (!key) continue
      const base = Number(inv.amount) || 0
      const total = Number(inv.total_amount) || (base + (Number(inv.tax_amount) || 0))
      const amount = net ? base : total
      const sid = inv.store_id ? String(inv.store_id) : 'sin-asignar'
      const k = `${key}|${sid}`
      let row = expenseAcc.get(k)
      if (!row) {
        row = {
          store_id: sid,
          store_name: inv.store_id ? storeName(inv.store_id) : 'Sin asignar a tienda',
          amount: 0,
          count: 0,
        }
        expenseAcc.set(k, row)
      }
      row.amount += amount
      row.count += 1

      const supplier = (inv.supplier_name || 'Sin proveedor').trim()
      const sk = `${key}|${supplier}`
      const srow = supplierAcc.get(sk) ?? { supplier, amount: 0 }
      srow.amount += amount
      supplierAcc.set(sk, srow)

      const m = ensureMonth(key)
      m.expenses.total += amount
      m.expenses.count += 1
    }

    // ── Volcar los acumuladores en cada mes ─────────────────────────────────
    for (const [k, row] of salesAcc) {
      const m = ensureMonth(k.split('|')[0])
      m.rows.push(row)
      m.totals.sales += row.sales
      m.totals.collected += row.collected
      m.totals.pending += row.pending
    }
    for (const [k, row] of otherAcc) {
      const m = ensureMonth(k.split('|')[0])
      m.other_months.rows.push(row)
      m.other_months.total += row.amount
    }
    for (const [k, row] of expenseAcc) {
      const m = ensureMonth(k.split('|')[0])
      m.expenses.rows.push(row)
    }
    for (const [k, row] of supplierAcc) {
      const m = ensureMonth(k.split('|')[0])
      m.expenses.by_supplier.push(row)
    }

    const CHANNEL_ORDER: Record<PartnerChannel, number> = { boutique: 0, sastreria: 1, online: 2 }
    const out = [...months.values()].sort((a, b) => a.key.localeCompare(b.key))
    for (const m of out) {
      m.rows.sort((a, b) => a.store_name.localeCompare(b.store_name) || CHANNEL_ORDER[a.channel] - CHANNEL_ORDER[b.channel])
      m.other_months.rows.sort((a, b) => a.origin_month.localeCompare(b.origin_month) || a.store_name.localeCompare(b.store_name))
      m.expenses.rows.sort((a, b) => b.amount - a.amount)
      m.expenses.by_supplier.sort((a, b) => b.amount - a.amount)
      m.profit = m.totals.sales - m.expenses.total
      m.cash_in = m.totals.collected + m.other_months.total + m.reservation_advances.total + m.gift_cards.total
    }

    const totals = out.reduce((acc, m) => ({
      sales: acc.sales + m.totals.sales,
      collected: acc.collected + m.totals.collected,
      pending: acc.pending + m.totals.pending,
      other_months: acc.other_months + m.other_months.total,
      reservation_advances: acc.reservation_advances + m.reservation_advances.total,
      gift_cards: acc.gift_cards + m.gift_cards.total,
      expenses: acc.expenses + m.expenses.total,
      profit: acc.profit + m.profit,
    }), { sales: 0, collected: 0, pending: 0, other_months: 0, reservation_advances: 0, gift_cards: 0, expenses: 0, profit: 0 })

    return success({ tax_mode, start_date, end_date, months: out, totals })
  },
)
