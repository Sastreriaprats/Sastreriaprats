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
        const iframe = document.createElement('iframe')
        iframe.style.position = 'fixed'
        iframe.style.right = '0'
        iframe.style.bottom = '0'
        iframe.style.width = '0'
        iframe.style.height = '0'
        iframe.style.border = '0'
        iframe.setAttribute('aria-hidden', 'true')
        iframe.src = url

        let printed = false
        const triggerPrint = () => {
          if (printed) return
          printed = true
          try {
            iframe.contentWindow?.focus()
            iframe.contentWindow?.print()
          } catch {
            // Fallback: descargar si el navegador bloquea la impresión
            const a = document.createElement('a')
            a.href = url
            a.download = `ticket-${data.sale.ticket_number}.pdf`
            a.click()
          }
        }

        iframe.addEventListener('load', () => {
          // Pequeño delay para que el visor PDF del iframe termine de montar
          setTimeout(triggerPrint, 250)
        })
        // Fallback por si el evento load no dispara
        setTimeout(triggerPrint, 1500)

        // Limpieza: retirar iframe y revocar blob cuando la ventana recupere el foco
        const cleanup = () => {
          setTimeout(() => {
            try { document.body.removeChild(iframe) } catch {}
            try { URL.revokeObjectURL(url) } catch {}
            window.removeEventListener('focus', cleanup)
          }, 1000)
        }
        window.addEventListener('focus', cleanup)

        document.body.appendChild(iframe)
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

// ============================================================
// Ticket de RESERVA
// ============================================================

export interface ReservationTicketLine {
  description: string
  sku?: string | null
  size?: string | null
  color?: string | null
  quantity: number
  unit_price: number
  line_total: number
}

export interface ReservationTicketPayment {
  payment_method: string
  amount: number
}

export interface ReservationTicketData {
  reservation_number: string
  created_at: string
  expires_at?: string | null
  status: string
  payment_status: 'pending' | 'partial' | 'paid'
  line: ReservationTicketLine
  total: number
  total_paid: number
  payments: ReservationTicketPayment[]
  clientName?: string | null
  clientCode?: string | null
  attendedBy?: string | null
  storeAddress?: string | null
  storeSubtitle?: string | null
  storePhones?: string | null
  notes?: string | null
  reason?: string | null
}

const RESERVATION_STATUS_LABELS: Record<string, string> = {
  active: 'Stock bloqueado',
  pending_stock: 'Pendiente de stock',
  fulfilled: 'Cumplida',
  cancelled: 'Cancelada',
  expired: 'Expirada',
}

