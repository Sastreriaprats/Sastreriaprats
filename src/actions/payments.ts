'use server'

import { revalidatePath } from 'next/cache'
import { protectedAction, type AdminClient } from '@/lib/server/action-wrapper'
import { success, failure } from '@/lib/errors'
import { serializeForServerAction } from '@/lib/server/serialize'

// ─── Types ────────────────────────────────────────────────────────────────────

export type PaymentMethod = 'cash' | 'card' | 'transfer' | 'check' | 'bizum'

export interface OrderPayment {
  id: string
  tailoring_order_id: string
  payment_date: string
  payment_method: PaymentMethod
  amount: number
  reference: string | null
  notes: string | null
  next_payment_date: string | null
  created_by: string | null
  created_at: string
}

export interface AddOrderPaymentInput {
  tailoring_order_id: string
  payment_date: string
  payment_method: PaymentMethod
  amount: number
  reference?: string
  notes?: string
  next_payment_date?: string
  storeId?: string
}

export interface UpdateOrderPaymentInput {
  payment_id: string
  tailoring_order_id: string
  amount: number
  method: PaymentMethod
}

export interface AddSalePaymentInput {
  sale_id: string
  payment_method: PaymentMethod
  amount: number
  reference?: string
  /** Fecha del pago (YYYY-MM-DD). Si no viene, se usa hoy y la sesión abierta actual. */
  payment_date?: string
  next_payment_date?: string
  storeId?: string
}

export interface UpdateSalePaymentInput {
  salePaymentId: string
  amount: number
  method: PaymentMethod
}

// ─── Tailoring Order Payments ──────────────────────────────────────────────────

export const getOrderPayments = protectedAction<{ tailoring_order_id: string }, OrderPayment[]>(
  { permission: 'orders.view' },
  async (ctx, { tailoring_order_id }) => {
    try {
      const { data, error } = await ctx.adminClient
        .from('tailoring_order_payments')
        .select('id, tailoring_order_id, payment_date, payment_method, amount, reference, notes, next_payment_date, created_by, created_at')
        .eq('tailoring_order_id', tailoring_order_id)
        .order('payment_date', { ascending: false })
        .limit(100)

      if (error) {
        console.error('[getOrderPayments]', error)
        return failure(error.message)
      }
      return success(serializeForServerAction(data ?? []))
    } catch (e) {
      console.error('[getOrderPayments] unexpected:', e)
      return failure('Error al obtener pagos')
    }
  }
)

export const addOrderPayment = protectedAction<AddOrderPaymentInput, OrderPayment>(
  { permission: 'orders.edit', auditAction: 'payment', auditModule: 'orders' },
  async (ctx, input) => {
    // NOTA: ya NO exigimos caja abierta. rpc_add_order_payment (mig 135) localiza
    // la sesión por FECHA del pago; si no hay ninguna que cubra la fecha, el cobro
    // se registra con cash_session_id = NULL (queda en el pedido y en total_paid,
    // pero sin entrar en el arqueo). Permite cobrar pedidos con la caja cerrada.
    const { data: result, error: rpcError } = await ctx.adminClient.rpc('rpc_add_order_payment', {
      p_tailoring_order_id: input.tailoring_order_id,
      p_payment_date: input.payment_date,
      p_payment_method: input.payment_method,
      p_amount: input.amount,
      p_reference: input.reference ?? null,
      p_notes: input.notes ?? null,
      p_next_payment_date: input.next_payment_date ?? null,
      p_store_id: input.storeId ?? null,
      p_user_id: ctx.userId,
    })

    if (rpcError) return failure(rpcError.message)

    revalidatePath(`/sastre/pedidos/${input.tailoring_order_id}`)

    const methodLabels: Record<string, string> = { cash: 'efectivo', card: 'tarjeta', transfer: 'transferencia', check: 'cheque', bizum: 'bizum', voucher: 'vale' }
    const methodLabel = methodLabels[input.payment_method] ?? input.payment_method
    const auditDescription = `Pago ${Number(input.amount).toFixed(2)}€ · Pedido ${result.order_number} · Método: ${methodLabel}`

    return success(serializeForServerAction({ ...result, auditDescription }))
  }
)

