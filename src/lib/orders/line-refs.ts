/**
 * Referencia corta por PRENDA de un pedido de sastrería ("boleta"), para que
 * cada ficha de confección se distinga de las demás del mismo pedido:
 *
 *   PIN-2026-0178-AMER1       americana suelta (1ª del pedido)
 *   PIN-2026-0178-PANT-TRJ1   pantalón del Traje 1
 *   PIN-2026-0178-CHAL-CHQ1   chaleco del Chaqué 1
 *   PIN-2026-0178-CAM2        2ª camisa a medida
 *
 * La referencia NO se persiste: se deriva del orden estable de las líneas
 * (sort_order → created_at → id) y del vínculo de conjunto que ya guarda la
 * ficha en `configuration.prendaLabel` ("Americana — Traje 1"). Mientras no se
 * borren líneas, la referencia de cada prenda no cambia aunque se reimprima.
 */

import { getLineGroup } from './line-groups'

export type RefLine = {
  id?: string | null
  sort_order?: number | null
  created_at?: string | null
  configuration?: Record<string, unknown> | null
  garment_types?: { code?: string | null; name?: string | null } | null
}

/** Orden estable de las líneas tal y como se crearon en la ficha. */
export function sortOrderLines<T extends RefLine>(lines: T[]): T[] {
  return [...lines].sort((a, b) =>
    (Number(a.sort_order ?? 0) - Number(b.sort_order ?? 0)) ||
    String(a.created_at ?? '').localeCompare(String(b.created_at ?? '')) ||
    String(a.id ?? '').localeCompare(String(b.id ?? '')),
  )
}

const GARMENT_ABBREV: Record<string, string> = {
  americana: 'AMER',
  pantalon: 'PANT',
  chaleco: 'CHAL',
  chaque: 'CHAQ',
  chaquet: 'CHAQ',
  levita: 'LEVI',
  abrigo: 'ABRG',
  teba: 'TEBA',
  gabardina: 'GABA',
  frac: 'FRAC',
  falda: 'FALD',
  bata: 'BATA',
  pijama: 'PIJA',
  smoking_jacket: 'AMER',
  smoking_trouser: 'PANT',
  camisa: 'CAM',
  camiseria: 'CAM',
  camiseria_industrial: 'CAM',
}

function stripAccents(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '')
}

function garmentAbbrev(line: RefLine): string {
  const cfg = (line.configuration ?? {}) as Record<string, unknown>
  const slug = String(cfg.prendaSlug ?? line.garment_types?.code ?? '').trim().toLowerCase()
  if (GARMENT_ABBREV[slug]) return GARMENT_ABBREV[slug]
  const base = stripAccents(slug || String(line.garment_types?.name ?? ''))
    .replace(/[^a-zA-Z]/g, '')
    .slice(0, 4)
    .toUpperCase()
  return base || 'PRD'
}

/**
 * Etiqueta de conjunto de la línea: la parte de prendaLabel tras el guión
 * largo ("Americana — Traje 1" → "Traje 1"). Solo em/en dash: es el separador
 * que escribe la ficha del sastre; un guion normal podría formar parte del
 * nombre de la prenda.
 */
function groupLabelOf(line: RefLine): string | null {
  const cfg = (line.configuration ?? {}) as Record<string, unknown>
  const label = String(cfg.prendaLabel ?? '').trim()
  const m = label.match(/\s*(?:—|–)\s*(.+)$/)
  return m ? m[1].trim() : null
}

function suitTagBase(groupLabel: string): string {
  const l = stripAccents(groupLabel).toLowerCase()
  if (l.startsWith('traje')) return 'TRJ'
  if (l.startsWith('smoking')) return 'SMK'
  if (l.startsWith('chaqu')) return 'CHQ'
  if (l.startsWith('frac')) return 'FRC'
  if (l.startsWith('levita')) return 'LEV'
  const base = l.replace(/[^a-z]/g, '').slice(0, 3).toUpperCase()
  return base || 'CNJ'
}

/** Número final de una etiqueta ("Traje 3" → 3, "Americana" → null). */
function trailingNumber(label: string | null): number | null {
  const m = String(label ?? '').trim().match(/(\d+)\s*$/)
  return m ? Number(m[1]) : null
}

/**
 * "BASE + número": usa el número de la etiqueta visible si está libre
 * (así "Traje 3" → TRJ3, igual que ve el sastre en pantalla); si no hay
 * número o ya está cogido, el primer libre.
 */
function claimTag(base: string, wanted: number | null, used: Set<string>): string {
  if (wanted != null && !used.has(`${base}${wanted}`)) {
    used.add(`${base}${wanted}`)
    return `${base}${wanted}`
  }
  let k = 1
  while (used.has(`${base}${k}`)) k++
  used.add(`${base}${k}`)
  return `${base}${k}`
}

