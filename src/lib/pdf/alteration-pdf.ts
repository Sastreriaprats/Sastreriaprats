'use client'

/**
 * PDF de la "Hoja de arreglos" de Sastrería Prats (A4 horizontal).
 *
 * Reproduce el diseño físico:
 *   ┌──────────┐         Prats (logo manuscrito)         ┌──────────┐
 *   │  Nº arr  │       HOJA DE ARREGLOS (tracking)       │  Fecha   │
 *   └──────────┘                                          └──────────┘
 *
 *   CLIENTE ______________________________________________________
 *   TELÉFONO _______________     IMPORTE __________________________
 *   TIPO DE PRENDA _______________________________________________
 *   OFICIAL ______________________________________________________
 *   ARREGLOS _____________________________________________________
 *            _____________________________________________________
 *            _____________________________________________________
 *            _____________________________________________________
 *
 *   FECHA DE ENVÍO TALLER ________   FECHA DE ENTREGA CLIENTE _____
 *
 *   ┌──CONFORME CLIENTE──┐ ┌──OBSERVACIONES──┐ ┌──FIRMA CLIENTE──┐
 *   │                    │ │                 │ │                 │
 *   └────────────────────┘ └─────────────────┘ └─────────────────┘
 */

import type { Content, TDocumentDefinitions } from 'pdfmake/interfaces'
import { COMPANY, getLogoBase64Client } from './pdf-company'
import type { AlterationWithRelations } from '@/types/alterations'
import { getAlteration } from '@/actions/alterations'

// A4 horizontal: 842 x 595 pt
const PAGE_W = 842
const PAGE_H = 595
const MARGIN = 35
const CONTENT_W = PAGE_W - 2 * MARGIN // 742 pt

const BORDER = '#000000'
const GRAY_LABEL = '#333333'

function formatDateSlashes(date: string | null | undefined): string {
  if (!date) return ''
  // date viene como 'YYYY-MM-DD' o ISO; cogemos solo la parte de fecha
  const d = new Date(date)
  if (Number.isNaN(d.getTime())) return ''
  const day = String(d.getDate()).padStart(2, '0')
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const year = d.getFullYear()
  return `${day} / ${month} / ${year}`
}

interface BoxCanvas {
  type: 'rect'
  x: number
  y: number
  w: number
  h: number
  r: number
  lineWidth: number
  lineColor: string
  color?: string
}

/** Caja rectangular redondeada (solo borde). */
function roundedBox(x: number, y: number, w: number, h: number, r = 12): BoxCanvas {
  return { type: 'rect', x, y, w, h, r, lineWidth: 0.75, lineColor: BORDER }
}

/**
 * Línea con label en mayúsculas (bold) seguida de la línea continua hasta el final.
 * El valor va encima de la línea, alineado.
 */
function fieldLine(label: string, value: string, opts?: { width?: number }): Content {
  const totalWidth = opts?.width ?? CONTENT_W
  return {
    stack: [
      {
        columns: [
          { text: label, bold: true, fontSize: 9, width: 'auto', characterSpacing: 0.6 },
          {
            text: value,
            fontSize: 11,
            margin: [10, -2, 0, 0] as [number, number, number, number],
            width: '*',
          },
        ],
      },
      {
        canvas: [{ type: 'line', x1: 0, y1: 0, x2: totalWidth, y2: 0, lineWidth: 0.6, lineColor: BORDER }],
        margin: [0, 2, 0, 0] as [number, number, number, number],
      },
    ] as Content[],
    margin: [0, 0, 0, 8] as [number, number, number, number],
  }
}

/** Línea con label y línea continua, sin valor (para que el cliente firme/anote a mano). */
function emptyLine(label?: string, totalWidth: number = CONTENT_W): Content {
  return {
    stack: [
      label
        ? { text: label, bold: true, fontSize: 9, characterSpacing: 0.6 }
        : { text: ' ', fontSize: 11 },
      {
        canvas: [{ type: 'line', x1: 0, y1: 0, x2: totalWidth, y2: 0, lineWidth: 0.6, lineColor: BORDER }],
        margin: [0, 2, 0, 0] as [number, number, number, number],
      },
    ] as Content[],
    margin: [0, 0, 0, 8] as [number, number, number, number],
  }
}

/** Dos columnas 50/50 con label/value. */
function twoColumns(left: { label: string; value: string }, right: { label: string; value: string }): Content {
  const colW = (CONTENT_W - 20) / 2
  return {
    columns: [
      { width: colW, stack: [fieldLine(left.label, left.value, { width: colW })] },
      { width: 20, text: '' },
      { width: colW, stack: [fieldLine(right.label, right.value, { width: colW })] },
    ],
    columnGap: 0,
  }
}

