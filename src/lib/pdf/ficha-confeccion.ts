/**
 * Genera el PDF de la ficha de confección con pdfmake (replica del diseño físico).
 * Parte superior (ficha sastrería) + línea de corte + talón oficial (2 columnas).
 */

import type { Content } from 'pdfmake'
import { getOrderStatusLabel } from '@/lib/utils'

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

/** Claves de medidas por tipo de prenda (sin prefijo). */
const MEDIDAS_KEYS_POR_PRENDA: Record<string, readonly string[]> = {
  americana: ['talle', 'largo', 'encuentro', 'largo_manga', 'pecho', 'cintura', 'frente_pecho', 'hombro', 'cadera'],
  frac:      ['talle', 'largo', 'encuentro', 'largo_manga', 'pecho', 'cintura', 'frente_pecho', 'hombro', 'cadera'],
  abrigo:    ['talle', 'largo', 'encuentro', 'largo_manga', 'pecho', 'cintura', 'frente_pecho', 'hombro', 'cadera'],
  pantalon:  ['largo', 'tiro', 'cintura', 'cadera', 'rodilla', 'bajo'],
  chaleco:   ['talle', 'largo', 'escote', 'largo_delantero', 'pecho', 'cintura'],
  camiseria: ['cuello', 'canesu', 'largo_manga', 'frente_pecho', 'pecho', 'cintura', 'cadera', 'largo_cuerpo', 'hombro', 'puno'],
  camiseria_industrial: ['cuello', 'canesu', 'largo_manga', 'frente_pecho', 'pecho', 'cintura', 'cadera', 'largo_cuerpo', 'hombro', 'puno'],
}

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

const MEDIDAS_LABELS: Record<string, string> = {
  talle: 'Talle',
  largo: 'Largo',
  encuentro: 'Encuentro',
  largo_manga: 'L.Manga',
  pecho: 'Pecho',
  cintura: 'Cintura',
  frente_pecho: 'Fr.Pecho',
  hombro: 'Hombro',
  cadera: 'Cadera',
  tiro: 'Tiro',
  rodilla: 'Rodilla',
  bajo: 'Bajo',
  escote: 'Escote',
  largo_delantero: 'L.Delantero',
  largo_cuerpo: 'L.Cuerpo',
  puno: 'Puño',
}

function getMedidasStr(
  clientMeasurementsValues?: Record<string, unknown>,
  prefix: string = 'americana_',
  keys: readonly string[] = MEDIDAS_KEYS_POR_PRENDA['americana']
): string {
  if (!clientMeasurementsValues || typeof clientMeasurementsValues !== 'object') return '—'
  const cfg = clientMeasurementsValues as Record<string, unknown>
  const parts: string[] = []
  for (const baseKey of keys) {
    const keysToTry = [`${prefix}${baseKey}`, baseKey]
    let val: unknown = undefined
    for (const k of keysToTry) {
      if (cfg[k] !== undefined && cfg[k] !== null && cfg[k] !== '') {
        val = cfg[k]
        break
      }
    }
    const label = MEDIDAS_LABELS[baseKey] ?? baseKey
    const n = typeof val === 'number' ? val : Number(val)
    if (typeof n === 'number' && Number.isFinite(n)) {
      parts.push(`${label}: ${n}`)
    } else {
      parts.push(`${label}: —`)
    }
  }
  const allDash = parts.every((p) => p.endsWith(': —'))
  return allDash ? '—' : parts.join(' - ')
}

