/* eslint-disable @typescript-eslint/no-explicit-any -- el cliente admin de Supabase es any por diseño; las filas leídas se castean puntualmente */
// CRITERIO DE VENTA: "manda la factura" (decisión del asesor, sep-2026).
//
// Desde DOC_RULE_START, una factura emitida ES la venta: cuenta en su fecha, con
// su IVA, esté cobrada o no, y el ticket/cobro al que sustituye deja de contar.
// Lo que no se factura sigue contando por su ticket o su cobro, como siempre.
//
// Lo ya presentado no se toca. Si la factura sustituye a cobros declarados en un
// TRIMESTRE anterior, aquel trimestre se queda como está y en la fecha de la
// factura entra un ABONO por lo ya declarado (con su IVA en negativo), de modo
// que el año suma cada euro una vez.
//
// Las facturas ANTERIORES al corte ligadas a un ticket/pedido/reserva siguen sin
// contar (su dinero se declaró por los cobros): son informativas.
//
// Este módulo es la única fuente de la regla; lo usan la contabilidad normal
// (accounting.ts) y las capas internas (ops.ts) para no divergir.

import { loadPedidoCobroBaseBySale } from './pedido-cobro-lines'
import { loadReservationPaymentsFor } from './reservation-payments'

type AdminClient = { from: (table: string) => any }

/** Desde esta fecha de factura manda el documento. */
export const DOC_RULE_START = '2026-07-01'
/** Cómo se dice esa fecha en pantalla. */
export const DOC_RULE_LABEL = '1 de julio de 2026'

const SALE_STATUSES = ['completed', 'partially_returned']
const PAGE = 1000

const quarterKey = (date: string) => `${date.slice(0, 4)}-${Math.ceil(Number(date.slice(5, 7)) / 3)}`

/** Factura emitida que cuenta como venta, con lo que sustituye. */
export type InvoiceSaleDoc = {
  id: string
  number: string
  /** YYYY-MM-DD */
  date: string
  /** Base del DOCUMENTO (lo que dice la factura). */
  base: number
  vat: number
  total: number
  /**
   * Lo que cuenta como ingreso. Es la base del documento menos los cobros de
   * pedido embebidos en el ticket que factura (líneas "Pedido sastrería - PIN-…"
   * al 0 %): ese dinero lo aporta el pedido, no el ticket, igual que en el
   * propio ticket. Si la factura solo era ese cobro, queda en 0 y no suma.
   */
  incomeBase: number
  incomeVat: number
  clientName: string | null
  storeId: string | null
  onlineOrderId: string | null
  pdfUrl?: string
  paymentMethod: string
  /** Ligada a ticket/pedido/reserva (false = factura suelta: web, comisión…). */
  linked: boolean
  /** Cobrado por sus cobros ligados (cualquier fecha), con IVA. */
  collected: number
  /** Parte de lo cobrado que fue en efectivo (0..1). Sin cobros, 0. */
  cashShare: number
  /** Ya declarado en un trimestre anterior → se abona en la fecha de la factura. */
  declared: { cashBase: number; cashVat: number; ncBase: number; ncVat: number }
}

export type InvoiceSalesPlan = {
  /** Facturas que cuentan como venta, ordenadas por fecha. */
  docs: InvoiceSaleDoc[]
  byId: Map<string, InvoiceSaleDoc>
  /** Ligadas anteriores al corte: siguen sin contar (informativas). */
  informativeIds: Set<string>
  /** Cobros que la factura sustituye: NO cuentan por su lado. */
  skipSaleIds: Set<string>
  skipOrderPaymentIds: Set<string>
  skipReservationPaymentIds: Set<string>
  /** Cobrado por factura (id → importe con IVA), solo facturas ligadas. */
  collectedByInvoice: Map<string, number>
}

const emptyPlan = (): InvoiceSalesPlan => ({
  docs: [], byId: new Map(), informativeIds: new Set(),
  skipSaleIds: new Set(), skipOrderPaymentIds: new Set(), skipReservationPaymentIds: new Set(),
  collectedByInvoice: new Map(),
})

