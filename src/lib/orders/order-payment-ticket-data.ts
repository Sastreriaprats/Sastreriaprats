/* eslint-disable @typescript-eslint/no-explicit-any -- el cliente admin de Supabase es any por diseño; las filas leídas se castean puntualmente */
// Datos del TICKET DE UN COBRO de pedido de sastrería (serie CLP-P, mig 291)
// con la forma que espera generateTicketPdf. El PDF se genera en el navegador.
//
// El ticket refleja SOLO lo cobrado en ese pago (base + IVA prorrateados con
// subtotal/total del pedido, mismo criterio que Contabilidad). Debajo, el
// estado del pedido en ese momento: total, pagado hasta ese cobro (incluido)
// y pendiente. Así cada entrega a cuenta tiene su propio ticket para Hacienda.

import type { TicketPdfData } from '@/components/pos/ticket-pdf'
import { STORE_PDF_CONFIGS } from '@/lib/pdf/pdf-company'

type AdminClient = { from: (table: string) => any }

const r2 = (n: number) => Math.round(n * 100) / 100

// "Americana — Traje 1" → "Traje 1" (igual que el resguardo del pedido)
function garmentGroupName(line: Record<string, any>): string {
  const cfg = (line.configuration ?? {}) as Record<string, unknown>
  const raw = (typeof cfg.prendaLabel === 'string' && cfg.prendaLabel)
    || (typeof cfg.product_name === 'string' && cfg.product_name)
    || line.garment_types?.name
    || 'Prenda'
  const m = String(raw).match(/\s*(?:—|–|-)\s*(.+)$/)
  return m ? m[1].trim() : String(raw)
}

export async function buildOrderPaymentTicketPdfData(admin: AdminClient, paymentId: string): Promise<TicketPdfData | null> {
  const { data: payment } = await admin
    .from('tailoring_order_payments')
    .select('id, tailoring_order_id, ticket_number, payment_date, payment_method, amount, created_at')
    .eq('id', paymentId)
    .maybeSingle()
  const p = payment as Record<string, any> | null
  if (!p?.ticket_number) return null

  const [{ data: order }, { data: allPayments }] = await Promise.all([
    admin
      .from('tailoring_orders')
      .select('order_number, subtotal, total, client_id, stores(name), clients(full_name, client_code), tailoring_order_lines(configuration, garment_types(name))')
      .eq('id', p.tailoring_order_id)
      .maybeSingle(),
    admin
      .from('tailoring_order_payments')
      .select('id, amount, payment_date, created_at')
      .eq('tailoring_order_id', p.tailoring_order_id),
  ])
  const o = order as Record<string, any> | null
  if (!o) return null

  const amount = r2(Number(p.amount) || 0)
  const orderTotal = r2(Number(o.total) || 0)
  const orderSub = Number(o.subtotal) || 0
  const ratio = orderTotal > 0 && orderSub > 0 ? orderSub / orderTotal : 1 / 1.21
  const base = r2(amount * ratio)
  const vat = r2(amount - base)

  // Pagado hasta ESTE cobro (incluido): reimprimir un ticket antiguo muestra el
  // estado del pedido en aquel momento, no el de hoy.
  const key = (x: Record<string, any>) => `${String(x.payment_date ?? '').slice(0, 10)}|${x.created_at ?? ''}|${x.id}`
  const myKey = key(p)
  const paidToDate = r2(((allPayments ?? []) as Record<string, any>[])
    .filter((x) => key(x) <= myKey)
    .reduce((s, x) => s + (Number(x.amount) || 0), 0))
  const pending = r2(Math.max(0, orderTotal - paidToDate))

  const items = [...new Set(((o.tailoring_order_lines ?? []) as Record<string, any>[]).map(garmentGroupName))]
  const orderNumber = String(o.order_number ?? '')
  const concept = pending <= 0.009 ? `Liquidación pedido ${orderNumber}` : `Entrega a cuenta pedido ${orderNumber}`

  // Fecha del ticket = fecha del cobro. La hora, la del registro si es el mismo día.
  const payDate = String(p.payment_date ?? '').slice(0, 10)
  const createdAt = String(p.created_at ?? '')
  const createdLocalDay = createdAt ? new Date(createdAt).toLocaleDateString('sv-SE', { timeZone: 'Europe/Madrid' }) : ''
  const ticketDate = !payDate || createdLocalDay === payDate ? (createdAt || new Date().toISOString()) : `${payDate}T12:00:00`

  const storeName = String(o.stores?.name ?? '').toLowerCase()
  const store = /wellington|vel[aá]zquez/.test(storeName) ? STORE_PDF_CONFIGS.wellington : STORE_PDF_CONFIGS.pinzon
  const method = String(p.payment_method ?? 'card')

  return {
    sale: {
      ticket_number: String(p.ticket_number),
      created_at: ticketDate,
      client_id: o.client_id ?? null,
      subtotal: base,
      tax_amount: vat,
      total: amount,
      payment_method: method,
    },
    lines: [{ description: concept, quantity: 1, unit_price: amount, discount_percentage: 0, line_total: amount, tax_rate: 21 }],
    payments: [{ payment_method: method, amount }],
    clientName: (o.clients?.full_name as string | undefined)?.trim() || null,
    clientCode: o.clients?.client_code ?? null,
    storeAddress: store.address,
    storePhones: store.phones,
    orderSummary: { orderNumber, items, total: orderTotal, paid: paidToDate, pending },
  }
}
