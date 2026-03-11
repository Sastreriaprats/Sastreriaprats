/**
 * Genera el PDF de la ficha de confección con pdfmake (replica del diseño físico).
 * Parte superior (ficha sastrería) + línea de corte + talón oficial (2 columnas).
 */

import type { Content } from 'pdfmake'

/** Tipo del documento para pdfmake (no exportado por @types/pdfmake). */
interface PdfDocDefinition {
  pageSize?: string
  pageOrientation?: string
  pageMargins?: number
  content: Content[]
  footer?: (currentPage: number, pageCount: number, pageSize: unknown) => Content
}

const MARGIN_PT = 15 * (72 / 25.4) // 15mm en pt (~42.52)
const BORDER_COLOR = '#cccccc'
const LABEL_FILL = '#f0f0f0'
const LABEL_COLOR = '#555555'

/** Claves base de medidas (sin prefijo). Se buscan con prefijo americana_ o camiseria_. */
const MEDIDAS_BASE_KEYS = [
  'cuello',
  'canesu',
  'manga',
  'fren_pecho',
  'cont_pecho',
  'cintura',
  'cadera',
  'largo',
  'hombro',
  'biceps',
] as const

export interface FichaConfeccionOrder {
  id: string
  order_number: string
  total: number
  total_paid?: number
  total_pending?: number
  estimated_delivery_date?: string | null
  client_id?: string
  /** Medidas del cliente (desde client_measurements) para el PDF */
  clientMeasurements?: { values?: Record<string, unknown> }
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
    email?: string
  } | null
  tailoring_order_lines?: Array<{
    garment_types?: { name?: string; code?: string } | null
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

function slugToPrendaLabel(slug: string): string {
  if (!slug || typeof slug !== 'string') return '—'
  const trimmed = slug.trim()
  if (!trimmed) return '—'
  return trimmed
    .split('_')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(' ')
}

function getMedidasStr(
  clientMeasurementsValues?: Record<string, unknown>,
  prefix: 'americana_' | 'camiseria_' = 'americana_'
): string {
  if (!clientMeasurementsValues || typeof clientMeasurementsValues !== 'object') return '—'
  const cfg = clientMeasurementsValues as Record<string, unknown>
  const parts: string[] = []
  for (const baseKey of MEDIDAS_BASE_KEYS) {
    const keysToTry = [`${prefix}${baseKey}`, baseKey]
    let val: unknown = undefined
    for (const k of keysToTry) {
      if (cfg[k] !== undefined && cfg[k] !== null && cfg[k] !== '') {
        val = cfg[k]
        break
      }
    }
    const n = typeof val === 'number' ? val : Number(val)
    if (typeof n === 'number' && Number.isFinite(n)) {
      parts.push(String(n))
    } else {
      parts.push('—')
    }
  }
  const allDash = parts.every((p) => p === '—')
  return allDash ? '—' : parts.join(', ')
}

const LABELS_BOTONES: Record<string, string> = {
  '1fila_2': '1 Fila 2 botones',
  '1fila_3para2': '1 Fila 3 para 2',
  '2filas_6': '2 Filas 6 botones',
}
const LABELS_ABERTURAS: Record<string, string> = {
  '2aberturas': '2 Aberturas',
  '1abertura': '1 Abertura',
  sin_aberturas: 'Sin abertura',
}
const LABELS_BOLSILLO: Record<string, string> = {
  recto: 'Bolsillo recto',
  inclinado: 'Bol. inclinado',
  parche: 'Bolsillo parche',
}
const LABELS_SOLAPA: Record<string, string> = {
  normal: 'Solapa normal',
  pico: 'Solapa pico',
  chal: 'Solapa chal',
}
const LABELS_MANGA: Record<string, string> = {
  napolit: 'Manga napolitana',
  reborde: 'Manga reborde',
  sin_reborde: 'Manga sin reborde',
}
const LABELS_FORRO: Record<string, string> = {
  sin_forro: 'Sin forro',
  medio: 'Medio forro',
  completo: 'Forro completo',
}
const LABELS_VUELTAS: Record<string, string> = {
  sin_vueltas: 'Sin vueltas',
  con_vueltas: 'Con vueltas',
}
const LABELS_BRAGUETA: Record<string, string> = {
  cremallera: 'Cremallera',
  boton: 'Botón',
}
const LABELS_PLIEGUES: Record<string, string> = {
  sin_pliegues: 'Sin pliegues',
  un_pliegue: '1 pliegue',
  dos_pliegues: '2 pliegues',
}

function labelBotones(v: unknown): string {
  return LABELS_BOTONES[String(v).trim()] ?? String(v)
}
function labelAberturas(v: unknown): string {
  return LABELS_ABERTURAS[String(v).trim()] ?? String(v)
}
function labelBolsillo(v: unknown): string {
  return LABELS_BOLSILLO[String(v).trim()] ?? String(v)
}
function labelSolapa(v: unknown): string {
  return LABELS_SOLAPA[String(v).trim()] ?? String(v)
}
function labelManga(v: unknown): string {
  return LABELS_MANGA[String(v).trim()] ?? String(v)
}
function labelForro(v: unknown): string {
  return LABELS_FORRO[String(v).trim()] ?? String(v)
}
function labelVueltas(v: unknown): string {
  return LABELS_VUELTAS[String(v).trim()] ?? String(v)
}
function labelBragueta(v: unknown): string {
  return LABELS_BRAGUETA[String(v).trim()] ?? String(v)
}
function labelPliegues(v: unknown): string {
  return LABELS_PLIEGUES[String(v).trim()] ?? String(v)
}

function buildDescripcionFromConfig(config: Record<string, unknown>): string {
  const partes: string[] = []

  if (config.botones) partes.push(`Botones: ${labelBotones(config.botones)}`)
  if (config.aberturas) partes.push(`Aberturas: ${labelAberturas(config.aberturas)}`)

  const bols: string[] = []
  if (config.bolsilloTipo) bols.push(labelBolsillo(config.bolsilloTipo))
  if (config.cerrilleraExterior) bols.push('cerillera exterior')
  if (bols.length) partes.push(`Bolsillos: ${bols.join(', ')}`)

  if (config.primerBoton) partes.push(`1er botón a ${config.primerBoton} cm`)

  if (config.solapa) {
    let sol = labelSolapa(config.solapa)
    if (config.anchoSolapa) sol += ` ${config.anchoSolapa} cm`
    partes.push(`Solapa: ${sol}`)
  }

  if (config.manga) partes.push(`Manga: ${labelManga(config.manga)}`)

  if (config.ojalesAbiertos) partes.push(`Ojales abiertos: ${config.ojalesAbiertos}`)
  if (config.ojalesCerrados) partes.push(`Ojales cerrados: ${config.ojalesCerrados}`)

  const hombros: string[] = []
  if (config.medidaHombro) hombros.push('medida hombro')
  if (config.hTerminado) hombros.push('H. terminado')
  if (config.escote) hombros.push('escote')
  if (config.sinHombreras) hombros.push('sin hombreras')
  if (config.picado34) hombros.push('picado 3/4')
  if (hombros.length) partes.push(`Hombros: ${hombros.join(', ')}`)

  if (config.forro) {
    let f = labelForro(config.forro)
    if (config.forroDesc) f += ` (${config.forroDesc})`
    partes.push(`Forro: ${f}`)
  }

  if (config.vueltas) partes.push(`Vueltas: ${labelVueltas(config.vueltas)}`)
  if (config.bragueta) partes.push(`Bragueta: ${labelBragueta(config.bragueta)}`)
  if (config.pliegues) partes.push(`Pliegues: ${labelPliegues(config.pliegues)}`)
  if (config.pretina2Botones) partes.push('Pretina 2 botones')
  if (config.pretinaCorrida) partes.push('Pretina corrida')

  if (config.chalecoCorte) partes.push(`Chaleco corte: ${config.chalecoCorte}`)
  if (config.chalecoBolsillo) partes.push(`Chaleco bolsillo: ${config.chalecoBolsillo}`)

  const obs = config.observaciones?.toString().trim()
  if (obs) partes.push(obs)

  return partes.join(' // ') || '—'
}

function getFichaFromOrder(order: FichaConfeccionOrder): Record<string, unknown> {
  const lines = order.tailoring_order_lines ?? []
  const first = lines[0]
  const config = (first?.configuration ?? {}) as Record<string, unknown>
  const prendaSlug = String(config.prenda ?? '')
  const isCamiseria = prendaSlug.toLowerCase().includes('camiseria')
  const medidasPrefix: 'americana_' | 'camiseria_' = isCamiseria ? 'camiseria_' : 'americana_'
  const clientMeasValues = order.clientMeasurements?.values
  const medidasStr = getMedidasStr(clientMeasValues, medidasPrefix)
  const prendaLabel = slugToPrendaLabel(prendaSlug)

  const tejidoStr = String(config.tejido ?? '').trim()
  const metrosVal = config.metros
  let caracteristicasStr: string
  if (tejidoStr && metrosVal !== undefined && metrosVal !== null && metrosVal !== '') {
    caracteristicasStr = `${tejidoStr} — ${metrosVal} m`
  } else if (tejidoStr) {
    caracteristicasStr = tejidoStr
  } else if (metrosVal !== undefined && metrosVal !== null && metrosVal !== '') {
    caracteristicasStr = `${metrosVal} m`
  } else {
    caracteristicasStr = '—'
  }

  return {
    cortador: config.cortador ?? '',
    oficial: config.oficial ?? '',
    prenda: config.prenda ?? '',
    prendaLabel,
    numeroTalon: config.numeroTalon ?? '',
    situacionTrabajo: config.situacionTrabajo ?? '',
    fechaCompromiso: order.estimated_delivery_date ?? config.fechaCompromiso ?? '',
    fechaCobro: config.fechaCobro ?? '',
    fechaProximaVisita: config.fechaProximaVisita ?? config.fechaCompromiso ?? '',
    descripcion: buildDescripcionFromConfig(config),
    observaciones: config.observaciones ?? '',
    caracteristicas: caracteristicasStr,
    tejido: config.tejido ?? '',
    metros: config.metros ?? '',
    medidas: medidasStr,
    domicilio: config.domicilio ?? '',
    localidad: config.localidad ?? '',
    provincia: config.provincia ?? '',
    cp: config.cp ?? '',
    telefono1: config.telefono1 ?? '',
    telefono2: config.telefono2 ?? '',
    horario1: config.horario1 ?? '',
    horario2: config.horario2 ?? '',
  }
}

function formatDate(s: unknown): string {
  if (!s || typeof s !== 'string') return '—'
  try {
    const d = new Date(s)
    return isNaN(d.getTime())
      ? '—'
      : d.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' })
  } catch {
    return '—'
  }
}

/** Layout de tabla con bordes grises */
const tableLayoutBorders = {
  hLineWidth: () => 0.5,
  vLineWidth: () => 0.5,
  hLineColor: () => BORDER_COLOR,
  vLineColor: () => BORDER_COLOR,
}

const labelStyle = {
  fillColor: LABEL_FILL,
  color: LABEL_COLOR,
  bold: true as const,
}

const labelStyleSmall = {
  fillColor: LABEL_FILL,
  color: LABEL_COLOR,
  bold: true as const,
  fontSize: 9,
}

const valueStyle = { color: '#000000' as const }

/** Celda para tablas 2 columnas: label | valor (una fila por dato) */
function cellLabel(text: string): Content {
  return { text, ...labelStyle }
}

function cellValue(text: string): Content {
  return { text, ...valueStyle }
}

/** Celda con stack: label encima (gris pequeño) + valor debajo */
function cellStack(label: string, value: string): Content {
  return {
    stack: [
      { text: label, ...labelStyleSmall },
      { text: value, ...valueStyle },
    ],
  }
}

function buildDocDefinition(order: FichaConfeccionOrder): PdfDocDefinition {
  const client = order.clients
  const ficha = getFichaFromOrder(order) as Record<string, unknown>
  const hoy = new Date().toLocaleDateString('es-ES', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  })
  const prendaLabel =
    String((ficha.prendaLabel as string) ?? '').trim() || slugToPrendaLabel(String(ficha.prenda ?? ''))
  const oficialStr =
    ficha.oficial !== undefined && ficha.oficial !== null && String(ficha.oficial).trim() !== ''
      ? String(ficha.oficial).trim()
      : ''
  const caracteristicasStr = String(ficha.caracteristicas ?? '—').trim() || '—'
  const medidasStr = String(ficha.medidas ?? '—').trim() || '—'
  const descripcionStr = String(ficha.descripcion ?? ficha.observaciones ?? '').trim() || '—'
  const domicilioStr = String(ficha.domicilio ?? client?.address ?? '—').trim()
  const localidadStr = String(ficha.localidad ?? client?.city ?? '—').trim()
  const cpStr = String(ficha.cp ?? client?.postal_code ?? '—').trim()
  const provinciaStr = String(ficha.provincia ?? client?.province ?? '—').trim()
  const tel1Str = String(ficha.telefono1 ?? client?.phone ?? '—').trim()
  const tel2Str = String(ficha.telefono2 ?? client?.phone_secondary ?? '—').trim()
  const hor1Str = String(ficha.horario1 ?? '—').trim()
  const hor2Str = String(ficha.horario2 ?? '—').trim()
  const total = Number(order.total ?? 0)
  const totalPaid = Number(order.total_paid ?? 0)
  const totalPending = Number(order.total_pending ?? 0)

  const content: Content[] = []

  // ─── PARTE SUPERIOR: FICHA SASTRERÍA ─────────────────────────────────────

  // Cabecera: 3 columnas (una fila)
  content.push({
    table: {
      widths: ['35%', '30%', '35%'],
      body: [
        [
          { text: `Nº talón: ${order.order_number ?? '—'}`, ...labelStyle },
          {
            text: 'FICHA DE CONFECCIÓN',
            alignment: 'center',
            bold: true,
            fontSize: 13,
            color: '#000000',
          },
          { text: `Fecha de emisión: ${hoy}`, ...labelStyle, alignment: 'right' },
        ],
      ],
    },
    layout: tableLayoutBorders,
  })

  // Tabla datos: 2 columnas (label | valor), una fila por dato
  content.push({
    table: {
      widths: ['25%', '75%'],
      body: [
        [cellLabel('Cliente:'), cellValue(getClientName(order))],
        [cellLabel('Cortador:'), cellValue(String(ficha.cortador ?? '—'))],
        [cellLabel('Oficial:'), cellValue(oficialStr || ' ')],
        [cellLabel('Prenda:'), cellValue(prendaLabel || '—')],
      ],
    },
    layout: tableLayoutBorders,
  })

  // Fila triple: cada celda = stack (label encima gris pequeño + valor debajo)
  content.push({
    table: {
      widths: ['33%', '33%', '34%'],
      body: [
        [
          cellStack('Tipo trabajo:', prendaLabel || '—'),
          cellStack('Situación trabajo:', String(ficha.situacionTrabajo ?? '—')),
          cellStack('Fecha próxima visita:', formatDate(ficha.fechaProximaVisita ?? ficha.fechaCompromiso)),
        ],
      ],
    },
    layout: tableLayoutBorders,
  })

  // Características: label 30% para evitar corte
  content.push({
    table: {
      widths: ['30%', '70%'],
      body: [[cellLabel('Características:'), cellValue(caracteristicasStr)]],
    },
    layout: tableLayoutBorders,
  })

  // Medidas: 2 columnas
  content.push({
    table: {
      widths: ['25%', '75%'],
      body: [[cellLabel('Medidas:'), cellValue(medidasStr)]],
    },
    layout: tableLayoutBorders,
  })

  // Descripción: celda crece con el contenido (sin altura fija)
  content.push({
    table: {
      widths: ['25%', '75%'],
      body: [[cellLabel('Descripción:'), cellValue(descripcionStr)]],
    },
    layout: tableLayoutBorders,
  })

  // Domicilio: 4 columnas, cada celda stack (label + valor)
  content.push({
    table: {
      widths: ['40%', '30%', '10%', '20%'],
      body: [
        [
          cellStack('Domicilio:', domicilioStr),
          cellStack('Localidad:', localidadStr),
          cellStack('CP:', cpStr),
          cellStack('Provincia:', provinciaStr),
        ],
      ],
    },
    layout: tableLayoutBorders,
  })

  // Teléfonos: 2 filas, cada celda stack (label + valor)
  content.push({
    table: {
      widths: ['50%', '50%'],
      body: [
        [cellStack('Teléfono 1:', tel1Str), cellStack('Horario 1:', hor1Str)],
        [cellStack('Teléfono 2:', tel2Str), cellStack('Horario 2:', hor2Str)],
      ],
    },
    layout: tableLayoutBorders,
  })

  // Precios: 4 columnas, cada celda stack (label encima + valor debajo)
  content.push({
    table: {
      widths: ['25%', '25%', '25%', '25%'],
      body: [
        [
          cellStack('Precio:', `${total.toFixed(2)} €`),
          cellStack('Entrega:', `${totalPaid.toFixed(2)} €`),
          cellStack('Pendiente:', `${totalPending.toFixed(2)} €`),
          cellStack('Fecha cobro:', formatDate(ficha.fechaCobro)),
        ],
      ],
    },
    layout: tableLayoutBorders,
  })

  // ─── LÍNEA DE CORTE ─────────────────────────────────────────────────────
  content.push({
    text: '- - - - - - - ✂  CORTAR POR AQUÍ  ✂ - - - - - - -',
    alignment: 'center',
    margin: [0, 8, 0, 8],
    color: '#888888',
    fontSize: 9,
  })

  // ─── PARTE INFERIOR: TALÓN OFICIAL (2 columnas: 68% | 32%) ──────────────
  content.push({
    columns: [
      {
        width: '68%',
        stack: [
          {
            table: {
              widths: ['25%', '75%'],
              body: [
                [cellLabel('Nº talón:'), cellValue(String(order.order_number ?? '—'))],
                [cellLabel('Fecha emisión:'), cellValue(hoy)],
              ],
            },
            layout: tableLayoutBorders,
          },
          {
            table: {
              widths: ['25%', '75%'],
              body: [
                [cellLabel('Cliente:'), cellValue(getClientName(order))],
                [cellLabel('Cortador:'), cellValue(String(ficha.cortador ?? '—'))],
                [cellLabel('Prenda:'), cellValue(prendaLabel || '—')],
              ],
            },
            layout: tableLayoutBorders,
          },
          {
            table: {
              widths: ['33%', '33%', '34%'],
              body: [
                [
                  cellStack('Tipo trabajo:', prendaLabel || '—'),
                  cellStack('Situación:', String(ficha.situacionTrabajo ?? '—')),
                  cellStack('Fecha próxima visita:', formatDate(ficha.fechaProximaVisita ?? ficha.fechaCompromiso)),
                ],
              ],
            },
            layout: tableLayoutBorders,
          },
          {
            table: {
              widths: ['30%', '70%'],
              body: [[cellLabel('Características:'), cellValue(caracteristicasStr)]],
            },
            layout: tableLayoutBorders,
          },
          {
            table: {
              widths: ['25%', '75%'],
              body: [[cellLabel('Medidas:'), cellValue(medidasStr)]],
            },
            layout: tableLayoutBorders,
          },
          {
            table: {
              widths: ['25%', '75%'],
              body: [[cellLabel('Descripción:'), cellValue(descripcionStr)]],
            },
            layout: tableLayoutBorders,
          },
          {
            table: {
              widths: ['25%', '25%', '25%', '25%'],
              body: [
                [
                  cellStack('Precio:', `${total.toFixed(2)} €`),
                  cellStack('Entrega:', `${totalPaid.toFixed(2)} €`),
                  cellStack('Pendiente:', `${totalPending.toFixed(2)} €`),
                  cellStack('Fecha cobro:', formatDate(ficha.fechaCobro)),
                ],
              ],
            },
            layout: tableLayoutBorders,
          },
        ],
      },
      {
        width: '32%',
        table: {
          widths: ['*'],
          body: [
            [
              {
                text: 'Talón de cobro',
                bold: true,
                alignment: 'center',
                margin: [4, 4, 4, 2],
              },
            ],
            [
              {
                stack: [
                  { text: `Oficial: ${oficialStr || ' '}`, margin: [4, 2] },
                  { text: `Prenda: ${prendaLabel || '—'}`, margin: [4, 2] },
                  { text: `Cliente: ${getClientName(order)}`, margin: [4, 2] },
                  { text: `Fecha emisión: ${hoy}`, margin: [4, 2, 4, 4] },
                ],
              },
            ],
          ],
        },
        layout: tableLayoutBorders,
      },
    ],
    columnGap: 10,
  })

  // ─── PIE DE PÁGINA ─────────────────────────────────────────────────────
  return {
    pageSize: 'A4',
    pageOrientation: 'portrait',
    pageMargins: MARGIN_PT,
    content,
    footer: () => ({
      text: 'SASTRERÍA PRATS',
      alignment: 'center',
      color: '#888888',
      fontSize: 8,
      margin: [0, 4, 0, 0],
    }),
  }
}

