/**
 * Genera el PDF de arqueo/cierre de caja con pdfmake.
 */

import type { Content } from 'pdfmake'

interface PdfDocDefinition {
  pageSize?: string
  pageOrientation?: string
  pageMargins?: number | number[]
  content: Content[]
  footer?: (currentPage: number, pageCount: number) => Content
}

export interface CashSessionReportData {
  storeName: string
  openedBy: string
  closedBy: string
  openedAt: string
  closedAt: string
  openingAmount: number
  openingBreakdown?: Record<string, number>
  closingBreakdown?: Record<string, number>
  totalSales: number
  totalCashSales: number
  totalCardSales: number
  totalBizumSales: number
  totalTransferSales: number
  totalVoucherSales: number
  totalReturns: number
  totalWithdrawals: number
  depositsCollected?: number
  expectedCash: number
  countedCash: number
  cashDifference: number
  closingNotes?: string
}

const NAVY = '#1B2A4A'
const GOLD = '#C4854A'
const BORDER = '#e2e8f0'
const LABEL_BG = '#f8fafc'
const LABEL_COLOR = '#64748b'
const TEXT = '#1e293b'

const BILLS = [500, 200, 100, 50, 20, 10, 5]
const COINS = [2, 1, 0.5, 0.2, 0.1, 0.05, 0.02, 0.01]
const ALL_DENOMS = [...BILLS, ...COINS]

function fmt(n: number): string {
  return n.toFixed(2) + ' €'
}

function formatDenom(d: number): string {
  return d >= 1 ? `${d} €` : `${Math.round(d * 100)} ct`
}

function fmtDt(iso: string): string {
  if (!iso) return '—'
  try {
    return new Date(iso).toLocaleString('es-ES', {
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    })
  } catch { return iso }
}

const tableLayout = {
  hLineWidth: () => 0.5,
  vLineWidth: () => 0.5,
  hLineColor: () => BORDER,
  vLineColor: () => BORDER,
}

function sectionHeader(title: string): Content {
  return {
    table: {
      widths: ['*'],
      body: [[{
        text: title,
        fillColor: NAVY,
        color: '#ffffff',
        bold: true,
        fontSize: 9,
        margin: [8, 5, 8, 5],
      }]],
    },
    layout: 'noBorders',
    margin: [0, 10, 0, 0] as [number, number, number, number],
  }
}

function kv(label: string, value: string, valueColor = TEXT): Content {
  return {
    columns: [
      { text: label, width: 140, color: LABEL_COLOR, fontSize: 9 },
      { text: value, fontSize: 9, bold: true, color: valueColor },
    ],
    margin: [0, 2, 0, 2] as [number, number, number, number],
  }
}

function buildBreakdownTable(breakdown: Record<string, number>): Content | null {
  const rows: Content[][] = []

  for (const denom of ALL_DENOMS) {
    const qty = breakdown[String(denom)] ?? 0
    if (qty === 0) continue
    const subtotal = qty * denom
    rows.push([
      { text: formatDenom(denom), fontSize: 9, color: TEXT },
      { text: String(qty), fontSize: 9, alignment: 'center' as const, color: TEXT },
      { text: fmt(subtotal), fontSize: 9, alignment: 'right' as const, bold: true, color: TEXT },
    ])
  }

  if (rows.length === 0) return null

  const totalBreakdown = Object.entries(breakdown).reduce((acc, [d, q]) => acc + parseFloat(d) * (q || 0), 0)

  return {
    table: {
      widths: ['*', 60, 80],
      body: [
        [
          { text: 'Denominación', fontSize: 8, color: LABEL_COLOR, fillColor: LABEL_BG },
          { text: 'Cantidad', fontSize: 8, alignment: 'center' as const, color: LABEL_COLOR, fillColor: LABEL_BG },
          { text: 'Subtotal', fontSize: 8, alignment: 'right' as const, color: LABEL_COLOR, fillColor: LABEL_BG },
        ],
        ...rows,
        [
          { text: 'TOTAL', fontSize: 9, bold: true, color: NAVY, colSpan: 2 } as any,
          {},
          { text: fmt(Math.round(totalBreakdown * 100) / 100), fontSize: 9, bold: true, alignment: 'right' as const, color: NAVY },
        ],
      ],
    },
    layout: tableLayout,
    margin: [0, 4, 0, 0] as [number, number, number, number],
  }
}

