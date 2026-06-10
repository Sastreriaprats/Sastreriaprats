'use client'

import type { Content } from 'pdfmake'
import { COMPANY, getLogoBase64Client } from './pdf-company'

// A6 horizontal: 148x105 mm = ~420x298 pt
const W_PT = 420
const H_PT = 298
const MARGIN = 16

const KIND_LABEL: Record<string, string> = {
  gift_card: 'Tarjeta regalo',
  return: 'Vale de devolución',
  residual: 'Vale de saldo',
}

export interface VoucherPdfData {
  code: string
  kind: 'gift_card' | 'return' | 'residual' | string
  amount: number
  /** Si es null, "Al portador" */
  clientName?: string | null
  issuedDate: string
  expiryDate: string | null
  storeName?: string | null
  notes?: string | null
}

function formatDateEs(value: string | null | undefined): string {
  if (!value) return '—'
  const d = new Date(value)
  if (isNaN(d.getTime())) return value
  return d.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

function formatEur(amount: number): string {
  return amount.toLocaleString('es-ES', { style: 'currency', currency: 'EUR', minimumFractionDigits: 2 })
}

/** Genera un PNG dataURL del código de barras CODE128 con el texto debajo. */
async function generateBarcodeDataUrl(code: string): Promise<string | null> {
  try {
    const JsBarcode = (await import('jsbarcode')).default
    const canvas = document.createElement('canvas')
    JsBarcode(canvas, code, {
      format: 'CODE128',
      width: 2,
      height: 70,
      displayValue: true,
      fontSize: 14,
      margin: 0,
    })
    return canvas.toDataURL('image/png')
  } catch (err) {
    console.error('[voucher-pdf] barcode failed:', err)
    return null
  }
}

export async function generateVoucherPdf(
  data: VoucherPdfData,
  mode: 'download' | 'print' = 'download',
): Promise<void> {
  const pdfMake = (await import('pdfmake/build/pdfmake')).default
  const vfsModule = await import('pdfmake/build/vfs_fonts')
  const vfs = (vfsModule as { default?: Record<string, string> }).default
  if (typeof pdfMake.addVirtualFileSystem === 'function' && vfs) {
    pdfMake.addVirtualFileSystem(vfs)
  }

  const [logoBase64, barcodeDataUrl] = await Promise.all([
    getLogoBase64Client(),
    generateBarcodeDataUrl(data.code),
  ])

  const kindLabel = KIND_LABEL[data.kind] ?? 'Vale'
  const clientLabel = data.clientName?.trim() || 'Al portador'

  const content: Content[] = [
    // Header: nombre + logo
    {
      columns: [
        {
          width: '*',
          stack: [
            { text: COMPANY.name.toUpperCase(), fontSize: 12, bold: true, color: '#1a1a2e', characterSpacing: 1 },
            { text: kindLabel.toUpperCase(), fontSize: 8, color: '#666', characterSpacing: 1, margin: [0, 2, 0, 0] as [number, number, number, number] },
          ],
        },
        ...(logoBase64
          ? [{
              image: logoBase64,
              width: 80,
              alignment: 'right' as const,
            }]
          : []),
      ],
      margin: [0, 0, 0, 8] as [number, number, number, number],
    },

    // Línea separadora
    {
      canvas: [{ type: 'line', x1: 0, y1: 0, x2: W_PT - 2 * MARGIN, y2: 0, lineWidth: 0.8, lineColor: '#1a1a2e' }],
      margin: [0, 0, 0, 10] as [number, number, number, number],
    },

    // Caja con código + barcode + importe
    {
      columns: [
        {
          width: '*',
          stack: [
            { text: 'CÓDIGO', fontSize: 7, color: '#888', characterSpacing: 1 },
            { text: data.code, fontSize: 18, bold: true, margin: [0, 2, 0, 8] as [number, number, number, number] },
            ...(barcodeDataUrl
              ? [{ image: barcodeDataUrl, width: 200, margin: [0, 0, 0, 0] as [number, number, number, number] } as Content]
              : [{ text: '(sin código de barras)', fontSize: 7, color: '#aaa' } as Content]),
          ],
        },
        {
          width: 130,
          stack: [
            { text: 'VALOR', fontSize: 7, color: '#888', characterSpacing: 1, alignment: 'right' },
            {
              text: formatEur(data.amount),
              fontSize: 26,
              bold: true,
              alignment: 'right',
              color: '#1a1a2e',
              margin: [0, 2, 0, 0] as [number, number, number, number],
            },
          ],
        },
      ],
      margin: [0, 0, 0, 14] as [number, number, number, number],
    },

    // Datos: cliente, fechas
    {
      table: {
        widths: ['*', '*'],
        body: [
          [
            {
              stack: [
                { text: 'CLIENTE', fontSize: 7, color: '#888', characterSpacing: 1 },
                { text: clientLabel, fontSize: 10, margin: [0, 2, 0, 0] as [number, number, number, number] },
              ],
              border: [false, false, false, false],
            },
            {
              stack: [
                { text: 'EMITIDO', fontSize: 7, color: '#888', characterSpacing: 1, alignment: 'right' },
                { text: formatDateEs(data.issuedDate), fontSize: 10, alignment: 'right', margin: [0, 2, 0, 0] as [number, number, number, number] },
              ],
              border: [false, false, false, false],
            },
          ],
          [
            {
              stack: [
                { text: 'TIENDA', fontSize: 7, color: '#888', characterSpacing: 1 },
                { text: data.storeName ?? '—', fontSize: 10, margin: [0, 2, 0, 0] as [number, number, number, number] },
              ],
              border: [false, false, false, false],
            },
            {
              stack: [
                { text: 'CADUCIDAD', fontSize: 7, color: '#888', characterSpacing: 1, alignment: 'right' },
                { text: formatDateEs(data.expiryDate), fontSize: 10, bold: true, alignment: 'right', margin: [0, 2, 0, 0] as [number, number, number, number] },
              ],
              border: [false, false, false, false],
            },
          ],
        ],
      },
      layout: 'noBorders',
      margin: [0, 0, 0, 10] as [number, number, number, number],
    },

    // Línea separadora
    {
      canvas: [{ type: 'line', x1: 0, y1: 0, x2: W_PT - 2 * MARGIN, y2: 0, lineWidth: 0.4, lineColor: '#cccccc' }],
      margin: [0, 0, 0, 6] as [number, number, number, number],
    },

    // Pie
    {
      text: 'Válido en tiendas Sastrería Prats. No acumulable con otros descuentos. No canjeable por dinero en efectivo.',
      fontSize: 7,
      color: '#666',
      alignment: 'center',
      margin: [0, 0, 0, 2] as [number, number, number, number],
    },
    {
      text: `${COMPANY.address}, ${COMPANY.postalCode} ${COMPANY.city}`,
      fontSize: 6,
      color: '#999',
      alignment: 'center',
    },
  ]

  const docDef = {
    pageSize: { width: W_PT, height: H_PT },
    pageMargins: [MARGIN, MARGIN, MARGIN, MARGIN],
    content,
    defaultStyle: { fontSize: 9 },
  }

  const pdf = pdfMake.createPdf(docDef as Parameters<typeof pdfMake.createPdf>[0])
  const fileName = `vale-${data.code}.pdf`

  if (mode === 'print') {
    // getBuffer() en vez de getBlob(callback): el callback de pdfmake 0.3.6 se cuelga
    // en algunos navegadores (Chrome 148, confirmado por telemetría en el ticket de
    // reserva). getBuffer resuelve donde getBlob no.
    const buf = await (pdf as { getBuffer: () => Promise<unknown> }).getBuffer()
    const blob = new Blob([buf as BlobPart], { type: 'application/pdf' })
    const url = URL.createObjectURL(blob)
    const printWindow = window.open(url, '_blank')
    if (!printWindow) {
      const a = document.createElement('a')
      a.href = url
      a.download = fileName
      a.click()
      setTimeout(() => URL.revokeObjectURL(url), 2000)
    } else {
      let printed = false
      const triggerPrint = () => {
        if (printed) return
        printed = true
        try {
          printWindow.focus()
          printWindow.print()
        } catch { /* ignore */ }
      }
      try { printWindow.addEventListener('load', () => setTimeout(triggerPrint, 500)) } catch { /* cross-origin */ }
      setTimeout(triggerPrint, 1500)
      setTimeout(() => { try { URL.revokeObjectURL(url) } catch {} }, 60000)
    }
  } else {
    await (pdf as { download: (name: string) => void }).download(fileName)
  }
}

export async function printVoucherPdf(data: VoucherPdfData): Promise<void> {
  return generateVoucherPdf(data, 'print')
}

export async function downloadVoucherPdf(data: VoucherPdfData): Promise<void> {
  return generateVoucherPdf(data, 'download')
}
