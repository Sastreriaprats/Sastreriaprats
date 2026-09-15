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

import { getLineGroup } from './line-groups'

export type OrderStatus =
  | 'created'
  | 'fabric_ordered'
  | 'fabric_received_store'        // artesanal: tejido llega a tienda
  | 'fabric_received_factory'      // industrial: tejido llega a fábrica
  | 'cut'                          // artesanal: cortado, paso previo a confección
  | 'in_production'                // = EN_CONFECCION
  | 'in_fitting'                   // artesanal: en prueba
  | 'received_in_store'            // industrial: prenda terminada llega a tienda
  | 'pendiente_terminacion'        // recta final: rematar tras prueba/recepción, antes de terminado
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
  artesanal:            ['created', 'fabric_ordered', 'fabric_received_store', 'cut', 'in_production', 'in_fitting', 'pendiente_terminacion', 'finished', 'delivered', 'incident', 'cancelled'],
  industrial:           ['created', 'fabric_ordered', 'fabric_received_factory', 'in_production', 'received_in_store', 'pendiente_terminacion', 'finished', 'delivered', 'incident', 'cancelled'],
  camiseria:            ['created', 'fabric_ordered', 'fabric_received_store', 'cut', 'in_production', 'in_fitting', 'pendiente_terminacion', 'finished', 'delivered', 'incident', 'cancelled'],
  camiseria_industrial: ['created', 'fabric_ordered', 'fabric_received_factory', 'in_production', 'received_in_store', 'pendiente_terminacion', 'finished', 'delivered', 'incident', 'cancelled'],
  oficial:              ['created', 'in_production', 'pendiente_terminacion', 'finished', 'delivered', 'cancelled'],
  proveedor:            ['created', 'fabric_ordered', 'fabric_received_store', 'cancelled'],
  // Pedido MIXTO (prendas artesanales e industriales, o prendas que no cuadran
  // con el order_type guardado): unión de los dos flujos. Es una superserie
  // ordenada de ambos, así que el rango relativo de cada estado se conserva y
  // el derivado "prenda menos avanzada" sigue funcionando. No es un order_type
  // real: lo resuelve `resolveStatusPipeline` a partir de las líneas.
  mixto:                ['created', 'fabric_ordered', 'fabric_received_store', 'fabric_received_factory', 'cut', 'in_production', 'in_fitting', 'received_in_store', 'pendiente_terminacion', 'finished', 'delivered', 'incident', 'cancelled'],
}