export const deleteOrderPayment = protectedAction<
  { payment_id: string; tailoring_order_id: string },
  { auditEntityId: string; auditDescription: string }
>(
  { permission: 'orders.edit', auditAction: 'delete', auditModule: 'orders' },
  async (ctx, { payment_id, tailoring_order_id }) => {
    try {
      // Traer el nº de pedido para el log de Seguimiento.
      const { data: order } = await ctx.adminClient
        .from('tailoring_orders')
        .select('order_number')
        .eq('id', tailoring_order_id)
        .maybeSingle()

      // Delegar en rpc_remove_order_payment (mig 150 + 191): revierte
      // manual_transactions + cash_sessions.total_*_sales y borra la fila
      // en una transacción. Si el pago vivía en una sesión cerrada, recalcula
      // el arqueo (expected_cash/cash_difference) — ya no se bloquea.
      const { error: rpcError } = await ctx.adminClient.rpc('rpc_remove_order_payment', {
        p_payment_id: payment_id,
      })

      if (rpcError) {
        console.error('[deleteOrderPayment]', rpcError)
        return failure(rpcError.message)
      }

      // total_paid lo recalcula la propia RPC (UPDATE explícito) y total_pending
      // es columna generada (total - total_paid): no se tocan aquí.
      revalidatePath(`/sastre/pedidos/${tailoring_order_id}`)

      return success({
        auditEntityId: String(tailoring_order_id),
        auditDescription: `Cobro eliminado del pedido ${order?.order_number ?? tailoring_order_id}`,
      })
    } catch (e) {
      console.error('[deleteOrderPayment] unexpected:', e)
      return failure('Error al eliminar pago')
    }
  }
)

// ── Editar cobro de pedido (orders.edit + isFullAdmin) ──────────────────────
// Delega en rpc_update_tailoring_payment (mig 191): ajusta los totales de la
// sesión por el delta (mismo método o cambio de método), recalcula el arqueo si
// la sesión está cerrada y reemplaza el espejo en manual_transactions. Alcance
// v1: solo importe + método (no fecha, no mover de sesión ni de pedido).
async function userIsFullAdmin(ctx: { adminClient: AdminClient; userId: string }): Promise<boolean> {
  const { data: roleRows } = await ctx.adminClient
    .from('user_roles').select('roles!inner(name)').eq('user_id', ctx.userId)
  return (roleRows ?? []).some((ur: { roles?: { name?: string } | { name?: string }[] }) => {
    const r = ur.roles
    const name = Array.isArray(r) ? r[0]?.name : r?.name
    return name === 'administrador' || name === 'super_admin'
  })
}

export const updateOrderPayment = protectedAction<
  UpdateOrderPaymentInput,
  { auditEntityId: string; auditDescription: string }
>(
  { permission: 'orders.edit', auditAction: 'update', auditModule: 'orders' },
  async (ctx, { payment_id, tailoring_order_id, amount, method }) => {
    if (!payment_id) return failure('Falta el identificador del cobro', 'VALIDATION')
    if (!(Number(amount) > 0)) return failure('El importe debe ser mayor que 0', 'VALIDATION')
    const validMethods: PaymentMethod[] = ['cash', 'card', 'transfer', 'check', 'bizum']
    if (!validMethods.includes(method)) return failure('Método de pago no válido', 'VALIDATION')
    if (!(await userIsFullAdmin(ctx))) return failure('Solo un administrador puede editar un cobro.', 'FORBIDDEN')

    // Traer el nº de pedido para el log de Seguimiento.
    const { data: order } = await ctx.adminClient
      .from('tailoring_orders')
      .select('order_number')
      .eq('id', tailoring_order_id)
      .maybeSingle()

    const { data: result, error: rpcError } = await ctx.adminClient.rpc('rpc_update_tailoring_payment', {
      p_payment_id: payment_id,
      p_amount: amount,
      p_method: method,
      p_user_id: ctx.userId,
    })

    if (rpcError) {
      console.error('[updateOrderPayment]', rpcError)
      return failure(rpcError.message)
    }
    if (result && result.success === false) {
      return failure(String(result.error || 'No se pudo actualizar el cobro'), 'CONFLICT')
    }

    // total_paid lo recalcula la propia RPC (UPDATE explícito) y total_pending
    // es columna generada (total - total_paid): no se tocan aquí.
    revalidatePath(`/sastre/pedidos/${tailoring_order_id}`)
    return success({
      auditEntityId: String(tailoring_order_id),
      auditDescription: `Cobro editado del pedido ${order?.order_number ?? tailoring_order_id} (${Number(amount).toFixed(2)} €)`,
    })
  }
)

