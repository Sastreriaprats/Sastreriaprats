'use client'

import type { Content } from 'pdfmake'
import { COMPANY, getLogoBase64Client, STORE_PDF_CONFIGS } from '@/lib/pdf/pdf-company'

/** Dirección y teléfono de la tienda por defecto (Hermanos Pinzón) */
const STORE_DEFAULT = STORE_PDF_CONFIGS.pinzon

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
  tax_rate?: number
  sku?: string | null
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
  /** Dirección de la tienda (opcional, por defecto Hermanos Pinzón) */
  storeAddress?: string | null
  /** Subtítulo de la tienda, e.g. "Wellington Hotel & Spa" (opcional) */
  storeSubtitle?: string | null
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

export async function generateTicketPdf(data: TicketPdfData, mode: 'download' | 'print' = 'download'): Promise<void> {
  const pdfMake = (await import('pdfmake/build/pdfmake')).default
  const vfsModule = await import('pdfmake/build/vfs_fonts')
  const vfs = (vfsModule as { default?: Record<string, string> }).default
  if (typeof pdfMake.addVirtualFileSystem === 'function' && vfs) {
    pdfMake.addVirtualFileSystem(vfs)
  }

  const storeAddress = data.storeAddress ?? STORE_DEFAULT.address
  const storeSubtitle = data.storeSubtitle ?? null
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
  const logoBase64 = await getLogoBase64Client()

  const content: Content[] = [
    ...(logoBase64
      ? [
          {
            image: logoBase64,
            width: 160,
            alignment: 'center',
            margin: [0, 0, 0, 6] as [number, number, number, number],
          } as Content,
        ]
      : []),
    { text: storeAddress, fontSize: FONT_SMALL, alignment: 'center', margin: [0, 0, 0, 2] as [number, number, number, number] },
    ...(storeSubtitle
      ? [{ text: storeSubtitle, fontSize: FONT_SMALL, alignment: 'center', margin: [0, 0, 0, 2] as [number, number, number, number] } as Content]
      : []),
    { text: storePhones, fontSize: FONT_SMALL, alignment: 'center', margin: [0, 0, 0, 2] as [number, number, number, number] },
    { text: `CIF: ${COMPANY.nif}`, fontSize: FONT_SMALL, alignment: 'center', margin: [0, 0, 0, 4] as [number, number, number, number] },
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
            text: `Vendedor: ${data.attendedBy}`,
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
    // unit_price YA es PVP (IVA incluido), no multiplicar por taxMultiplier
    const unitPriceWithTax = line.unit_price
    const lineTotalWithTax = line.line_total
      ?? (line.unit_price * line.quantity * (1 - (line.discount_percentage || 0) / 100))
    const desc = truncate(line.description, 32)
    const hasDiscount = (line.discount_percentage || 0) > 0
    const discountAmountWithTax = line.unit_price * line.quantity * (line.discount_percentage || 0) / 100

    const rows: any[][] = [
      [
        { text: desc, fontSize: FONT_BODY },
        { text: fmt(lineTotalWithTax), fontSize: FONT_BODY, alignment: 'right' },
      ],
      [
        { text: `${line.quantity} x ${fmt(unitPriceWithTax)}`, fontSize: FONT_SMALL, color: '#555', colSpan: 2 },
        {},
      ],
    ]

    if (line.sku) {
      rows.push([
        { text: `Ref: ${line.sku}`, fontSize: FONT_SMALL, color: '#555', colSpan: 2 },
        {},
      ])
    }

    if (hasDiscount) {
      rows.push([
        { text: `Dto: -${line.discount_percentage}%`, fontSize: FONT_SMALL, color: '#c00' },
        { text: `-${fmt(discountAmountWithTax)}`, fontSize: FONT_SMALL, color: '#c00', alignment: 'right' },
      ])
    }

    content.push({
      table: { widths: ['*', 50], body: rows },
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
      text: `Artículos: ${totalArticles}`,
      fontSize: FONT_BODY,
      margin: [0, 0, 0, 2] as [number, number, number, number],
    },
    {
      text: `Pago: ${payLabel}`,
      fontSize: FONT_BODY,
      margin: [0, 0, 0, 12] as [number, number, number, number],
    },
    {
      text: '¡Gracias por elegir Sastrería Prats!',
      fontSize: FONT_BODY,
      bold: true,
      alignment: 'center',
      margin: [0, 0, 0, 8] as [number, number, number, number],
    },
    {
      canvas: [
        { type: 'line', x1: 0, y1: 0, x2: W_PT - 2 * MARGIN_PT, y2: 0, lineWidth: 0.5 },
      ],
      margin: [0, 0, 0, 8] as [number, number, number, number],
    },
    ...(() => {
      const parts = COMPANY.returnsPolicy.split('Cuando el único')
      const para1 = parts[0].trim()
      const para2 = parts[1] ? 'Cuando el único' + parts[1] : ''
      const items: Content[] = [
        {
          text: para1,
          fontSize: 6,
          color: '#333',
          alignment: 'left',
          margin: [0, 0, 0, 6] as [number, number, number, number],
        },
      ]
      if (para2) {
        items.push({
          text: para2,
          fontSize: 6,
          color: '#333',
          alignment: 'left',
          margin: [0, 0, 0, 0] as [number, number, number, number],
        })
      }
      return items
    })(),
    { text: '', margin: [0, 8, 0, 0] as [number, number, number, number] },
    {
      text: COMPANY.name,
      fontSize: 6,
      color: '#999',
      alignment: 'center',
      margin: [0, 0, 0, 1] as [number, number, number, number],
    },
    {
      text: `${COMPANY.nif} · ${COMPANY.address}`,
      fontSize: 6,
      color: '#999',
      alignment: 'center',
      margin: [0, 0, 0, 1] as [number, number, number, number],
    },
    {
      text: `${COMPANY.postalCode} - ${COMPANY.city} · ${COMPANY.country}`,
      fontSize: 6,
      color: '#999',
      alignment: 'center',
      margin: [0, 0, 0, 0] as [number, number, number, number],
    }
  )

  const docDef = {
    pageSize: { width: W_PT, height: H_PT },
    pageMargins: [MARGIN_PT, MARGIN_PT, MARGIN_PT, MARGIN_PT],
    content,
  }

  const pdf = pdfMake.createPdf(docDef as Parameters<typeof pdfMake.createPdf>[0])

  if (mode === 'print') {
    await new Promise<void>((resolve) => {
      (pdf as any).getBlob((blob: Blob) => {
        const url = URL.createObjectURL(blob)
        const win = window.open(url, '_blank')
        if (win) {
          win.addEventListener('load', () => {
            win.print()
            // No cerrar automáticamente: el usuario puede querer revisar
          })
          // Fallback por si el evento load no dispara
          setTimeout(() => { try { win.print() } catch {} }, 500)
        } else {
          // Si el popup está bloqueado, descargar como fallback
          const a = document.createElement('a')
          a.href = url
          a.download = `ticket-${data.sale.ticket_number}.pdf`
          a.click()
        }
        resolve()
      })
    })
  } else {
    const fileName = `ticket-${data.sale.ticket_number}.pdf`
    await (pdf as { download: (name: string) => void }).download(fileName)
  }
}

/** Genera el ticket PDF y abre el diálogo de impresión del navegador */
export async function printTicketPdf(data: TicketPdfData): Promise<void> {
  return generateTicketPdf(data, 'print')
}
