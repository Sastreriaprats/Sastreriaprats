'use server'

import { protectedAction } from '@/lib/server/action-wrapper'
import { success, failure } from '@/lib/errors'
import {
  createReservationSchema,
  updateReservationSchema,
  cancelReservationSchema,
  fulfillReservationSchema,
  listReservationsSchema,
  addReservationPaymentSchema,
  type CreateReservationInput,
  type UpdateReservationInput,
  type CancelReservationInput,
  type FulfillReservationInput,
  type ListReservationsInput,
  type AddReservationPaymentInput,
} from '@/lib/validations/reservations'

type ListResult<T> = { data: T[]; total: number; page: number; pageSize: number }

const RESERVATION_SELECT = `
  id, reservation_number, client_id, product_variant_id, warehouse_id, store_id,
  quantity, unit_price, total, total_paid, payment_status,
  status, notes, reason, expires_at,
  fulfilled_sale_id, fulfilled_at, cancelled_at, cancelled_reason,
  stock_reserved_at, created_by, created_at, updated_at,
  client:clients ( id, client_code, full_name, first_name, last_name, phone ),
  product_variant:product_variants (
    id, variant_sku, size, color, barcode, image_url,
    product:products ( id, sku, name, brand, main_image_url, base_price, price_with_tax, tax_rate )
  ),
  warehouse:warehouses ( id, code, name ),
  store:stores ( id, code, name, display_name ),
  payments:product_reservation_payments ( id, payment_date, payment_method, amount, reference, notes, created_at ),
  created_by_profile:profiles!product_reservations_created_by_fkey ( id, full_name )
`

export const listReservations = protectedAction<ListReservationsInput, ListResult<any>>(
  { permission: 'reservations.view', auditModule: 'reservations' },
  async (ctx, rawInput) => {
    const input = listReservationsSchema.parse(rawInput)

    let query = ctx.adminClient
      .from('product_reservations')
      .select(RESERVATION_SELECT, { count: 'exact' })

    if (input.status && input.status !== 'all') {
      query = query.eq('status', input.status)
    }
    if (input.onlyPending) {
      query = query.eq('status', 'pending_stock')
    }
    if (input.clientId) query = query.eq('client_id', input.clientId)
    if (input.productVariantId) query = query.eq('product_variant_id', input.productVariantId)
    if (input.warehouseId) query = query.eq('warehouse_id', input.warehouseId)
    if (input.storeId) query = query.eq('store_id', input.storeId)

    if (input.search && input.search.trim().length > 0) {
      const term = `%${input.search.trim()}%`
      query = query.or(`reservation_number.ilike.${term}`)
    }

    const from = input.page * input.pageSize
    const to = from + input.pageSize - 1

    const { data, error, count } = await query
      .order('created_at', { ascending: false })
      .range(from, to)

    if (error) return failure(error.message || 'Error al listar reservas', 'INTERNAL')

    return success({
      data: data ?? [],
      total: count ?? 0,
      page: input.page,
      pageSize: input.pageSize,
    })
  }
)

export const getReservation = protectedAction<{ id: string }, any>(
  { permission: 'reservations.view', auditModule: 'reservations' },
  async (ctx, { id }) => {
    const { data, error } = await ctx.adminClient
      .from('product_reservations')
      .select(RESERVATION_SELECT)
      .eq('id', id)
      .maybeSingle()
    if (error) return failure(error.message || 'Error al leer reserva', 'INTERNAL')
    if (!data) return failure('Reserva no encontrada', 'NOT_FOUND')
    return success(data)
  }
)

type CreateReservationResult = {
  id: string
  reservation_number: string
  status: string
  had_stock: boolean
  unit_price: number
  total: number
  total_paid: number
  payment_status: 'pending' | 'partial' | 'paid'
  payment_id: string | null
}

