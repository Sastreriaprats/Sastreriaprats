/* eslint-disable @typescript-eslint/no-explicit-any -- el cliente admin de Supabase es any por diseño; las filas leídas se castean puntualmente */
// Datos del TICKET DE UN COBRO de reserva (serie CLP-R, mig 292) con la forma
// que espera generateTicketPdf. El PDF se genera en el navegador.
//
// Gemelo de `order-payment-ticket-data.ts` (cobros de pedido, serie CLP-P): el
// ticket refleja SOLO lo cobrado en ese pago, y debajo el estado de la reserva
// en ese momento (total, pagado hasta ese cobro incluido y pendiente).
//
// Motivo (David, 24-sep-2026, caso RSV-2026-0169): se cobraron 660 € de una
// reserva y no había ningún papel del cobro, porque el ticket de la recogida
// sale a 0 € (el TPV descuenta lo ya pagado).
//
// La base y el IVA salen de `loadReservationPaymentsFor`, el mismo helper que
// usa Contabilidad: así el ticket y el libro dicen lo mismo aunque la reserva
// mezcle artículos con tipos de IVA distintos.

import type { TicketPdfData } from '@/components/pos/ticket-pdf'
import { STORE_PDF_CONFIGS } from '@/lib/pdf/pdf-company'
import { loadReservationPaymentsFor } from '@/lib/accounting/reservation-payments'

type AdminClient = { from: (table: string) => any }

const r2 = (n: number) => Math.round(n * 100) / 100

export async function buildReservationPaymentTicketPdfData(
  admin: AdminClient,
  paymentId: string,
): Promise<TicketPdfData | null> {
  const { data: payment } = await admin
    .from('product_reservation_payments')
    .select('id, product_reservation_id, ticket_number, payment_date, payment_method, amount, created_at')
    .eq('id', paymentId)
    .maybeSingle()
  const p = payment as Record<string, any> | null
  if (!p?.ticket_number) return null

  const [{ data: reservation }, { data: allPayments }] = await Promise.all([
    admin
      .from('product_reservations')
      .select(`
        reservation_number, total, client_id, store_id,
        stores(name),
        clients(full_name, client_code),
        product_reservation_lines(
          quantity, status,
          product_variants(size, color, products(name))
        )
      `)
      .eq('id', p.product_reservation_id)
      .maybeSingle(),
    admin
      .from('product_reservation_payments')
      .select('id, amount, payment_date, created_at')
      .eq('product_reservation_id', p.product_reservation_id),
  ])
  const res = reservation as Record<string, any> | null
  if (!res) return null

  const amount = r2(Number(p.amount) || 0)

  // Base/IVA con el criterio de Contabilidad (ponderado por las líneas).
  // Si el helper no encuentra el cobro, se cae al 21% general.
  let base = r2(amount / 1.21)
  let vat = r2(amount - base)
  try {
    const income = await loadReservationPaymentsFor(admin as never, [String(p.product_reservation_id)])
    const mine = income.find((x) => String(x.id) === String(p.id))
    if (mine) {
      base = r2(mine.base)
      vat = r2(mine.vat)
    }
  } catch {
    // Sin el desglose fino, el 21% general ya deja el ticket utilizable.
  }

  // Pagado hasta ESTE cobro (incluido): reimprimir un ticket antiguo muestra el
  // estado de la reserva en aquel momento, no el de hoy.
  const key = (x: Record<string, any>) => `${String(x.payment_date ?? '').slice(0, 10)}|${x.created_at ?? ''}|${x.id}`
  const myKey = key(p)
  const reservationTotal = r2(Number(res.total) || 0)
  const paidToDate = r2(((allPayments ?? []) as Record<string, any>[])
    .filter((x) => key(x) <= myKey)
    .reduce((s, x) => s + (Number(x.amount) || 0), 0))
  const pending = r2(Math.max(0, reservationTotal - paidToDate))

  const items = ((res.product_reservation_lines ?? []) as Record<string, any>[])
    .filter((l) => l.status !== 'cancelled')
    .map((l) => {
      const v = l.product_variants as Record<string, any> | null
      const name = String(v?.products?.name ?? 'Artículo')
      const bits = [v?.size ? `T.${v.size}` : null, v?.color].filter(Boolean)
      return bits.length ? `${name} (${bits.join(' · ')})` : name
    })

  const reservationNumber = String(res.reservation_number ?? '')
  const concept = pending <= 0.009
    ? `Liquidación reserva ${reservationNumber}`
    : `Entrega a cuenta reserva ${reservationNumber}`

  // Fecha del ticket = fecha del cobro. La hora, la del registro si es el mismo día.
  const payDate = String(p.payment_date ?? '').slice(0, 10)
  const createdAt = String(p.created_at ?? '')
  const createdLocalDay = createdAt ? new Date(createdAt).toLocaleDateString('sv-SE', { timeZone: 'Europe/Madrid' }) : ''
  const ticketDate = !payDate || createdLocalDay === payDate ? (createdAt || new Date().toISOString()) : `${payDate}T12:00:00`

  const storeName = String(res.stores?.name ?? '').toLowerCase()
  const store = /wellington|vel[aá]zquez/.test(storeName) ? STORE_PDF_CONFIGS.wellington : STORE_PDF_CONFIGS.pinzon
  const method = String(p.payment_method ?? 'card')

  return {
    sale: {
      ticket_number: String(p.ticket_number),
      created_at: ticketDate,
      client_id: res.client_id ?? null,
      subtotal: base,
      tax_amount: vat,
      total: amount,
      payment_method: method,
    },
    lines: [{ description: concept, quantity: 1, unit_price: amount, discount_percentage: 0, line_total: amount, tax_rate: vat > 0 && base > 0 ? r2((vat / base) * 100) : 21 }],
    payments: [{ payment_method: method, amount }],
    clientName: (res.clients?.full_name as string | undefined)?.trim() || null,
    clientCode: res.clients?.client_code ?? null,
    storeAddress: store.address,
    storePhones: store.phones,
    orderSummary: {
      label: 'Reserva',
      orderNumber: reservationNumber,
      items: [...new Set(items)],
      total: reservationTotal,
      paid: paidToDate,
      pending,
    },
  }
}
