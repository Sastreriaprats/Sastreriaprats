'use client'

import type { Content } from 'pdfmake'
import { COMPANY, getLogoBase64Client, STORE_PDF_CONFIGS } from '@/lib/pdf/pdf-company'

const STORE_DEFAULT = STORE_PDF_CONFIGS.pinzon

const W_MM = 80
const W_PT = Math.round(W_MM * 2.83465)
const H_PT = 841
const MARGIN_PT = 14
const FONT_BODY = 9
const FONT_SMALL = 7
const FONT_HEAD = 10

export interface ReturnTicketLine {
  description: string
  sku?: string | null
  quantity: number
  unit_price: number
  line_total: number
}

export interface ReturnTicketData {
  return_type: 'voucher' | 'exchange'
  original_ticket_number: string | null
  client_name?: string | null
  total_returned: number
  voucher_code?: string | null
  reason: string
  created_at: string
  lines: ReturnTicketLine[]
  attendedBy?: string | null
  storeAddress?: string | null
  storeSubtitle?: string | null
  storePhones?: string | null
}

function fmt(v: number): string {
  return v.toFixed(2).replace('.', ',') + ' €'
}

function truncate(s: string, max: number): string {
  return s.length <= max ? s : s.slice(0, max - 1) + '…'
}

export async function generateReturnTicketPdf(data: ReturnTicketData, mode: 'download' | 'print' = 'download'): Promise<void> {
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
  const totalArticles = data.lines.reduce((a, l) => a + (l.quantity || 1), 0)
  const logoBase64 = await getLogoBase64Client()
  const kindLabel = data.return_type === 'voucher' ? 'VALE DE DEVOLUCIÓN' : 'CAMBIO DIRECTO'

  const content: Content[] = [
    ...(logoBase64
      ? [{ image: logoBase64, width: 160, alignment: 'center', margin: [0, 0, 0, 6] as [number, number, number, number] } as Content]
      : []),
    { text: storeAddress, fontSize: FONT_SMALL, alignment: 'center', margin: [0, 0, 0, 2] as [number, number, number, number] },
    ...(storeSubtitle
      ? [{ text: storeSubtitle, fontSize: FONT_SMALL, alignment: 'center', margin: [0, 0, 0, 2] as [number, number, number, number] } as Content]
      : []),
    { text: storePhones, fontSize: FONT_SMALL, alignment: 'center', margin: [0, 0, 0, 2] as [number, number, number, number] },
    { text: `CIF: ${COMPANY.nif}`, fontSize: FONT_SMALL, alignment: 'center', margin: [0, 0, 0, 4] as [number, number, number, number] },
    { canvas: [{ type: 'line', x1: 0, y1: 0, x2: W_PT - 2 * MARGIN_PT, y2: 0, lineWidth: 0.5 }], margin: [0, 0, 0, 6] as [number, number, number, number] },
    { text: kindLabel, fontSize: FONT_HEAD, bold: true, alignment: 'center', margin: [0, 0, 0, 6] as [number, number, number, number] },
    {
      table: {
        widths: ['*', 60],
        body: [
          [
            { text: `Ticket origen: ${data.original_ticket_number ?? '—'}`, fontSize: FONT_SMALL },
            { text: dateStr, fontSize: FONT_SMALL, alignment: 'right' },
          ],
          [
            { text: data.client_name ? `Cliente: ${truncate(data.client_name, 22)}` : 'Cliente: —', fontSize: FONT_SMALL },
            { text: timeStr, fontSize: FONT_SMALL, alignment: 'right' },
          ],
        ],
      },
      layout: 'noBorders',
      margin: [0, 0, 0, 4] as [number, number, number, number],
    },
    ...(data.attendedBy
      ? [{ text: `Vendedor: ${data.attendedBy}`, fontSize: FONT_SMALL, margin: [0, 0, 0, 6] as [number, number, number, number] } as Content]
      : []),
    { canvas: [{ type: 'line', x1: 0, y1: 0, x2: W_PT - 2 * MARGIN_PT, y2: 0, lineWidth: 0.5 }], margin: [0, 0, 0, 8] as [number, number, number, number] },
    { text: 'Artículos devueltos', fontSize: FONT_BODY, bold: true, margin: [0, 0, 0, 4] as [number, number, number, number] },
  ]

  for (const line of data.lines) {
    content.push({
      table: {
        widths: ['*', 50],
        body: [
          [
            { text: truncate(line.description, 32), fontSize: FONT_BODY },
            { text: fmt(line.line_total), fontSize: FONT_BODY, alignment: 'right' },
          ],
          [
            { text: `${line.quantity} x ${fmt(line.unit_price)}`, fontSize: FONT_SMALL, color: '#555', colSpan: 2 },
            {},
          ],
          ...(line.sku
            ? [[
                { text: `Ref: ${line.sku}`, fontSize: FONT_SMALL, color: '#555', colSpan: 2 },
                {},
              ]]
            : []),
        ],
      },
      layout: 'noBorders',
      margin: [0, 0, 0, 6] as [number, number, number, number],
    })
  }

  content.push(
    { canvas: [{ type: 'line', x1: 0, y1: 0, x2: W_PT - 2 * MARGIN_PT, y2: 0, lineWidth: 0.5 }], margin: [0, 0, 0, 6] as [number, number, number, number] },
    {
      columns: [
        { text: 'TOTAL DEVUELTO:', fontSize: FONT_HEAD, bold: true },
        { text: fmt(data.total_returned), fontSize: FONT_HEAD, bold: true, alignment: 'right' },
      ],
      margin: [0, 2, 0, 2] as [number, number, number, number],
    },
    { text: `Artículos: ${totalArticles}`, fontSize: FONT_BODY, margin: [0, 0, 0, 6] as [number, number, number, number] },
    { text: `Motivo: ${truncate(data.reason || '—', 60)}`, fontSize: FONT_SMALL, margin: [0, 0, 0, 8] as [number, number, number, number] },
  )

  if (data.return_type === 'voucher' && data.voucher_code) {
    const expiryDate = new Date(createdAt)
    expiryDate.setFullYear(expiryDate.getFullYear() + 1)
    const expiryStr = expiryDate.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' })
    content.push(
      { canvas: [{ type: 'line', x1: 0, y1: 0, x2: W_PT - 2 * MARGIN_PT, y2: 0, lineWidth: 0.5 }], margin: [0, 0, 0, 6] as [number, number, number, number] },
      { text: 'CÓDIGO DEL VALE', fontSize: FONT_SMALL, alignment: 'center', color: '#555', margin: [0, 0, 0, 2] as [number, number, number, number] },
      { text: data.voucher_code, fontSize: FONT_HEAD + 2, bold: true, alignment: 'center', margin: [0, 0, 0, 2] as [number, number, number, number] },
      { text: `Válido hasta ${expiryStr}`, fontSize: FONT_SMALL, alignment: 'center', color: '#555', margin: [0, 0, 0, 8] as [number, number, number, number] },
    )
  } else if (data.return_type === 'exchange') {
    content.push(
      { text: 'Crédito aplicado en la nueva venta', fontSize: FONT_SMALL, alignment: 'center', color: '#555', margin: [0, 0, 0, 8] as [number, number, number, number] },
    )
  }

  content.push(
    { canvas: [{ type: 'line', x1: 0, y1: 0, x2: W_PT - 2 * MARGIN_PT, y2: 0, lineWidth: 0.5 }], margin: [0, 0, 0, 6] as [number, number, number, number] },
    { text: 'Conserve este ticket como justificante', fontSize: FONT_SMALL, alignment: 'center', color: '#555', margin: [0, 0, 0, 6] as [number, number, number, number] },
    { text: COMPANY.name, fontSize: 6, color: '#999', alignment: 'center', margin: [0, 0, 0, 1] as [number, number, number, number] },
    { text: `${COMPANY.nif} · ${COMPANY.address}`, fontSize: 6, color: '#999', alignment: 'center', margin: [0, 0, 0, 1] as [number, number, number, number] },
    { text: `${COMPANY.postalCode} - ${COMPANY.city} · ${COMPANY.country}`, fontSize: 6, color: '#999', alignment: 'center', margin: [0, 0, 0, 0] as [number, number, number, number] },
  )

  const docDef = {
    pageSize: { width: W_PT, height: H_PT },
    pageMargins: [MARGIN_PT, MARGIN_PT, MARGIN_PT, MARGIN_PT],
    content,
  }

  const pdf = pdfMake.createPdf(docDef as Parameters<typeof pdfMake.createPdf>[0])
  const fileBase = `devolucion-${data.voucher_code ?? data.original_ticket_number ?? 'ticket'}`

  if (mode === 'print') {
    await new Promise<void>((resolve) => {
      (pdf as any).getBlob((blob: Blob) => {
        const url = URL.createObjectURL(blob)
        const win = window.open(url, '_blank')
        if (win) {
          win.addEventListener('load', () => { win.print() })
          setTimeout(() => { try { win.print() } catch {} }, 500)
        } else {
          const a = document.createElement('a')
          a.href = url
          a.download = `${fileBase}.pdf`
          a.click()
        }
        resolve()
      })
    })
  } else {
    await (pdf as { download: (name: string) => void }).download(`${fileBase}.pdf`)
  }
}

export function printReturnTicketPdf(data: ReturnTicketData): Promise<void> {
  return generateReturnTicketPdf(data, 'print')
}