export async function generateReservationPdf(
  data: ReservationTicketData,
  mode: 'download' | 'print' = 'download',
): Promise<void> {
  const pdfMake = (await import('pdfmake/build/pdfmake')).default
  const vfsModule = await import('pdfmake/build/vfs_fonts')
  const vfs = (vfsModule as { default?: Record<string, string> }).default
  if (typeof pdfMake.addVirtualFileSystem === 'function' && vfs) {
    pdfMake.addVirtualFileSystem(vfs)
  }

  const storeAddress = data.storeAddress ?? STORE_DEFAULT.address
  const storeSubtitle = data.storeSubtitle ?? null
  const storePhones = data.storePhones ?? STORE_DEFAULT.phones

  const createdAt = new Date(data.created_at)
  const dateStr = createdAt.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' })
  const timeStr = createdAt.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })
  const expiresStr = data.expires_at
    ? new Date(data.expires_at).toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' })
    : null

  const pending = Math.max(0, Number(data.total) - Number(data.total_paid))
  const variantBits = [data.line.size ? `T.${data.line.size}` : null, data.line.color].filter(Boolean).join(' · ')

  const logoBase64 = await getLogoBase64Client()

  const content: Content[] = [
    ...(logoBase64
      ? [
          { image: logoBase64, width: 160, alignment: 'center', margin: [0, 0, 0, 6] as [number, number, number, number] } as Content,
        ]
      : []),
    { text: storeAddress, fontSize: FONT_SMALL, alignment: 'center', margin: [0, 0, 0, 2] as [number, number, number, number] },
    ...(storeSubtitle ? [{ text: storeSubtitle, fontSize: FONT_SMALL, alignment: 'center', margin: [0, 0, 0, 2] as [number, number, number, number] } as Content] : []),
    { text: storePhones, fontSize: FONT_SMALL, alignment: 'center', margin: [0, 0, 0, 2] as [number, number, number, number] },
    { text: `CIF: ${COMPANY.nif}`, fontSize: FONT_SMALL, alignment: 'center', margin: [0, 0, 0, 4] as [number, number, number, number] },
    { canvas: [{ type: 'line', x1: 0, y1: 0, x2: W_PT - 2 * MARGIN_PT, y2: 0, lineWidth: 0.5 }], margin: [0, 0, 0, 6] as [number, number, number, number] },
    { text: 'RESERVA', fontSize: 13, bold: true, alignment: 'center', margin: [0, 0, 0, 4] as [number, number, number, number] },
    {
      table: {
        widths: ['*', 60],
        body: [
          [
            { text: data.reservation_number, fontSize: FONT_BODY, bold: true },
            { text: dateStr, fontSize: FONT_BODY, alignment: 'right' },
          ],
          [
            { text: data.clientName ? `Cliente: ${truncate(data.clientName, 22)}` : 'Cliente: —', fontSize: FONT_SMALL },
            { text: timeStr, fontSize: FONT_SMALL, alignment: 'right' },
          ],
        ],
      },
      layout: 'noBorders',
      margin: [0, 0, 0, 2] as [number, number, number, number],
    },
    ...(data.clientCode
      ? [{ text: `Código: ${data.clientCode}`, fontSize: FONT_SMALL, margin: [0, 0, 0, 1] as [number, number, number, number] } as Content]
      : []),
    ...(data.attendedBy
      ? [{ text: `Atendido por: ${data.attendedBy}`, fontSize: FONT_SMALL, margin: [0, 0, 0, 2] as [number, number, number, number] } as Content]
      : []),
    { text: `Estado: ${RESERVATION_STATUS_LABELS[data.status] || data.status}`, fontSize: FONT_SMALL, margin: [0, 0, 0, 2] as [number, number, number, number] },
    ...(expiresStr
      ? [{ text: `Fecha límite: ${expiresStr}`, fontSize: FONT_SMALL, margin: [0, 0, 0, 6] as [number, number, number, number] } as Content]
      : [{ text: '', margin: [0, 0, 0, 4] as [number, number, number, number] } as Content]),
    { canvas: [{ type: 'line', x1: 0, y1: 0, x2: W_PT - 2 * MARGIN_PT, y2: 0, lineWidth: 0.5 }], margin: [0, 0, 0, 6] as [number, number, number, number] },
    {
      table: {
        widths: ['*', 50],
        body: [
          [
            { text: truncate(data.line.description, 32), fontSize: FONT_BODY },
            { text: fmt(data.line.line_total), fontSize: FONT_BODY, alignment: 'right' },
          ],
          [
            { text: `${data.line.quantity} x ${fmt(data.line.unit_price)}`, fontSize: FONT_SMALL, color: '#555', colSpan: 2 },
            {},
          ],
          ...(variantBits
            ? [[
                { text: variantBits, fontSize: FONT_SMALL, color: '#555', colSpan: 2 },
                {},
              ]]
            : []),
          ...(data.line.sku
            ? [[
                { text: `Ref: ${data.line.sku}`, fontSize: FONT_SMALL, color: '#555', colSpan: 2 },
                {},
              ]]
            : []),
        ],
      },
      layout: 'noBorders',
      margin: [0, 0, 0, 8] as [number, number, number, number],
    },
    { canvas: [{ type: 'line', x1: 0, y1: 0, x2: W_PT - 2 * MARGIN_PT, y2: 0, lineWidth: 0.5 }], margin: [0, 0, 0, 6] as [number, number, number, number] },
    {
      columns: [
        { text: 'TOTAL:', fontSize: FONT_HEAD, bold: true },
        { text: fmt(data.total), fontSize: FONT_HEAD, bold: true, alignment: 'right' },
      ],
      margin: [0, 2, 0, 2] as [number, number, number, number],
    },
    {
      columns: [
        { text: 'Pagado:', fontSize: FONT_BODY },
        { text: fmt(data.total_paid), fontSize: FONT_BODY, alignment: 'right' },
      ],
      margin: [0, 0, 0, 2] as [number, number, number, number],
    },
    {
      columns: [
        { text: 'Pendiente:', fontSize: FONT_BODY, bold: true, color: pending > 0 ? '#c00' : '#060' },
        { text: fmt(pending), fontSize: FONT_BODY, bold: true, alignment: 'right', color: pending > 0 ? '#c00' : '#060' },
      ],
      margin: [0, 0, 0, 6] as [number, number, number, number],
    },
  ]

  if (data.payments.length > 0) {
    content.push(
      { text: 'Pagos:', fontSize: FONT_SMALL, bold: true, margin: [0, 2, 0, 2] as [number, number, number, number] },
      ...data.payments.map<Content>((p) => ({
        columns: [
          { text: PAYMENT_LABELS[p.payment_method] || p.payment_method, fontSize: FONT_SMALL },
          { text: fmt(p.amount), fontSize: FONT_SMALL, alignment: 'right' },
        ],
        margin: [0, 0, 0, 1] as [number, number, number, number],
      })),
    )
  }

  if (data.reason) {
    content.push({
      text: `Motivo: ${truncate(data.reason, 60)}`,
      fontSize: FONT_SMALL,
      color: '#555',
      margin: [0, 6, 0, 2] as [number, number, number, number],
    })
  }
  if (data.notes) {
    content.push({
      text: `Notas: ${truncate(data.notes, 60)}`,
      fontSize: FONT_SMALL,
      color: '#555',
      margin: [0, 0, 0, 2] as [number, number, number, number],
    })
  }

  content.push(
    { text: '', margin: [0, 8, 0, 0] as [number, number, number, number] },
    { canvas: [{ type: 'line', x1: 0, y1: 0, x2: W_PT - 2 * MARGIN_PT, y2: 0, lineWidth: 0.5 }], margin: [0, 0, 0, 6] as [number, number, number, number] },
    {
      text: 'Conserve este resguardo para recoger su reserva.',
      fontSize: FONT_SMALL,
      alignment: 'center',
      color: '#444',
      margin: [0, 0, 0, 6] as [number, number, number, number],
    },
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
    },
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
        const iframe = document.createElement('iframe')
        iframe.style.position = 'fixed'
        iframe.style.right = '0'
        iframe.style.bottom = '0'
        iframe.style.width = '0'
        iframe.style.height = '0'
        iframe.style.border = '0'
        iframe.setAttribute('aria-hidden', 'true')
        iframe.src = url

        let printed = false
        const triggerPrint = () => {
          if (printed) return
          printed = true
          try {
            iframe.contentWindow?.focus()
            iframe.contentWindow?.print()
          } catch {
            const a = document.createElement('a')
            a.href = url
            a.download = `reserva-${data.reservation_number}.pdf`
            a.click()
          }
        }

        iframe.addEventListener('load', () => { setTimeout(triggerPrint, 250) })
        setTimeout(triggerPrint, 1500)

        const cleanup = () => {
          setTimeout(() => {
            try { document.body.removeChild(iframe) } catch {}
            try { URL.revokeObjectURL(url) } catch {}
            window.removeEventListener('focus', cleanup)
          }, 1000)
        }
        window.addEventListener('focus', cleanup)

        document.body.appendChild(iframe)
        resolve()
      })
    })
  } else {
    const fileName = `reserva-${data.reservation_number}.pdf`
    await (pdf as { download: (name: string) => void }).download(fileName)
  }
}

export async function printReservationPdf(data: ReservationTicketData): Promise<void> {
  return generateReservationPdf(data, 'print')
}