export function buildAlterationDocDefinition(
  alteration: AlterationWithRelations,
  logoBase64: string | null,
): TDocumentDefinitions {
  const clientName = alteration.clients?.full_name || ''
  const phone = alteration.phone || alteration.clients?.phone || ''
  const officialName = alteration.official_name || alteration.official?.name || ''
  const description = alteration.description || ''

  // ── HEADER ────────────────────────────────────────────────────────
  // Tres columnas: caja nº arreglo · logo+título · caja fecha
  const headerBoxW = 200
  const headerBoxH = 55
  const centerW = CONTENT_W - 2 * headerBoxW - 20 // espaciado entre cajas

  const header: Content = {
    columns: [
      // Caja izquierda con número
      {
        width: headerBoxW,
        stack: [
          {
            canvas: [roundedBox(0, 0, headerBoxW, headerBoxH, 20)],
          },
          {
            text: alteration.alteration_number || '',
            fontSize: 14,
            bold: true,
            alignment: 'center',
            // Centrado vertical: bajamos hasta la mitad de la caja (55pt → -38)
            absolutePosition: undefined,
            margin: [0, -38, 0, 0] as [number, number, number, number],
          },
        ],
      },
      { width: 10, text: '' },
      // Centro: logo + título
      {
        width: centerW,
        stack: [
          ...(logoBase64
            ? [{
                image: logoBase64,
                width: 120,
                alignment: 'center' as const,
              } as Content]
            : [{ text: 'Prats', fontSize: 28, italics: true, alignment: 'center' } as Content]),
          {
            text: 'HOJA DE ARREGLOS',
            fontSize: 14,
            bold: true,
            color: GRAY_LABEL,
            alignment: 'center',
            characterSpacing: 4,
            margin: [0, 6, 0, 0] as [number, number, number, number],
          },
        ],
      },
      { width: 10, text: '' },
      // Caja derecha con fecha
      {
        width: headerBoxW,
        stack: [
          {
            text: 'FECHA DE ARREGLO',
            bold: true,
            fontSize: 9,
            characterSpacing: 0.6,
            alignment: 'center',
            margin: [0, 0, 0, 4] as [number, number, number, number],
          },
          {
            canvas: [roundedBox(0, 0, headerBoxW, headerBoxH - 14, 20)],
          },
          {
            text: formatDateSlashes(alteration.alteration_date),
            fontSize: 12,
            alignment: 'center',
            // Centrado en la caja interior (55-14=41pt → -30)
            margin: [0, -30, 0, 0] as [number, number, number, number],
          },
        ],
      },
    ],
    margin: [0, 0, 0, 18] as [number, number, number, number],
  }

  // ── CUERPO ────────────────────────────────────────────────────────
  // Partimos description en líneas para rellenar 4 filas (1 label + 3 continuación)
  const descLines = splitDescriptionLines(description, 4)

  const body: Content[] = [
    fieldLine('CLIENTE', clientName),
    twoColumns(
      { label: 'TELÉFONO', value: phone },
      // IMPORTE: la label se mantiene fiel al diseño original de la ficha de Prats.
      // El cobro se gestiona por caja, no por el módulo de arreglos: el valor sale
      // siempre vacío y queda como línea con underline para rellenar a mano si hace falta.
      { label: 'IMPORTE', value: '' },
    ),
    { text: '', margin: [0, 0, 0, 8] as [number, number, number, number] },
    fieldLine('TIPO DE PRENDA', alteration.garment_type || ''),
    fieldLine('OFICIAL', officialName),
    fieldLine('ARREGLOS', descLines[0] ?? ''),
    emptyLine(undefined, CONTENT_W),
    emptyLine(undefined, CONTENT_W),
    emptyLine(undefined, CONTENT_W),
  ]

  // Sobrescribimos las 3 líneas de continuación con los textos extra (si los hay)
  // (mantenemos la firma de emptyLine pero con valor cuando exista)
  if (descLines[1] || descLines[2] || descLines[3]) {
    // Reemplazamos las 3 últimas entradas vacías con líneas con valor
    const last3 = [descLines[1], descLines[2], descLines[3]].map((val) => ({
      stack: [
        { text: val ?? '', fontSize: 11, margin: [10, 0, 0, 0] as [number, number, number, number] },
        {
          canvas: [{ type: 'line' as const, x1: 0, y1: 0, x2: CONTENT_W, y2: 0, lineWidth: 0.6, lineColor: BORDER }],
          margin: [0, 2, 0, 0] as [number, number, number, number],
        },
      ],
      margin: [0, 0, 0, 8] as [number, number, number, number],
    }))
    body.splice(body.length - 3, 3, ...last3)
  }

  // Fechas envío/entrega
  const halfW = (CONTENT_W - 20) / 2
  body.push({
    columns: [
      { width: halfW, stack: [fieldLine('FECHA DE ENVÍO TALLER', formatDateSlashes(alteration.workshop_sent_date), { width: halfW })] },
      { width: 20, text: '' },
      { width: halfW, stack: [fieldLine('FECHA DE ENTREGA CLIENTE', formatDateSlashes(alteration.client_delivery_date), { width: halfW })] },
    ],
  })

  // ── FOOTER: 3 cajas para firma a mano ──────────────────────────
  const footerBoxH = 70
  const footerGap = 15
  const footerBoxW = (CONTENT_W - 2 * footerGap) / 3

  const footerBox = (label: string) => ({
    width: footerBoxW,
    stack: [
      { canvas: [roundedBox(0, 0, footerBoxW, footerBoxH, 12)] },
      {
        text: label,
        bold: true,
        fontSize: 9,
        characterSpacing: 0.6,
        // Sube el label hasta cerca del borde superior de la caja (70-6=64)
        margin: [10, -64, 0, 0] as [number, number, number, number],
      },
    ] as Content[],
  })

  const footer: Content = {
    columns: [
      footerBox('CONFORME CLIENTE'),
      { width: footerGap, text: '' },
      footerBox('OBSERVACIONES'),
      { width: footerGap, text: '' },
      footerBox('FIRMA CLIENTE'),
    ],
    margin: [0, 14, 0, 0] as [number, number, number, number],
  }

  return {
    pageSize: { width: PAGE_W, height: PAGE_H },
    pageOrientation: 'landscape',
    pageMargins: [MARGIN, MARGIN, MARGIN, MARGIN] as [number, number, number, number],
    info: {
      title: `Hoja de arreglos ${alteration.alteration_number}`,
      author: COMPANY.name,
    },
    defaultStyle: { fontSize: 10 },
    content: [header, ...body, footer],
  }
}