/**
 * Sufijo de referencia por línea (id → "AMER-TRJ3" / "PANT2" / "CAM1").
 * - Prendas que comparten conjunto (mismo texto tras "—" y ≥2 líneas):
 *   ABREV-PRENDA + tag del conjunto, con el número de la etiqueta visible
 *   ("Americana — Traje 3" → AMER-TRJ3).
 * - Prendas sueltas (incl. camisas): ABREV + número de la etiqueta visible
 *   ("Americana 5" → AMER5) o el primer libre.
 * - Complementos de boutique: sin referencia (no llevan boleta).
 * Al derivarse de las etiquetas (y no del orden), las referencias se mantienen
 * estables aunque el pedido se edite.
 */
export function buildLineRefSuffixes(lines: RefLine[]): Map<string, string> {
  const sorted = sortOrderLines(lines ?? [])
  const out = new Map<string, string>()

  const groupCount = new Map<string, number>()
  for (const l of sorted) {
    if (getLineGroup(l) !== 'sastreria') continue
    const g = groupLabelOf(l)
    if (g) groupCount.set(g, (groupCount.get(g) ?? 0) + 1)
  }

  const groupTags = new Map<string, string>()  // "Traje 3" → "TRJ3"
  const usedSuitTags = new Set<string>()
  const usedLoose = new Set<string>()

  for (const l of sorted) {
    if (!l.id) continue
    const group = getLineGroup(l)
    if (group === 'complementos') continue
    const abbrev = group === 'camiseria' ? 'CAM' : garmentAbbrev(l)
    const g = group === 'sastreria' ? groupLabelOf(l) : null

    if (g && (groupCount.get(g) ?? 0) > 1) {
      let tag = groupTags.get(g)
      if (!tag) {
        tag = claimTag(suitTagBase(g), trailingNumber(g), usedSuitTags)
        groupTags.set(g, tag)
      }
      out.set(String(l.id), `${abbrev}-${tag}`)
    } else {
      // Suelta: número de la etiqueta visible ("Americana 5", "Pantalón solo 2")
      const cfg = (l.configuration ?? {}) as Record<string, unknown>
      const n = trailingNumber(g ?? String(cfg.prendaLabel ?? ''))
      const tag = claimTag(abbrev, n, usedLoose)
      out.set(String(l.id), tag)
    }
  }
  return out
}

// Rango natural dentro de un conjunto: chaqueta → chaleco → pantalón.
const GROUP_MEMBER_RANK: Record<string, number> = {
  americana: 0, chaque: 0, chaquet: 0, levita: 0, frac: 0, smoking_jacket: 0, abrigo: 0, teba: 0,
  chaleco: 1,
  pantalon: 2, smoking_trouser: 2,
}

function memberRank(line: RefLine): number {
  const cfg = (line.configuration ?? {}) as Record<string, unknown>
  const slug = String(cfg.prendaSlug ?? line.garment_types?.code ?? '').trim().toLowerCase()
  return GROUP_MEMBER_RANK[slug] ?? 3
}

/**
 * Orden de VISUALIZACIÓN: como sortOrderLines, pero además junta las prendas
 * de un mismo conjunto (el conjunto entero se coloca donde aparece su primer
 * miembro, y dentro va chaqueta → chaleco → pantalón). Necesario porque en
 * pedidos editados a lo largo del tiempo el sort_order de los miembros de un
 * traje puede haber quedado intercalado con otras prendas.
 */
export function sortLinesForDisplay<T extends RefLine>(lines: T[]): T[] {
  const sorted = sortOrderLines(lines ?? [])
  const keyOf = (l: T, i: number): string => {
    if (getLineGroup(l) !== 'sastreria') return `__self_${i}`
    const g = groupLabelOf(l)
    return g && sorted.filter(x => getLineGroup(x) === 'sastreria' && groupLabelOf(x) === g).length > 1
      ? `__grp_${g}`
      : `__self_${i}`
  }
  const firstIdx = new Map<string, number>()
  sorted.forEach((l, i) => {
    const k = keyOf(l, i)
    if (!firstIdx.has(k)) firstIdx.set(k, i)
  })
  return sorted
    .map((l, i) => ({ l, i, k: keyOf(l, i) }))
    .sort((a, b) =>
      (firstIdx.get(a.k)! - firstIdx.get(b.k)!) ||
      (a.k === b.k ? (memberRank(a.l) - memberRank(b.l)) : 0) ||
      (a.i - b.i),
    )
    .map(x => x.l)
}

/** Sufijo de una línea concreta, o null si no le corresponde (complemento, sin id…). */
export function getLineRefSuffix(lines: RefLine[], line: RefLine | null | undefined): string | null {
  if (!line?.id) return null
  return buildLineRefSuffixes(lines ?? []).get(String(line.id)) ?? null
}

/** Referencia completa de la boleta: "PIN-2026-0178-AMER-TRJ1" (o el nº de pedido a secas si no hay sufijo). */
export function getLineRef(
  orderNumber: string | null | undefined,
  lines: RefLine[],
  line: RefLine | null | undefined,
): string {
  const base = String(orderNumber ?? '').trim() || '—'
  const suffix = getLineRefSuffix(lines, line)
  return suffix ? `${base}-${suffix}` : base
}
