/**
 * Constructores de bloques PDF compartidos por factura y presupuesto.
 * Garantiza diseño idéntico entre ambos documentos.
 */
import type { Content } from 'pdfmake'
import { COMPANY, formatDateDDMMYYYY, eurFormat } from './pdf-company'

export const HEADER_BG = '#1a1a2e'
export const TABLE_HEADER_BG = '#718096'
export const ROW_ALT = '#f5f7fa'

const SEPARATOR_COLOR = '#cccccc'

export function n(v: unknown): number {
  if (v == null) return 0
  if (typeof v === 'number' && !Number.isNaN(v)) return v
  return Number(String(v).replace(',', '.')) || 0
}

export function buildHeader(
  title: string,
  displayNumber: string,
  logoData: string | null,
): Content {
  const numberBadge: Content = {
    columns: [
      { text: '', width: '*' },
      {
        width: 'auto',
        table: {
          widths: ['auto'],
          body: [[{
            text: `Nº: ${displayNumber}`,
            fillColor: '#ffffff',
            color: HEADER_BG,
            bold: true,
            fontSize: 10,
            margin: [10, 4, 10, 4] as [number, number, number, number],
          }]],
        },
        layout: 'noBorders',
      },
    ],
    margin: [0, 6, 0, 0] as [number, number, number, number],
  }

  return {
    table: {
      widths: ['40%', '60%'],
      body: [[
        {
          fillColor: HEADER_BG,
          alignment: 'left' as const,
          margin: [16, 10, 16, 10] as [number, number, number, number],
          ...(logoData
            ? { image: logoData, width: 80 }
            : { text: 'SASTRERÍA PRATS', fontSize: 18, bold: true, color: 'white' }),
        },
        {
          fillColor: HEADER_BG,
          stack: [
            {
              text: title,
              fontSize: 20,
              bold: true,
              color: 'white',
              alignment: 'right',
              margin: [0, 0, 0, 6] as [number, number, number, number],
            },
            numberBadge,
          ] as Content[],
          alignment: 'right',
          margin: [0, 12, 16, 12] as [number, number, number, number],
        },
      ]],
    },
    layout: 'noBorders',
    margin: [0, 0, 0, 0] as [number, number, number, number],
  } as Content
}

