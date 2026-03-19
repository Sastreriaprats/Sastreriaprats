/**
 * Genera el PDF tipo ticket del pedido de sastrería.
 * Usa el formato unificado de Sastrería Prats vía generateTicketPdf.
 */

import { STORE_PDF_CONFIGS } from '@/lib/pdf/pdf-company'
import { generateTicketPdf } from '@/components/pos/ticket-pdf'

export interface TailoringTicketOrder {
  order_number: string
  total: number
  total_paid?: number
  created_at?: string
  clients?: { full_name?: string; first_name?: string; last_name?: string; code?: string; client_code?: string } | null
  tailoring_order_lines?: Array<{
    garment_types?: { name?: string } | null
    unit_price?: number
  }> | null
}

function getClientName(order: TailoringTicketOrder): string {
  const c = order.clients
  if (!c) return '—'
  if (typeof c === 'object' && 'full_name' in c && c.full_name) return String(c.full_name)
  const first = (c as { first_name?: string }).first_name ?? ''
  const last = (c as { last_name?: string }).last_name ?? ''
  return [first, last].filter(Boolean).join(' ') || '—'
}

function getClientCode(order: TailoringTicketOrder): string | null {
  const c = order.clients
  if (!c || typeof c !== 'object') return null
  return (c as { code?: string; client_code?: string }).code ?? (c as { client_code?: string }).client_code ?? null
}

export async function generateTailoringOrderTicketPdf(order: TailoringTicketOrder): Promise<void> {
  const orderLines = order.tailoring_order_lines ?? []
  const total = Number(order.total ?? 0)
  const subtotal = Math.round((total / 1.21) * 100) / 100
  const tax_amount = Math.round((total - subtotal) * 100) / 100

  const lines = orderLines.map((line) => {
    const gt = line.garment_types
    const name = (typeof gt === 'object' && gt && 'name' in gt ? (gt as { name?: string }).name : null) ?? 'Prenda'
    const unitPrice = Number(line.unit_price ?? 0)
    const quantity = 1
    const lineTotal = Math.round(quantity * unitPrice * 1.21 * 100) / 100
    return {
      description: name,
      quantity,
      unit_price: unitPrice,
      discount_percentage: 0,
      line_total: lineTotal,
    }
  })

  await generateTicketPdf({
    sale: {
      ticket_number: String(order.order_number ?? 'pedido'),
      created_at: order.created_at ?? new Date().toISOString(),
      client_id: null,
      subtotal,
      tax_amount,
      total,
      payment_method: 'card',
    },
    lines,
    payments: [{ payment_method: 'card', amount: total }],
    clientName: getClientName(order),
    clientCode: getClientCode(order),
    storeAddress: STORE_PDF_CONFIGS.pinzon.address,
    storePhones: STORE_PDF_CONFIGS.pinzon.phones,
  })
}
