/**
 * Genera el PDF tipo ticket del pedido de sastrería.
 * Muestra todas las líneas, totales, lo pagado y lo pendiente.
 */

import { STORE_PDF_CONFIGS } from '@/lib/pdf/pdf-company'
import { generateTicketPdf } from '@/components/pos/ticket-pdf'

export interface TailoringTicketOrder {
  order_number: string
  total: number
  total_paid?: number
  total_pending?: number
  discount_amount?: number
  discount_percentage?: number
  created_at?: string
  store_id?: string | null
  stores?: { name?: string } | null
  clients?: { full_name?: string; first_name?: string; last_name?: string; code?: string; client_code?: string } | null
  tailoring_order_lines?: Array<{
    garment_types?: { name?: string } | null
    configuration?: Record<string, unknown> | null
    unit_price?: number
    line_total?: number
    quantity?: number
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

function getLineName(line: TailoringTicketOrder['tailoring_order_lines'] extends (infer T)[] | null | undefined ? T : never): string {
  const cfg = line.configuration as Record<string, unknown> | null
  if (cfg?.prendaLabel && typeof cfg.prendaLabel === 'string') return cfg.prendaLabel
  if (cfg?.product_name && typeof cfg.product_name === 'string') return cfg.product_name
  const gt = line.garment_types
  if (typeof gt === 'object' && gt && 'name' in gt) return (gt as { name?: string }).name ?? 'Prenda'
  return 'Prenda'
}

function getStoreConfig(order: TailoringTicketOrder) {
  const storeName = order.stores?.name?.toLowerCase() ?? ''
  if (storeName.includes('wellington') || storeName.includes('velázquez') || storeName.includes('velazquez')) {
    return STORE_PDF_CONFIGS.wellington
  }
  return STORE_PDF_CONFIGS.pinzon
}

export async function generateTailoringOrderTicketPdf(order: TailoringTicketOrder): Promise<void> {
  const orderLines = order.tailoring_order_lines ?? []
  const total = Number(order.total ?? 0)
  const totalPaid = Number(order.total_paid ?? 0)
  const totalPending = Number(order.total_pending ?? total - totalPaid)
  const discountAmount = Number(order.discount_amount ?? 0)
  const subtotal = Math.round((total / 1.21) * 100) / 100
  const taxAmount = Math.round((total - subtotal) * 100) / 100
  const storeConfig = getStoreConfig(order)

  // Group lines by parent item so "Traje" (americana+pantalón) shows as one line in the ticket.
  // prendaLabel is like "Americana — Traje 1" or "Pantalón — Traje 1" → group by part after "—".
  // If there's no "—", the line is standalone (e.g. "Pantalón" solo).
  const grouped = new Map<string, { description: string; unitPrice: number; lineTotal: number; quantity: number }>()
  for (const line of orderLines) {
    const cfg = line.configuration as Record<string, unknown> | null
    const rawLabel = (cfg?.prendaLabel as string) || getLineName(line)

    // Extract group name: "Americana — Traje 1" → "Traje 1", "Pantalón" → "Pantalón"
    const dashMatch = rawLabel.match(/\s*(?:—|–|-)\s*(.+)$/)
    const groupKey = dashMatch ? dashMatch[1].trim() : rawLabel
    const displayName = dashMatch ? dashMatch[1].trim() : rawLabel

    const existing = grouped.get(groupKey)
    // unit_price ya incluye IVA
    const unitPrice = Number(line.unit_price ?? 0)
    const lineTotal = line.line_total ? Number(line.line_total) : unitPrice
    if (existing) {
      existing.unitPrice += unitPrice
      existing.lineTotal += lineTotal
    } else {
      grouped.set(groupKey, { description: displayName, unitPrice, lineTotal, quantity: Number(line.quantity ?? 1) })
    }
  }

  const lines = Array.from(grouped.values()).map((g) => ({
    description: g.description,
    quantity: g.quantity,
    unit_price: g.unitPrice,
    discount_percentage: 0,
    line_total: g.lineTotal,
  }))

  // Build payments array: show paid + pending
  const payments: { payment_method: string; amount: number }[] = []
  if (totalPaid > 0) {
    payments.push({ payment_method: 'Abonado', amount: totalPaid })
  }
  if (totalPending > 0) {
    payments.push({ payment_method: 'Pendiente', amount: totalPending })
  }
  if (payments.length === 0) {
    payments.push({ payment_method: 'card', amount: total })
  }

  await generateTicketPdf({
    sale: {
      ticket_number: String(order.order_number ?? 'pedido'),
      created_at: order.created_at ?? new Date().toISOString(),
      client_id: null,
      subtotal,
      discount_amount: discountAmount > 0 ? discountAmount : undefined,
      tax_amount: taxAmount,
      total,
      payment_method: totalPaid >= total ? 'card' : 'mixed',
    },
    lines,
    payments,
    clientName: getClientName(order),
    clientCode: getClientCode(order),
    storeAddress: storeConfig.address,
    storePhones: storeConfig.phones,
  })
}
