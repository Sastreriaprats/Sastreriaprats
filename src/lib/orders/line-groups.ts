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

// Códigos de garment_type que se consideran camisería para el grupo visual.
// Coexisten en BBDD: 'camisa' (artesanal), 'camiseria' (artesanal alt.),
// 'camiseria_industrial' (industrial). Verificado en producción.
const CAMISERIA_GARMENT_CODES = new Set(['camisa', 'camiseria', 'camiseria_industrial'])

/**
 * Clasifica una línea en uno de los 3 grupos. La heurística mira primero el
 * contenido de `configuration` (campos típicos de cada flujo) porque es lo
 * que rellena el formulario de cada tipo de prenda.
 *
 * Fallback defensivo: si `configuration` no es concluyente (líneas creadas
 * desde el modal "Editar pedido" sin pasar por el formulario de camisería),
 * cae a `garment_types.code`. Esto evita que una camisa con configuration
 * casi vacía aparezca como "Sastrería" en el detalle.
 */
export function getLineGroup(line: unknown): LineGroup {
  const l = line as {
    configuration?: Record<string, unknown> | null
    garment_types?: { code?: string | null } | null
  } | null | undefined
  const cfg = l?.configuration ?? {}
  if (cfg.product_name !== undefined) return 'complementos'
  if (cfg.tipo === 'camiseria' || cfg.puno !== undefined) return 'camiseria'
  const code = l?.garment_types?.code
  if (code && CAMISERIA_GARMENT_CODES.has(code)) return 'camiseria'
  return 'sastreria'
}

/**
 * Devuelve un nombre legible para mostrar en listados. Depende del grupo:
 *  - sastreria: prendaLabel → slug de prenda → nombre del garment_type
 *  - camiseria: "Camisa (Cuello, Puño)" si hay datos; si no, nombre del garment_type
 *  - complementos: product_name
 *
 * El último fallback (`garment_types.name`) cubre líneas que se crearon sin
 * pasar por el formulario completo de su tipo (configuration casi vacía).
 */
export function getLineName(line: unknown): string {
  const l = line as {
    configuration?: Record<string, unknown> | null
    garment_types?: { name?: string | null } | null
  } | null | undefined
  const cfg = (l?.configuration ?? {}) as Record<string, unknown>
  const gtName = (l?.garment_types?.name ?? '').trim() || null
  const group = getLineGroup(line)

  if (group === 'sastreria') {
    const prendaLabel = (cfg.prendaLabel as string)?.trim()
    if (prendaLabel) return prendaLabel
    const prenda = (cfg.prenda as string) ?? ''
    if (prenda.trim()) return slugToPrendaLabel(prenda)
    return gtName ?? '—'
  }

  if (group === 'camiseria') {
    const labelCuello = (cfg.modCuello as string)?.trim()
    const labelPuno = capitalizar(cfg.puno as string)
    if (labelCuello || labelPuno) {
      return `Camisa (${labelCuello || 'Italiano'}, ${labelPuno || 'Sencillo'})`
    }
    // Línea de camisa creada sin formulario (ej. desde "Editar pedido").
    return gtName ?? 'Camisa'
  }

  return (cfg.product_name as string) ?? 'Complemento'
}
