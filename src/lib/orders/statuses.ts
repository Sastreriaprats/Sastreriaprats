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
  | 'fabric_received'
  | 'factory_ordered'
  | 'in_production'
  | 'fitting'
  | 'adjustments'
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

export const ORDER_STATUSES_BY_TYPE: Record<string, OrderStatus[]> = {
  artesanal:            ['created', 'fabric_ordered', 'fabric_received', 'in_production', 'fitting', 'adjustments', 'finished', 'delivered', 'incident', 'cancelled'],
  industrial:           ['created', 'fabric_ordered', 'fabric_received', 'factory_ordered', 'in_production', 'fitting', 'adjustments', 'finished', 'delivered', 'incident', 'cancelled'],
  camiseria:            ['created', 'fabric_ordered', 'fabric_received', 'in_production', 'fitting', 'adjustments', 'finished', 'delivered', 'incident', 'cancelled'],
  camiseria_industrial: ['created', 'fabric_ordered', 'fabric_received', 'factory_ordered', 'in_production', 'fitting', 'adjustments', 'finished', 'delivered', 'incident', 'cancelled'],
  oficial:              ['created', 'in_production', 'finished', 'delivered', 'cancelled'],
  proveedor:            ['created', 'fabric_ordered', 'fabric_received', 'cancelled'],
}

/** Flat union de TODOS los estados visibles en UI (sin los 8 huérfanos de mig 059). */
export const ALL_VISIBLE_STATUSES: OrderStatus[] = [
  'created', 'fabric_ordered', 'fabric_received', 'factory_ordered',
  'in_production', 'fitting', 'adjustments', 'finished', 'delivered',
  'incident', 'cancelled',
]

/**
 * Orden de las columnas del Kanban del admin (`/admin/pedidos` modo pipeline).
 * Se excluyen `delivered`, `incident` y `cancelled` porque son estados terminales
 * que no aportan al flujo de trabajo activo del taller.
 */
export const TAILORING_PIPELINE_STATUSES: OrderStatus[] = [
  'created', 'fabric_ordered', 'fabric_received', 'factory_ordered',
  'in_production', 'fitting', 'adjustments', 'finished',
]

export function getStatusesFor(orderType: string | null | undefined): OrderStatus[] {
  if (!orderType) return ORDER_STATUSES_BY_TYPE.artesanal
  return ORDER_STATUSES_BY_TYPE[orderType] ?? ORDER_STATUSES_BY_TYPE.artesanal
}