// ─── Sale Payments ─────────────────────────────────────────────────────────────

export const getSalePayments = protectedAction<{ sale_id: string }, any[]>(
  { permission: 'sales.view' },
  async (ctx, { sale_id }) => {
    try {
      const { data, error } = await ctx.adminClient
        .from('sale_payments')
        .select('id, sale_id, payment_method, amount, reference, next_payment_date, created_at')
        .eq('sale_id', sale_id)
        .order('created_at', { ascending: false })
        .limit(100)

      if (error) {
        console.error('[getSalePayments]', error)
        return failure(error.message)
      }
      return success(serializeForServerAction(data ?? []))
    } catch (e) {
      console.error('[getSalePayments] unexpected:', e)
      return failure('Error al obtener pagos')
    }
  }
)

export const addSalePayment = protectedAction<AddSalePaymentInput, any>(
  { permission: 'sales.edit', auditAction: 'payment', auditModule: 'sales' },
  async (ctx, input) => {
    try {
      const today = new Date().toISOString().split('T')[0]
      const paymentDate = input.payment_date ?? today

      // Localizar sesión que cubra paymentDate. Prioridad: 'open' cuya
      // apertura sea <= fecha. Fallback: cerrada cuyo rango incluya la fecha.
      // Si no hay ninguna, sessionId queda null y se omiten los updates de
      // cash_sessions y manual_transactions (consistente con rpc_add_order_payment
      // tras la mig 135).
      let sessionId: string | null = null
      {
        let q = ctx.adminClient
          .from('cash_sessions')
          .select('id, opened_at, closed_at, status')
          .eq('status', 'open')
          .lte('opened_at', `${paymentDate}T23:59:59`)
          .order('opened_at', { ascending: false })
          .limit(1)
        if (input.storeId) q = q.eq('store_id', input.storeId)
        const { data: open } = await q.maybeSingle()
        if (open) sessionId = (open as { id: string }).id
      }
      if (!sessionId) {
        let q = ctx.adminClient
          .from('cash_sessions')
          .select('id, opened_at, closed_at, status')
          .neq('status', 'open')
          .lte('opened_at', `${paymentDate}T23:59:59`)
          .gte('closed_at', `${paymentDate}T00:00:00`)
          .order('opened_at', { ascending: false })
          .limit(1)
        if (input.storeId) q = q.eq('store_id', input.storeId)
        const { data: closed } = await q.maybeSingle()
        if (closed) sessionId = (closed as { id: string }).id
      }
      // Si la fecha es hoy y no hay sesión abierta, abortar (igual que antes).
      // Para fechas pasadas/futuras sin sesión, permitir el pago sin vincular.
      if (!sessionId && paymentDate === today) {
        return failure('No hay una caja abierta. Abre la caja antes de registrar un cobro.')
      }

      // Crear el cobro + (si hay sesión) el espejo con FK + sumar a la caja, todo
      // ATÓMICO en la RPC (igual que rpc_add_order_payment). La sesión la
      // resolvemos arriba con la lógica de fecha + gate "hoy sin caja"; la RPC
      // suma a cash_sessions.total_* para que el cobro a plazos entre en el arqueo.
      const { data: result, error: rpcError } = await ctx.adminClient.rpc('rpc_add_sale_payment', {
        p_sale_id: input.sale_id,
        p_payment_method: input.payment_method,
        p_amount: input.amount,
        p_reference: input.reference ?? null,
        p_next_payment_date: input.next_payment_date ?? null,
        p_payment_date: paymentDate,
        p_cash_session_id: sessionId,
        p_user_id: ctx.userId,
      })

      if (rpcError) {
        console.error('[addSalePayment] rpc:', rpcError)
        return failure(rpcError.message || 'Error al registrar pago')
      }

      // Traer el nº de ticket para el log de Seguimiento.
      const { data: sale } = await ctx.adminClient
        .from('sales')
        .select('ticket_number')
        .eq('id', input.sale_id)
        .maybeSingle()

      return success(serializeForServerAction({
        ...result,
        auditEntityId: String(input.sale_id),
        auditDescription: `Cobro de la venta ${sale?.ticket_number ?? input.sale_id} (${Number(input.amount).toFixed(2)} €)`,
      }))
    } catch (e) {
      console.error('[addSalePayment] unexpected:', e)
      return failure('Error al registrar pago')
    }
  }
)

