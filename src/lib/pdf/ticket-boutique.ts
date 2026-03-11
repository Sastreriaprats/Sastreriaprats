/**
 * Genera tickets PDF para líneas boutique/complementos de un pedido.
 * Usa el formato unificado de Sastrería Prats vía generateTicketPdf.
 */

import { COMPANY } from '@/lib/pdf/pdf-company'
import { generateTicketPdf } from '@/components/pos/ticket-pdf'

function getClientName(order: any): string {
  const c = order?.clients
  if (!c) return '—'
  if (c.full_name) return String(c.full_name)
  return [c.first_name, c.last_name].filter(Boolean).join(' ') || '—'
}

function getClientCode(order: any): string | null {
  const c = order?.clients
  if (!c) return null
  return c.code ?? c.client_code ?? null
}

/** Dirección de la tienda por defecto (sede principal) */
const DEFAULT_STORE_ADDRESS = COMPANY.address + ', ' + COMPANY.postalCode + ' ' + COMPANY.city

/**
 * Genera un ticket PDF para una sola línea complemento del pedido.
 * Construye TicketPdfData y llama a generateTicketPdf (formato físico Sastrería Prats).
 */
export async function generateTicketComplemento(order: any, line: any): Promise<void> {
  const cfg = line?.configuration ?? {}
  const description = (cfg.product_name as string)?.trim() || 'Complemento'
  const quantity = Number(cfg.cantidad ?? line?.quantity ?? 1) || 1
  const priceWithTax = Number(cfg.precio ?? line?.unit_price ?? line?.price_with_tax ?? 0) || 0
  const taxRate = 21
  const unitPriceNoTax = priceWithTax / (1 + taxRate / 100)
  const lineTotal = quantity * priceWithTax

  const subtotal = quantity * unitPriceNoTax
  const tax_amount = lineTotal - subtotal
  const total = lineTotal
  const now = new Date().toISOString()
  const paymentMethodKey = order?.payment_method ?? order?.payment ?? 'card'

  await generateTicketPdf({
    sale: {
      ticket_number: String(order?.order_number ?? 'pedido'),
      created_at: now,
      client_id: order?.client_id ?? null,
      subtotal: Math.round(subtotal * 100) / 100,
      tax_amount: Math.round(tax_amount * 100) / 100,
      total: Math.round(total * 100) / 100,
      payment_method: paymentMethodKey,
    },
    lines: [
      {
        description,
        quantity,
        unit_price: Math.round(unitPriceNoTax * 100) / 100,
        discount_percentage: 0,
        line_total: Math.round(lineTotal * 100) / 100,
      },
    ],
    payments: [{ payment_method: paymentMethodKey, amount: total }],
    clientName: getClientName(order),
    clientCode: getClientCode(order),
    storeAddress: DEFAULT_STORE_ADDRESS,
  })
}

/**
 * Genera un ticket PDF para todas las líneas boutique/complementos del pedido.
 * Construye TicketPdfData y llama a generateTicketPdf (formato físico Sastrería Prats).
 */
export async function generateTicketBoutiquePDF(order: any): Promise<void> {
  const rawLines = order?.tailoring_order_lines ?? []
  const boutiqueLines = rawLines.filter((l: any) => {
    const cfg = l?.configuration ?? {}
    return cfg.product_variant_id || cfg.product_name
  })

  let subtotal = 0
  const lines = boutiqueLines.map((l: any) => {
    const cfg = l.configuration ?? {}
    const description = (cfg.product_name as string) || 'Complemento'
    const quantity = Number(l.quantity ?? 1) || 1
    const unitPriceNoTax = Number(l.unit_price ?? 0) || 0
    const lineTotal = quantity * unitPriceNoTax * 1.21
    subtotal += quantity * unitPriceNoTax
    return {
      description,
      quantity,
      unit_price: unitPriceNoTax,
      discount_percentage: 0,
      line_total: Math.round(lineTotal * 100) / 100,
    }
  })

  const total = Math.round(subtotal * 1.21 * 100) / 100
  const tax_amount = Math.round((total - subtotal) * 100) / 100
  const paymentMethodKey = order?.payment_method ?? order?.payment ?? 'card'

  await generateTicketPdf({
    sale: {
      ticket_number: String(order?.order_number ?? order?.id ?? 'pedido'),
      created_at: order?.created_at ?? new Date().toISOString(),
      client_id: order?.client_id ?? null,
      subtotal: Math.round(subtotal * 100) / 100,
      tax_amount,
      total,
      payment_method: paymentMethodKey,
    },
    lines,
    payments: [{ payment_method: paymentMethodKey, amount: total }],
    clientName: getClientName(order),
    clientCode: getClientCode(order),
    storeAddress: DEFAULT_STORE_ADDRESS,
  })
}
