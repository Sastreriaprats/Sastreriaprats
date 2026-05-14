/**
 * Tipos del módulo Arreglos (tabla `alterations`). El oficial se referencia
 * a la tabla compartida `officials` (mig. 012). Declarados a mano porque el
 * proyecto no genera `database.types.ts` desde Supabase (la fuente de verdad
 * para el resto de tablas es `lib/db/schema.ts` con Drizzle).
 *
 * Las columnas BBDD `amount`, `payment_method`, `is_included`, `sale_id` siguen
 * existiendo en la tabla `alterations` pero NO se exponen en estos tipos: el
 * módulo es pura ficha de seguimiento de confección y el cobro se gestiona por
 * caja de forma independiente.
 */

export type AlterationStatus = 'pending' | 'sent' | 'ready' | 'delivered' | 'cancelled'

export type AlterationType = 'order' | 'boutique' | 'external'

export interface Alteration {
  id: string
  alteration_number: string
  client_id: string
  phone: string | null
  garment_type: string | null
  official_id: string | null
  official_name: string | null
  description: string | null
  alteration_date: string
  workshop_sent_date: string | null
  client_delivery_date: string | null
  status: AlterationStatus
  notes: string | null
  store_id: string | null
  created_by: string | null
  created_at: string
  updated_at: string
  tailoring_order_id: string | null
  alteration_type: AlterationType
  estimated_completion: string | null
}

/** Arreglo con joins típicos de listados / detalle. */
export interface AlterationWithRelations extends Alteration {
  clients: { id: string; full_name: string; phone: string | null } | null
  official: { id: string; name: string } | null
  tailoring_orders: { id: string; order_number: string } | null
  stores: { id: string; name: string } | null
}

/** Alias histórico — algunos componentes lo importan así. */
export type AlterationRow = AlterationWithRelations

export interface CreateAlterationInput {
  client_id: string
  phone?: string | null
  garment_type?: string | null
  official_id?: string | null
  description?: string | null
  alteration_date?: string
  notes?: string | null
  store_id?: string | null
  // Opcionales (link con sastrería)
  alteration_type?: AlterationType
  tailoring_order_id?: string | null
  estimated_completion?: string | null
}

export interface UpdateAlterationInput {
  phone?: string | null
  garment_type?: string | null
  official_id?: string | null
  description?: string | null
  alteration_date?: string
  workshop_sent_date?: string | null
  client_delivery_date?: string | null
  estimated_completion?: string | null
  status?: AlterationStatus
  notes?: string | null
}

export const ALTERATION_STATUS_LABELS: Record<AlterationStatus, string> = {
  pending: 'Pendiente',
  sent: 'Enviado al taller',
  ready: 'Listo',
  delivered: 'Entregado',
  cancelled: 'Cancelado',
}

export const ALTERATION_STATUS_COLORS: Record<AlterationStatus, string> = {
  pending: 'bg-amber-100 text-amber-700 border-amber-200',
  sent: 'bg-blue-100 text-blue-700 border-blue-200',
  ready: 'bg-purple-100 text-purple-700 border-purple-200',
  delivered: 'bg-green-100 text-green-700 border-green-200',
  cancelled: 'bg-gray-100 text-gray-600 border-gray-200',
}