export const createReservation = protectedAction<CreateReservationInput, CreateReservationResult>(
  {
    permission: 'reservations.create',
    auditModule: 'reservations',
    auditAction: 'create',
    auditEntity: 'product_reservation',
    revalidate: ['/admin/stock'],
  },
  async (ctx, rawInput) => {
    const input = createReservationSchema.parse(rawInput)

    const payload: Record<string, unknown> = {
      client_id: input.client_id,
      product_variant_id: input.product_variant_id,
      warehouse_id: input.warehouse_id,
      store_id: input.store_id ?? null,
      cash_session_id: input.cash_session_id ?? null,
      quantity: input.quantity,
      unit_price: input.unit_price,
      notes: input.notes ?? null,
      reason: input.reason ?? null,
      expires_at: input.expires_at ?? null,
    }
    if (input.initial_payment) {
      payload.initial_payment = {
        method: input.initial_payment.method,
        amount: input.initial_payment.amount,
        reference: input.initial_payment.reference ?? null,
        notes: input.initial_payment.notes ?? null,
      }
    }

    const { data, error } = await ctx.adminClient.rpc('rpc_create_reservation', {
      p_reservation: payload,
      p_user_id: ctx.userId !== 'system' ? ctx.userId : null,
    })

    if (error) return failure(error.message || 'Error al crear la reserva', 'INTERNAL')
    const result = data as CreateReservationResult | null
    if (!result?.id) return failure('Respuesta inválida del servidor', 'INTERNAL')

    return success({
      id: result.id,
      reservation_number: result.reservation_number,
      status: result.status,
      had_stock: result.had_stock,
      unit_price: Number(result.unit_price ?? 0),
      total: Number(result.total ?? 0),
      total_paid: Number(result.total_paid ?? 0),
      payment_status: result.payment_status ?? 'pending',
      payment_id: result.payment_id ?? null,
    })
  }
)

type AddReservationPaymentResult = {
  id: string
  reservation_id: string
  reservation_number: string
  amount: number
  payment_method: string
  total_paid: number
  payment_status: 'pending' | 'partial' | 'paid'
  created_at: string
}

export const addReservationPayment = protectedAction<
  AddReservationPaymentInput,
  AddReservationPaymentResult
>(
  {
    permission: 'reservations.edit',
    auditModule: 'reservations',
    auditAction: 'payment',
    auditEntity: 'product_reservation',
    revalidate: ['/admin/stock'],
  },
  async (ctx, rawInput) => {
    const input = addReservationPaymentSchema.parse(rawInput)

    const { data, error } = await ctx.adminClient.rpc('rpc_add_reservation_payment', {
      p_reservation_id: input.reservation_id,
      p_payment_date: input.payment_date || new Date().toISOString().slice(0, 10),
      p_payment_method: input.payment_method,
      p_amount: input.amount,
      p_reference: input.reference ?? null,
      p_notes: input.notes ?? null,
      p_store_id: input.store_id ?? null,
      p_cash_session_id: input.cash_session_id ?? null,
      p_user_id: ctx.userId !== 'system' ? ctx.userId : null,
    })

    if (error) return failure(error.message || 'Error al registrar el pago', 'INTERNAL')
    const result = data as AddReservationPaymentResult | null
    if (!result?.id) return failure('Respuesta inválida del servidor', 'INTERNAL')

    return success({
      ...result,
      amount: Number(result.amount),
      total_paid: Number(result.total_paid),
    })
  }
)

export const updateReservation = protectedAction<UpdateReservationInput, { id: string }>(
  {
    permission: 'reservations.edit',
    auditModule: 'reservations',
    auditAction: 'update',
    auditEntity: 'product_reservation',
    revalidate: ['/admin/stock'],
  },
  async (ctx, rawInput) => {
    const input = updateReservationSchema.parse(rawInput)

    const updates: Record<string, unknown> = { updated_at: new Date().toISOString() }
    if (input.notes !== undefined) updates.notes = input.notes
    if (input.reason !== undefined) updates.reason = input.reason
    if (input.expires_at !== undefined) updates.expires_at = input.expires_at

    const { error } = await ctx.adminClient
      .from('product_reservations')
      .update(updates)
      .eq('id', input.id)

    if (error) return failure(error.message || 'Error al actualizar reserva', 'INTERNAL')
    return success({ id: input.id })
  }
)