// ── Borrar cobro de venta (sales.edit) ──────────────────────────────────────
// Delega en rpc_remove_sale_payment (mig 218): revierte cash_sessions.total_*,
// recalcula el arqueo si la sesión está cerrada, borra el espejo por FK y
// recalcula amount_paid/payment_status. Mismo patrón que deleteOrderPayment.
export const deleteSalePayment = protectedAction<
  { salePaymentId: string },
  { auditEntityId: string; auditDescription: string }
>(
  { permission: 'sales.edit', auditAction: 'delete', auditModule: 'sales' },
  async (ctx, { salePaymentId }) => {
    try {
      // Resolver venta + nº de ticket ANTES de borrar (luego ya no existe la fila).
      const { data: pay } = await ctx.adminClient
        .from('sale_payments')
        .select('sale_id, sales(ticket_number)')
        .eq('id', salePaymentId)
        .maybeSingle()
      const sale = pay ? (Array.isArray(pay.sales) ? pay.sales[0] : pay.sales) : null
      const saleId = pay?.sale_id ?? salePaymentId
      const ticketNumber = sale?.ticket_number ?? saleId

      const { error: rpcError } = await ctx.adminClient.rpc('rpc_remove_sale_payment', {
        p_sale_payment_id: salePaymentId,
      })
      if (rpcError) {
        console.error('[deleteSalePayment]', rpcError)
        return failure(rpcError.message)
      }
      revalidatePath('/admin/tickets')
      return success({
        auditEntityId: String(saleId),
        auditDescription: `Cobro eliminado de la venta ${ticketNumber}`,
      })
    } catch (e) {
      console.error('[deleteSalePayment] unexpected:', e)
      return failure('Error al eliminar el cobro')
    }
  }
)

// ── Editar cobro de venta (sales.edit + isFullAdmin) ─────────────────────────
// Delega en rpc_update_sale_payment (mig 218): ajusta los totales de la sesión
// por el delta (mismo método o cambio de método), recalcula el arqueo si la
// sesión está cerrada y actualiza el espejo IN-PLACE por FK. Alcance: solo
// importe + método (no fecha, no mover de sesión). Igual que updateOrderPayment.
export const updateSalePayment = protectedAction<
  UpdateSalePaymentInput,
  { auditEntityId: string; auditDescription: string }