export async function generateFichaConfeccionPDF(order: FichaConfeccionOrder): Promise<void> {
  const o = order as unknown as Record<string, unknown>
  console.log('[PDF] order.configuration:', JSON.stringify(o.configuration, null, 2))
  console.log('[PDF] fichaData:', JSON.stringify(o.fichaData, null, 2))
  console.log('[PDF] lines:', JSON.stringify((o.lines as any[])?.map((l: any) => l?.configuration), null, 2))
  console.log('[PDF] tailoring_order_lines[0].configuration:', JSON.stringify(order.tailoring_order_lines?.[0]?.configuration, null, 2))

  const pdfMake = (await import('pdfmake/build/pdfmake')).default
  const vfsModule = await import('pdfmake/build/vfs_fonts')
  const vfs = (vfsModule as { default?: Record<string, string> }).default
  if (typeof pdfMake.addVirtualFileSystem === 'function' && vfs) {
    pdfMake.addVirtualFileSystem(vfs)
  }

  const docDef = buildDocDefinition(order)
  const pdf = pdfMake.createPdf(docDef as Parameters<typeof pdfMake.createPdf>[0])
  const fileName = `ficha-confeccion-${(order.order_number || order.id).toString().replace(/\s+/g, '-')}.pdf`
  await pdf.download(fileName)
}