/** Bloque combinado: Empresa | Cliente (con separador vertical) + Fechas debajo */
export function buildInfoSection(params: {
  clientName: string | null
  clientNif: string | null
  clientAddress: string | null
  label1: string
  date1: string | null
  label2?: string
  date2?: string | null
}): Content[] {
  const { clientName, clientNif, clientAddress, label1, date1, label2, date2 } = params

  const infoTable: Content = {
    table: {
      widths: ['50%', '50%'],
      body: [
        [
          {
            text: 'EMPRESA',
            fontSize: 7,
            bold: true,
            color: '#888',
            border: [false, false, false, true] as [boolean, boolean, boolean, boolean],
            margin: [0, 0, 0, 4] as [number, number, number, number],
          },
          {
            text: 'CLIENTE',
            fontSize: 7,
            bold: true,
            color: '#888',
            border: [false, false, false, true] as [boolean, boolean, boolean, boolean],
            margin: [0, 0, 0, 4] as [number, number, number, number],
          },
        ],
        [
          {
            stack: [
              { text: COMPANY.name, fontSize: 10, bold: true, color: 'black', margin: [0, 0, 0, 2] as [number, number, number, number] },
              { text: `NIF / CIF: ${COMPANY.nif}`, fontSize: 9, color: HEADER_BG, margin: [0, 0, 0, 1] as [number, number, number, number] },
              { text: COMPANY.address, fontSize: 9, color: HEADER_BG, margin: [0, 0, 0, 1] as [number, number, number, number] },
              { text: `${COMPANY.postalCode}, ${COMPANY.city}, ${COMPANY.country}`, fontSize: 9, color: HEADER_BG },
            ],
            border: [false, false, false, false] as [boolean, boolean, boolean, boolean],
            margin: [0, 4, 0, 10] as [number, number, number, number],
          },
          {
            stack: [
              { text: clientName || '—', fontSize: 10, bold: true, color: 'black', margin: [0, 0, 0, 2] as [number, number, number, number] },
              { text: `NIF / CIF: ${clientNif ?? ''}`, fontSize: 9, color: HEADER_BG, margin: [0, 0, 0, 1] as [number, number, number, number] },
              { text: `Dirección: ${clientAddress ?? ''}`, fontSize: 9, color: HEADER_BG },
            ],
            border: [false, false, false, false] as [boolean, boolean, boolean, boolean],
            margin: [0, 4, 0, 10] as [number, number, number, number],
          },
        ],
      ],
    },
    layout: {
      hLineWidth: () => 0.5,
      vLineWidth: () => 0,
      hLineColor: () => SEPARATOR_COLOR,
    },
    margin: [0, 12, 0, 6] as [number, number, number, number],
  }

  const sep: Content = {
    canvas: [{ type: 'line', x1: 0, y1: 0, x2: 515, y2: 0, lineWidth: 0.5, lineColor: SEPARATOR_COLOR }],
    margin: [0, 0, 0, 6] as [number, number, number, number],
  }

  const datesRow: Content = {
    columns: [
      { text: '', width: '*' },
      {
        stack: [
          {
            columns: [
              { text: label1, fontSize: 8, color: '#666', width: 75 },
              { text: formatDateDDMMYYYY(date1), fontSize: 10, bold: true, color: 'black' },
            ],
            margin: [0, 0, 0, label2 ? 3 : 0] as [number, number, number, number],
          },
          ...(label2
            ? [{
                columns: [
                  { text: label2, fontSize: 8, color: '#666', width: 75 },
                  { text: formatDateDDMMYYYY(date2 ?? null), fontSize: 10, bold: true, color: 'black' },
                ],
              }]
            : []),
        ],
      },
    ],
    margin: [0, 2, 0, 6] as [number, number, number, number],
  }

  const sep2: Content = {
    canvas: [{ type: 'line', x1: 0, y1: 0, x2: 515, y2: 0, lineWidth: 0.5, lineColor: SEPARATOR_COLOR }],
    margin: [0, 0, 0, 14] as [number, number, number, number],
  }

  return [infoTable, sep, datesRow, sep2]
}

export type PdfLine = {
  description: string
  quantity: number
  unit_price: number
  tax_rate: number
  line_total: number
}

export function buildTableBody(lines: PdfLine[]): unknown[][] {
  const header = [
    { text: 'CONCEPTO', fillColor: TABLE_HEADER_BG, color: 'white', bold: true, fontSize: 9 },
    { text: 'CANT.', fillColor: TABLE_HEADER_BG, color: 'white', bold: true, fontSize: 9, alignment: 'center' },
    { text: 'PRECIO', fillColor: TABLE_HEADER_BG, color: 'white', bold: true, fontSize: 9, alignment: 'right' },
    { text: 'IVA', fillColor: TABLE_HEADER_BG, color: 'white', bold: true, fontSize: 9, alignment: 'center' },
    { text: 'TOTAL', fillColor: TABLE_HEADER_BG, color: 'white', bold: true, fontSize: 9, alignment: 'right' },
  ]
  const body: unknown[][] = [header]
  lines.forEach((ln, i) => {
    const alt = i % 2 === 1 ? ROW_ALT : undefined
    body.push([
      { text: String(ln.description ?? '').slice(0, 80), fillColor: alt, fontSize: 9 },
      { text: String(n(ln.quantity)), fillColor: alt, fontSize: 9, alignment: 'center' },
      { text: eurFormat(n(ln.unit_price)), fillColor: alt, fontSize: 9, alignment: 'right' },
      { text: `${n(ln.tax_rate)}%`, fillColor: alt, fontSize: 9, alignment: 'center' },
      { text: eurFormat(n(ln.line_total)), fillColor: alt, fontSize: 9, bold: true, alignment: 'right' },
    ])
  })
  return body
}