>(
  { permission: 'sales.edit', auditAction: 'update', auditModule: 'sales' },
  async (ctx, { salePaymentId, amount, method }) => {
    if (!salePaymentId) return failure('Falta el identificador del cobro', 'VALIDATION')
    if (!(Number(amount) > 0)) return failure('El importe debe ser mayor que 0', 'VALIDATION')
    const validMethods: PaymentMethod[] = ['cash', 'card', 'transfer', 'check', 'bizum']
    if (!validMethods.includes(method)) return failure('Método de pago no válido', 'VALIDATION')
    if (!(await userIsFullAdmin(ctx))) return failure('Solo un administrador puede editar un cobro.', 'FORBIDDEN')

    // Resolver venta + nº de ticket para el log de Seguimiento.
    const { data: pay } = await ctx.adminClient
      .from('sale_payments')
      .select('sale_id, sales(ticket_number)')
      .eq('id', salePaymentId)
      .maybeSingle()
    const sale = pay ? (Array.isArray(pay.sales) ? pay.sales[0] : pay.sales) : null
    const saleId = pay?.sale_id ?? salePaymentId
    const ticketNumber = sale?.ticket_number ?? saleId

    const { data: result, error: rpcError } = await ctx.adminClient.rpc('rpc_update_sale_payment', {
      p_sale_payment_id: salePaymentId,
      p_amount: amount,
      p_method: method,
      p_user_id: ctx.userId,
    })
    if (rpcError) {
      console.error('[updateSalePayment]', rpcError)
      return failure(rpcError.message)
    }
    if (result && result.success === false) {
      return failure(String(result.error || 'No se pudo actualizar el cobro'), 'CONFLICT')
    }
    revalidatePath('/admin/tickets')
    return success({
      auditEntityId: String(saleId),
      auditDescription: `Cobro editado de la venta ${ticketNumber} (${Number(amount).toFixed(2)} €)`,
    })
  }
)

// ─── Cobros pendientes (para el panel) ────────────────────────────────────────

export interface PendingPaymentRow {
  id: string
  entity_type: 'tailoring_order' | 'sale' | 'reservation'
  reference: string
  client_name: string
  client_id: string
  total: number
  total_paid: number
  total_pending: number
  last_payment_date: string | null
  next_payment_date: string | null
  created_at: string
  days_since_creation: number
  store_id: string | null
  store_name: string | null
}

export const getPendingPayments = protectedAction<
  { type?: 'all' | 'orders' | 'sales' | 'reservations'; search?: string },
  PendingPaymentRow[]