/** Tipo de línea para identificar prenda en el nombre de archivo */
export type TailoringOrderLine = {
  configuration?: Record<string, unknown>
  garment_types?: { name?: string; code?: string } | null
}

function isLineCamiseria(line: TailoringOrderLine): boolean {
  const cfg = line?.configuration ?? {}
  if (cfg.tipo === 'camiseria') return true
  const name = (line?.garment_types?.name ?? '').toString().toLowerCase()
  if (name.includes('camiseria')) return true
  if (cfg.puno !== undefined) return true
  return false
}

function getPrendaNameForLine(line: TailoringOrderLine): string {
  const cfg = line?.configuration ?? {}
  if (isLineCamiseria(line)) return 'camisa-a-medida'
  const prendaLabel = (cfg.prendaLabel as string)?.trim()
  if (prendaLabel) return prendaLabel.replace(/\s+/g, '-')
  const prenda = (cfg.prenda as string)?.trim()
  if (prenda) return slugToPrendaLabel(prenda).replace(/\s+/g, '-')
  const gtName = (line?.garment_types?.name ?? '').toString().trim()
  if (gtName) return gtName.replace(/\s+/g, '-')
  return 'ficha'
}

/**
 * Genera y descarga la ficha de confección para una línea concreta del pedido.
 * Usa solo esa línea en order.tailoring_order_lines.
 * Nombre de archivo: ficha-[order_number]-[prenda].pdf
 * Para líneas de camisería usar generateFichaForLineCamiseria.
 */
