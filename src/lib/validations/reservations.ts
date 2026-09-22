import { z } from 'zod'

export const reservationStatusSchema = z.enum([
  'active', 'pending_stock', 'fulfilled', 'cancelled', 'expired',
])

/** Clasificación de la reserva. NO cambia a dónde va el dinero: una reserva
 *  siempre ingresa por BOUTIQUE (petición de Mónica, 22-sep-2026). */
export const reservationDepartmentSchema = z.enum(['boutique', 'sastreria'])

/** Situación del género: si el cliente ya se lo llevó aunque no lo haya pagado. */
export const reservationDeliveryStatusSchema = z.enum(['pending', 'partial', 'delivered'])

export const reservationPaymentMethodSchema = z.enum([
  'cash', 'card', 'bizum', 'transfer', 'voucher',
])

export const initialReservationPaymentSchema = z.object({
  method: reservationPaymentMethodSchema,
  amount: z.number().positive('El importe debe ser mayor que 0'),
  reference: z.string().max(100).optional().nullable(),
  notes: z.string().max(300).optional().nullable(),
})

export const reservationLineInputSchema = z.object({
  product_variant_id: z.string().uuid('Variante obligatoria'),
  warehouse_id: z.string().uuid('Almacén obligatorio'),
  quantity: z.number().int().positive('La cantidad debe ser mayor que 0'),
  unit_price: z.number().min(0, 'El precio no puede ser negativo').default(0),
})

export const createReservationSchema = z.object({
  client_id: z.string().uuid('Cliente obligatorio'),
  employee_id: z.string().uuid('Vendedor obligatorio'),
  store_id: z.string().uuid().optional().nullable(),
  department: reservationDepartmentSchema.default('boutique'),
  cash_session_id: z.string().uuid().optional().nullable(),
  lines: z.array(reservationLineInputSchema).min(1, 'Añade al menos un producto'),
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
  department: reservationDepartmentSchema.optional(),
  store_id: z.string().uuid().optional().nullable(),
})

// Precio pactado de los artículos de una reserva (precios especiales de
// Joaquín). Va aparte de updateReservationSchema porque exige otro permiso.
export const updateReservationPricesSchema = z.object({
  id: z.string().uuid(),
  lines: z.array(z.object({
    line_id: z.string().uuid(),
    unit_price: z.number().min(0, 'El precio no puede ser negativo').max(999999),
  })).min(1, 'No hay artículos que actualizar'),
})

export const cancelReservationSchema = z.object({
  id: z.string().uuid(),
  reason: z.string().max(300).optional().nullable(),
})

export const reactivateReservationSchema = z.object({
  id: z.string().uuid(),
})

export const cancelReservationLineSchema = z.object({
  line_id: z.string().uuid(),
  reason: z.string().max(300).optional().nullable(),
})

export const fulfillReservationLineSchema = z.object({
  line_id: z.string().uuid(),
  sale_id: z.string().uuid().optional().nullable(),
})

export const listReservationsSchema = z.object({
  status: reservationStatusSchema.or(z.literal('all')).optional(),
  clientId: z.string().uuid().optional(),
  productVariantId: z.string().uuid().optional(),
  warehouseId: z.string().uuid().optional(),
  storeId: z.string().uuid().optional(),
  onlyPending: z.boolean().optional(),
  /**
   * Oculta las reservas ya cobradas por completo (payment_status = 'paid').
   * Una reserva pagada sigue viva mientras no se entrega, así que no basta con
   * filtrar por estado: para trabajar el pendiente de cobro hay que poder
   * quitarlas de en medio.
   */
  excludePaid: z.boolean().optional(),
  department: reservationDepartmentSchema.optional(),
  /** Situación del género (ver `delivery_status`, migración 289). */
  delivery: reservationDeliveryStatusSchema.optional(),
  /**
   * Vista combinada pago + entrega, que es como lo mira la tienda:
   *   en_tienda_sin_pagar  → el género sigue aquí y nos deben dinero
   *   en_casa_sin_pagar    → se lo llevó el cliente y nos debe dinero
   *   pagada_sin_recoger   → cobrada entera, el género sigue en tienda
   *   cumplida             → cobrada y entregada
   */
  situation: z.enum(['en_tienda_sin_pagar', 'en_casa_sin_pagar', 'pagada_sin_recoger', 'cumplida']).optional(),
  search: z.string().optional(),
  /** Rango de fechas de CREACIÓN de la reserva (YYYY-MM-DD, inclusivo). */
  dateFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  dateTo: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  page: z.number().int().min(0).default(0),
  pageSize: z.number().int().min(1).max(200).default(20),
})

export type CreateReservationInput = z.infer<typeof createReservationSchema>
export type ReservationLineInput = z.infer<typeof reservationLineInputSchema>
export type UpdateReservationInput = z.infer<typeof updateReservationSchema>
export type UpdateReservationPricesInput = z.infer<typeof updateReservationPricesSchema>
export type CancelReservationInput = z.infer<typeof cancelReservationSchema>
export type ReactivateReservationInput = z.infer<typeof reactivateReservationSchema>
export type CancelReservationLineInput = z.infer<typeof cancelReservationLineSchema>
export type FulfillReservationLineInput = z.infer<typeof fulfillReservationLineSchema>
export type ListReservationsInput = z.infer<typeof listReservationsSchema>
export type ReservationStatus = z.infer<typeof reservationStatusSchema>
export type ReservationPaymentMethod = z.infer<typeof reservationPaymentMethodSchema>
export type ReservationDepartment = z.infer<typeof reservationDepartmentSchema>
export type ReservationDeliveryStatus = z.infer<typeof reservationDeliveryStatusSchema>
export type InitialReservationPayment = z.infer<typeof initialReservationPaymentSchema>
export type AddReservationPaymentInput = z.infer<typeof addReservationPaymentSchema>