>(
  { permission: ['orders.view', 'sales.view'] },
  async (ctx, { type = 'all', search }) => {
    try {
      const rows: PendingPaymentRow[] = []
      const today = new Date()
      const searchTerm = (search ?? '').trim()

      // Búsqueda por cliente: obtener IDs de clientes que coincidan por nombre/apellido
      let clientIds: string[] = []
      if (searchTerm.length >= 2) {
        const { data: clients } = await ctx.adminClient
          .from('clients')
          .select('id')
          .or(`full_name.ilike.%${searchTerm}%,first_name.ilike.%${searchTerm}%,last_name.ilike.%${searchTerm}%`)
          .limit(200)
        clientIds = (clients ?? []).map((c: { id: string }) => c.id)
      }

      if (type === 'all' || type === 'orders') {
        let query = ctx.adminClient
          .from('tailoring_orders')
          .select('id, order_number, total, total_paid, total_pending, created_at, client_id, clients(id, full_name), stores(id, name)')
          .gt('total_pending', 0)
          // Solo se excluyen los cancelados. Un pedido 'delivered' (entregado)
          // puede tener saldo pendiente: entregar la prenda no implica cobrarla.
          .neq('status', 'cancelled')
          .order('created_at', { ascending: false })
          .limit(500)

        if (searchTerm) {
          if (clientIds.length > 0) {
            query = query.or(`order_number.ilike.%${searchTerm}%,client_id.in.(${clientIds.join(',')})`)
          } else {
            query = query.ilike('order_number', `%${searchTerm}%`)
          }
        }

        const { data: orders, error: ordErr } = await query
        if (ordErr) {
          console.error('[getPendingPayments] orders:', ordErr)
        } else {
          for (const o of orders ?? []) {
            const client = Array.isArray(o.clients) ? o.clients[0] : o.clients
            const store = Array.isArray(o.stores) ? o.stores[0] : o.stores

            const { data: lastPay } = await ctx.adminClient
              .from('tailoring_order_payments')
              .select('payment_date, next_payment_date')
              .eq('tailoring_order_id', o.id)
              .order('payment_date', { ascending: false })
              .limit(1)
              .maybeSingle()

            const created = new Date(o.created_at)
            const days = Math.floor((today.getTime() - created.getTime()) / (1000 * 60 * 60 * 24))

            rows.push({
              id: o.id,
              entity_type: 'tailoring_order',
              reference: o.order_number,
              client_name: client?.full_name ?? '—',
              client_id: client?.id ?? '',
              total: Number(o.total),
              total_paid: Number(o.total_paid ?? 0),
              total_pending: Number(o.total_pending ?? 0),
              last_payment_date: lastPay?.payment_date ?? null,
              next_payment_date: lastPay?.next_payment_date ?? null,
              created_at: o.created_at,
              days_since_creation: days,
              store_id: store?.id ?? null,
              store_name: store?.name ?? null,
            })
          }
        }
      }

      if (type === 'all' || type === 'sales') {
        let query = ctx.adminClient
          .from('sales')
          .select('id, ticket_number, total, amount_paid, payment_status, created_at, client_id, clients(id, full_name), stores(id, name)')
          .in('payment_status', ['pending', 'partial'])
          .order('created_at', { ascending: false })
          .limit(500)

        if (searchTerm) {
          if (clientIds.length > 0) {
            query = query.or(`ticket_number.ilike.%${searchTerm}%,client_id.in.(${clientIds.join(',')})`)
          } else {
            query = query.ilike('ticket_number', `%${searchTerm}%`)
          }
        }

        const { data: sales, error: salErr } = await query
        if (salErr) {
          console.error('[getPendingPayments] sales:', salErr)
        } else {
          for (const s of sales ?? []) {
            const client = Array.isArray(s.clients) ? s.clients[0] : s.clients
            const store = Array.isArray(s.stores) ? s.stores[0] : s.stores
            const amountPaid = Number(s.amount_paid ?? 0)
            const total = Number(s.total)
            const created = new Date(s.created_at)
            const days = Math.floor((today.getTime() - created.getTime()) / (1000 * 60 * 60 * 24))

            const { data: lastSalePay } = await ctx.adminClient
              .from('sale_payments')
              .select('created_at, next_payment_date')
              .eq('sale_id', s.id)
              .order('created_at', { ascending: false })
              .limit(1)
              .maybeSingle()

            rows.push({
              id: s.id,
              entity_type: 'sale',
              reference: s.ticket_number ?? s.id.slice(0, 8),
              client_name: client?.full_name ?? '—',
              client_id: client?.id ?? '',
              total,
              total_paid: amountPaid,
              total_pending: Math.max(0, total - amountPaid),
              last_payment_date: lastSalePay?.created_at ?? null,
              next_payment_date: lastSalePay?.next_payment_date ?? null,
              created_at: s.created_at,
              days_since_creation: days,
              store_id: store?.id ?? null,
              store_name: store?.name ?? null,
            })
          }
        }
      }

      // Reservas con deuda (mig 263): activas, pendientes de stock o entregadas
      // sin cobro completo. La deuda de recogidas por TPV vive en la VENTA (ya
      // listada arriba); aquí solo asoma la deuda de cabecera de la reserva.
      if (type === 'all' || type === 'reservations') {
        let query = ctx.adminClient
          .from('product_reservations')
          .select('id, reservation_number, total, total_paid, status, created_at, client_id, clients(id, full_name), stores(id, name)')
          .in('status', ['active', 'pending_stock', 'fulfilled'])
          .gt('total', 0)
          .order('created_at', { ascending: false })
          .limit(500)

        if (searchTerm) {
          if (clientIds.length > 0) {
            query = query.or(`reservation_number.ilike.%${searchTerm}%,client_id.in.(${clientIds.join(',')})`)
          } else {
            query = query.ilike('reservation_number', `%${searchTerm}%`)
          }
        }

        const { data: reservations, error: resErr } = await query
        if (resErr) {
          console.error('[getPendingPayments] reservations:', resErr)
        } else {
          for (const r of reservations ?? []) {
            const total = Number(r.total)
            const paid = Number(r.total_paid ?? 0)
            const pending = Math.round((total - paid) * 100) / 100
            if (pending <= 0) continue
            const client = Array.isArray(r.clients) ? r.clients[0] : r.clients
            const store = Array.isArray(r.stores) ? r.stores[0] : r.stores
            const created = new Date(r.created_at)
            const days = Math.floor((today.getTime() - created.getTime()) / (1000 * 60 * 60 * 24))
            rows.push({
              id: r.id,
              entity_type: 'reservation',
              reference: r.reservation_number ?? r.id.slice(0, 8),
              client_name: client?.full_name ?? '—',
              client_id: client?.id ?? '',
              total,
              total_paid: paid,
              total_pending: pending,
              last_payment_date: null,
              next_payment_date: null,
              created_at: r.created_at,
              days_since_creation: days,
              store_id: store?.id ?? null,
              store_name: store?.name ?? null,
            })
          }
        }
      }

      // Orden único: más reciente primero (por created_at)
      rows.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())

      return success(serializeForServerAction(rows))
    } catch (e) {
      console.error('[getPendingPayments] unexpected:', e)
      return failure('Error al obtener cobros pendientes')
    }
  }
)

