'use client'

import type { Content } from 'pdfmake'
import { COMPANY, getLogoBase64Client, STORE_PDF_CONFIGS } from '@/lib/pdf/pdf-company'

const STORE_DEFAULT = STORE_PDF_CONFIGS.pinzon

const W_MM = 80
const W_PT = Math.round(W_MM * 2.83465)
const H_PT = 841
const MARGIN_PT = 14
const FONT_SMALL = 7
const FONT_BODY = 9

export interface GiftCardPdfData {
  voucherCode: string
  issuedDate: string
  expiryDate: string
  /** Indica si es la tarjeta principal o un vale residual generado tras un canje */
  kind?: 'gift_card' | 'residual'
  storeAddress?: string | null
  storeSubtitle?: string | null
  storePhones?: string | null
}

function formatDate(value: string): string {
  if (!value) return ''
  const d = new Date(value)
  if (isNaN(d.getTime())) return value
  return d.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

export async function generateGiftCardPdf(data: GiftCardPdfData, mode: 'download' | 'print' = 'print'): Promise<void> {
  const pdfMake = (await import('pdfmake/build/pdfmake')).default
  const vfsModule = await import('pdfmake/build/vfs_fonts')
  const vfs = (vfsModule as { default?: Record<string, string> }).default
  if (typeof pdfMake.addVirtualFileSystem === 'function' && vfs) {
    pdfMake.addVirtualFileSystem(vfs)
  }

  const storeAddress = data.storeAddress ?? STORE_DEFAULT.address
  const storeSubtitle = data.storeSubtitle ?? null
  const storePhones = data.storePhones ?? STORE_DEFAULT.phones
  const logoBase64 = await getLogoBase64Client()

  const isResidual = data.kind === 'residual'
  const title = isResidual ? 'VALE REGALO' : 'TARJETA REGALO'
  const subtitle = isResidual
    ? 'Saldo restante de tu tarjeta regalo'
    : '¡Un regalo para ti!'

  const content: Content[] = [
    ...(logoBase64
      ? [{
          image: logoBase64,
          width: 160,
          alignment: 'center' as const,
          margin: [0, 0, 0, 6] as [number, number, number, number],
        } as Content]
      : []),
    { text: storeAddress, fontSize: FONT_SMALL, alignment: 'center', margin: [0, 0, 0, 2] as [number, number, number, number] },
    ...(storeSubtitle
      ? [{ text: storeSubtitle, fontSize: FONT_SMALL, alignment: 'center', margin: [0, 0, 0, 2] as [number, number, number, number] } as Content]
      : []),
    { text: storePhones, fontSize: FONT_SMALL, alignment: 'center', margin: [0, 0, 0, 2] as [number, number, number, number] },
    { text: `CIF: ${COMPANY.nif}`, fontSize: FONT_SMALL, alignment: 'center', margin: [0, 0, 0, 8] as [number, number, number, number] },

    {
      canvas: [{ type: 'line', x1: 0, y1: 0, x2: W_PT - 2 * MARGIN_PT, y2: 0, lineWidth: 0.8 }],
      margin: [0, 0, 0, 10] as [number, number, number, number],
    },

    {
      text: title,
      fontSize: 22,
      bold: true,
      alignment: 'center',
      margin: [0, 4, 0, 4] as [number, number, number, number],
    },
    {
      text: subtitle,
      fontSize: FONT_BODY,
      italics: true,
      alignment: 'center',
      color: '#444',
      margin: [0, 0, 0, 14] as [number, number, number, number],
    },

    // Caja con el código del vale
    {
      table: {
        widths: ['*'],
        body: [[
          {
            text: data.voucherCode,
            fontSize: 20,
            bold: true,
            alignment: 'center',
            margin: [0, 10, 0, 10] as [number, number, number, number],
          },
        ]],
      },
      layout: {
        hLineWidth: () => 1.5,
        vLineWidth: () => 1.5,
        hLineColor: () => '#000',
        vLineColor: () => '#000',
      },
      margin: [0, 0, 0, 14] as [number, number, number, number],
    },

    {
      text: 'CÓDIGO DEL VALE',
      fontSize: FONT_SMALL,
      alignment: 'center',
      color: '#666',
      margin: [0, 0, 0, 14] as [number, number, number, number],
    },

    {
      canvas: [{ type: 'line', x1: 0, y1: 0, x2: W_PT - 2 * MARGIN_PT, y2: 0, lineWidth: 0.5 }],
      margin: [0, 0, 0, 8] as [number, number, number, number],
    },

    {
      table: {
        widths: ['*', '*'],
        body: [
          [
            { text: 'Emisión:', fontSize: FONT_SMALL, color: '#555' },
            { text: formatDate(data.issuedDate), fontSize: FONT_SMALL, alignment: 'right' },
          ],
          [
            { text: 'Válida hasta:', fontSize: FONT_SMALL, color: '#555' },
            { text: formatDate(data.expiryDate), fontSize: FONT_SMALL, alignment: 'right', bold: true },
          ],
        ],
      },
      layout: 'noBorders',
      margin: [0, 0, 0, 14] as [number, number, number, number],
    },

    {
      canvas: [{ type: 'line', x1: 0, y1: 0, x2: W_PT - 2 * MARGIN_PT, y2: 0, lineWidth: 0.5 }],
      margin: [0, 0, 0, 8] as [number, number, number, number],
    },

    {
      text: 'CÓMO CANJEARLO',
      fontSize: FONT_SMALL,
      bold: true,
      alignment: 'center',
      margin: [0, 0, 0, 4] as [number, number, number, number],
    },
    {
      text: 'Presenta este código en cualquiera de nuestras tiendas al realizar tu compra. El importe se descontará automáticamente del total.',
      fontSize: FONT_SMALL,
      alignment: 'center',
      color: '#444',
      margin: [0, 0, 0, 8] as [number, number, number, number],
    },
    {
      text: 'No canjeable por dinero en efectivo. Si el importe de la compra es menor al saldo, recibirás un nuevo vale por la diferencia.',
      fontSize: 6,
      alignment: 'center',
      color: '#777',
      margin: [0, 0, 0, 12] as [number, number, number, number],
    },

    {
      canvas: [{ type: 'line', x1: 0, y1: 0, x2: W_PT - 2 * MARGIN_PT, y2: 0, lineWidth: 0.5 }],
      margin: [0, 0, 0, 6] as [number, number, number, number],
    },

    {
      text: COMPANY.name,
      fontSize: 6,
      alignment: 'center',
      color: '#999',
    },
    {
      text: `${COMPANY.address}, ${COMPANY.postalCode} ${COMPANY.city}`,
      fontSize: 6,
      alignment: 'center',
      color: '#999',
    },
  ]

  const docDef = {
    pageSize: { width: W_PT, height: H_PT },
    pageMargins: [MARGIN_PT, MARGIN_PT, MARGIN_PT, MARGIN_PT],
    content,
  }

  const pdf = pdfMake.createPdf(docDef as Parameters<typeof pdfMake.createPdf>[0])
  const fileName = `tarjeta-regalo-${data.voucherCode}.pdf`

  if (mode === 'print') {
    await new Promise<void>((resolve) => {
      (pdf as any).getBlob((blob: Blob) => {
        const url = URL.createObjectURL(blob)
        const printWindow = window.open(url, '_blank')

        if (!printWindow) {
          const a = document.createElement('a')
          a.href = url
          a.download = fileName
          a.click()
          setTimeout(() => URL.revokeObjectURL(url), 2000)
          resolve()
          return
        }

        let printed = false
        const triggerPrint = () => {
          if (printed) return
          printed = true
          try {
            printWindow.focus()
            printWindow.print()
          } catch {}
        }

        const onLoad = () => setTimeout(triggerPrint, 500)
        try {
          printWindow.addEventListener('load', onLoad)
        } catch {}
        setTimeout(triggerPrint, 1500)
        setTimeout(() => { try { URL.revokeObjectURL(url) } catch {} }, 60000)

        resolve()
      })
    })
  } else {
    await (pdf as { download: (name: string) => void }).download(fileName)
  }
}

export async function printGiftCardPdf(data: GiftCardPdfData): Promise<void> {
  return generateGiftCardPdf(data, 'print')
}
