/**
 * Genera el PDF de la ficha de camisería (cuadrícula física).
 * Uso: desde panel sastre (medidas) o desde admin al imprimir ficha de una línea Camisería.
 */

const MARGIN = 14
const FONT = 10
const FONT_SMALL = 9
const LINE = 6
const A4_W_MM = 210
const A4_H_MM = 297

const MEDIDAS_KEYS = [
  { key: 'cuello', label: 'Cuello' },
  { key: 'canesu', label: 'Canesú' },
  { key: 'manga', label: 'Manga' },
  { key: 'fren_pecho', label: 'Fren. Pecho' },
  { key: 'cont_pecho', label: 'Cont. Pecho' },
  { key: 'cintura', label: 'Cintura' },
  { key: 'cadera', label: 'Cadera' },
  { key: 'largo_cuerpo', label: 'Largo Cuerpo' },
  { key: 'p_izq', label: 'P. Izq.' },
  { key: 'p_dch', label: 'P. Dch.' },
  { key: 'hombro', label: 'Hombro' },
  { key: 'biceps', label: 'Bíceps' },
] as const

const CARACT_LABELS: Record<string, string> = {
  jareton: 'Jaretón',
  bolsillo: 'Bolsillo',
  hombro_caido: 'Hombro Caído',
  hombros_altos: 'Hombros Altos',
  hombros_bajos: 'Hombros Bajos',
  erguido: 'Erguido',
  cargado: 'Cargado',
  espalda_lisa: 'Espalda Lisa',
  esp_pliegues: 'Esp. Pliegues',
  esp_tablon_centr: 'Esp. Tablón Centr.',
  esp_pinzas: 'Esp. Pinzas',
}

const PUNO_KEYS = [
  { key: 'puno_sencillo', label: 'Sencillo' },
  { key: 'puno_gemelo', label: 'Gemelo' },
  { key: 'puno_mixto', label: 'Mixto' },
  { key: 'puno_mosquetero', label: 'Mosquetero' },
  { key: 'puno_otro', label: 'Otro' },
] as const

export interface CamiseriaFichaPdfParams {
  clientName: string
  values: Record<string, string>
  prefix?: string
  precio?: string
  entregado?: string
  observaciones?: string
}

function getVal(values: Record<string, string>, prefix: string, key: string): string {
  const v = values[`${prefix}_${key}`] ?? values[key]
  return v?.trim() ?? '—'
}

function getChecked(values: Record<string, string>, prefix: string, key: string): boolean {
  const v = getVal(values, prefix, key)
  return v === 'true' || v === '1'
}

export async function generateCamiseriaFichaPdf(params: CamiseriaFichaPdfParams): Promise<void> {
  const { jsPDF } = await import('jspdf')
  const doc = new jsPDF({ orientation: 'p', unit: 'mm', format: 'a4' })
  const pageW = A4_W_MM
  const prefix = params.prefix ?? 'camiseria'
  let y = MARGIN

  doc.setFontSize(14)
  doc.setFont('helvetica', 'bold')
  doc.text('FICHA CAMISERÍA', pageW / 2, y, { align: 'center' })
  y += LINE + 2

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(FONT)
  doc.text('Cliente: ' + (params.clientName || '—'), MARGIN, y)
  y += LINE + 4

  doc.setDrawColor(0, 0, 0)
  doc.setLineWidth(0.3)
  doc.line(MARGIN, y, pageW - MARGIN, y)
  y += LINE

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(FONT_SMALL)
  doc.text('MEDIDAS (cm)', MARGIN, y)
  y += LINE

  const colW = (pageW - 2 * MARGIN) / 4
  const cols = 4
  let col = 0
  doc.setFont('helvetica', 'normal')
  for (const { key, label } of MEDIDAS_KEYS) {
    const x = MARGIN + col * colW
    const val = getVal(params.values, prefix, key)
    doc.text(`${label}: ${val}`, x, y)
    col++
    if (col >= cols) {
      col = 0
      y += LINE
    }
  }
  if (col > 0) y += LINE
  y += 4

  doc.setFont('helvetica', 'bold')
  doc.text('CARACTERÍSTICAS', MARGIN, y)
  y += LINE
  const checkedCaract = Object.entries(CARACT_LABELS)
    .filter(([key]) => getChecked(params.values, prefix, key))
    .map(([, label]) => label)
  const iniciales = getVal(params.values, prefix, 'iniciales')
  const modCuello = getVal(params.values, prefix, 'mod_cuello')
  doc.setFont('helvetica', 'normal')
  if (checkedCaract.length) doc.text(checkedCaract.join(' · '), MARGIN, y)
  y += LINE
  if (iniciales !== '—') {
    doc.text('Iniciales: ' + iniciales, MARGIN, y)
    y += LINE
  }
  if (modCuello !== '—') {
    doc.text('Mod. Cuello: ' + modCuello, MARGIN, y)
    y += LINE
  }
  if (checkedCaract.length === 0 && iniciales === '—' && modCuello === '—') doc.text('—', MARGIN, y)
  y += LINE + 4

  doc.setFont('helvetica', 'bold')
  doc.text('PUÑO', MARGIN, y)
  y += LINE
  const punoSelected = PUNO_KEYS.find(({ key }) => getChecked(params.values, prefix, key))
  doc.setFont('helvetica', 'normal')
  doc.text(punoSelected ? punoSelected.label : '—', MARGIN, y)
  y += LINE + 4

  doc.setFont('helvetica', 'bold')
  doc.text('TEJIDO', MARGIN, y)
  y += LINE
  const tejido = getVal(params.values, prefix, 'tejido')
  const der = getChecked(params.values, prefix, 'derecho')
  const izq = getChecked(params.values, prefix, 'izquierdo')
  doc.setFont('helvetica', 'normal')
  if (tejido !== '—') doc.text(tejido, MARGIN, y)
  y += LINE
  if (der || izq) doc.text([der && 'Derecho', izq && 'Izquierdo'].filter(Boolean).join(' · '), MARGIN, y)
  y += LINE + 4

  if (params.precio ?? params.entregado ?? params.observaciones) {
    doc.setFont('helvetica', 'bold')
    doc.text('PRECIO / ENTREGADO / OBSERVACIONES', MARGIN, y)
    y += LINE
    doc.setFont('helvetica', 'normal')
    if (params.precio) {
      doc.text('Precio: ' + params.precio, MARGIN, y)
      y += LINE
    }
    if (params.entregado) {
      doc.text('Entregado a cuenta: ' + params.entregado, MARGIN, y)
      y += LINE
    }
    if (params.observaciones) {
      const lines = doc.splitTextToSize('Observaciones: ' + params.observaciones, pageW - 2 * MARGIN)
      lines.forEach((line: string) => {
        doc.text(line, MARGIN, y)
        y += LINE
      })
    }
    y += 4
  }

  y = A4_H_MM - MARGIN - 12
  doc.setDrawColor(0, 0, 0)
  doc.line(MARGIN, y, pageW - MARGIN, y)
  y += LINE
  doc.setFontSize(FONT_SMALL)
  doc.setTextColor(100, 100, 100)
  doc.text('SASTRERÍA PRATS', pageW / 2, y, { align: 'center' })
  doc.setTextColor(0, 0, 0)

  doc.save(`ficha-camiseria-${(params.clientName || 'cliente').replace(/\s+/g, '-')}.pdf`)
}