function buildDocDefinition(d: CashSessionReportData): PdfDocDefinition {
  const hoy = new Date().toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' })
  const content: Content[] = []

  // ─── CABECERA ─────────────────────────────────────────────────────────────
  content.push({
    table: {
      widths: ['*', 'auto'],
      body: [[
        {
          stack: [
            { text: 'ARQUEO DE CAJA', fontSize: 16, bold: true, color: '#ffffff' },
            { text: d.storeName || 'Sastrería Prats', fontSize: 10, color: 'rgba(255,255,255,0.7)', margin: [0, 2, 0, 0] },
          ],
          margin: [12, 10, 8, 10],
        },
        {
          stack: [
            { text: 'Documento interno', fontSize: 8, color: 'rgba(255,255,255,0.6)', alignment: 'right' as const },
            { text: hoy, fontSize: 9, color: '#ffffff', bold: true, alignment: 'right' as const, margin: [0, 2, 0, 0] },
          ],
          margin: [8, 10, 12, 10],
        },
      ]],
    },
    layout: {
      hLineWidth: () => 0,
      vLineWidth: () => 0,
      fillColor: () => NAVY,
    },
  })

  // ─── APERTURA / CIERRE ───────────────────────────────────────────────────
  content.push({
    columns: [
      {
        width: '50%',
        stack: [
          sectionHeader('APERTURA'),
          kv('Fecha y hora:', fmtDt(d.openedAt)),
          kv('Responsable:', d.openedBy || '—'),
          kv('Fondo inicial:', fmt(d.openingAmount), NAVY),
        ],
        margin: [0, 0, 8, 0],
      },
      {
        width: '50%',
        stack: [
          sectionHeader('CIERRE'),
          kv('Fecha y hora:', fmtDt(d.closedAt)),
          kv('Responsable:', d.closedBy || '—'),
          kv('Efectivo contado:', fmt(d.countedCash), NAVY),
        ],
        margin: [8, 0, 0, 0],
      },
    ],
    columnGap: 0,
    margin: [0, 8, 0, 0] as [number, number, number, number],
  })

  // ─── RESUMEN DE VENTAS ───────────────────────────────────────────────────
  content.push(sectionHeader('RESUMEN DE VENTAS'))
  content.push({
    table: {
      widths: ['*', 80],
      body: [
        [
          { text: 'Método de pago', fontSize: 8, color: LABEL_COLOR, fillColor: LABEL_BG },
          { text: 'Importe', fontSize: 8, alignment: 'right' as const, color: LABEL_COLOR, fillColor: LABEL_BG },
        ],
        [
          { text: 'Efectivo', fontSize: 9, color: TEXT },
          { text: fmt(d.totalCashSales), fontSize: 9, alignment: 'right' as const, color: TEXT },
        ],
        [
          { text: 'Tarjeta', fontSize: 9, color: TEXT },
          { text: fmt(d.totalCardSales), fontSize: 9, alignment: 'right' as const, color: TEXT },
        ],
        [
          { text: 'Bizum', fontSize: 9, color: TEXT },
          { text: fmt(d.totalBizumSales), fontSize: 9, alignment: 'right' as const, color: TEXT },
        ],
        [
          { text: 'Transferencia', fontSize: 9, color: TEXT },
          { text: fmt(d.totalTransferSales), fontSize: 9, alignment: 'right' as const, color: TEXT },
        ],
        [
          { text: 'Vales', fontSize: 9, color: TEXT },
          { text: fmt(d.totalVoucherSales), fontSize: 9, alignment: 'right' as const, color: TEXT },
        ],
        [
          { text: 'TOTAL VENTAS', fontSize: 9, bold: true, color: NAVY },
          { text: fmt(d.totalSales), fontSize: 9, bold: true, alignment: 'right' as const, color: NAVY },
        ],
      ],
    },
    layout: tableLayout,
    margin: [0, 4, 0, 0] as [number, number, number, number],
  })

  // ─── MOVIMIENTOS ─────────────────────────────────────────────────────────
  content.push(sectionHeader('MOVIMIENTOS'))
  content.push({
    table: {
      widths: ['*', 80],
      body: [
        [
          { text: 'Concepto', fontSize: 8, color: LABEL_COLOR, fillColor: LABEL_BG },
          { text: 'Importe', fontSize: 8, alignment: 'right' as const, color: LABEL_COLOR, fillColor: LABEL_BG },
        ],
        [
          { text: 'Devoluciones', fontSize: 9, color: TEXT },
          { text: '− ' + fmt(d.totalReturns), fontSize: 9, alignment: 'right' as const, color: '#dc2626' },
        ],
        [
          { text: 'Retiradas de caja', fontSize: 9, color: TEXT },
          { text: '− ' + fmt(d.totalWithdrawals), fontSize: 9, alignment: 'right' as const, color: '#dc2626' },
        ],
        ...(d.depositsCollected ? [[
          { text: 'Depósitos cobrados', fontSize: 9, color: TEXT },
          { text: fmt(d.depositsCollected), fontSize: 9, alignment: 'right' as const, color: '#16a34a' },
        ]] : []),
      ],
    },
    layout: tableLayout,
    margin: [0, 4, 0, 0] as [number, number, number, number],
  })

  // ─── DESGLOSE DE EFECTIVO (si hay breakdown) ─────────────────────────────
  if (d.closingBreakdown) {
    const breakdownTable = buildBreakdownTable(d.closingBreakdown)
    if (breakdownTable) {
      content.push(sectionHeader('DESGLOSE DE EFECTIVO CONTADO'))
      content.push(breakdownTable)
    }
  }

  // ─── RESULTADO DEL ARQUEO ────────────────────────────────────────────────
  content.push(sectionHeader('RESULTADO DEL ARQUEO'))

  const diffColor = Math.abs(d.cashDifference) < 0.01
    ? '#16a34a'
    : d.cashDifference > 0
      ? '#d97706'
      : '#dc2626'

  const diffSign = d.cashDifference > 0 ? '+' : ''

  content.push({
    table: {
      widths: ['*', 100],
      body: [
        [
          { text: 'Efectivo esperado en caja', fontSize: 9, color: TEXT },
          { text: fmt(d.expectedCash), fontSize: 9, alignment: 'right' as const, color: TEXT },
        ],
        [
          { text: 'Efectivo contado', fontSize: 9, color: TEXT },
          { text: fmt(d.countedCash), fontSize: 9, alignment: 'right' as const, color: TEXT },
        ],
        [
          {
            text: Math.abs(d.cashDifference) < 0.01
              ? 'Diferencia  ✓  Cuadra exacto'
              : `Diferencia  ${d.cashDifference > 0 ? '↑ Sobrante' : '↓ Faltante'}`,
            fontSize: 10,
            bold: true,
            color: diffColor,
          },
          {
            text: diffSign + fmt(d.cashDifference),
            fontSize: 12,
            bold: true,
            alignment: 'right' as const,
            color: diffColor,
          },
        ],
      ],
    },
    layout: {
      hLineWidth: (i: number, node: any) => (i === 0 || i === node.table.body.length) ? 0.5 : 0.5,
      vLineWidth: () => 0.5,
      hLineColor: () => BORDER,
      vLineColor: () => BORDER,
      fillColor: (rowIndex: number) => rowIndex === 2 ? (Math.abs(d.cashDifference) < 0.01 ? '#f0fdf4' : d.cashDifference > 0 ? '#fffbeb' : '#fef2f2') : null,
    },
    margin: [0, 4, 0, 0] as [number, number, number, number],
  })

  // ─── NOTAS DE CIERRE ─────────────────────────────────────────────────────
  if (d.closingNotes?.trim()) {
    content.push(sectionHeader('NOTAS DE CIERRE'))
    content.push({
      text: d.closingNotes.trim(),
      fontSize: 9,
      color: TEXT,
      margin: [0, 4, 0, 0] as [number, number, number, number],
    })
  }

  // ─── FIRMA ───────────────────────────────────────────────────────────────
  content.push({
    columns: [
      {
        width: '48%',
        stack: [
          { text: '', margin: [0, 30, 0, 0] },
          { canvas: [{ type: 'line', x1: 0, y1: 0, x2: 180, y2: 0, lineWidth: 0.5, lineColor: BORDER }] },
          { text: 'Firma — apertura', fontSize: 8, color: LABEL_COLOR, margin: [0, 3, 0, 0] },
          { text: d.openedBy || '—', fontSize: 8, color: TEXT },
        ],
      },
      { width: '4%', text: '' },
      {
        width: '48%',
        stack: [
          { text: '', margin: [0, 30, 0, 0] },
          { canvas: [{ type: 'line', x1: 0, y1: 0, x2: 180, y2: 0, lineWidth: 0.5, lineColor: BORDER }] },
          { text: 'Firma — cierre', fontSize: 8, color: LABEL_COLOR, margin: [0, 3, 0, 0] },
          { text: d.closedBy || '—', fontSize: 8, color: TEXT },
        ],
      },
    ],
    margin: [0, 24, 0, 0] as [number, number, number, number],
  })

  return {
    pageSize: 'A4',
    pageOrientation: 'portrait',
    pageMargins: [40, 40, 40, 50],
    content,
    footer: () => ({
      text: 'Sastrería Prats — Documento interno — No válido como factura',
      alignment: 'center',
      color: LABEL_COLOR,
      fontSize: 7,
      margin: [0, 8, 0, 0],
    }),
  }
}

export async function generateCashSessionReport(data: CashSessionReportData): Promise<void> {
  const pdfMake = (await import('pdfmake/build/pdfmake')).default
  const vfsModule = await import('pdfmake/build/vfs_fonts')
  const vfs = (vfsModule as { default?: Record<string, string> }).default
  if (typeof pdfMake.addVirtualFileSystem === 'function' && vfs) {
    pdfMake.addVirtualFileSystem(vfs)
  }

  const docDef = buildDocDefinition(data)
  const pdf = pdfMake.createPdf(docDef as Parameters<typeof pdfMake.createPdf>[0])

  const date = data.closedAt
    ? new Date(data.closedAt).toLocaleDateString('es-ES').replace(/\//g, '-')
    : new Date().toLocaleDateString('es-ES').replace(/\//g, '-')
  const fileName = `arqueo-caja-${date}.pdf`

  await pdf.download(fileName)
}
