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