async function readPaged(run: (from: number, to: number) => Promise<{ data: unknown[] | null }>) {
  const out: any[] = []
  for (let from = 0; ; from += PAGE) {
    const { data } = await run(from, from + PAGE - 1)
    const batch = (data ?? []) as any[]
    out.push(...batch)
    if (batch.length < PAGE) break
  }
  return out
}

/**
 * Facturas emitidas con fecha en [fromDate, toDate] que cuentan como venta, con
 * los cobros a los que sustituyen y lo que hay que abonar. Las fechas son
 * YYYY-MM-DD (se admite timestamp: se usa su parte de fecha).
 */
export async function loadInvoiceSalesPlan(
  admin: AdminClient,
  fromDate: string,
  toDate: string,
): Promise<InvoiceSalesPlan> {
  const from = fromDate.slice(0, 10)
  const to = toDate.slice(0, 10)
  const invoices = await readPaged((f, t) => admin.from('invoices')
    .select('id, invoice_number, client_name, invoice_date, subtotal, tax_amount, total, payment_method, pdf_url, store_id, sale_id, tailoring_order_id, reservation_id, online_order_id')
    .eq('invoice_type', 'issued')
    .not('status', 'in', '(draft,cancelled)')
    .gte('invoice_date', from).lte('invoice_date', to)
    .order('invoice_date', { ascending: true })
    .range(f, t))
  if (invoices.length === 0) return emptyPlan()

  // Enlaces: columnas escalares + tablas puente (una factura puede cubrir varios
  // pedidos y reservas; el escalar solo guarda el primero).
  const linkIds = new Map<string, { orders: Set<string>; reservations: Set<string> }>()
  const cell = (invoiceId: string) => {
    let c = linkIds.get(invoiceId)
    if (!c) { c = { orders: new Set(), reservations: new Set() }; linkIds.set(invoiceId, c) }
    return c
  }
  for (const x of invoices) {
    if (x.tailoring_order_id) cell(String(x.id)).orders.add(String(x.tailoring_order_id))
    if (x.reservation_id) cell(String(x.id)).reservations.add(String(x.reservation_id))
  }
  const invoiceIds = invoices.map((x) => String(x.id))
  for (let i = 0; i < invoiceIds.length; i += 200) {
    const chunk = invoiceIds.slice(i, i + 200)
    const [orders, reservations] = await Promise.all([
      admin.from('invoice_tailoring_orders').select('invoice_id, tailoring_order_id').in('invoice_id', chunk),
      admin.from('invoice_reservations').select('invoice_id, reservation_id').in('invoice_id', chunk),
    ])
    for (const r of ((orders as any).data ?? []) as any[]) cell(String(r.invoice_id)).orders.add(String(r.tailoring_order_id))
    for (const r of ((reservations as any).data ?? []) as any[]) cell(String(r.invoice_id)).reservations.add(String(r.reservation_id))
  }

  const plan = emptyPlan()
  // Fuente → factura que la cubre (la más antigua manda si hay varias).
  const docBySale = new Map<string, InvoiceSaleDoc>()
  const docByOrder = new Map<string, InvoiceSaleDoc>()
  const docByReservation = new Map<string, InvoiceSaleDoc>()
  const claim = (map: Map<string, InvoiceSaleDoc>, key: string, d: InvoiceSaleDoc) => {
    const cur = map.get(key)
    if (!cur || d.date < cur.date) map.set(key, d)
  }
  for (const x of invoices) {
    const id = String(x.id)
    const date = String(x.invoice_date ?? '').slice(0, 10)
    if (!date) continue
    const links = linkIds.get(id)
    const saleId = x.sale_id ? String(x.sale_id) : null
    const orderIds = links?.orders ?? new Set<string>()
    const reservationIds = links?.reservations ?? new Set<string>()
    const linked = !!saleId || orderIds.size > 0 || reservationIds.size > 0
    if (linked && date < DOC_RULE_START) { plan.informativeIds.add(id); continue }
    const total = Number(x.total) || 0
    const vat = Number(x.tax_amount) || 0
    const doc: InvoiceSaleDoc = {
      id, date, linked, total, vat,
      number: String(x.invoice_number ?? ''),
      base: Number(x.subtotal) || (total - vat),
      incomeBase: Number(x.subtotal) || (total - vat),
      incomeVat: vat,
      clientName: x.client_name ? String(x.client_name) : null,
      storeId: x.store_id ? String(x.store_id) : null,
      onlineOrderId: x.online_order_id ? String(x.online_order_id) : null,
      pdfUrl: x.pdf_url ? String(x.pdf_url) : undefined,
      paymentMethod: String(x.payment_method ?? ''),
      collected: 0, cashShare: 0,
      declared: { cashBase: 0, cashVat: 0, ncBase: 0, ncVat: 0 },
    }
    plan.docs.push(doc)
    plan.byId.set(id, doc)
    if (saleId) claim(docBySale, saleId, doc)
    for (const o of orderIds) claim(docByOrder, o, doc)
    for (const r of reservationIds) claim(docByReservation, r, doc)
  }
  if (plan.docs.length === 0) return plan

  // ¿La factura sustituye a este cobro, o el cobro ya se declaró en un trimestre
  // cerrado? Mismo trimestre (o cobro posterior) → lo sustituye.
  const replaces = (paymentDate: string, d: InvoiceSaleDoc) =>
    quarterKey(paymentDate) === quarterKey(d.date) || paymentDate >= d.date

  // Lo cobrado en efectivo por factura, para repartirla entre capas (B/C).
  const cashByDoc = new Map<string, number>()
  const addCash = (d: InvoiceSaleDoc, amount: number) => cashByDoc.set(d.id, (cashByDoc.get(d.id) ?? 0) + amount)

  // --- Tickets facturados -----------------------------------------------------
  const saleIds = [...docBySale.keys()]
  if (saleIds.length) {
    const sales: any[] = []
    for (let i = 0; i < saleIds.length; i += 200) {
      const { data } = await admin.from('sales')
        .select('id, subtotal, tax_amount, total, total_returned, created_at, payment_method')
        .in('id', saleIds.slice(i, i + 200))
        .in('status', SALE_STATUSES)
      sales.push(...((data ?? []) as any[]))
    }
    // Parte en efectivo real de cada venta y base de cobros de pedido embebidos
    // (esa base la aporta el pedido, no el ticket).
    const cashBySale = new Map<string, number>()
    for (let i = 0; i < saleIds.length; i += 200) {
      const { data } = await admin.from('sale_payments')
        .select('sale_id, payment_method, amount')
        .in('sale_id', saleIds.slice(i, i + 200))
      for (const p of ((data ?? []) as any[])) {
        if (String(p.payment_method) !== 'cash') continue
        const k = String(p.sale_id)
        cashBySale.set(k, (cashBySale.get(k) ?? 0) + (Number(p.amount) || 0))
      }
    }
    const minDate = sales.reduce((min, s) => (String(s.created_at) < min ? String(s.created_at) : min), '9999')
    const cobroBase = sales.length
      ? await loadPedidoCobroBaseBySale(admin, minDate.slice(0, 10), `${to}T23:59:59`)
      : new Map<string, number>()
    for (const s of sales) {
      const d = docBySale.get(String(s.id))
      if (!d) continue
      const total = Number(s.total) || 0
      const returned = Number(s.total_returned) || 0
      const prop = total > 0 ? Math.max(0, (total - returned) / total) : 0
      const netTotal = Math.max(0, total - returned)
      const base = Math.max(0, (Number(s.subtotal) || total) - (cobroBase.get(String(s.id)) || 0)) * prop
      const vat = (Number(s.tax_amount) || 0) * prop
      const cash = Math.min(netTotal, cashBySale.get(String(s.id)) ?? (String(s.payment_method) === 'cash' ? netTotal : 0))
      // El cobro de pedido embebido en el ticket no lo aporta esta factura: ese
      // dinero va por el pedido (que tiene sus cobros o su propia factura). Se
      // descuenta del TOTAL (el importe embebido es bruto) y lo que queda se
      // reparte base/IVA con la proporción de la propia factura, que puede
      // llevar otro tipo que el ticket.
      const embedded = (cobroBase.get(String(s.id)) || 0) * prop
      if (embedded > 0) {
        const ratio = d.total > 0 ? d.base / d.total : 1
        const rest = Math.max(0, d.total - embedded)
        d.incomeBase = rest * ratio
        d.incomeVat = rest - d.incomeBase
      }
      d.collected += netTotal
      addCash(d, cash)
      const date = String(s.created_at).slice(0, 10)
      if (replaces(date, d)) { plan.skipSaleIds.add(String(s.id)); continue }
      // Declarado en un trimestre anterior: se abona con la fecha de la factura.
      const fr = netTotal > 0 ? cash / netTotal : 0
      d.declared.cashBase += base * fr; d.declared.cashVat += vat * fr
      d.declared.ncBase += base * (1 - fr); d.declared.ncVat += vat * (1 - fr)
    }
  }

  // --- Cobros de pedidos de sastrería facturados ------------------------------
  const orderIds = [...docByOrder.keys()]
  if (orderIds.length) {
    const payments: any[] = []
    for (let i = 0; i < orderIds.length; i += 200) {
      const { data } = await admin.from('tailoring_order_payments')
        .select('id, amount, payment_date, payment_method, tailoring_order_id, tailoring_order:tailoring_orders(subtotal, total)')
        .in('tailoring_order_id', orderIds.slice(i, i + 200))
      payments.push(...((data ?? []) as any[]))
    }
    for (const p of payments) {
      const d = docByOrder.get(String(p.tailoring_order_id))
      if (!d) continue
      const amount = Number(p.amount) || 0
      const order = p.tailoring_order || {}
      const oTotal = Number(order.total) || 0
      const ratio = oTotal > 0 ? (Number(order.subtotal) || 0) / oTotal : 1
      const base = amount * ratio
      const isCash = String(p.payment_method) === 'cash'
      d.collected += amount
      if (isCash) addCash(d, amount)
      const date = String(p.payment_date ?? '').slice(0, 10)
      if (replaces(date, d)) { plan.skipOrderPaymentIds.add(String(p.id)); continue }
      if (isCash) { d.declared.cashBase += base; d.declared.cashVat += amount - base }
      else { d.declared.ncBase += base; d.declared.ncVat += amount - base }
    }
  }

  // --- Señales de reservas facturadas -----------------------------------------
  const reservationIds = [...docByReservation.keys()]
  if (reservationIds.length) {
    const payments = await loadReservationPaymentsFor(admin, reservationIds)
    for (const p of payments) {
      const d = docByReservation.get(p.reservationId)
      if (!d) continue
      const isCash = p.method === 'cash'
      d.collected += p.amount
      if (isCash) addCash(d, p.amount)
      if (replaces(p.paymentDate, d)) { plan.skipReservationPaymentIds.add(p.id); continue }
      if (isCash) { d.declared.cashBase += p.base; d.declared.cashVat += p.vat }
      else { d.declared.ncBase += p.base; d.declared.ncVat += p.vat }
    }
  }

  for (const d of plan.docs) {
    const cash = cashByDoc.get(d.id) ?? 0
    d.cashShare = d.collected > 0.0001 ? Math.min(1, Math.max(0, cash / d.collected)) : 0
    if (d.linked) plan.collectedByInvoice.set(d.id, Math.round(d.collected * 100) / 100)
  }
  plan.docs.sort((a, b) => a.date.localeCompare(b.date))
  return plan
}
