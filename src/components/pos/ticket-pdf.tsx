'use client'

const STORE = {
  name: 'SASTRERÍA PRATS MADRID',
  address: 'Calle de la Sastrería, 1 · 28001 Madrid',
  cif: 'B-12345678',
}

const W_MM = 80
const MARGIN = 5
const RIGHT = W_MM - MARGIN
const FONT_BODY = 9
const FONT_SMALL = 8
const FONT_HEAD = 11
const LINE_HEIGHT = 5

export interface TicketLinePayload {
  description: string
  quantity: number
  unit_price: number
  discount_percentage: number
  line_total?: number
}

export interface TicketPaymentPayload {
  payment_method: string
  amount: number
}

export interface TicketSalePayload {
  ticket_number: string
  created_at: string
  client_id?: string | null
  subtotal: number
  discount_amount?: number
  discount_percentage?: number
  tax_amount: number
  total: number
  payment_method: string
  is_tax_free?: boolean
}

export interface TicketPdfData {
  sale: TicketSalePayload
  lines: TicketLinePayload[]
  payments: TicketPaymentPayload[]
  clientName?: string | null
  clientCode?: string | null
}

function fmt(value: number): string {
  return value.toFixed(2).replace('.', ',') + ' €'
}

const PAYMENT_LABELS: Record<string, string> = {
  cash: 'Efectivo',
  card: 'Tarjeta',
  bizum: 'Bizum',
  transfer: 'Transferencia',
  voucher: 'Vale',
  mixed: 'Varios',
}

function truncate(str: string, max: number): string {
  if (str.length <= max) return str
  return str.slice(0, max - 1) + '…'
}

export async function generateTicketPdf(data: TicketPdfData): Promise<void> {
  const { jsPDF } = await import('jspdf')
  const doc = new jsPDF({ orientation: 'p', unit: 'mm', format: [W_MM, 297] })
  let y = 10

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(12)
  doc.text('PRATS', W_MM / 2, y, { align: 'center' })
  y += LINE_HEIGHT

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(FONT_BODY)
  doc.text(STORE.name, W_MM / 2, y, { align: 'center' })
  y += LINE_HEIGHT
  doc.setFontSize(FONT_SMALL)
  doc.setTextColor(80, 80, 80)
  doc.text(STORE.address, W_MM / 2, y, { align: 'center' })
  y += 4
  doc.text('CIF: ' + STORE.cif, W_MM / 2, y, { align: 'center' })
  doc.setTextColor(0, 0, 0)
  y += LINE_HEIGHT

  doc.setDrawColor(0, 0, 0)
  doc.line(MARGIN, y, RIGHT, y)
  y += LINE_HEIGHT

  doc.setFontSize(FONT_BODY)
  doc.setFont('helvetica', 'bold')
  doc.text('Ticket ' + data.sale.ticket_number, MARGIN, y)
  const dateStr = new Date(data.sale.created_at).toLocaleString('es-ES', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
  doc.setFont('helvetica', 'normal')
  doc.text(dateStr, RIGHT, y, { align: 'right' })
  y += LINE_HEIGHT

  if (data.clientName) {
    doc.setFontSize(FONT_SMALL)
    doc.text('Cliente: ' + truncate(data.clientName, 35), MARGIN, y)
    y += 4
    if (data.clientCode) {
      doc.text('Código: ' + data.clientCode, MARGIN, y)
      y += 4
    }
    doc.setFontSize(FONT_BODY)
    y += 2
  }

  doc.setDrawColor(0, 0, 0)
  doc.line(MARGIN, y, RIGHT, y)
  y += LINE_HEIGHT

  for (const line of data.lines) {
    const lineSub = line.line_total ?? line.unit_price * line.quantity * (1 - (line.discount_percentage || 0) / 100)
    const desc = truncate(line.description, 24)
    doc.setFontSize(FONT_BODY)
    doc.text(desc, MARGIN, y)
    doc.text(fmt(lineSub), RIGHT, y, { align: 'right' })
    y += 4
    doc.setFontSize(FONT_SMALL)
    doc.setTextColor(90, 90, 90)
    const cantPrecio = `${line.quantity} x ${fmt(line.unit_price)}`
    doc.text(cantPrecio, MARGIN, y)
    if (line.discount_percentage && line.discount_percentage > 0) {
      doc.text(`-${line.discount_percentage}%`, RIGHT, y, { align: 'right' })
    }
    doc.setTextColor(0, 0, 0)
    doc.setFontSize(FONT_BODY)
    y += LINE_HEIGHT
  }

  doc.setDrawColor(0, 0, 0)
  doc.line(MARGIN, y, RIGHT, y)
  y += LINE_HEIGHT

  const discountAmount = data.sale.discount_amount ?? 0
  const base = data.sale.is_tax_free ? data.sale.total : data.sale.subtotal - discountAmount
  const tax = data.sale.tax_amount ?? 0

  doc.setFontSize(FONT_BODY)
  doc.text('Subtotal:', MARGIN, y)
  doc.text(fmt(data.sale.subtotal), RIGHT, y, { align: 'right' })
  y += LINE_HEIGHT

  if (discountAmount > 0) {
    doc.text('Descuento:', MARGIN, y)
    doc.text('-' + fmt(discountAmount), RIGHT, y, { align: 'right' })
    y += LINE_HEIGHT
  }

  if (!data.sale.is_tax_free && tax > 0) {
    doc.text('IVA 21%:', MARGIN, y)
    doc.text(fmt(tax), RIGHT, y, { align: 'right' })
    y += LINE_HEIGHT
  }

  if (data.sale.is_tax_free) {
    doc.setFontSize(FONT_SMALL)
    doc.text('Tax Free', MARGIN, y)
    y += LINE_HEIGHT
  }

  doc.setDrawColor(0, 0, 0)
  doc.line(MARGIN, y, RIGHT, y)
  y += LINE_HEIGHT

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(FONT_HEAD)
  doc.text('TOTAL:', MARGIN, y)
  doc.text(fmt(data.sale.total), RIGHT, y, { align: 'right' })
  y += LINE_HEIGHT + 2

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(FONT_BODY)
  const payLabel = PAYMENT_LABELS[data.sale.payment_method] || data.sale.payment_method
  doc.text('Pago: ' + payLabel, MARGIN, y)
  y += LINE_HEIGHT + 2

  doc.setDrawColor(0, 0, 0)
  doc.line(MARGIN, y, RIGHT, y)
  y += LINE_HEIGHT

  doc.setFontSize(FONT_BODY)
  doc.text('Gracias por su visita', W_MM / 2, y, { align: 'center' })

  doc.save(`ticket-${data.sale.ticket_number}.pdf`)
}