export async function generateFichaForLine(
  order: FichaConfeccionOrder,
  line: TailoringOrderLine
): Promise<void> {
  const orderWithSingleLine: FichaConfeccionOrder = {
    ...order,
    tailoring_order_lines: [line as any],
  }
  const prendaName = getPrendaNameForLine(line)
  const orderNum = (order.order_number || order.id).toString().replace(/\s+/g, '-')
  const fileName = `ficha-${orderNum}-${prendaName}.pdf`

  const pdfMake = (await import('pdfmake/build/pdfmake')).default
  const vfsModule = await import('pdfmake/build/vfs_fonts')
  const vfs = (vfsModule as { default?: Record<string, string> }).default
  if (typeof pdfMake.addVirtualFileSystem === 'function' && vfs) {
    pdfMake.addVirtualFileSystem(vfs)
  }

  const docDef = buildDocDefinition(orderWithSingleLine)
  const pdf = pdfMake.createPdf(docDef as Parameters<typeof pdfMake.createPdf>[0])
  await pdf.download(fileName)
}

const MEDIDAS_HEADERS_CAMISA = [
  'CUELLO',
  'CANESÚ',
  'MANGA',
  'FREN.PECHO',
  'CONT.PECHO',
  'CINTURA',
  'CADERA',
  'LAR.CUERPO',
  'P.IZQ',
  'P.DCH',
  'HOMBRO',
  'BÍCEPS',
] as const
const MEDIDAS_KEYS_CAMISA = [
  'cuello',
  'canesu',
  'manga',
  'frenPecho',
  'contPecho',
  'cintura',
  'cadera',
  'largo',
  'pIzq',
  'pDch',
  'hombro',
  'biceps',
] as const

