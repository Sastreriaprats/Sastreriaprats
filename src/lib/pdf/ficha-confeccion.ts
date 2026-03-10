/**
 * Genera el PDF de la ficha de confección (replica del diseño artesanal físico).
 * Uso: desde la página de confirmación de nueva venta o al crear pedido.
 */

const MARGIN = 14
const FONT = 10
const FONT_SMALL = 9
const LINE = 6
const A4_W = 210
const A4_H = 297

export interface FichaConfeccionOrder {
  id: string
  order_number: string
  total: number
  total_paid?: number
  total_pending?: number
  estimated_delivery_date?: string | null
  clients?: {
    full_name?: string
    first_name?: string
    last_name?: string
    address?: string
    city?: string
    province?: string
    postal_code?: string
    phone?: string
    phone_secondary?: string
  } | null
  tailoring_order_lines?: Array<{
    garment_types?: { name?: string } | null
    unit_price?: number
    finishing_notes?: string | null
    configuration?: Record<string, unknown>
  }> | null
}

function getClientName(order: FichaConfeccionOrder): string {
  const c = order.clients
  if (!c) return '—'
  if (typeof c === 'object' && 'full_name' in c && c.full_name) return String(c.full_name)
  const first = (c as { first_name?: string }).first_name ?? ''
  const last = (c as { last_name?: string }).last_name ?? ''
  return [first, last].filter(Boolean).join(' ') || '—'
}

function getFichaFromOrder(order: FichaConfeccionOrder): Record<string, unknown> {
  const lines = order.tailoring_order_lines ?? []
  const first = lines[0]
  const config = (first?.configuration ?? {}) as Record<string, unknown>
  const fichaData = (config.fichaData as Record<string, unknown>) ?? {}
  return {
    cortador: config.cortador ?? '',
    prenda: config.prenda ?? '',
    situacionTrabajo: config.situacionTrabajo ?? '',
    fechaCompromiso: config.fechaCompromiso ?? order.estimated_delivery_date ?? '',
    fechaCobro: config.fechaCobro ?? '',
    ...fichaData,
  }
}

function formatDate(s: unknown): string {
  if (!s || typeof s !== 'string') return '—'
  try {
    const d = new Date(s)
    return isNaN(d.getTime()) ? '—' : d.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' })
  } catch {
    return '—'
  }
}

