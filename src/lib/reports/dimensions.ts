// Dimensiones transversales de los informes: CANAL (boutique/sastrería) y TIENDA.
//
// Módulo PLANO a propósito (NO lleva 'use server'): así puede exportar constantes
// y helpers síncronos que comparten las server actions de informes (reports.ts) y
// la UI (reports-content.tsx) con UNA sola definición. Es el cimiento sobre el que
// se construyen las vistas multi-tienda (nº4), boutique en ventas por tipo (nº5) y
// tienda por empleado (nº10): todas deben reutilizar esto para no divergir.

/**
 * DEFINICIÓN ÚNICA DE "BOUTIQUE".
 *
 * Una venta es de boutique sii `sales.sale_type === BOUTIQUE_SALE_TYPE`.
 *
 * Regla invariable del dominio:
 *  - La SASTRERÍA nunca vive en `sales`. Va por `tailoring_orders` (valor del
 *    pedido) + `tailoring_order_payments` (caja cobrada). Ver memoria
 *    `project_sastreria_revenue_sources`.
 *  - Por tanto "lo vendido en boutique" = `sale_lines` de ventas con este
 *    `sale_type`. NUNCA asumir que "todo `sale_lines`" es boutique: otros
 *    sale_type ('gift_card', o futuros 'tailoring_*' cobrados por TPV)
 *    contaminarían el dato sin avisar.
 *
 * Cualquier informe que segmente boutique/sastrería DEBE filtrar por aquí.
 */
export const BOUTIQUE_SALE_TYPE = 'boutique' as const

/**
 * Tarjetas regalo: `sales.sale_type === GIFT_CARD_SALE_TYPE`. Es venta de SALDO,
 * no de producto boutique, por eso se reporta en columna propia y NO se suma a
 * Boutique. Viaja con el canal Boutique (no es sastrería).
 */
export const GIFT_CARD_SALE_TYPE = 'gift_card' as const

// Orden natural de tallas para el desglose: numéricas por valor (46,48,50…) antes
// que las de letra; letras por su orden real (XS<S<M<L<XL…); "sin talla" (—) al final.
const LETTER_SIZE_ORDER = ['XXS', 'XS', 'S', 'M', 'L', 'XL', 'XXL', 'XXXL', '4XL']
export function compareSizes(a: string, b: string): number {
  const na = Number(a), nb = Number(b)
  const aNum = a.trim() !== '' && !Number.isNaN(na)
  const bNum = b.trim() !== '' && !Number.isNaN(nb)
  if (aNum && bNum) return na - nb
  if (aNum !== bNum) return aNum ? -1 : 1
  const ia = LETTER_SIZE_ORDER.indexOf(a.toUpperCase()), ib = LETTER_SIZE_ORDER.indexOf(b.toUpperCase())
  if (ia !== -1 && ib !== -1) return ia - ib
  if (ia !== -1) return -1
  if (ib !== -1) return 1
  if (a === '—') return 1
  if (b === '—') return -1
  return a.localeCompare(b)
}

/** Fila del desglose por talla de un producto (lo devuelve getTopProducts). */
export type SizeBreakdownRow = { size: string; comprado: number; vendido: number; queda: number }

/**
 * Agrega los `sizeBreakdown` de varios productos en un total por TALLA
 * (más vendidas primero; a igualdad, orden natural de talla). Lo comparten la
 * tarjeta "Unidades vendidas por talla" de Informes→Productos y sus exports
 * PDF/Excel, para que los tres muestren exactamente el mismo dato.
 */
export function aggregateSizeTotals(
  products: { sizeBreakdown?: SizeBreakdownRow[] | null }[],
): SizeBreakdownRow[] {
  const acc: Record<string, SizeBreakdownRow> = {}
  for (const p of products) {
    for (const b of p.sizeBreakdown || []) {
      const s = (acc[b.size] ||= { size: b.size, comprado: 0, vendido: 0, queda: 0 })
      s.comprado += b.comprado
      s.vendido += b.vendido
      s.queda += b.queda
    }
  }
  return Object.values(acc).sort((a, b) => b.vendido - a.vendido || compareSizes(a.size, b.size))
}

/**
 * Etiqueta compacta con las TALLAS MÁS VENDIDAS de UN producto, más vendida
 * primero: p.ej. "50 (12) · 52 (9) · 48 (5)". La usan los exports PDF/Excel para
 * mostrar, por producto, el mismo detalle que las filas expandibles de la web.
 * Ignora tallas con 0 vendidas; devuelve '' si el producto no vendió ninguna.
 */
export function topSizesLabel(sizeBreakdown?: SizeBreakdownRow[] | null, limit = 5): string {
  return (sizeBreakdown || [])
    .filter((b) => b.vendido > 0)
    .sort((a, b) => b.vendido - a.vendido || compareSizes(a.size, b.size))
    .slice(0, limit)
    .map((b) => `${b.size} (${b.vendido})`)
    .join(' · ')
}

/** Bucket acumulado por tienda. */
export type StoreBucket = { store_name: string; total: number }

/**
 * Acumulador genérico por TIENDA — base común de la dimensión "todas las tiendas
 * a la vez" (nº4). Cada informe pasa un extractor que, por fila, devuelve la
 * tienda ya resuelta (`storeId`/`storeName`) y el `value` a sumar; el helper los
 * agrupa por tienda. Las filas sin tienda caen en la clave `'unknown'`.
 *
 * Mantener el agrupado en un solo sitio evita que cada vista reinvente (y haga
 * divergir) la lógica de "¿de qué tienda es esta fila?".
 */
export function accumulateByStore<T>(
  rows: T[],
  pick: (row: T) => { storeId: string | null | undefined; storeName: string | null | undefined; value: number },
): Record<string, StoreBucket> {
  const acc: Record<string, StoreBucket> = {}
  for (const row of rows) {
    const { storeId, storeName, value } = pick(row)
    const id = storeId || 'unknown'
    if (!acc[id]) acc[id] = { store_name: storeName || 'Sin tienda', total: 0 }
    acc[id].total += value
  }
  return acc
}