export function buildTotals(params: {
  subtotal: number
  taxRate: number
  taxAmount: number
  irpfRate: number
  irpfAmount: number
  total: number
}): Content {
  const { subtotal, taxRate, taxAmount, irpfRate, irpfAmount, total } = params
  return {
    columns: [
      { text: '', width: '*' },
      {
        width: 200,
        stack: [
          {
            text: `Subtotal:         ${eurFormat(n(subtotal))}`,
            alignment: 'right',
            margin: [0, 0, 0, 4] as [number, number, number, number],
            fontSize: 10,
          },
          {
            text: `IVA (${n(taxRate)}%):         ${eurFormat(n(taxAmount))}`,
            alignment: 'right',
            margin: [0, 0, 0, 4] as [number, number, number, number],
            fontSize: 10,
          },
          ...(n(irpfAmount) > 0
            ? [{
                text: `IRPF (${n(irpfRate)}%):   -${eurFormat(n(irpfAmount))}`,
                alignment: 'right' as const,
                margin: [0, 0, 0, 4] as [number, number, number, number],
                fontSize: 10,
              }]
            : []),
          {
            table: {
              widths: [200],
              body: [[{
                columns: [
                  { text: 'TOTAL', bold: true, fontSize: 13, color: 'white', width: '*' },
                  { text: eurFormat(n(total)), bold: true, fontSize: 13, color: 'white', alignment: 'right' },
                ],
                fillColor: HEADER_BG,
                margin: [10, 7, 10, 7] as [number, number, number, number],
              }]],
            },
            layout: 'noBorders',
            margin: [0, 8, 0, 0] as [number, number, number, number],
          },
        ],
      },
    ],
    margin: [0, 12, 0, 0] as [number, number, number, number],
  } as Content
}

export function buildSectionBox(title: string, rows: Content[]): Content {
  return {
    table: {
      widths: ['*'],
      body: [
        [{
          text: title,
          fillColor: HEADER_BG,
          color: 'white',
          bold: true,
          fontSize: 9,
          margin: [8, 6, 8, 6] as [number, number, number, number],
        }],
        ...rows.map(row => [row]),
      ],
    },
    layout: {
      hLineWidth: () => 0.5,
      vLineWidth: () => 0.5,
      hLineColor: () => SEPARATOR_COLOR,
      vLineColor: () => SEPARATOR_COLOR,
    },
    margin: [0, 16, 0, 0] as [number, number, number, number],
  } as Content
}

/** Función de pie de página fijo para pdfmake (usar en docDef.footer) */
export function buildPageFooter() {
  return (): Content => ({
    stack: [
      {
        canvas: [{ type: 'line', x1: 40, y1: 0, x2: 555, y2: 0, lineWidth: 0.5, lineColor: '#e0e0e0' }],
        margin: [0, 0, 0, 4] as [number, number, number, number],
      },
      { text: COMPANY.footerLine1, fontSize: 7, color: '#888', alignment: 'center' },
      { text: COMPANY.registroMercantil, fontSize: 6, color: '#888', alignment: 'center', margin: [0, 1, 0, 0] as [number, number, number, number] },
      { text: `Teléfono: ${COMPANY.phone} · ${COMPANY.email} · ${COMPANY.web}`, fontSize: 6, color: '#888', alignment: 'center', margin: [0, 1, 0, 0] as [number, number, number, number] },
    ],
    margin: [0, 8, 0, 0] as [number, number, number, number],
  })
}

export async function initPdfMake() {
  const pdfMake = (await import('pdfmake/build/pdfmake')).default
  const vfsModule = await import('pdfmake/build/vfs_fonts')
  const vfs = (vfsModule as { default?: Record<string, string> }).default
  if (typeof pdfMake.addVirtualFileSystem === 'function' && vfs) {
    pdfMake.addVirtualFileSystem(vfs)
  }
  return pdfMake
}