const PUNO_LABELS: Record<string, string> = {
  sencillo: 'Sencillo',
  gemelo: 'Gemelo',
  mixto: 'Mixto',
  mosquetero: 'Mosquetero',
  otro: 'Otro',
}

function buildCamiseriaDocDefinition(
  order: FichaConfeccionOrder,
  line: { configuration?: Record<string, unknown> },
  lineIndex: number,
  fontSizeDelta: number = 0
): PdfDocDefinition {
  const cfg = line.configuration ?? {}
  const client = order.clients
  const hoy = new Date().toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' })
  const clientName = getClientName(order)
  const tel = String(client?.phone ?? '—').trim()
  const email = String(client?.email ?? '—').trim()
  const fechaCompromiso = formatDate(order.estimated_delivery_date ?? cfg.fechaCompromiso)
  const orderNum = String(order.order_number ?? order.id ?? '—')
  const totalPaid = Number(order.total_paid ?? 0)

  const fs7 = 7 + fontSizeDelta
  const fs9 = 9 + fontSizeDelta
  const fs8 = 8 + fontSizeDelta

  const content: Content[] = []

  // Título (solo en parte superior, sin delta)
  if (fontSizeDelta === 0) {
    content.push({
      text: 'CAMISERÍA',
      alignment: 'center',
      italics: true,
      fontSize: 16,
      bold: true,
      margin: [0, 0, 0, 10],
    })
  }

  // Cabecera 2 columnas
  content.push({
    table: {
      widths: ['50%', '50%'],
      body: [
        [
          { text: `CLIENTE: ${clientName}`, fontSize: fs9, ...valueStyle },
          { text: `FECHA: ${hoy}`, fontSize: fs9, ...valueStyle },
        ],
        [
          { text: `TELÉFONO: ${tel}`, fontSize: fs9, ...valueStyle },
          { text: `FECHA COMPROMISO: ${fechaCompromiso}`, fontSize: fs9, ...valueStyle },
        ],
        [
          { text: `EMAIL: ${email}`, fontSize: fs9, ...valueStyle },
          { text: `NÚM. PEDIDO: ${orderNum}`, fontSize: fs9, ...valueStyle },
        ],
      ],
    },
    layout: tableLayoutBorders,
  })

  // Fila "CAMISA" (fondo #2a2a2a, texto blanco, centrado, negrita, colSpan 2)
  content.push({
    table: {
      widths: ['*'],
      body: [
        [
          {
            text: 'CAMISA',
            fillColor: '#2a2a2a',
            color: '#ffffff',
            alignment: 'center',
            bold: true,
            fontSize: fs9,
          },
        ],
      ],
    },
    layout: tableLayoutBorders,
  })

  // Tabla medidas: 12 columnas (headers + valores)
  const medidaValues = MEDIDAS_KEYS_CAMISA.map((k) => String(cfg[k] ?? '—').trim())
  content.push({
    table: {
      widths: MEDIDAS_HEADERS_CAMISA.map(() => '*'),
      body: [
        MEDIDAS_HEADERS_CAMISA.map((h) => ({
          text: h,
          fillColor: LABEL_FILL,
          fontSize: fs7,
          alignment: 'center' as const,
        })),
        medidaValues.map((v) => ({ text: v, fontSize: fs9, alignment: 'center' as const, ...valueStyle })),
      ],
    },
    layout: tableLayoutBorders,
  })

  // Checkbox helper
  const ch = (label: string, checked: boolean) =>
    (checked ? '☑ ' : '☐ ') + label

  // Tabla checkboxes 4 columnas
  const col1 = [
    ch('JARETÓN', !!cfg.jareton),
    ch('BOLSILLO', !!cfg.bolsillo),
    ch('HOMBRO CAÍDO', !!cfg.hombroCaido),
    ch('DERECHO', !!cfg.derecho),
    ch('IZQUIERDO', !!cfg.izquierdo),
  ].map((t) => ({ text: t, fontSize: fs8 }))
  const col2 = [
    ch('HOMBROS ALTOS', !!cfg.hombrosAltos),
    ch('HOMBROS BAJOS', !!cfg.hombrosBajos),
    ch('ERGUIDO', !!cfg.erguido),
    ch('CARGADO', !!cfg.cargado),
  ].map((t) => ({ text: t, fontSize: fs8 }))
  const col3 = [
    ch('ESPALDA LISA', !!cfg.espaldaLisa),
    ch('ESP. PLIEGUES', !!cfg.espPliegues),
    ch('ESP. TABLÓN CENTR.', !!cfg.espTablonCentr),
    ch('ESP. PINZAS', !!cfg.espPinzas),
  ].map((t) => ({ text: t, fontSize: fs8 }))
  const punoVal = String(cfg.puno ?? 'sencillo').toLowerCase()
  const punoLines = (['sencillo', 'gemelo', 'mixto', 'mosquetero', 'otro'] as const).map((p) =>
    punoVal === p ? `● PUÑO ${PUNO_LABELS[p] ?? p}` : `○ PUÑO ${PUNO_LABELS[p] ?? p}`
  )
  const col4 = [
    { text: ch('INICIALES', !!cfg.iniciales), fontSize: fs8 },
    { text: `MOD. CUELLO: ${String(cfg.modCuello ?? '—').trim()}`, fontSize: fs8 },
    ...punoLines.map((t) => ({ text: t, fontSize: fs8 })),
  ]
  const maxRows = Math.max(col1.length, col2.length, col3.length, col4.length)
  const pad = (arr: Content[], n: number) => [...arr, ...Array(Math.max(0, n - arr.length)).fill({ text: ' ' })]
  const checkboxRows = Array.from({ length: maxRows }, (_, i) => [
    pad(col1, maxRows)[i],
    pad(col2, maxRows)[i],
    pad(col3, maxRows)[i],
    pad(col4, maxRows)[i],
  ])
  content.push({
    table: {
      widths: ['25%', '25%', '25%', '25%'],
      body: checkboxRows,
    },
    layout: { hLineWidth: () => 0.5, vLineWidth: () => 0.5, hLineColor: () => BORDER_COLOR, vLineColor: () => BORDER_COLOR },
  })

  // Tabla TEJIDO + PRECIO (65% / 35%)
  const tejidoStr = String(cfg.tejido ?? '—').trim()
  const precioLinea = Number(cfg.precio ?? 0)
  content.push({
    table: {
      widths: ['65%', '35%'],
      body: [
        [
          {
            stack: [
              { text: 'TEJIDO', fontSize: fs7, color: LABEL_COLOR },
              { text: tejidoStr, fontSize: fs9 + 2, ...valueStyle },
            ],
            margin: [0, 0, 0, 40],
          },
          {
            stack: [
              { text: 'PRECIO', fontSize: fs7, color: LABEL_COLOR },
              { text: `${precioLinea.toFixed(2)} €`, fontSize: fs9 + 2, bold: true, ...valueStyle },
              { text: 'ENTREGADO A CUENTA', fontSize: fs7, color: LABEL_COLOR, margin: [0, 6, 0, 0] },
              { text: `${totalPaid.toFixed(2)} €`, fontSize: fs9, ...valueStyle },
            ],
            fillColor: '#f5f5f5',
          },
        ],
      ],
    },
    layout: tableLayoutBorders,
  })

  // Tabla OBSERVACIONES
  const obsStr = String(cfg.obs ?? '').trim() || '—'
  content.push({
    table: {
      widths: ['25%', '75%'],
      body: [
        [
          { text: 'OBSERVACIONES:', fontSize: fs7, ...labelStyle },
          { text: obsStr, fontSize: fs9, margin: [0, 0, 0, 60], ...valueStyle },
        ],
      ],
    },
    layout: tableLayoutBorders,
  })

  return {
    pageSize: 'A4',
    pageOrientation: 'portrait',
    pageMargins: MARGIN_PT,
    content,
  }
}

