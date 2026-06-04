'use client'

/**
 * Ticket de la "Hoja de arreglos" de Sastrería Prats (80mm, impresora de tickets).
 *
 * Antes era una hoja A4 horizontal con cajas para firma. Ahora se imprime en la
 * misma impresora térmica de 80mm que los tickets de caja, adaptado al ancho del
 * rollo. Se conservan los datos clave: nº de arreglo, fecha, cliente, teléfono,
 * tipo de prenda, oficial, descripción de los arreglos y fechas de taller/entrega.
 */

import type { Content, TDocumentDefinitions } from 'pdfmake/interfaces'
import { COMPANY, getLogoBase64Client } from './pdf-company'
import type { AlterationWithRelations } from '@/types/alterations'
import { getAlteration } from '@/actions/alterations'

// Ancho del rollo térmico (idéntico al ticket de caja): 80mm.
const W_MM = 80
const W_PT = Math.round(W_MM * 2.83465)
const H_PT = 841
const MARGIN_PT = 14
const LINE_W = W_PT - 2 * MARGIN_PT

const FONT_BODY = 9
const FONT_SMALL = 7
const FONT_HEAD = 11

function formatDateSlashes(date: string | null | undefined): string {
  if (!date) return ''
  const d = new Date(date)
  if (Number.isNaN(d.getTime())) return ''
  const day = String(d.getDate()).padStart(2, '0')
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const year = d.getFullYear()
  return `${day}/${month}/${year}`
}

function hr(marginBottom = 6): Content {
  return {
    canvas: [{ type: 'line', x1: 0, y1: 0, x2: LINE_W, y2: 0, lineWidth: 0.5 }],
    margin: [0, 0, 0, marginBottom] as [number, number, number, number],
  }
}

/** Fila "Etiqueta: valor" a ancho completo (el valor envuelve si es largo). */
function field(label: string, value: string): Content {
  return {
    columns: [
      { text: label, fontSize: FONT_SMALL, bold: true, width: 'auto' },
      { text: value || '—', fontSize: FONT_SMALL, width: '*', margin: [4, 0, 0, 0] as [number, number, number, number] },
    ],
    margin: [0, 0, 0, 2] as [number, number, number, number],
  }
}

