/**
 * Lista canónica de orígenes de cliente (`clients.source`).
 *
 * UNA sola fuente de verdad consumida por:
 *  - Formulario admin de creación de cliente (create-client-dialog.tsx)
 *  - Informe "Origen de nuevos clientes" (reporting/charts/clients-chart.tsx)
 *  - Detalle del cliente (client-detail-content.tsx)
 *  - Cualquier futura UI que muestre o filtre por source.
 *
 * Antes había 3 listas divergentes: el formulario tenía 7 opciones, el
 * informe tenía 13 labels (incluyendo `web_registration` muerto), y el
 * wizard sastre persistía `'sastre'` que el informe etiquetaba sólo por
 * fallback de capitalización. Esto unifica todo.
 *
 * `manual: true` → opción asignable a mano desde el formulario admin.
 * `manual: false` → la genera el código automáticamente (web, citas,
 * checkout, migración, scripts de import). No aparece en formulario.
 */
// Paleta de orígenes: 13 colores VISUALMENTE DISTINTOS (hues bien separados, un
// solo gris neutro = 'other'). Antes 'sastre'/'web'/'web_shop' compartían morado
// y 'other'/'migration'/'import_excel'/'unknown' eran grises casi idénticos.
export const CLIENT_SOURCES = [
  // Manual (visibles en formulario de creación admin):
  { value: 'walk_in',      label: 'Visita en tienda',  color: '#2563EB', manual: true },  // azul
  { value: 'referral',     label: 'Recomendación',     color: '#059669', manual: true },  // esmeralda
  { value: 'sastre',       label: 'Sastre',            color: '#7C3AED', manual: true },  // violeta
  { value: 'web',          label: 'Web',               color: '#0EA5E9', manual: true },  // cielo
  { value: 'social_media', label: 'Redes sociales',    color: '#F59E0B', manual: true },  // ámbar
  { value: 'event',        label: 'Evento',            color: '#E11D48', manual: true },  // rosa/carmín
  { value: 'press',        label: 'Prensa',            color: '#0D9488', manual: true },  // verde azulado
  { value: 'other',        label: 'Otro',              color: '#6B7280', manual: true },  // gris (único neutro)
  // Automatizados (NO visibles en formulario, generados por código):
  { value: 'web_shop',     label: 'Tienda online',     color: '#C026D3', manual: false }, // fucsia
  { value: 'online',       label: 'Cita online',       color: '#EA580C', manual: false }, // naranja
  { value: 'migration',    label: 'Migración',         color: '#92400E', manual: false }, // marrón
  { value: 'import_excel', label: 'Importación Excel', color: '#65A30D', manual: false }, // lima
  { value: 'unknown',      label: 'Sin datos',         color: '#334155', manual: false }, // pizarra oscuro
] as const

// Paleta de reserva para valores de `source` legacy NO catalogados (p.ej.
// 'gdpr_paper_2026', 'test_campaign'): colores distintos de los de arriba, para
// que tampoco compartan color entre sí ni con los conocidos.
const FALLBACK_PALETTE = ['#0891B2', '#CA8A04', '#BE123C', '#4D7C0F', '#7E22CE', '#B45309', '#1D4ED8', '#A21CAF', '#15803D', '#9F1239'] as const

export type ClientSourceValue = (typeof CLIENT_SOURCES)[number]['value']

export const CLIENT_SOURCE_BY_VALUE: Record<string, { label: string; color: string }> =
  Object.fromEntries(CLIENT_SOURCES.map(s => [s.value, { label: s.label, color: s.color }]))

/** Label legible. Valores legacy desconocidos caen al fallback de
 *  capitalización (preserva retro-compatibilidad). */
export function clientSourceLabel(value: string | null | undefined): string {
  if (!value) return 'Sin datos'
  const known = CLIENT_SOURCE_BY_VALUE[value]
  if (known) return known.label
  return value.charAt(0).toUpperCase() + value.slice(1).replace(/_/g, ' ')
}

function fallbackColor(value: string): string {
  let h = 0
  for (let i = 0; i < value.length; i++) h = (h * 31 + value.charCodeAt(i)) >>> 0
  return FALLBACK_PALETTE[h % FALLBACK_PALETTE.length]
}

/** Color de un source aislado (ficha de cliente, etc.). Para conjuntos donde
 *  hay que GARANTIZAR que ninguno comparta color, usar `assignSourceColors`. */
export function clientSourceColor(value: string | null | undefined): string {
  if (!value) return '#E5E7EB'
  return CLIENT_SOURCE_BY_VALUE[value]?.color ?? fallbackColor(value)
}

/**
 * Asigna un color ÚNICO a cada `source` de un conjunto (para leyendas/gráficos
 * donde dos categorías no deben compartir color). Los conocidos mantienen su
 * color canónico; los legacy reciben colores de la paleta de reserva evitando
 * colisiones, con respaldo HSL si se agota.
 */
export function assignSourceColors(values: string[]): Record<string, string> {
  const result: Record<string, string> = {}
  const used = new Set<string>()
  for (const v of values) {
    const known = CLIENT_SOURCE_BY_VALUE[v]
    if (known) { result[v] = known.color; used.add(known.color) }
  }
  let fi = 0
  for (const v of values) {
    if (result[v]) continue
    while (fi < FALLBACK_PALETTE.length && used.has(FALLBACK_PALETTE[fi])) fi++
    const color = FALLBACK_PALETTE[fi] ?? `hsl(${(fi * 47) % 360} 65% 45%)`
    result[v] = color; used.add(color); fi++
  }
  return result
}
