/**
 * Tipos de pedidos de sastrería, líneas, historial de estados y pruebas.
 */

export type {
  TailoringOrder,
  NewTailoringOrder,
  TailoringOrderLine,
  NewTailoringOrderLine,
  TailoringOrderStateHistory,
  NewTailoringOrderStateHistory,
  TailoringFitting,
  NewTailoringFitting,
} from '@/lib/db/schema'

/** Vista: resumen de pedido de sastrería */
export interface TailoringOrderSummary {
  id: string
  order_number: string
  order_type: string
  status: string
  order_date: string
  estimated_delivery_date: string | null
  total: string | null
  total_paid: string | null
  total_pending: string | null
  total_cost: string | null
  client_name: string | null
  client_phone: string | null
  client_email: string | null
  client_id: string
  store_name: string
  store_code: string
  garment_count: number
  next_fitting_date: string | null
  created_at: Date
}
