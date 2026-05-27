/**
 * Estados canónicos de pedidos de sastrería.
 *
 * Fuente única consumida por:
 *  - UI admin (change-status-dialog)
 *  - UI sastre (sastre-pedido-detail-content)
 *  - Schema de validación zod (changeOrderStatusSchema, updateOrderStatus)
 *
 * El ENUM real de Postgres (`tailoring_order_status`) contiene además 8
 * valores huérfanos añadidos por la mig 059 (in_workshop, pending_first_fitting,
 * note_sent_factory, fabric_ordered_supplier, fabric_at_factory,
 * shipping_to_store, delivered_to_store, order_requested) que NO se exponen
 * en UI (0 pedidos en producción, deuda muerta — se dejan en el enum por
 * compatibilidad con históricos pero no se ofrecen como destino).
 */

export type OrderStatus =
  | 'created'
  | 'fabric_ordered'
  | 'fabric_received'              // legacy, eliminado en commit 3
  | 'fabric_received_store'        // nuevo: artesanal
  | 'fabric_received_factory'      // nuevo: industrial
  | 'cut'                          // nuevo: artesanal (cortado)
  | 'factory_ordered'              // legacy, eliminado en commit 3
  | 'in_production'                // = EN_CONFECCION
  | 'in_fitting'                   // nuevo: artesanal (renombra fitting)
  | 'received_in_store'            // nuevo: industrial (prenda llega a tienda)
  | 'fitting'                      // legacy, eliminado en commit 3
  | 'adjustments'                  // legacy, eliminado en commit 3
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

/**
 * Flat union de TODOS los estados visibles en UI. Incluye los 5 nuevos y los
 * 3 legacy (fabric_received, factory_ordered, fitting, adjustments) hasta que
 * el commit 3 ejecute el backfill y los retire. Los 8 huérfanos de mig 059
 * NUNCA se exponen aquí.
 */
export const ALL_VISIBLE_STATUSES: OrderStatus[] = [
  'created', 'fabric_ordered',
  'fabric_received', 'fabric_received_store', 'fabric_received_factory',
  'cut',
  'factory_ordered',
  'in_production',
  'in_fitting', 'received_in_store',
  'fitting', 'adjustments',
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
