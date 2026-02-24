/**
 * Tipos de clientes, medidas y prendas.
 * Tipos de tablas re-exportados desde el schema Drizzle.
 */

export type {
  Client,
  NewClient,
  ClientContact,
  NewClientContact,
  ClientNote,
  NewClientNote,
  GarmentType,
  NewGarmentType,
  MeasurementField,
  NewMeasurementField,
  ClientMeasurement,
  NewClientMeasurement,
  GarmentConfigOption,
  NewGarmentConfigOption,
  BoutiqueAlteration,
  NewBoutiqueAlteration,
  ClientTag,
  NewClientTag,
  ClientEmailHistory,
  NewClientEmailHistory,
} from '@/lib/db/schema'

/** Vista: resumen de cliente con tienda y estado de pago */
export interface ClientSummary {
  id: string
  client_code: string | null
  full_name: string | null
  email: string | null
  phone: string | null
  client_type: 'individual' | 'company'
  category: 'standard' | 'vip' | 'premium' | 'gold' | 'ambassador'
  tags: string[] | null
  total_spent: string | null
  total_pending: string | null
  last_purchase_date: string | null
  purchase_count: number | null
  average_ticket: string | null
  is_active: boolean
  home_store_id: string | null
  home_store_name: string | null
  payment_status: 'paid' | 'pending'
  created_at: Date
}
