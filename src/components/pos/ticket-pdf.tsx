'use client'

import type { Content } from 'pdfmake'
import { COMPANY, getLogoBase64Client } from '@/lib/pdf/pdf-company'

/** Dirección y teléfono de la tienda para el ticket (por defecto sede principal) */
const STORE_DEFAULT = {
  address: COMPANY.address + ', ' + COMPANY.postalCode + ' ' + COMPANY.city,
  phones: COMPANY.phone,
}

const W_MM = 80
const W_PT = Math.round(W_MM * 2.83465)
const H_PT = 841
const MARGIN_PT = 14
const FONT_BODY = 9
const FONT_SMALL = 7
const FONT_HEAD = 10

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
  /** Nombre del vendedor que atendió (opcional) */
  attendedBy?: string | null
  /** Dirección de la tienda (opcional, por defecto sede principal) */
  storeAddress?: string | null
  /** Teléfonos de la tienda (opcional) */
  storePhones?: string | null
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
  const pdfMake = (await import('pdfmake/build/pdfmake')).default
  const vfsModule = await import('pdfmake/build/vfs_fonts')
  const vfs = (vfsModule as { default?: Record<string, string> }).default
  if (typeof pdfMake.addVirtualFileSystem === 'function' && vfs) {
    pdfMake.addVirtualFileSystem(vfs)
  }

  const storeAddress = data.storeAddress ?? STORE_DEFAULT.address
  const storePhones = data.storePhones ?? STORE_DEFAULT.phones
  const createdAt = new Date(data.sale.created_at)
  const dateStr = createdAt.toLocaleDateString('es-ES', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  })
  const timeStr = new Date(data.sale.created_at).toLocaleTimeString('es-ES', {
    hour: '2-digit',
    minute: '2-digit',
  })
  const payLabel = PAYMENT_LABELS[data.sale.payment_method] || data.sale.payment_method
  const discountAmount = data.sale.discount_amount ?? 0
  const tax = data.sale.tax_amount ?? 0
  const totalArticles = data.lines.reduce((acc, l) => acc + (l.quantity || 1), 0)
  const logoBase64 = getLogoBase64Client()

  const content: Content[] = [
    ...(logoBase64
      ? [
          {
            image: logoBase64,
            width: 80,
            alignment: 'center',
            margin: [0, 0, 0, 6] as [number, number, number, number],
          } as Content,
        ]
      : []),
    {
      text: COMPANY.name,
      fontSize: FONT_HEAD,
      bold: true,
      alignment: 'center',
      margin: [0, 0, 0, 2] as [number, number, number, number],
    },
    {
      text: `${COMPANY.nif} · ${COMPANY.address}`,
      fontSize: FONT_SMALL,
      alignment: 'center',
      margin: [0, 0, 0, 2] as [number, number, number, number],
    },
    {
      text: `${COMPANY.postalCode} - ${COMPANY.city} - ${COMPANY.country}`,
      fontSize: FONT_SMALL,
      alignment: 'center',
      margin: [0, 0, 0, 2] as [number, number, number, number],
    },
    { text: storeAddress, fontSize: FONT_SMALL, alignment: 'center', margin: [0, 0, 0, 2] as [number, number, number, number] },
    { text: storePhones, fontSize: FONT_SMALL, alignment: 'center', margin: [0, 0, 0, 12] as [number, number, number, number] },
    { canvas: [{ type: 'line', x1: 0, y1: 0, x2: W_PT - 2 * MARGIN_PT, y2: 0, lineWidth: 0.5 }], margin: [0, 0, 0, 8] as [number, number, number, number] },
    {
      table: {
        widths: ['*', 50],
        body: [
          [
            { text: `Ticket ${data.sale.ticket_number}`, fontSize: FONT_BODY, bold: true },
            { text: dateStr, fontSize: FONT_BODY, alignment: 'right' },
          ],
          [
            {
              text: data.clientName ? `Cliente: ${truncate(data.clientName, 22)}` : 'Cliente: —',
              fontSize: FONT_SMALL,
            },
            { text: timeStr, fontSize: FONT_SMALL, alignment: 'right' },
          ],
        ],
      },
      layout: 'noBorders',
      margin: [0, 0, 0, 2] as [number, number, number, number],
    },
    ...(data.clientCode
      ? [
          {
            text: `Código: ${data.clientCode}`,
            fontSize: 8,
            margin: [0, 0, 0, 1] as [number, number, number, number],
          } as Content,
        ]
      : []),
    ...(data.attendedBy
      ? [
          {
            text: `Atendido por: ${data.attendedBy}`,
            fontSize: FONT_SMALL,
            margin: [0, 0, 0, 8] as [number, number, number, number],
          } as Content,
        ]
      : []),
    {
      canvas: [
        {
          type: 'line',
          x1: 0,
          y1: 0,
          x2: W_PT - 2 * MARGIN_PT,
          y2: 0,
          lineWidth: 0.5,
        },
      ],
      margin: [0, 0, 0, 8] as [number, number, number, number],
    },
  ]

  for (const line of data.lines) {
    const lineTotal = line.line_total ?? line.unit_price * line.quantity * (1 - (line.discount_percentage || 0) / 100)
    const desc = truncate(line.description, 32)
    content.push({
      table: {
        widths: ['*', 50],
        body: [
          [
            { text: desc, fontSize: FONT_BODY },
            { text: fmt(lineTotal), fontSize: FONT_BODY, alignment: 'right' },
          ],
          [
            { text: `${line.quantity} x ${fmt(line.unit_price)}`, fontSize: FONT_SMALL, color: '#555', colSpan: 2 },
            {},
          ],
        ],
      },
      layout: 'noBorders',
      margin: [0, 0, 0, 6] as [number, number, number, number],
    })
  }

  content.push(
    {
      canvas: [
        { type: 'line', x1: 0, y1: 0, x2: W_PT - 2 * MARGIN_PT, y2: 0, lineWidth: 0.5 },
      ],
      margin: [0, 0, 0, 8] as [number, number, number, number],
    },
    {
      columns: [
        { text: 'Subtotal:', fontSize: FONT_BODY },
        { text: fmt(data.sale.subtotal), fontSize: FONT_BODY, alignment: 'right' },
      ],
      margin: [0, 0, 0, 2] as [number, number, number, number],
    }
  )
  if (discountAmount > 0) {
    content.push({
      columns: [
        { text: 'Descuento:', fontSize: FONT_BODY },
        { text: '-' + fmt(discountAmount), fontSize: FONT_BODY, alignment: 'right' },
      ],
      margin: [0, 0, 0, 2] as [number, number, number, number],
    })
  }
  if (!data.sale.is_tax_free && tax > 0) {
    content.push({
      columns: [
        { text: 'IVA 21%:', fontSize: FONT_BODY },
        { text: fmt(tax), fontSize: FONT_BODY, alignment: 'right' },
      ],
      margin: [0, 0, 0, 2] as [number, number, number, number],
    })
  }
  content.push(
    {
      columns: [
        { text: 'TOTAL:', fontSize: FONT_HEAD, bold: true },
        { text: fmt(data.sale.total), fontSize: FONT_HEAD, bold: true, alignment: 'right' },
      ],
      margin: [0, 4, 0, 2] as [number, number, number, number],
    },
    {
      text: `Pago: ${payLabel}`,
      fontSize: FONT_BODY,
      margin: [0, 0, 0, 12] as [number, number, number, number],
    },
    {
      canvas: [
        { type: 'line', x1: 0, y1: 0, x2: W_PT - 2 * MARGIN_PT, y2: 0, lineWidth: 0.5 },
      ],
      margin: [0, 0, 0, 8] as [number, number, number, number],
    },
    {
      text: '¡Gracias por elegir Sastrería Prats!',
      fontSize: FONT_BODY,
      bold: true,
      alignment: 'center',
      margin: [0, 0, 0, 4] as [number, number, number, number],
    },
    {
      text: `Artículos: ${totalArticles}`,
      fontSize: FONT_SMALL,
      alignment: 'center',
      margin: [0, 0, 0, 12] as [number, number, number, number],
    },
    {
      text: COMPANY.returnsPolicy,
      fontSize: 5,
      color: '#444',
      alignment: 'left',
      margin: [0, 0, 0, 0] as [number, number, number, number],
    }
  )

  const docDef = {
    pageSize: { width: W_PT, height: H_PT },
    pageMargins: [MARGIN_PT, MARGIN_PT, MARGIN_PT, MARGIN_PT],
    content,
  }

  const pdf = pdfMake.createPdf(docDef as Parameters<typeof pdfMake.createPdf>[0])
  const fileName = `ticket-${data.sale.ticket_number}.pdf`
  await (pdf as { download: (name: string) => void }).download(fileName)
}