const LABELS_BOTONES: Record<string, string> = {
  '1fila_1': '1 Fila 1 botón',
  '1fila_2': '1 Fila 2 botones',
  '1fila_3para2': '1 Fila 3 para 2',
  '2filas_6': '2 Filas 6 botones',
}
const LABELS_ABERTURAS: Record<string, string> = {
  '2aberturas': '2 Aberturas',
  '1abertura': '1 Abertura',
  sin_abertura: 'Sin abertura',
  sin_aberturas: 'Sin abertura',
}
const LABELS_BOLSILLO: Record<string, string> = {
  recto: 'Bolsillo recto',
  inclinado: 'Bol. inclinado',
  parche: 'Bolsillo parche',
  bercheta: 'Pecho de bercheta',
  bercheta_parche: 'Pecho parche de bercheta',
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
  con_reborde: 'Con reborde',
}
const LABELS_FORRO: Record<string, string> = {
  sin_forro: 'Sin forro',
  medio: 'Medio forro',
  completo: 'Forro completo',
}
const LABELS_VUELTAS: Record<string, string> = {
  sin_vueltas: 'Sin vueltas',
  con_vueltas: 'Con vueltas',
  '3.5': '3.5 cm',
  '4': '4 cm',
  '4.5': '4.5 cm',
  '5': '5 cm',
}
const LABELS_BRAGUETA: Record<string, string> = {
  cremallera: 'Cremallera',
  boton: 'Botón',
  botones: 'Botones',
}
const LABELS_PLIEGUES: Record<string, string> = {
  sin_pliegues: 'Sin pliegues',
  un_pliegue: '1 pliegue',
  dos_pliegues: '2 pliegues',
  '1_pliegue': '1 pliegue',
  '2_pliegues': '2 pliegues',
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

function buildDescripcionAndConfig(config: Record<string, unknown>): { descripcion: string; configuracion: string } {
  const partes: string[] = []
  const confParts: string[] = []
  const slug = String(config.prendaSlug ?? config.prenda ?? '').toLowerCase()
  const isPantalon = slug === 'pantalon'
  const isChaleco = slug === 'chaleco'
  const isAmericana = !isPantalon && !isChaleco

  if (isAmericana) {
    if (config.botones) partes.push(labelBotones(config.botones))
    if (config.aberturas) partes.push(labelAberturas(config.aberturas))

    const bols: string[] = []
    if (config.bolsilloTipo) bols.push(labelBolsillo(config.bolsilloTipo))
    if (config.cerrilleraExterior) bols.push('cerillera exterior')
    if (bols.length) partes.push(bols.join(', '))

    if (config.primerBoton) partes.push(`1er botón a ${config.primerBoton} cm`)

    if (config.solapa) {
      let sol = labelSolapa(config.solapa)
      if (config.anchoSolapa) sol += ` ${config.anchoSolapa} cm`
      partes.push(sol)
    }

    if (config.manga) partes.push(labelManga(config.manga))
    if (config.ojalesAbiertos) partes.push(`Ojales abiertos: ${config.ojalesAbiertos}`)
    if (config.ojalesCerrados) partes.push(`Ojales cerrados: ${config.ojalesCerrados}`)

    const hombros: string[] = []
    if (config.medidaHombro) hombros.push('medida hombro')
    if (config.hTerminado) hombros.push(config.hTerminadoVal ? `H. terminado: ${config.hTerminadoVal}` : 'H. terminado')
    if (config.escote) hombros.push(config.escoteVal ? `escote: ${config.escoteVal}` : 'escote')
    if (config.sinHombreras) hombros.push('sin hombreras')
    if (config.picado34) hombros.push('picado 3/4')
    if (config.sinHombrera) hombros.push('sin hombrera')
    if (config.hombrerasTraseras) hombros.push('hombreras traseras')
    if (config.pocaHombrera) hombros.push('poca hombrera')
    if (hombros.length) partes.push(hombros.join(', '))

    if (config.forro) {
      let f = labelForro(config.forro)
      if (config.forroDesc) f += ` (${config.forroDesc})`
      partes.push(f)
    }

    // Configuración → separate field
    if (config.confF) confParts.push(`F ${config.confF}`)
    if (config.confD) confParts.push(`D ${config.confD}`)
    if (config.confFP) confParts.push(`FP ${config.confFP}`)
    if (config.confFV) confParts.push(`FV ${config.confFV}`)
    if (config.confHA) confParts.push(`HA ${config.confHA}`)
    if (config.confHB) confParts.push(`HB ${config.confHB}`)
    if (config.confVD) confParts.push(`VD ${config.confVD}`)
  }

  if (isPantalon) {
    if (config.vueltas) partes.push(labelVueltas(config.vueltas))
    if (config.bragueta) partes.push(labelBragueta(config.bragueta))
    if (config.pliegues) {
      let pl = labelPliegues(config.pliegues)
      if (config.plieguesVal) pl += ` (${config.plieguesVal})`
      partes.push(pl)
    }
    if (config.pVEnTrasero) partes.push('V en trasero')
    if (config.pretina2Botones) partes.push('Pretina 2 botones')
    if (config.pretinaCorrida) partes.push('Pretina corrida')
    if (config.pretinaReforzadaDelante) partes.push('Pretina reforzada por delante')
    const bolsP: string[] = []
    if (config.p7pasadores) bolsP.push('7 pasadores')
    if (config.p5bolsillos) bolsP.push('5 bolsillos')
    if (config.pRefForro) bolsP.push('Ref. forro')
    if (config.pRefExtTela) bolsP.push('Ref. ext. tela')
    if (config.pSinBolTrasero) bolsP.push('Sin bol. trasero')
    if (config.p1BolTrasero) bolsP.push('1 bol. trasero')
    if (config.p2BolTraseros) bolsP.push('2 bol. traseros')
    if (config.pBolCostura) bolsP.push('Bol. costura')
    if (config.pBolFrances) bolsP.push('Bol. francés')
    if (config.pBolVivo) bolsP.push('Bol. vivo')
    if (config.pBolOreja) bolsP.push('Bol. oreja')
    if (config.pCenidores) bolsP.push('Ceñidores costados')
    if (config.pBotonesTirantes) bolsP.push('Botones tirantes')
    if (bolsP.length) partes.push(bolsP.join(', '))

    // Configuración → separate field
    if (config.confFM) confParts.push(`FM ${config.confFM}`)
    if (config.confFT) confParts.push(`FT ${config.confFT}`)
    if (config.confPT) confParts.push(`PT ${config.confPT}`)
    if (config.confRodalTrasero) confParts.push(`Rodal trasero ${config.confRodalTrasero}`)
    if (config.confBajadaDelantero) confParts.push(`Bajada delantero ${config.confBajadaDelantero}`)
    if (config.confAlturaTrasero) confParts.push(`Altura trasero ${config.confAlturaTrasero}`)
    if (config.confFormaGemelo) confParts.push('Forma gemelo')
    if (config.confFVSalida) confParts.push(`FV con salida ${config.confFVSalida}`)
  }

  if (isChaleco) {
    if (config.chalecoCorte) partes.push(config.chalecoCorte as string)
    if (config.chalecoBolsillo) partes.push(config.chalecoBolsillo as string)

    // Configuración → separate field
    if (config.confF) confParts.push(`F ${config.confF}`)
    if (config.confD) confParts.push(`D ${config.confD}`)
    if (config.confFP) confParts.push(`FP ${config.confFP}`)
    if (config.confFV) confParts.push(`FV ${config.confFV}`)
    if (config.confHA) confParts.push(`HA ${config.confHA}`)
    if (config.confHB) confParts.push(`HB ${config.confHB}`)
    if (config.confVD) confParts.push(`VD ${config.confVD}`)
  }

  // Build configuracion: first the conf values, then the free text (caracteristicasPrenda)
  const caracText = String(config.caracteristicasPrenda ?? '').trim()
  const confLine = confParts.join(', ')
  const configuracion = [confLine, caracText].filter(Boolean).join('\n') || '—'

  return {
    descripcion: partes.join(' // ') || '—',
    configuracion,
  }
}

function getFichaFromOrder(order: FichaConfeccionOrder): Record<string, unknown> {
  const lines = order.tailoring_order_lines ?? []
  const first = lines[0]
  const config = (first?.configuration ?? {}) as Record<string, unknown>
  const prendaSlug = String(config.prendaSlug ?? config.prenda ?? '').toLowerCase().replace(/\s+/g, '_')
  const isCamiseria = prendaSlug.includes('camiseria')
  const medidasPrefix = isCamiseria ? 'camiseria_' : (prendaSlug ? `${prendaSlug}_` : 'americana_')
  const medidasKeys = MEDIDAS_KEYS_POR_PRENDA[prendaSlug] ?? MEDIDAS_KEYS_POR_PRENDA['americana']
  const clientMeasValues = order.clientMeasurements?.values
  const medidasStr = getMedidasStr(clientMeasValues, medidasPrefix, medidasKeys)
  const prendaLabel = slugToPrendaLabel(prendaSlug)

  const tejidoStr = String(config.tejidoStockNombre || config.tejidoCatalogo || config.tejido || '').trim()
  const metrosVal = config.tejidoMetros || config.metros
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
    ...buildDescripcionAndConfig(config),
    observaciones: config.observaciones ?? '',
    caracteristicas: caracteristicasStr,
    caracteristicasPrenda: String(config.caracteristicasPrenda ?? '').trim(),
    tejido: tejidoStr,
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

/** Layout con padding vertical mayor para filas de medidas y descripción */
const tableLayoutBordersPadded = {
  hLineWidth: () => 0.5,
  vLineWidth: () => 0.5,
  hLineColor: () => BORDER_COLOR,
  vLineColor: () => BORDER_COLOR,
  paddingTop: () => 6,
  paddingBottom: () => 6,
  paddingLeft: () => 4,
  paddingRight: () => 4,
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
  const configuracionStr = String(ficha.configuracion ?? '—').trim() || '—'
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
          cellStack('Situación trabajo:', getOrderStatusLabel(String(ficha.situacionTrabajo ?? '—'))),
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
    layout: tableLayoutBordersPadded,
  })

  // Descripción: celda crece con el contenido (sin altura fija)
  content.push({
    table: {
      widths: ['25%', '75%'],
      body: [[cellLabel('Descripción:'), cellValue(descripcionStr)]],
    },
    layout: tableLayoutBordersPadded,
  })

  // Configuración
  content.push({
    table: {
      widths: ['25%', '75%'],
      body: [[cellLabel('Configuración:'), cellValue(configuracionStr)]],
    },
    layout: tableLayoutBordersPadded,
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

  // ─── PARTE INFERIOR: TALÓN OFICIAL (tabla única para igualar alturas) ────
  const talonLeftStack: Content[] = [
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
            cellStack('Situación:', getOrderStatusLabel(String(ficha.situacionTrabajo ?? '—'))),
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
      layout: tableLayoutBordersPadded,
    },
    {
      table: {
        widths: ['25%', '75%'],
        body: [[cellLabel('Descripción:'), cellValue(descripcionStr)]],
      },
      layout: tableLayoutBordersPadded,
    },
    {
      table: {
        widths: ['25%', '75%'],
        body: [[cellLabel('Configuración:'), cellValue(configuracionStr)]],
      },
      layout: tableLayoutBordersPadded,
    },
  ]

  content.push({
    table: {
      widths: ['68%', '32%'],
      body: [
        [
          { stack: talonLeftStack, border: [false, false, false, false] },
          {
            stack: [
              { text: 'Talón de cobro', bold: true, alignment: 'center', fontSize: 13, margin: [4, 8, 4, 12] },
              { text: `Nº talón: ${String(order.order_number ?? '—')}`, bold: true, fontSize: 11, margin: [6, 6, 6, 6] },
              { text: `Cliente: ${getClientName(order)}`, margin: [6, 6] },
              { text: `Oficial: ${oficialStr || ' '}`, margin: [6, 6] },
              { text: `Prenda: ${prendaLabel || '—'}`, margin: [6, 6] },
              { text: `Situación: ${getOrderStatusLabel(String(ficha.situacionTrabajo ?? '—'))}`, margin: [6, 6] },
              { text: `F. compromiso: ${formatDate(ficha.fechaProximaVisita ?? ficha.fechaCompromiso)}`, margin: [6, 6] },
              { text: `Fecha emisión: ${hoy}`, margin: [6, 6, 6, 8] },
            ],
            border: [true, true, true, true],
          },
        ],
      ],
    },
    layout: {
      hLineWidth: () => 0.5,
      vLineWidth: () => 0.5,
      hLineColor: () => BORDER_COLOR,
      vLineColor: () => BORDER_COLOR,
      paddingLeft: () => 0,
      paddingRight: () => 4,
      paddingTop: () => 0,
      paddingBottom: () => 0,
    },
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
  if (cfg.tipo === 'camiseria' || cfg.tipo === 'camiseria_industrial') return true
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
  'L.MANGA',
  'FR.PECHO',
  'PECHO',
  'CINTURA',
  'CADERA',
  'LAR.CUERPO',
  'HOMBRO',
  'PUÑO',
] as const
const MEDIDAS_KEYS_CAMISA = [
  'cuello',
  'canesu',
  'largoManga',
  'frentePecho',
  'pecho',
  'cintura',
  'cadera',
  'largoCuerpo',
  'hombro',
  'puno',
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
