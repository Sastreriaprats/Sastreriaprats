'use server'

import { protectedAction } from '@/lib/server/action-wrapper'
import { success, failure } from '@/lib/errors'
import { normalizeSearchTerm } from '@/lib/utils'
import { resolveClientIdsForSearch } from '@/lib/server/query-helpers'
import {
  createReservationSchema,
  updateReservationSchema,
  updateReservationPricesSchema,
  cancelReservationSchema,
  reactivateReservationSchema,
  cancelReservationLineSchema,
  fulfillReservationLineSchema,
  listReservationsSchema,
  addReservationPaymentSchema,
  type CreateReservationInput,
  type UpdateReservationInput,
  type UpdateReservationPricesInput,
  type CancelReservationInput,
  type ReactivateReservationInput,
  type CancelReservationLineInput,
  type FulfillReservationLineInput,
  type ListReservationsInput,
  type AddReservationPaymentInput,
} from '@/lib/validations/reservations'

type ListResult<T> = { data: T[]; total: number; page: number; pageSize: number }

const RESERVATION_SELECT = `
  id, reservation_number, client_id, store_id,
  quantity, unit_price, total, total_paid, payment_status,
  status, delivery_status, department, notes, reason, expires_at,
  cancelled_at, cancelled_reason,
  created_by, employee_id, created_at, updated_at,
  client:clients ( id, client_code, full_name, first_name, last_name, phone ),
  store:stores ( id, code, name, display_name ),
  lines:product_reservation_lines (
    id, product_variant_id, warehouse_id, quantity, unit_price, line_total,
    status, stock_reserved_at, fulfilled_sale_id, fulfilled_at,
    cancelled_at, cancelled_reason, sort_order, created_at, updated_at,
    product_variant:product_variants (
      id, variant_sku, size, color, barcode, image_url,
      product:products ( id, sku, name, brand, main_image_url, base_price, price_with_tax, tax_rate )
    ),
    warehouse:warehouses ( id, code, name )
  ),
  payments:product_reservation_payments ( id, payment_date, payment_method, amount, reference, notes, created_at ),
  created_by_profile:profiles!product_reservations_created_by_fkey ( id, full_name ),
  employee:profiles!product_reservations_employee_id_fkey ( id, full_name )
`