export function buildAlterationDocDefinition(
  alteration: AlterationWithRelations,
  logoBase64: string | null,
): TDocumentDefinitions {
  const clientName = alteration.clients?.full_name || ''
  const phone = alteration.phone || alteration.clients?.phone || ''
  const officialName = alteration.official_name || alteration.official?.name || ''
  const description = (alteration.description || '').trim()

  const content: Content[] = [
    ...(logoBase64
      ? [{ image: logoBase64, width: 160, alignment: 'center', margin: [0, 0, 0, 6] as [number, number, number, number] } as Content]
      : []),
    { text: 'HOJA DE ARREGLOS', fontSize: FONT_HEAD, bold: true, alignment: 'center', characterSpacing: 1, margin: [0, 0, 0, 4] as [number, number, number, number] },
    hr(8),

    // Cabecera: nº de arreglo + fecha
    {
      columns: [
        { text: alteration.alteration_number || '', fontSize: FONT_BODY, bold: true, width: '*' },
        { text: formatDateSlashes(alteration.alteration_date), fontSize: FONT_BODY, alignment: 'right', width: 'auto' },
      ],
      margin: [0, 0, 0, 6] as [number, number, number, number],
    },
    hr(6),

    field('Cliente:', clientName),
    field('Teléfono:', phone),
    field('Prenda:', alteration.garment_type || ''),
    field('Oficial:', officialName),

    hr(6),
    { text: 'ARREGLOS', fontSize: FONT_SMALL, bold: true, characterSpacing: 0.6, margin: [0, 0, 0, 2] as [number, number, number, number] },
    {
      text: description || '—',
      fontSize: FONT_BODY,
      margin: [0, 0, 0, 6] as [number, number, number, number],
    },
    hr(6),

    field('Envío taller:', formatDateSlashes(alteration.workshop_sent_date)),
    field('Entrega cliente:', formatDateSlashes(alteration.client_delivery_date)),
  ]

  // Importe: línea para rellenar a mano (el cobro se gestiona por caja).
  content.push(
    hr(6),
    {
      columns: [
        { text: 'Importe:', fontSize: FONT_SMALL, bold: true, width: 'auto' },
        { text: '', fontSize: FONT_SMALL, width: '*' },
      ],
      margin: [0, 0, 0, 10] as [number, number, number, number],
    },
  )

  // Pie con datos de la empresa
  content.push(
    hr(6),
    { text: COMPANY.name, fontSize: 6, color: '#999', alignment: 'center', margin: [0, 0, 0, 1] as [number, number, number, number] },
    { text: `${COMPANY.nif} · ${COMPANY.address}`, fontSize: 6, color: '#999', alignment: 'center', margin: [0, 0, 0, 1] as [number, number, number, number] },
    { text: `${COMPANY.postalCode} - ${COMPANY.city} · ${COMPANY.country}`, fontSize: 6, color: '#999', alignment: 'center' },
  )

  return {
    pageSize: { width: W_PT, height: H_PT },
    pageMargins: [MARGIN_PT, MARGIN_PT, MARGIN_PT, MARGIN_PT] as [number, number, number, number],
    info: {
      title: `Hoja de arreglos ${alteration.alteration_number}`,
      author: COMPANY.name,
    },
    content,
  }
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

/** Genera el ticket en el navegador y lo descarga. */
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

/**
 * Genera el ticket y lanza el diálogo de impresión.
 * Usa un iframe oculto (igual que el ticket de caja) para imprimir directo en la
 * impresora térmica sin abrir pestaña ni depender del bloqueador de popups.
 */
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
  const fileName = `arreglo-${alteration.alteration_number}.pdf`

  await new Promise<void>((resolve) => {
    pdf.getBlob((blob: Blob) => {
      const url = URL.createObjectURL(blob)

      const iframe = document.createElement('iframe')
      iframe.style.position = 'fixed'
      iframe.style.top = '-9999px'
      iframe.style.left = '-9999px'
      iframe.style.width = '0'
      iframe.style.height = '0'
      iframe.style.border = 'none'
      iframe.src = url

      let cleaned = false
      const cleanup = () => {
        if (cleaned) return
        cleaned = true
        try { iframe.remove() } catch {}
        try { URL.revokeObjectURL(url) } catch {}
      }

      const fallbackToWindowOpen = () => {
        cleanup()
        const tabUrl = URL.createObjectURL(blob)
        const printWindow = window.open(tabUrl, '_blank')
        if (!printWindow) {
          const a = document.createElement('a')
          a.href = tabUrl
          a.download = fileName
          a.click()
          setTimeout(() => { try { URL.revokeObjectURL(tabUrl) } catch {} }, 2000)
          return
        }
        const onLoad = () => setTimeout(() => {
          try { printWindow.focus(); printWindow.print() } catch {}
        }, 500)
        try { printWindow.addEventListener('load', onLoad) } catch {}
        setTimeout(() => { try { URL.revokeObjectURL(tabUrl) } catch {} }, 60000)
      }

      let triggered = false
      const triggerPrint = () => {
        if (triggered) return
        triggered = true
        const cw = iframe.contentWindow
        if (!cw) { fallbackToWindowOpen(); return }
        try { cw.addEventListener('afterprint', cleanup, { once: true }) } catch {}
        try { cw.focus(); cw.print() } catch {
          try { window.print() } catch { fallbackToWindowOpen() }
        }
      }

      iframe.addEventListener('load', () => setTimeout(triggerPrint, 300))
      iframe.addEventListener('error', fallbackToWindowOpen)
      setTimeout(() => { if (!triggered) fallbackToWindowOpen() }, 5000)
      setTimeout(cleanup, 60000)

      document.body.appendChild(iframe)
      resolve()
    })
  })
}
