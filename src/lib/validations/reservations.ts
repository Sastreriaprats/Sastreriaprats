import { z } from 'zod'

export const reservationStatusSchema = z.enum([
  'active', 'pending_stock', 'fulfilled', 'cancelled', 'expired',
])

export const createReservationSchema = z.object({
  client_id: z.string().uuid('Cliente obligatorio'),
  product_variant_id: z.string().uuid('Variante obligatoria'),
  warehouse_id: z.string().uuid('Almacén obligatorio'),
  store_id: z.string().uuid().optional().nullable(),
  quantity: z.number().int().positive('La cantidad debe ser mayor que 0'),
  notes: z.string().max(500).optional().nullable(),
  reason: z.string().max(200).optional().nullable(),
  expires_at: z.string().datetime().optional().nullable(),
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
