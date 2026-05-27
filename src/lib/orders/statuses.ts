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