/**
 * Genera y descarga la ficha de camisería para una línea concreta.
 * Archivo: ficha-[order_number]-camisa-[lineIndex+1].pdf
 */
export async function generateFichaForLineCamiseria(
  order: FichaConfeccionOrder,
  line: { configuration?: Record<string, unknown> },
  lineIndex: number
): Promise<void> {
  const orderNum = (order.order_number || order.id).toString().replace(/\s+/g, '-')
  const fileName = `ficha-${orderNum}-camisa-${lineIndex + 1}.pdf`

  const pdfMake = (await import('pdfmake/build/pdfmake')).default
  const vfsModule = await import('pdfmake/build/vfs_fonts')
  const vfs = (vfsModule as { default?: Record<string, string> }).default
  if (typeof pdfMake.addVirtualFileSystem === 'function' && vfs) {
    pdfMake.addVirtualFileSystem(vfs)
  }

  const contentTop: Content[] = buildCamiseriaDocDefinition(order, line, lineIndex, 0).content as Content[]
  const contentBottom = buildCamiseriaDocDefinition(order, line, lineIndex, -1).content as Content[]

  const docDef: PdfDocDefinition = {
    pageSize: 'A4',
    pageOrientation: 'portrait',
    pageMargins: MARGIN_PT,
    content: [
      ...contentTop,
      {
        text: '- - - ✂ CORTAR POR AQUÍ ✂ - - -',
        alignment: 'center',
        margin: [0, 8, 0, 8],
        color: '#888888',
        fontSize: 9,
      },
      ...contentBottom,
    ],
  }

  const pdf = pdfMake.createPdf(docDef as Parameters<typeof pdfMake.createPdf>[0])
  await pdf.download(fileName)
}