/** Pendiente de cobro de un cliente (para aviso en TPV al asignar cliente). */
export const getClientPendingDebt = protectedAction<
  { client_id: string },
  PendingPaymentRow[]
>(
  { permission: ['orders.view', 'sales.view'] },
  async (ctx, { client_id }) => {
    try {
      const rows: PendingPaymentRow[] = []
      const today = new Date()

      const { data: orders } = await ctx.adminClient
        .from('tailoring_orders')
        .select('id, order_number, total, total_paid, total_pending, created_at, client_id, clients(id, full_name), stores(id, name)')
        .eq('client_id', client_id)
        .gt('total_pending', 0)
        // Igual que en getPendingPayments: un pedido entregado puede seguir
        // debiendo dinero; solo se excluyen los cancelados.
        .neq('status', 'cancelled')
        .order('created_at', { ascending: false })
        .limit(50)

      for (const o of orders ?? []) {
        const client = Array.isArray(o.clients) ? o.clients[0] : o.clients
        const store = Array.isArray(o.stores) ? o.stores[0] : o.stores
        const { data: lastPay } = await ctx.adminClient
          .from('tailoring_order_payments')
          .select('payment_date, next_payment_date')
          .eq('tailoring_order_id', o.id)
          .order('payment_date', { ascending: false })
          .limit(1)
          .maybeSingle()
        const created = new Date(o.created_at)
        const days = Math.floor((today.getTime() - created.getTime()) / (1000 * 60 * 60 * 24))
        rows.push({
          id: o.id,
          entity_type: 'tailoring_order',
          reference: o.order_number,
          client_name: client?.full_name ?? '—',
          client_id: client?.id ?? '',
          total: Number(o.total),
          total_paid: Number(o.total_paid ?? 0),
          total_pending: Number(o.total_pending ?? 0),
          last_payment_date: lastPay?.payment_date ?? null,
          next_payment_date: lastPay?.next_payment_date ?? null,
          created_at: o.created_at,
          days_since_creation: days,
          store_id: store?.id ?? null,
          store_name: store?.name ?? null,
        })
      }

      const { data: sales } = await ctx.adminClient
        .from('sales')
        .select('id, ticket_number, total, amount_paid, payment_status, created_at, client_id, clients(id, full_name), stores(id, name)')
        .eq('client_id', client_id)
        .in('payment_status', ['pending', 'partial'])
        .order('created_at', { ascending: false })
        .limit(50)

      for (const s of sales ?? []) {
        const client = Array.isArray(s.clients) ? s.clients[0] : s.clients
        const store = Array.isArray(s.stores) ? s.stores[0] : s.stores
        const amountPaid = Number(s.amount_paid ?? 0)
        const total = Number(s.total)
        const totalPending = Math.max(0, total - amountPaid)
        if (totalPending <= 0) continue
        const { data: lastSalePay } = await ctx.adminClient
          .from('sale_payments')
          .select('created_at, next_payment_date')
          .eq('sale_id', s.id)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle()
        const created = new Date(s.created_at)
        const days = Math.floor((today.getTime() - created.getTime()) / (1000 * 60 * 60 * 24))
        rows.push({
          id: s.id,
          entity_type: 'sale',
          reference: s.ticket_number ?? s.id.slice(0, 8),
          client_name: client?.full_name ?? '—',
          client_id: client?.id ?? '',
          total,
          total_paid: amountPaid,
          total_pending: totalPending,
          last_payment_date: lastSalePay?.created_at ?? null,
          next_payment_date: lastSalePay?.next_payment_date ?? null,
          created_at: s.created_at,
          days_since_creation: days,
          store_id: store?.id ?? null,
          store_name: store?.name ?? null,
        })
      }

      // Reservas del cliente con deuda (incluidas las fulfilled sin cobro
      // completo, mig 263) — mismo criterio que el agregado de la ficha.
      const { data: reservations } = await ctx.adminClient
        .from('product_reservations')
        .select('id, reservation_number, total, total_paid, status, created_at, client_id, clients(id, full_name), stores(id, name)')
        .eq('client_id', client_id)
        .in('status', ['active', 'pending_stock', 'fulfilled'])
        .gt('total', 0)
        .order('created_at', { ascending: false })
        .limit(50)

      for (const r of reservations ?? []) {
        const total = Number(r.total)
        const paid = Number(r.total_paid ?? 0)
        const pending = Math.round((total - paid) * 100) / 100
        if (pending <= 0) continue
        const client = Array.isArray(r.clients) ? r.clients[0] : r.clients
        const store = Array.isArray(r.stores) ? r.stores[0] : r.stores
        const created = new Date(r.created_at)
        const days = Math.floor((today.getTime() - created.getTime()) / (1000 * 60 * 60 * 24))
        rows.push({
          id: r.id,
          entity_type: 'reservation',
          reference: r.reservation_number ?? r.id.slice(0, 8),
          client_name: client?.full_name ?? '—',
          client_id: client?.id ?? '',
          total,
          total_paid: paid,
          total_pending: pending,
          last_payment_date: null,
          next_payment_date: null,
          created_at: r.created_at,
          days_since_creation: days,
          store_id: store?.id ?? null,
          store_name: store?.name ?? null,
        })
      }

      rows.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
      return success(serializeForServerAction(rows))
    } catch (e) {
      console.error('[getClientPendingDebt] unexpected:', e)
      return failure('Error al obtener pendiente del cliente')
    }
  }
)

