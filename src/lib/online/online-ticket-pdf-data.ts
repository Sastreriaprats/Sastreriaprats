/* eslint-disable @typescript-eslint/no-explicit-any -- el cliente admin de Supabase es any por diseño; las filas leídas se castean puntualmente */
// Datos del TICKET de un pedido online (mig 286) con la forma que espera
// generateTicketPdf, para descargarlo desde Tickets → Online y desde el
// escenario C. El PDF se genera en el navegador, como el de los tickets de TPV.
//
// Líneas = las del pedido en el momento del cobro (mismo criterio que la
// factura W), más los gastos de envío. El descuento (cupón o tarjeta regalo) es
// la diferencia entre líneas + envío y lo cobrado. Base/IVA desde el total.

import type { TicketPdfData, TicketLinePayload } from '@/components/pos/ticket-pdf'
import { STORE_PDF_CONFIGS } from '@/lib/pdf/pdf-company'
import { splitOnlineTotal } from '@/lib/accounting/online-ticket-income'

type AdminClient = { from: (table: string) => any }

const r2 = (n: number) => Math.round(n * 100) / 100

export async function buildOnlineTicketPdfData(admin: AdminClient, orderId: string): Promise<TicketPdfData | null> {
  const { data: order } = await admin
    .from('online_orders')
    .select('id, order_number, ticket_ref, total, shipping_cost, paid_at, created_at, client_id, shipping_address, clients:client_id(full_name, client_code)')
    .eq('id', orderId)
    .maybeSingle()
  const o = order as Record<string, any> | null
  if (!o?.ticket_ref) return null

  const { data: rawLines } = await admin
    .from('online_order_lines')
    .select('product_name, variant_sku, quantity, total')
    .eq('order_id', orderId)
    .order('created_at', { ascending: true })

  const lines: TicketLinePayload[] = ((rawLines ?? []) as Record<string, any>[]).map((l) => {
    const qty = Math.max(1, Number(l.quantity) || 1)
    const lineTotal = r2(Number(l.total) || 0)
    return {
      description: String(l.product_name || 'Producto'),
      quantity: qty,
      unit_price: r2(lineTotal / qty),
      discount_percentage: 0,
      line_total: lineTotal,
      tax_rate: 21,
      sku: l.variant_sku ?? null,
    }
  })
  const shipping = r2(Number(o.shipping_cost) || 0)
  if (shipping > 0.005) {
    lines.push({ description: 'Gastos de envío', quantity: 1, unit_price: shipping, discount_percentage: 0, line_total: shipping, tax_rate: 21 })
  }

  const total = r2(Number(o.total) || 0)
  const linesTotal = lines.reduce((s, l) => s + (l.line_total ?? 0), 0)
  const discount = r2(linesTotal - total)
  const { base, vat } = splitOnlineTotal(total)

  const addr = (o.shipping_address && typeof o.shipping_address === 'object' ? o.shipping_address : {}) as Record<string, unknown>
  const addrName = [addr.first_name, addr.last_name].filter(Boolean).join(' ').trim()

  return {
    sale: {
      ticket_number: String(o.order_number ?? ''),
      internal_ref: String(o.ticket_ref),
      created_at: String(o.paid_at ?? o.created_at),
      client_id: o.client_id ?? null,
      subtotal: base,
      discount_amount: discount > 0.005 ? discount : 0,
      discount_percentage: 0,
      tax_amount: vat,
      total,
      payment_method: 'card',
    },
    lines,
    payments: [{ payment_method: 'card', amount: total }],
    clientName: (o.clients?.full_name as string | undefined)?.trim() || addrName || null,
    clientCode: o.clients?.client_code ?? null,
    storeAddress: STORE_PDF_CONFIGS.pinzon.address,
    storeSubtitle: `Tienda online · Pedido ${o.order_number ?? ''}`.trim(),
    storePhones: STORE_PDF_CONFIGS.pinzon.phones,
  }
}