export const cancelReservation = protectedAction<CancelReservationInput, { id: string; status: string }>(
  {
    permission: 'reservations.delete',
    auditModule: 'reservations',
    auditAction: 'delete',
    auditEntity: 'product_reservation',
    revalidate: ['/admin/stock'],
  },
  async (ctx, rawInput) => {
    const input = cancelReservationSchema.parse(rawInput)

    const { data, error } = await ctx.adminClient.rpc('rpc_cancel_reservation', {
      p_reservation_id: input.id,
      p_reason: input.reason ?? null,
      p_user_id: ctx.userId !== 'system' ? ctx.userId : null,
    })

    if (error) return failure(error.message || 'Error al cancelar reserva', 'INTERNAL')
    const result = data as { id: string; status: string } | null
    if (!result?.id) return failure('Respuesta inválida del servidor', 'INTERNAL')
    return success(result)
  }
)

export const fulfillReservation = protectedAction<FulfillReservationInput, { id: string; status: string }>(
  {
    permission: 'reservations.edit',
    auditModule: 'reservations',
    auditAction: 'state_change',
    auditEntity: 'product_reservation',
    revalidate: ['/admin/stock'],
  },
  async (ctx, rawInput) => {
    const input = fulfillReservationSchema.parse(rawInput)

    const { data, error } = await ctx.adminClient.rpc('rpc_fulfill_reservation', {
      p_reservation_id: input.id,
      p_sale_id: input.sale_id ?? null,
      p_user_id: ctx.userId !== 'system' ? ctx.userId : null,
    })

    if (error) return failure(error.message || 'Error al cumplir reserva', 'INTERNAL')
    const result = data as { id: string; status: string } | null
    if (!result?.id) return failure('Respuesta inválida del servidor', 'INTERNAL')
    return success(result)
  }
)

/**
 * Helper usado en el POS para saber si el cliente seleccionado
 * tiene reserva activa sobre una variante. Devuelve la cantidad
 * reservada total (puede haber varias reservas activas del mismo
 * cliente sobre la misma variante).
 */
export const getActiveReservationsForVariant = protectedAction<
  { productVariantId: string; warehouseId?: string; clientId?: string },
  { totalReserved: number; count: number; reservations: Array<{ id: string; reservation_number: string; quantity: number; client_id: string }> }
>(
  { permission: 'reservations.view', auditModule: 'reservations' },
  async (ctx, { productVariantId, warehouseId, clientId }) => {
    let query = ctx.adminClient
      .from('product_reservations')
      .select('id, reservation_number, quantity, client_id')
      .eq('product_variant_id', productVariantId)
      .eq('status', 'active')

    if (warehouseId) query = query.eq('warehouse_id', warehouseId)
    if (clientId) query = query.eq('client_id', clientId)

    const { data, error } = await query
    if (error) return failure(error.message || 'Error al consultar reservas', 'INTERNAL')
    const rows = data ?? []
    const totalReserved = rows.reduce((acc: number, r: any) => acc + (Number(r.quantity) || 0), 0)
    return success({
      totalReserved,
      count: rows.length,
      reservations: rows as any[],
    })
  }
)

/**
 * Busca el almacén principal de la tienda para que el POS pueda
 * crear reservas sin tener que conocer los almacenes explícitamente.
 */
export const getMainWarehouseForStore = protectedAction<{ storeId: string }, { id: string; name: string } | null>(
  { permission: 'reservations.view', auditModule: 'reservations' },
  async (ctx, { storeId }) => {
    const { data, error } = await ctx.adminClient
      .from('warehouses')
      .select('id, name')
      .eq('store_id', storeId)
      .eq('is_main', true)
      .eq('is_active', true)
      .maybeSingle()
    if (error) return failure(error.message || 'Error al buscar almacén', 'INTERNAL')
    return success((data ?? null) as any)
  }
)