// ─── Badge: count de pagos con next_payment_date vencido ─────────────────────

export const getOverduePaymentsCount = protectedAction<
  { since?: string },
  number
>(
  { permission: 'orders.view' },
  async (ctx, { since }) => {
    try {
      const today = new Date().toISOString().split('T')[0]

      // Pedidos con next_payment_date <= hoy (y > since si se proporciona)
      let orderQ = ctx.adminClient
        .from('tailoring_order_payments')
        .select('tailoring_order_id', { count: 'exact', head: true })
        .lte('next_payment_date', today)
        .not('next_payment_date', 'is', null)

      if (since) orderQ = orderQ.gt('next_payment_date', since)

      const { count: orderCount } = await orderQ

      // Ventas con next_payment_date <= hoy
      let saleQ = ctx.adminClient
        .from('sale_payments')
        .select('sale_id', { count: 'exact', head: true })
        .lte('next_payment_date', today)
        .not('next_payment_date', 'is', null)

      if (since) saleQ = saleQ.gt('next_payment_date', since)

      const { count: saleCount } = await saleQ

      return success((orderCount ?? 0) + (saleCount ?? 0))
    } catch (e) {
      console.error('[getOverduePaymentsCount] unexpected:', e)
      return failure('Error al obtener conteo')
    }
  }
)
