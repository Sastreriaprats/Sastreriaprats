/**
 * Estados canónicos de pedidos de sastrería.
 *
 * Fuente única consumida por:
 *  - UI admin (change-status-dialog)
 *  - UI sastre (sastre-pedido-detail-content)
 *  - Schema de validación zod (changeOrderStatusSchema, updateOrderStatus)
 *
 * Modelo final tras mig 169 (rediseño Ismael, mayo 2026): 12 valores.
 * Los estados legacy (factory_ordered, fitting, adjustments, fabric_received)
 * y los 11 huérfanos de mig 059 se eliminaron del enum mediante backfill
 * + ALTER TYPE en transacción atómica.
 */

export type OrderStatus =
  | 'created'
  | 'fabric_ordered'
  | 'fabric_received_store'        // artesanal: tejido llega a tienda
  | 'fabric_received_factory'      // industrial: tejido llega a fábrica
  | 'cut'                          // artesanal: cortado, paso previo a confección
  | 'in_production'                // = EN_CONFECCION
  | 'in_fitting'                   // artesanal: en prueba
  | 'received_in_store'            // industrial: prenda terminada llega a tienda
  | 'finished'
  | 'delivered'
  | 'incident'
  | 'cancelled'

export type TailoringOrderType =
  | 'artesanal'
  | 'industrial'
  | 'camiseria'
  | 'camiseria_industrial'
  | 'oficial'
  | 'proveedor'

// Modelo nuevo (Ismael, mayo 2026):
// - Artesanal: created → fabric_ordered → fabric_received_store → cut → in_production → in_fitting → finished → delivered
// - Industrial: created → fabric_ordered → fabric_received_factory → in_production → received_in_store → finished → delivered
// - Camisería sigue el mismo flujo que su order_type (artesanal o industrial).
export const ORDER_STATUSES_BY_TYPE: Record<string, OrderStatus[]> = {
  artesanal:            ['created', 'fabric_ordered', 'fabric_received_store', 'cut', 'in_production', 'in_fitting', 'finished', 'delivered', 'incident', 'cancelled'],
  industrial:           ['created', 'fabric_ordered', 'fabric_received_factory', 'in_production', 'received_in_store', 'finished', 'delivered', 'incident', 'cancelled'],
  camiseria:            ['created', 'fabric_ordered', 'fabric_received_store', 'cut', 'in_production', 'in_fitting', 'finished', 'delivered', 'incident', 'cancelled'],
  camiseria_industrial: ['created', 'fabric_ordered', 'fabric_received_factory', 'in_production', 'received_in_store', 'finished', 'delivered', 'incident', 'cancelled'],
  oficial:              ['created', 'in_production', 'finished', 'delivered', 'cancelled'],
  proveedor:            ['created', 'fabric_ordered', 'fabric_received_store', 'cancelled'],
}

/** Flat union de TODOS los estados visibles en UI. Modelo final post-mig 169. */
export const ALL_VISIBLE_STATUSES: OrderStatus[] = [
  'created', 'fabric_ordered',
  'fabric_received_store', 'fabric_received_factory',
  'cut',
  'in_production',
  'in_fitting', 'received_in_store',
  'finished', 'delivered',
  'incident', 'cancelled',
]

/**
 * Orden de las columnas del Kanban del admin (`/admin/pedidos` modo pipeline).
 * Opción "troncales": solo las grandes etapas del flujo, sin estados intermedios
 * por tipo. Los estados específicos (cut, in_fitting, received_in_store) se ven
 * al entrar al pedido, no en la vista global.
 */
export const TAILORING_PIPELINE_STATUSES: OrderStatus[] = [
  'created', 'fabric_ordered', 'in_production', 'finished', 'delivered',
]

export function getStatusesFor(orderType: string | null | undefined): OrderStatus[] {
  if (!orderType) return ORDER_STATUSES_BY_TYPE.artesanal
  return ORDER_STATUSES_BY_TYPE[orderType] ?? ORDER_STATUSES_BY_TYPE.artesanal
}

/** Estados transversales/terminales que NO participan en el orden lineal del pipeline. */
const NON_PIPELINE_STATUSES: OrderStatus[] = ['incident', 'cancelled']

/**
 * Índice (rank) de un estado dentro del pipeline de su order_type.
 * Devuelve -1 si el estado no pertenece a ese pipeline.
 */
export function getStatusIndex(status: string, orderType: string | null | undefined): number {
  return getStatusesFor(orderType).indexOf(status as OrderStatus)
}

export interface ForwardPropagation {
  /** IDs de líneas que deben avanzar al estado destino (estaban por detrás). */
  toUpdate: string[]
  /** Nº de líneas que se dejan intactas por estar MÁS adelantadas que el destino. */
  aheadCount: number
}

/**
 * Regla "forward-only" para propagar el estado general del pedido a sus líneas.
 * El estado general lo conduce el personal; las líneas solo se arrastran hacia
 * adelante, nunca se hacen retroceder.
 *
 *  - destino `incident`  → transversal: NO se toca ninguna línea.
 *  - destino `cancelled` → se cancelan todas las líneas que no estén ya
 *                          `delivered` (ni `cancelled`).
 *  - resto               → solo avanzan las líneas estrictamente por detrás
 *                          (índice < índice destino en el pipeline del tipo).
 *                          Las líneas en `incident`/`cancelled` nunca se tocan,
 *                          y las de estado ajeno al pipeline se dejan como están.
 */
export function classifyLinesForForwardPropagation(
  targetStatus: string,
  orderType: string | null | undefined,
  lines: { id: string; status: string }[],
): ForwardPropagation {
  if (targetStatus === 'incident') return { toUpdate: [], aheadCount: 0 }

  if (targetStatus === 'cancelled') {
    const toUpdate = lines
      .filter((l) => l.status !== 'delivered' && l.status !== 'cancelled')
      .map((l) => l.id)
    return { toUpdate, aheadCount: 0 }
  }

  const idxTarget = getStatusIndex(targetStatus, orderType)
  if (idxTarget < 0) return { toUpdate: [], aheadCount: 0 }

  const toUpdate: string[] = []
  let aheadCount = 0
  for (const l of lines) {
    if (NON_PIPELINE_STATUSES.includes(l.status as OrderStatus)) continue // transversales: intactas
    const idxLine = getStatusIndex(l.status, orderType)
    if (idxLine < 0) continue            // estado ajeno al pipeline del tipo: no tocar
    if (idxLine < idxTarget) toUpdate.push(l.id)
    else if (idxLine > idxTarget) aheadCount++
  }
  return { toUpdate, aheadCount }
}