/** Flat union de TODOS los estados visibles en UI. Modelo final post-mig 169. */
export const ALL_VISIBLE_STATUSES: OrderStatus[] = [
  'created', 'fabric_ordered',
  'fabric_received_store', 'fabric_received_factory',
  'cut',
  'in_production',
  'in_fitting', 'received_in_store',
  'pendiente_terminacion',
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

/** Eje artesanal/industrial de un order_type; null si no tiene (oficial, proveedor). */
function manufacturingFamily(orderType: string): 'artesanal' | 'industrial' | null {
  if (orderType === 'artesanal' || orderType === 'camiseria') return 'artesanal'
  if (orderType === 'industrial' || orderType === 'camiseria_industrial') return 'industrial'
  return null
}

/**
 * Tipo de flujo de estados EFECTIVO de un pedido, mirando sus prendas y no solo
 * el `order_type` guardado (sep-2026, PIN-2026-0288): un pedido industrial con
 * una americana artesanal no ofrecía "Pendiente 1ª prueba". Si alguna prenda de
 * sastrería/camisería es de la otra familia (`line_type`) que el pedido, se usa
 * el flujo 'mixto' (unión de ambos). Los complementos no cuentan, igual que en
 * `getOrderManufacturingLabel`. Las líneas sin `line_type` (select que no lo
 * trae) se ignoran: nunca fuerzan 'mixto' por error.
 */
export function resolveStatusPipeline(
  orderType: string | null | undefined,
  lines: unknown,
): string {
  const base = orderType || 'artesanal'
  const family = manufacturingFamily(base)
  if (!family) return base
  for (const line of Array.isArray(lines) ? lines : []) {
    if (getLineGroup(line) === 'complementos') continue
    const lt = (line as { line_type?: string | null } | null)?.line_type
    if (lt !== 'artesanal' && lt !== 'industrial') continue
    if (lt !== family) return 'mixto'
  }
  return base
}

/**
 * Estados que se ofrecen para UNA prenda. En un pedido mixto cada prenda ve el
 * flujo de su propia familia (la americana artesanal, el de artesanal); fuera
 * de ese caso, el del pedido.
 */
export function getLineStatuses(
  pipelineType: string | null | undefined,
  line: { line_type?: string | null } | null | undefined,
): OrderStatus[] {
  if (pipelineType === 'mixto' && (line?.line_type === 'artesanal' || line?.line_type === 'industrial')) {
    return getStatusesFor(line.line_type)
  }
  return getStatusesFor(pipelineType)
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

/**
 * Estado DERIVADO del pedido a partir del de sus prendas (regla Ismael, jun 2026):
 * el pedido sigue al estado MENOS avanzado de sus prendas vivas.
 *
 *  - Alguna prenda `incident`        → 'incident' (una incidencia se ve a nivel
 *                                      pedido; gana sobre el mínimo normal).
 *  - Se IGNORAN las prendas `cancelled`. Si TODAS están canceladas → 'cancelled'.
 *  - Resto                           → la prenda con MENOR `getStatusIndex` dentro
 *                                      del pipeline del `orderType`.
 *  - Sin prendas                     → null (no se deriva; el pedido conserva su
 *                                      estado actual; lo decide quien llama).
 *
 * NO contempla `cancelled`/`incident` a nivel pedido como acción manual: eso lo
 * gestiona la acción (set directo). Aquí solo se deriva del estado de las prendas.
 */
export function deriveOrderStatusFromLines(
  orderType: string | null | undefined,
  lineStatuses: string[],
): OrderStatus | null {
  if (lineStatuses.length === 0) return null
  if (lineStatuses.includes('incident')) return 'incident'
  const live = lineStatuses.filter((s) => s !== 'cancelled')
  if (live.length === 0) return 'cancelled'
  let best: string | null = null
  let bestIdx = Infinity
  for (const s of live) {
    const i = getStatusIndex(s, orderType)
    if (i < 0) continue // estado ajeno al pipeline del tipo: no participa en el mínimo
    if (i < bestIdx) { bestIdx = i; best = s }
  }
  return (best ?? live[0]) as OrderStatus
}

export interface ForwardPropagation {
  /** IDs de líneas que deben avanzar al estado destino (estaban por detrás). */
  toUpdate: string[]
  /** Nº de líneas que se dejan intactas por estar MÁS adelantadas que el destino. */
  aheadCount: number
}

/**
 * Clasifica qué líneas deben cambiar al aplicar un estado GENERAL al pedido.
 * El estado general lo conduce el personal y es BIDIRECCIONAL:
 *
 *  - destino `incident`  → transversal: NO se toca ninguna línea.
 *  - destino `cancelled` → se cancelan todas las líneas que no estén ya
 *                          `delivered` (ni `cancelled`).
 *  - AVANZAR (destino ≥ estado actual del pedido = mínimo de sus prendas):
 *      forward-only. Solo avanzan las líneas estrictamente por detrás; las que
 *      ya están más adelantadas se MANTIENEN (`aheadCount` las cuenta).
 *  - RETROCEDER (destino < estado actual del pedido): se arrastran TODAS las
 *      líneas del pipeline hacia atrás al destino, para que el pedido pueda
 *      volver a un estado anterior. Esto incluye las prendas ya `delivered`:
 *      marcar un pedido como entregado por error es el fallo más común y antes
 *      obligaba a deshacerlo prenda a prenda con el chip de la pestaña Prendas.
 *      Se dejan intactas las transversales (`cancelled`/`incident`) y las de
 *      estado ajeno al pipeline.
 */
export function classifyLinesForStatusChange(
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

  // Estado ACTUAL del pedido = índice mínimo entre sus prendas vivas del pipeline.
  // Si el destino queda por debajo, es un RETROCESO explícito.
  let curMin = Infinity
  for (const l of lines) {
    if (NON_PIPELINE_STATUSES.includes(l.status as OrderStatus)) continue
    const i = getStatusIndex(l.status, orderType)
    if (i >= 0 && i < curMin) curMin = i
  }
  const retreating = idxTarget < curMin

  const toUpdate: string[] = []
  let aheadCount = 0
  for (const l of lines) {
    if (NON_PIPELINE_STATUSES.includes(l.status as OrderStatus)) continue // transversales: intactas
    // Entregada: en un AVANCE se mantiene (ya está en el final del pipeline);
    // en un RETROCESO explícito sí se arrastra — es la única forma de deshacer
    // una entrega marcada por error desde el diálogo del pedido.
    if (l.status === 'delivered' && !retreating) { aheadCount++; continue }
    const idxLine = getStatusIndex(l.status, orderType)
    if (idxLine < 0) continue            // estado ajeno al pipeline del tipo: no tocar
    if (idxLine === idxTarget) continue  // ya está en el destino
    if (retreating) {
      toUpdate.push(l.id)                // retroceso: arrastra todas hacia atrás
    } else if (idxLine < idxTarget) {
      toUpdate.push(l.id)                // avance: solo las que van por detrás
    } else {
      aheadCount++                       // avance: las adelantadas se mantienen
    }
  }
  return { toUpdate, aheadCount }
}
