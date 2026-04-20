import { z } from 'zod'

export const reservationStatusSchema = z.enum([
  'active', 'pending_stock', 'fulfilled', 'cancelled', 'expired',
])

export const reservationPaymentMethodSchema = z.enum([
  'cash', 'card', 'bizum', 'transfer', 'voucher',
])

export const initialReservationPaymentSchema = z.object({
  method: reservationPaymentMethodSchema,
  amount: z.number().positive('El importe debe ser mayor que 0'),
  reference: z.string().max(100).optional().nullable(),
  notes: z.string().max(300).optional().nullable(),
})

export const createReservationSchema = z.object({
  client_id: z.string().uuid('Cliente obligatorio'),
  product_variant_id: z.string().uuid('Variante obligatoria'),
  warehouse_id: z.string().uuid('Almacén obligatorio'),
  store_id: z.string().uuid().optional().nullable(),
  cash_session_id: z.string().uuid().optional().nullable(),
  quantity: z.number().int().positive('La cantidad debe ser mayor que 0'),
  unit_price: z.number().min(0, 'El precio no puede ser negativo').default(0),
  notes: z.string().max(500).optional().nullable(),
  reason: z.string().max(200).optional().nullable(),
  expires_at: z.string().datetime().optional().nullable(),
  initial_payment: initialReservationPaymentSchema.optional().nullable(),
})

export const addReservationPaymentSchema = z.object({
  reservation_id: z.string().uuid(),
  payment_method: reservationPaymentMethodSchema,
  amount: z.number().positive('El importe debe ser mayor que 0'),
  payment_date: z.string().optional().nullable(),
  reference: z.string().max(100).optional().nullable(),
  notes: z.string().max(300).optional().nullable(),
  cash_session_id: z.string().uuid().optional().nullable(),
  store_id: z.string().uuid().optional().nullable(),
})

export const updateReservationSchema = z.object({
  id: z.string().uuid(),
  notes: z.string().max(500).optional().nullable(),
  reason: z.string().max(200).optional().nullable(),
  expires_at: z.string().datetime().optional().nullable(),
})

export const cancelReservationSchema = z.object({
  id: z.string().uuid(),
  reason: z.string().max(300).optional().nullable(),
})

export const fulfillReservationSchema = z.object({
  id: z.string().uuid(),
  sale_id: z.string().uuid().optional().nullable(),
})

export const listReservationsSchema = z.object({
  status: reservationStatusSchema.or(z.literal('all')).optional(),
  clientId: z.string().uuid().optional(),
  productVariantId: z.string().uuid().optional(),
  warehouseId: z.string().uuid().optional(),
  storeId: z.string().uuid().optional(),
  onlyPending: z.boolean().optional(),
  search: z.string().optional(),
  page: z.number().int().min(0).default(0),
  pageSize: z.number().int().min(1).max(200).default(20),
})

export type CreateReservationInput = z.infer<typeof createReservationSchema>
export type UpdateReservationInput = z.infer<typeof updateReservationSchema>
export type CancelReservationInput = z.infer<typeof cancelReservationSchema>
export type FulfillReservationInput = z.infer<typeof fulfillReservationSchema>
export type ListReservationsInput = z.infer<typeof listReservationsSchema>
export type ReservationStatus = z.infer<typeof reservationStatusSchema>
export type ReservationPaymentMethod = z.infer<typeof reservationPaymentMethodSchema>
export type InitialReservationPayment = z.infer<typeof initialReservationPaymentSchema>
export type AddReservationPaymentInput = z.infer<typeof addReservationPaymentSchema>