/** Reparte el texto en hasta `maxLines` cortando por palabras de ~95 chars cada una. */
function splitDescriptionLines(text: string, maxLines: number): string[] {
  const lines: string[] = []
  const remaining = (text || '').replace(/\s+/g, ' ').trim()
  if (!remaining) return Array(maxLines).fill('')
  const charsPerLine = 95
  let rest = remaining
  while (rest.length > 0 && lines.length < maxLines) {
    if (rest.length <= charsPerLine) {
      lines.push(rest)
      rest = ''
    } else {
      // Cortar por espacio cercano a charsPerLine
      let cut = rest.lastIndexOf(' ', charsPerLine)
      if (cut <= 0) cut = charsPerLine
      lines.push(rest.slice(0, cut).trim())
      rest = rest.slice(cut).trim()
    }
  }
  while (lines.length < maxLines) lines.push('')
  return lines
}

async function loadPdfMake() {
  const pdfMakeMod = await import('pdfmake/build/pdfmake')
  const pdfMake = (pdfMakeMod as { default?: typeof import('pdfmake/build/pdfmake') }).default ?? pdfMakeMod
  const vfsModule = await import('pdfmake/build/vfs_fonts')
  const vfs = (vfsModule as { default?: Record<string, string> }).default
  const pm = pdfMake as unknown as {
    addVirtualFileSystem?: (vfs: Record<string, string>) => void
    createPdf: (def: TDocumentDefinitions) => unknown
  }
  if (typeof pm.addVirtualFileSystem === 'function' && vfs) pm.addVirtualFileSystem(vfs)
  return pm
}

/** Genera el PDF en el navegador y lo descarga. */
export async function downloadAlterationPdf(id: string): Promise<void> {
  const res = await getAlteration({ id })
  if (!res.success || !res.data) {
    throw new Error('error' in res ? res.error : 'Arreglo no encontrado')
  }
  const alteration = res.data

  const logo = await getLogoBase64Client()
  const docDef = buildAlterationDocDefinition(alteration, logo)

  const pdfMake = await loadPdfMake()
  const pdf = pdfMake.createPdf(docDef) as { download: (name: string) => void }
  pdf.download(`arreglo-${alteration.alteration_number}.pdf`)
}

/** Genera el PDF y abre la pantalla de impresión. */
export async function printAlterationPdf(id: string): Promise<void> {
  const res = await getAlteration({ id })
  if (!res.success || !res.data) {
    throw new Error('error' in res ? res.error : 'Arreglo no encontrado')
  }
  const alteration = res.data

  const logo = await getLogoBase64Client()
  const docDef = buildAlterationDocDefinition(alteration, logo)

  const pdfMake = await loadPdfMake()
  const pdf = pdfMake.createPdf(docDef) as { getBlob: (cb: (blob: Blob) => void) => void }

  await new Promise<void>((resolve) => {
    pdf.getBlob((blob: Blob) => {
      const url = URL.createObjectURL(blob)
      const w = window.open(url, '_blank')
      if (!w) {
        const a = document.createElement('a')
        a.href = url
        a.download = `arreglo-${alteration.alteration_number}.pdf`
        a.click()
        setTimeout(() => URL.revokeObjectURL(url), 2000)
        resolve()
        return
      }
      const trigger = () => { try { w.focus(); w.print() } catch { /* ignore */ } }
      try { w.addEventListener('load', () => setTimeout(trigger, 500)) } catch { /* ignore */ }
      setTimeout(trigger, 1500)
      setTimeout(() => { try { URL.revokeObjectURL(url) } catch { /* ignore */ } }, 60000)
      resolve()
    })
  })
}
