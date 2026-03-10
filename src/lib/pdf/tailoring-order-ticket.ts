/**
 * Genera el PDF tipo ticket del pedido de sastrería.
 * Uso: desde la página de confirmación de nueva venta.
 */

const W_MM = 80
const MARGIN = 5
const FONT = 9
const FONT_SMALL = 8
const LINE = 5

export interface TailoringTicketOrder {
  order_number: string
  total: number
  total_paid?: number
  created_at?: string
  clients?: { full_name?: string; first_name?: string; last_name?: string } | null
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

function fmtDate(s: string | undefined): string {
  if (!s) return '—'
  try {
    const d = new Date(s)
    return d.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' })
  } catch {
    return String(s)
  }
}

export async function generateTailoringOrderTicketPdf(order: TailoringTicketOrder): Promise<void> {
  const { jsPDF } = await import('jspdf')
  const doc = new jsPDF({ orientation: 'p', unit: 'mm', format: [W_MM, 297] })
  let y = 10

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(11)
  doc.text('PRATS', W_MM / 2, y, { align: 'center' })
  y += LINE + 2

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(FONT)
  doc.text('PEDIDO SASTRERÍA', W_MM / 2, y, { align: 'center' })
  y += LINE + 2

  doc.setFontSize(FONT_SMALL)
  doc.text('Nº ' + (order.order_number ?? '—'), MARGIN, y)
  y += LINE
  doc.text('Fecha: ' + fmtDate(order.created_at), MARGIN, y)
  y += LINE
  doc.text('Cliente: ' + getClientName(order), MARGIN, y)
  y += LINE + 2

  doc.line(MARGIN, y, W_MM - MARGIN, y)
  y += LINE

  const lines = order.tailoring_order_lines ?? []
  for (const line of lines) {
    const gt = line.garment_types
    const name = (typeof gt === 'object' && gt && 'name' in gt ? (gt as { name?: string }).name : null) ?? 'Prenda'
    const price = Number(line.unit_price ?? 0)
    doc.text(name.slice(0, 22), MARGIN, y)
    doc.text(price.toFixed(2) + ' €', W_MM - MARGIN - 20, y)
    y += LINE
  }

  y += LINE
  doc.line(MARGIN, y, W_MM - MARGIN, y)
  y += LINE
  doc.setFont('helvetica', 'bold')
  doc.text('TOTAL: ' + Number(order.total ?? 0).toFixed(2) + ' €', MARGIN, y)
  y += LINE
  const paid = Number(order.total_paid ?? 0)
  if (paid > 0) {
    doc.setFont('helvetica', 'normal')
    doc.text('Entregado: ' + paid.toFixed(2) + ' €', MARGIN, y)
  }

  y = 287
  doc.setFontSize(FONT_SMALL)
  doc.setTextColor(100, 100, 100)
  doc.text('SASTRERÍA PRATS', W_MM / 2, y, { align: 'center' })
  doc.setTextColor(0, 0, 0)

  doc.save(`ticket-pedido-${(order.order_number || '').replace(/\s+/g, '-')}.pdf`)
}