export async function generateFichaConfeccionPDF(order: FichaConfeccionOrder): Promise<void> {
  const { jsPDF } = await import('jspdf')
  const doc = new jsPDF({ orientation: 'p', unit: 'mm', format: 'a4' })
  let y = MARGIN
  const client = order.clients
  const ficha = getFichaFromOrder(order)

  // Título
  doc.setFontSize(16)
  doc.setFont('helvetica', 'bold')
  doc.text('FICHA DE CONFECCIÓN', A4_W / 2, y, { align: 'center' })
  y += LINE + 6

  // Cabecera: Número de talón | Fecha de emisión
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(FONT)
  const hoy = new Date().toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' })
  doc.text('Nº ' + (order.order_number ?? '—'), MARGIN, y)
  doc.text('Fecha de emisión: ' + hoy, A4_W - MARGIN, y, { align: 'right' })
  y += LINE + 2

  // Cliente (nombre en grande)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(12)
  doc.text('Cliente: ' + getClientName(order), MARGIN, y)
  y += LINE + 4

  // Cortador | Prenda | Tipo trabajo
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(FONT)
  doc.text('Cortador: ' + String(ficha.cortador ?? '—'), MARGIN, y)
  doc.text('Prenda: ' + String(ficha.prenda ?? '—'), MARGIN + 70, y)
  doc.text('Situación: ' + String(ficha.situacionTrabajo ?? '—'), MARGIN + 130, y)
  y += LINE
  doc.text('Fecha próxima visita: ' + formatDate(ficha.fechaProximaVisita ?? ficha.fechaCompromiso), MARGIN, y)
  y += LINE + 4

  // Características / Tejido
  const caracteristicas = String(ficha.caracteristicas ?? ficha.metros ?? '').trim() || '—'
  doc.setFont('helvetica', 'bold')
  doc.text('Características / Tejido', MARGIN, y)
  y += LINE
  doc.setFont('helvetica', 'normal')
  const carLines = doc.splitTextToSize(caracteristicas, A4_W - 2 * MARGIN)
  doc.text(carLines, MARGIN, y)
  y += carLines.length * LINE + 2

  // Medidas (si hay en ficha, como números separados por comas)
  const medidasStr = String(ficha.metros ?? '').trim() || '—'
  doc.setFont('helvetica', 'bold')
  doc.text('Medidas', MARGIN, y)
  y += LINE
  doc.setFont('helvetica', 'normal')
  doc.text(medidasStr, MARGIN, y)
  y += LINE + 2

  // Observaciones
  const observaciones = String(ficha.observaciones ?? '').trim() || '—'
  doc.setFont('helvetica', 'bold')
  doc.text('Observaciones', MARGIN, y)
  y += LINE
  doc.setFont('helvetica', 'normal')
  const obsLines = doc.splitTextToSize(observaciones, A4_W - 2 * MARGIN)
  doc.text(obsLines, MARGIN, y)
  y += Math.min(obsLines.length * LINE, 6 * LINE) + 4

  // Datos cliente
  doc.setFont('helvetica', 'bold')
  doc.text('Datos cliente', MARGIN, y)
  y += LINE
  doc.setFont('helvetica', 'normal')
  const domicilio = String(ficha.domicilio ?? client?.address ?? '—').trim()
  const localidad = String(ficha.localidad ?? client?.city ?? '—').trim()
  const provincia = String(ficha.provincia ?? client?.province ?? '—').trim()
  const cp = String(ficha.cp ?? client?.postal_code ?? '—').trim()
  const t1 = String(ficha.telefono1 ?? client?.phone ?? '—').trim()
  const t2 = String(ficha.telefono2 ?? client?.phone_secondary ?? '—').trim()
  const h1 = String(ficha.horario1 ?? '—').trim()
  const h2 = String(ficha.horario2 ?? '—').trim()
  doc.text('Domicilio: ' + domicilio, MARGIN, y)
  y += LINE
  doc.text('Localidad: ' + localidad + '  CP: ' + cp + '  Provincia: ' + provincia, MARGIN, y)
  y += LINE
  doc.text('Teléfono 1: ' + t1 + '  Horario 1: ' + h1, MARGIN, y)
  y += LINE
  doc.text('Teléfono 2: ' + t2 + '  Horario 2: ' + h2, MARGIN, y)
  y += LINE + 4

  // Precio | Entrega | Pendiente | Fecha de cobro
  doc.setDrawColor(0, 0, 0)
  doc.setLineWidth(0.3)
  doc.line(MARGIN, y, A4_W - MARGIN, y)
  y += LINE + 2
  doc.setFont('helvetica', 'bold')
  doc.text('Precio: ' + Number(order.total ?? 0).toFixed(2) + ' €', MARGIN, y)
  doc.text('Entregado a cuenta: ' + Number(order.total_paid ?? 0).toFixed(2) + ' €', MARGIN + 50, y)
  doc.text('Pendiente: ' + Number(order.total_pending ?? 0).toFixed(2) + ' €', MARGIN + 110, y)
  doc.text('Fecha de cobro: ' + formatDate(ficha.fechaCobro), MARGIN + 155, y)
  y += LINE + 6

  // Líneas del pedido (resumen)
  doc.setFont('helvetica', 'bold')
  doc.text('Líneas', MARGIN, y)
  y += LINE
  doc.setFont('helvetica', 'normal')
  const lines = order.tailoring_order_lines ?? []
  for (const line of lines) {
    const gt = line.garment_types
    const name = (typeof gt === 'object' && gt && 'name' in gt ? (gt as { name?: string }).name : null) ?? 'Prenda'
    const price = Number(line.unit_price ?? 0)
    doc.text(`${name}: ${price.toFixed(2)} €`, MARGIN, y)
    y += LINE
    if (y > A4_H - 50) {
      doc.addPage()
      y = MARGIN
    }
  }

  // Talón (duplicado reducido al final)
  y = A4_H - 55
  doc.setDrawColor(0, 0, 0)
  doc.line(MARGIN, y, A4_W - MARGIN, y)
  y += LINE
  doc.setFontSize(FONT_SMALL)
  doc.setFont('helvetica', 'bold')
  doc.text('TALÓN DE COBRO', MARGIN, y)
  y += LINE
  doc.setFont('helvetica', 'normal')
  doc.text('Oficial', MARGIN, y)
  doc.text('Prenda: ' + String(ficha.prenda ?? '—'), MARGIN + 30, y)
  doc.text('Cliente: ' + getClientName(order), MARGIN + 90, y)
  doc.text('Fecha: ' + hoy, A4_W - MARGIN - 25, y)
  y += LINE + 2
  doc.setDrawColor(200, 200, 200)
  doc.rect(A4_W - MARGIN - 45, y - LINE - 2, 45, LINE * 2 + 2)
  doc.setDrawColor(0, 0, 0)
  doc.setFontSize(FONT_SMALL - 1)
  doc.text('Talón de cobro', A4_W - MARGIN - 42, y - 2)
  doc.text('Oficial | Prenda | Cliente', A4_W - MARGIN - 42, y + LINE - 2)
  doc.text('Fecha emisión', A4_W - MARGIN - 42, y + LINE * 2 - 2)

  y = A4_H - MARGIN - 8
  doc.setDrawColor(0, 0, 0)
  doc.line(MARGIN, y, A4_W - MARGIN, y)
  y += LINE
  doc.setFontSize(FONT_SMALL)
  doc.setTextColor(100, 100, 100)
  doc.text('SASTRERÍA PRATS', A4_W / 2, y, { align: 'center' })
  doc.setTextColor(0, 0, 0)

  doc.save(`ficha-confeccion-${(order.order_number || order.id).toString().replace(/\s+/g, '-')}.pdf`)
}