export const listReservations = protectedAction<ListReservationsInput, ListResult<any>>(
  { permission: 'reservations.view', auditModule: 'reservations' },
  async (ctx, rawInput) => {
    const input = listReservationsSchema.parse(rawInput)

    // Búsqueda inteligente: por nº de reserva o por cliente (nombre/código/teléfono).
    // Resolvemos primero los IDs de clientes que matchean contra clients.search_text
    // (unaccent + lower), luego construimos un OR sobre reservation_number y client_id.
    // Multi-palabra por nombre de cliente (tokens AND) vía el helper central, igual
    // que pedidos/arreglos. El nº de reserva (reservation_number, más abajo) va
    // entero, no se tokeniza.
    let clientIdsFromSearch: string[] | null = null
    const searchTerm = normalizeSearchTerm(input.search || '')
    if (searchTerm.length > 0) {
      clientIdsFromSearch = await resolveClientIdsForSearch(ctx.adminClient, searchTerm)
    }

    let query = ctx.adminClient
      .from('product_reservations')
      .select(RESERVATION_SELECT, { count: 'exact' })

    if (input.status && input.status !== 'all') {
      query = query.eq('status', input.status)
    }
    if (input.onlyPending) {
      query = query.eq('status', 'pending_stock')
    }
    // Se filtra en SERVIDOR, no sobre la página cargada: si no, el contador y la
    // paginación seguirían contando las pagadas y el Excel las arrastraría.
    if (input.excludePaid) {
      query = query.neq('payment_status', 'paid')
    }
    if (input.department) query = query.eq('department', input.department)
    if (input.delivery) query = query.eq('delivery_status', input.delivery)
    // Vista combinada pago + entrega (petición de Mónica, 22-sep-2026): saber de
    // un vistazo quién tiene el género en casa sin pagar y quién lo tiene aquí.
    // Se filtra en SERVIDOR para que el contador, la paginación y el Excel
    // hablen de lo mismo que la tabla.
    if (input.situation) {
      const cancelled = ['cancelled', 'expired']
      switch (input.situation) {
        case 'en_tienda_sin_pagar':
          query = query.eq('delivery_status', 'pending').neq('payment_status', 'paid').not('status', 'in', `(${cancelled.join(',')})`)
          break
        case 'en_casa_sin_pagar':
          query = query.in('delivery_status', ['partial', 'delivered']).neq('payment_status', 'paid')
          break
        case 'pagada_sin_recoger':
          query = query.eq('delivery_status', 'pending').eq('payment_status', 'paid').not('status', 'in', `(${cancelled.join(',')})`)
          break
        case 'cumplida':
          query = query.eq('delivery_status', 'delivered').eq('payment_status', 'paid')
          break
      }
    }
    if (input.clientId) query = query.eq('client_id', input.clientId)
    if (input.storeId) query = query.eq('store_id', input.storeId)
    if (input.dateFrom) query = query.gte('created_at', input.dateFrom)
    if (input.dateTo) query = query.lte('created_at', input.dateTo + 'T23:59:59')

    if (input.productVariantId) {
      const { data: linesMatch } = await ctx.adminClient
        .from('product_reservation_lines')
        .select('reservation_id')
        .eq('product_variant_id', input.productVariantId)
      const ids = [...new Set((linesMatch ?? []).map((l: any) => l.reservation_id as string))]
      if (ids.length === 0) {
        return success({ data: [], total: 0, page: input.page, pageSize: input.pageSize })
      }
      query = query.in('id', ids)
    }

    if (input.warehouseId) {
      const { data: linesMatch } = await ctx.adminClient
        .from('product_reservation_lines')
        .select('reservation_id')
        .eq('warehouse_id', input.warehouseId)
      const ids = [...new Set((linesMatch ?? []).map((l: any) => l.reservation_id as string))]
      if (ids.length === 0) {
        return success({ data: [], total: 0, page: input.page, pageSize: input.pageSize })
      }
      query = query.in('id', ids)
    }

    if (searchTerm.length > 0) {
      const like = `%${searchTerm}%`
      const orParts: string[] = [`reservation_number.ilike.${like}`]
      if (clientIdsFromSearch && clientIdsFromSearch.length > 0) {
        orParts.push(`client_id.in.(${clientIdsFromSearch.join(',')})`)
      }
      query = query.or(orParts.join(','))
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
  total: number
  total_paid: number
  payment_status: 'pending' | 'partial' | 'paid'
  payment_id: string | null
  lines: Array<{
    id: string
    product_variant_id: string
    warehouse_id: string
    quantity: number
    unit_price: number
    line_total: number
    status: string
  }>
  auditEntityId: string
  auditDescription: string
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
      employee_id: input.employee_id,
      store_id: input.store_id ?? null,
      cash_session_id: input.cash_session_id ?? null,
      lines: input.lines.map((l) => ({
        product_variant_id: l.product_variant_id,
        warehouse_id: l.warehouse_id,
        quantity: l.quantity,
        unit_price: l.unit_price,
      })),
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

    // `department` es solo clasificación (boutique/sastrería) y la RPC no lo
    // recibe: se marca aquí en vez de reescribir rpc_create_reservation entera.
    // El dinero de la reserva sigue entrando SIEMPRE por boutique.
    if (input.department && input.department !== 'boutique') {
      await ctx.adminClient
        .from('product_reservations')
        .update({ department: input.department })
        .eq('id', result.id)
    }

    return success({
      id: result.id,
      reservation_number: result.reservation_number,
      status: result.status,
      had_stock: result.had_stock,
      total: Number(result.total ?? 0),
      total_paid: Number(result.total_paid ?? 0),
      payment_status: result.payment_status ?? 'pending',
      payment_id: result.payment_id ?? null,
      lines: (result.lines ?? []).map((l) => ({
        ...l,
        quantity: Number(l.quantity),
        unit_price: Number(l.unit_price),
        line_total: Number(l.line_total),
      })),
      auditEntityId: String(result.id),
      auditDescription: `Reserva ${result.reservation_number}`,
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
  auditEntityId: string
  auditDescription: string
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

    const amount = Number(result.amount)
    return success({
      ...result,
      amount,
      total_paid: Number(result.total_paid),
      auditEntityId: String(result.reservation_id),
      auditDescription: `Pago de reserva ${result.reservation_number} (${amount} €)`,
    })
  }
)

export const updateReservation = protectedAction<UpdateReservationInput, { id: string; auditEntityId: string; auditDescription: string }>(
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
    if (input.department !== undefined) updates.department = input.department
    if (input.store_id !== undefined) updates.store_id = input.store_id

    const { data, error } = await ctx.adminClient
      .from('product_reservations')
      .update(updates)
      .eq('id', input.id)
      .select('reservation_number')
      .maybeSingle()

    if (error) return failure(error.message || 'Error al actualizar reserva', 'INTERNAL')
    const reservation_number = (data as { reservation_number: string } | null)?.reservation_number ?? ''
    return success({
      id: input.id,
      auditEntityId: String(input.id),
      auditDescription: `Reserva ${reservation_number}`,
    })
  }
)

/**
 * Cambia el PRECIO pactado de los artículos de una reserva (precios especiales:
 * petición de Teresa, sep-2026). Solo toca `unit_price`/`line_total` de las
 * líneas vivas; el trigger `fn_recalc_reservation_header` recalcula el total de
 * la reserva, el estado de pago y lo pendiente.
 *
 * Reglas:
 * - Las líneas ya entregadas o canceladas no se tocan (su precio es histórico:
 *   la entregada ya está en un ticket).
 * - El nuevo total no puede quedar por debajo de lo ya cobrado, para no dejar
 *   la reserva con un pago mayor que su importe.
 * - Permiso propio (`reservations.edit_price`, mig 288): editar notas o fecha
 *   lo puede hacer cualquier vendedor, tocar el precio no.
 */
export const updateReservationPrices = protectedAction<UpdateReservationPricesInput, { id: string; total: number; auditEntityId: string; auditDescription: string }>(
  {
    permission: 'reservations.edit_price',
    auditModule: 'reservations',
    auditAction: 'update',
    auditEntity: 'product_reservation',
    revalidate: ['/admin/stock'],
  },
  async (ctx, rawInput) => {
    const input = updateReservationPricesSchema.parse(rawInput)

    const { data: reservation, error: rErr } = await ctx.adminClient
      .from('product_reservations')
      .select('id, reservation_number, status, total, total_paid')
      .eq('id', input.id)
      .maybeSingle()
    if (rErr) return failure(rErr.message || 'Error al leer la reserva', 'INTERNAL')
    if (!reservation) return failure('Reserva no encontrada', 'NOT_FOUND')
    if (reservation.status === 'cancelled') return failure('La reserva está cancelada', 'VALIDATION')
    if (reservation.status === 'fulfilled') return failure('La reserva ya se ha entregado: el precio está en el ticket', 'VALIDATION')

    const { data: linesData, error: lErr } = await ctx.adminClient
      .from('product_reservation_lines')
      .select('id, quantity, unit_price, line_total, status')
      .eq('reservation_id', input.id)
    if (lErr) return failure(lErr.message || 'Error al leer los artículos', 'INTERNAL')
    const lines = (linesData ?? []) as Array<{ id: string; quantity: number; unit_price: number; line_total: number; status: string }>

    const editable = new Map(lines.filter((l) => l.status === 'active' || l.status === 'pending_stock').map((l) => [String(l.id), l]))
    const changes: Array<{ line: { id: string; quantity: number; unit_price: number }; unitPrice: number; lineTotal: number }> = []
    for (const req of input.lines) {
      const line = editable.get(req.line_id)
      if (!line) return failure('Alguno de los artículos ya está entregado o cancelado: recarga la pantalla', 'VALIDATION')
      const unitPrice = Math.round(req.unit_price * 100) / 100
      const lineTotal = Math.round(unitPrice * Number(line.quantity) * 100) / 100
      if (Math.abs(unitPrice - Number(line.unit_price)) < 0.005) continue
      changes.push({ line, unitPrice, lineTotal })
    }
    if (!changes.length) return failure('No has cambiado ningún precio', 'VALIDATION')

    // Total que quedará: líneas vivas con su precio nuevo (las canceladas no suman).
    const changed = new Map(changes.map((c) => [String(c.line.id), c.lineTotal]))
    const newTotal = lines
      .filter((l) => l.status !== 'cancelled')
      .reduce((sum, l) => sum + (changed.get(String(l.id)) ?? (Number(l.line_total) || 0)), 0)
    const paid = Number(reservation.total_paid) || 0
    if (newTotal + 0.005 < paid) {
      return failure(`El total (${newTotal.toFixed(2)} €) no puede ser menor que lo ya cobrado (${paid.toFixed(2)} €)`, 'VALIDATION')
    }

    for (const c of changes) {
      const { error } = await ctx.adminClient
        .from('product_reservation_lines')
        .update({ unit_price: c.unitPrice, line_total: c.lineTotal })
        .eq('id', c.line.id)
      if (error) return failure(error.message || 'Error al guardar el precio', 'INTERNAL')
    }

    const oldTotal = Number(reservation.total) || 0
    const detail = changes
      .map((c) => `${Number(c.line.unit_price).toFixed(2)} € → ${c.unitPrice.toFixed(2)} €`)
      .join(' · ')
    return success({
      id: input.id,
      total: Math.round(newTotal * 100) / 100,
      auditEntityId: String(input.id),
      auditDescription: `Reserva ${reservation.reservation_number}: precio ${oldTotal.toFixed(2)} € → ${newTotal.toFixed(2)} € (${detail})`,
    })
  }
)

export const cancelReservation = protectedAction<CancelReservationInput, { id: string; status: string; auditEntityId: string; auditDescription: string }>(
  {
    permission: 'reservations.delete',
    auditModule: 'reservations',
    auditAction: 'delete',
    auditEntity: 'product_reservation',
    revalidate: ['/admin/stock'],
  },
  async (ctx, rawInput) => {
    const input = cancelReservationSchema.parse(rawInput)

    const { data: existing } = await ctx.adminClient
      .from('product_reservations')
      .select('reservation_number')
      .eq('id', input.id)
      .maybeSingle()
    const reservation_number = (existing as { reservation_number: string } | null)?.reservation_number ?? ''

    const { data, error } = await ctx.adminClient.rpc('rpc_cancel_reservation', {
      p_reservation_id: input.id,
      p_reason: input.reason ?? null,
      p_user_id: ctx.userId !== 'system' ? ctx.userId : null,
    })

    if (error) return failure(error.message || 'Error al cancelar reserva', 'INTERNAL')
    const result = data as { id: string; status: string } | null
    if (!result?.id) return failure('Respuesta inválida del servidor', 'INTERNAL')
    return success({
      ...result,
      auditEntityId: String(result.id),
      auditDescription: `Reserva ${reservation_number} cancelada`,
    })
  }
)

export const reactivateReservation = protectedAction<ReactivateReservationInput, { id: string; status: string; auditEntityId: string; auditDescription: string }>(
  {
    permission: 'reservations.delete',
    auditModule: 'reservations',
    auditAction: 'state_change',
    auditEntity: 'product_reservation',
    revalidate: ['/admin/stock'],
  },
  async (ctx, rawInput) => {
    const input = reactivateReservationSchema.parse(rawInput)

    const { data: existing } = await ctx.adminClient
      .from('product_reservations')
      .select('reservation_number')
      .eq('id', input.id)
      .maybeSingle()
    const reservation_number = (existing as { reservation_number: string } | null)?.reservation_number ?? ''

    const { data, error } = await ctx.adminClient.rpc('rpc_reactivate_reservation', {
      p_reservation_id: input.id,
      p_user_id: ctx.userId !== 'system' ? ctx.userId : null,
    })

    if (error) return failure(error.message || 'Error al reactivar reserva', 'INTERNAL')
    const result = data as { id: string; status: string } | null
    if (!result?.id) return failure('Respuesta inválida del servidor', 'INTERNAL')
    return success({
      ...result,
      auditEntityId: String(result.id),
      auditDescription: `Reserva ${reservation_number} reactivada`,
    })
  }
)

export const cancelReservationLine = protectedAction<CancelReservationLineInput, { id: string; status: string; auditEntityId: string; auditDescription: string }>(
  {
    permission: 'reservations.delete',
    auditModule: 'reservations',
    auditAction: 'delete',
    auditEntity: 'product_reservation_line',
    revalidate: ['/admin/stock'],
  },
  async (ctx, rawInput) => {
    const input = cancelReservationLineSchema.parse(rawInput)

    const { data: lineRow } = await ctx.adminClient
      .from('product_reservation_lines')
      .select('reservation:product_reservations ( reservation_number )')
      .eq('id', input.line_id)
      .maybeSingle()
    const reservation_number =
      (lineRow as { reservation: { reservation_number: string } | null } | null)?.reservation?.reservation_number ?? ''

    const { data, error } = await ctx.adminClient.rpc('rpc_cancel_reservation_line', {
      p_line_id: input.line_id,
      p_reason: input.reason ?? null,
      p_user_id: ctx.userId !== 'system' ? ctx.userId : null,
    })

    if (error) return failure(error.message || 'Error al cancelar línea', 'INTERNAL')
    const result = data as { id: string; status: string } | null
    if (!result?.id) return failure('Respuesta inválida del servidor', 'INTERNAL')
    return success({
      ...result,
      auditEntityId: String(result.id),
      auditDescription: `Línea de reserva ${reservation_number} cancelada`,
    })
  }
)

export const fulfillReservationLine = protectedAction<FulfillReservationLineInput, { id: string; status: string; auditEntityId: string; auditDescription: string }>(
  {
    permission: 'reservations.edit',
    auditModule: 'reservations',
    auditAction: 'state_change',
    auditEntity: 'product_reservation_line',
    revalidate: ['/admin/stock'],
  },
  async (ctx, rawInput) => {
    const input = fulfillReservationLineSchema.parse(rawInput)

    const { data: lineRow } = await ctx.adminClient
      .from('product_reservation_lines')
      .select('reservation:product_reservations ( reservation_number )')
      .eq('id', input.line_id)
      .maybeSingle()
    const reservation_number =
      (lineRow as { reservation: { reservation_number: string } | null } | null)?.reservation?.reservation_number ?? ''

    const { data, error } = await ctx.adminClient.rpc('rpc_fulfill_reservation_line', {
      p_line_id: input.line_id,
      p_sale_id: input.sale_id ?? null,
      p_user_id: ctx.userId !== 'system' ? ctx.userId : null,
    })

    if (error) return failure(error.message || 'Error al cumplir línea', 'INTERNAL')
    const result = data as { id: string; status: string } | null
    if (!result?.id) return failure('Respuesta inválida del servidor', 'INTERNAL')
    return success({
      ...result,
      auditEntityId: String(result.id),
      auditDescription: `Línea de reserva ${reservation_number} entregada`,
    })
  }
)

/**
 * Helper usado en el POS para saber si el cliente seleccionado
 * tiene líneas activas sobre una variante. Suma cantidad de todas
 * las líneas activas (puede haber varias en varias reservas).
 */
/**
 * Activa reservas en `pending_stock` para una variante+almacén concreta si
 * ahora hay stock suficiente. Wrapper de la función SQL fn_activate_pending_reservations
 * (definida en 105_reservations_on_delivery.sql y refactorizada en 112b_rpcs_reservation_lines.sql).
 * Devuelve cuántas líneas se han activado y los detalles para feedback en UI.
 */
export const activatePendingReservationsForVariant = protectedAction<
  { variantId: string; warehouseId: string },
  { activatedCount: number; activated: Array<{ reservation_id: string; reservation_line_id: string; reservation_number: string; client_id: string | null; quantity: number; activated: boolean }> }
>(
  { permission: 'reservations.view', auditModule: 'reservations' },
  async (ctx, { variantId, warehouseId }) => {
    const { data, error } = await ctx.adminClient.rpc('fn_activate_pending_reservations', {
      p_product_variant_id: variantId,
      p_warehouse_id: warehouseId,
      p_user_id: ctx.userId !== 'system' ? ctx.userId : null,
    })
    if (error) return failure(error.message || 'Error al activar reservas pendientes', 'INTERNAL')
    const rows = Array.isArray(data) ? data : []
    const activated = rows.map((r: any) => ({
      reservation_id: String(r?.reservation_id ?? ''),
      reservation_line_id: String(r?.reservation_line_id ?? ''),
      reservation_number: String(r?.reservation_number ?? ''),
      client_id: r?.client_id ?? null,
      quantity: Number(r?.quantity ?? 0),
      activated: Boolean(r?.activated),
    }))
    const activatedCount = activated.filter((r) => r.activated).length
    return success({ activatedCount, activated })
  }
)

export const getActiveReservationsForVariant = protectedAction<
  { productVariantId: string; warehouseId?: string; clientId?: string },
  { totalReserved: number; count: number; reservations: Array<{ id: string; line_id: string; reservation_number: string; quantity: number; client_id: string }> }
>(
  { permission: 'reservations.view', auditModule: 'reservations' },
  async (ctx, { productVariantId, warehouseId, clientId }) => {
    let query = ctx.adminClient
      .from('product_reservation_lines')
      .select('id, reservation_id, quantity, product_reservations!inner(reservation_number, client_id)')
      .eq('product_variant_id', productVariantId)
      .eq('status', 'active')

    if (warehouseId) query = query.eq('warehouse_id', warehouseId)
    if (clientId) query = query.eq('product_reservations.client_id', clientId)

    const { data, error } = await query
    if (error) return failure(error.message || 'Error al consultar reservas', 'INTERNAL')
    const rows = (data ?? []) as any[]
    const totalReserved = rows.reduce((acc, r) => acc + (Number(r.quantity) || 0), 0)
    return success({
      totalReserved,
      count: rows.length,
      reservations: rows.map((r) => ({
        id: r.reservation_id,
        line_id: r.id,
        reservation_number: r.product_reservations?.reservation_number ?? '',
        quantity: Number(r.quantity),
        client_id: r.product_reservations?.client_id ?? '',
      })),
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
