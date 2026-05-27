/**
 * Agrupación de líneas de pedido (`tailoring_order_lines`) por familia visual:
 *  - 'sastreria': trajes y prendas tradicionales con ficha de confección
 *  - 'camiseria': camisas a medida (artesanal o industrial)
 *  - 'complementos': líneas de boutique adjuntadas al pedido
 *
 * Fuente única consumida por:
 *  - Detalle del pedido en panel sastre (sección "Piezas del pedido")
 *  - Detalle del pedido en panel admin (pestaña "Prendas")
 *
 * Antes vivía duplicada en cada componente y divergió en pequeños detalles
 * (sastre usaba 'complementos' plural, admin usaba 'complemento' singular).
 * Esta unificación se queda con la versión plural del sastre.
 */

export type LineGroup = 'sastreria' | 'camiseria' | 'complementos'

function slugToPrendaLabel(slug: string): string {
  if (!slug || typeof slug !== 'string') return '—'
  return slug
    .trim()
    .split('_')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(' ')
}

function capitalizar(s: string | undefined): string {
  if (s == null || typeof s !== 'string') return ''
  const t = s.trim()
  return t ? t.charAt(0).toUpperCase() + t.slice(1).toLowerCase() : ''
}

/**
 * Clasifica una línea en uno de los 3 grupos. La heurística mira primero el
 * contenido de `configuration` (campos típicos de cada flujo) porque es lo
 * que rellena el formulario de cada tipo de prenda.
 */
export function getLineGroup(line: unknown): LineGroup {
  const l = line as { configuration?: Record<string, unknown> | null } | null | undefined
  const cfg = l?.configuration ?? {}
  if (cfg.product_name !== undefined) return 'complementos'
  if (cfg.tipo === 'camiseria' || cfg.puno !== undefined) return 'camiseria'
  return 'sastreria'
}

/**
 * Devuelve un nombre legible para mostrar en listados. Depende del grupo:
 *  - sastreria: prendaLabel o slug derivado de prenda
 *  - camiseria: "Camisa (Cuello, Puño)"
 *  - complementos: product_name
 */
export function getLineName(line: unknown): string {
  const l = line as {
    configuration?: Record<string, unknown> | null
  } | null | undefined
  const cfg = (l?.configuration ?? {}) as Record<string, unknown>
  const group = getLineGroup(line)
  if (group === 'sastreria') {
    const prendaLabel = (cfg.prendaLabel as string)?.trim()
    if (prendaLabel) return prendaLabel
    return slugToPrendaLabel((cfg.prenda as string) ?? '')
  }
  if (group === 'camiseria') {
    const labelCuello = (cfg.modCuello as string)?.trim() || 'Italiano'
    const labelPuno = capitalizar(cfg.puno as string)
    return `Camisa (${labelCuello}, ${labelPuno})`
  }
  return (cfg.product_name as string) ?? 'Complemento'
}
