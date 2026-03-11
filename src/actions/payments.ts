'use server'

import { revalidatePath } from 'next/cache'
import { protectedAction } from '@/lib/server/action-wrapper'
import { success, failure } from '@/lib/errors'
import { serializeForServerAction } from '@/lib/server/serialize'

// ─── Types ────────────────────────────────────────────────────────────────────

export type PaymentMethod = 'cash' | 'card' | 'transfer' | 'check'

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
}

export interface AddSalePaymentInput {
  sale_id: string
  payment_method: PaymentMethod
  amount: number
  reference?: string
  next_payment_date?: string
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
    try {
      const { data: payment, error: insertError } = await ctx.adminClient
        .from('tailoring_order_payments')
        .insert({
          tailoring_order_id: input.tailoring_order_id,
          payment_date: input.payment_date,
          payment_method: input.payment_method,
          amount: input.amount,
          reference: input.reference ?? null,
          notes: input.notes ?? null,
          next_payment_date: input.next_payment_date ?? null,
          created_by: ctx.userId,
        })
        .select('id, tailoring_order_id, payment_date, payment_method, amount, reference, notes, next_payment_date, created_by, created_at')
        .single()

      if (insertError) {
        console.error('[addOrderPayment] insert:', insertError)
        return failure(insertError.message)
      }

      // Recalcular total_paid desde los pagos registrados
      const orderId = input.tailoring_order_id
      const { data: pagos } = await ctx.adminClient
        .from('tailoring_order_payments')
        .select('amount')
        .eq('tailoring_order_id', orderId)

      const nuevoTotalPaid = pagos?.reduce((sum, p) => sum + Number(p.amount), 0) ?? 0

      await ctx.adminClient
        .from('tailoring_orders')
        .update({ total_paid: nuevoTotalPaid })
        .eq('id', orderId)

      const { data: orderRow } = await ctx.adminClient
        .from('tailoring_orders')
        .select('order_number')
        .eq('id', input.tailoring_order_id)
        .single()
      const orderNumber = (orderRow as any)?.order_number ?? ''
      const methodLabels: Record<string, string> = { cash: 'efectivo', card: 'tarjeta', transfer: 'transferencia', check: 'cheque', bizum: 'bizum', voucher: 'vale' }
      const methodLabel = methodLabels[input.payment_method] ?? input.payment_method

      const importe = Number(input.amount)
      const baseAmount = importe / 1.21
      const taxAmountManual = importe - baseAmount
      await ctx.adminClient.from('manual_transactions').insert({
        type: 'income',
        date: input.payment_date,
        description: 'Pago pedido - ' + orderNumber,
        category: 'sastreria',
        amount: baseAmount,
        tax_rate: 21,
        tax_amount: taxAmountManual,
        total: importe,
        notes: 'Pedido ' + orderNumber + ' - ' + methodLabel,
        created_by: ctx.userId,
      })

      revalidatePath(`/sastre/pedidos/${input.tailoring_order_id}`)

      const auditDescription = `Pago ${Number(input.amount).toFixed(2)}€ · Pedido ${orderNumber} · Método: ${methodLabel}`
      return success(serializeForServerAction({ ...payment!, auditDescription }))
    } catch (e) {
      console.error('[addOrderPayment] unexpected:', e)
      return failure('Error al registrar pago')
    }
  }
)

export const deleteOrderPayment = protectedAction<{ payment_id: string; tailoring_order_id: string }, void>(
  { permission: 'orders.edit', auditAction: 'delete', auditModule: 'orders' },
  async (ctx, { payment_id, tailoring_order_id }) => {
    try {
      const { error } = await ctx.adminClient
        .from('tailoring_order_payments')
        .delete()
        .eq('id', payment_id)

      if (error) {
        console.error('[deleteOrderPayment]', error)
        return failure(error.message)
      }

      // Recalcular totales tras eliminar
      const { data: agg } = await ctx.adminClient
        .from('tailoring_order_payments')
        .select('amount')
        .eq('tailoring_order_id', tailoring_order_id)

      const totalPaid = (agg ?? []).reduce((sum, p) => sum + Number(p.amount), 0)

      const { data: order } = await ctx.adminClient
        .from('tailoring_orders')
        .select('total')
        .eq('id', tailoring_order_id)
        .single()

      if (order) {
        const totalPending = Math.max(0, Number(order.total) - totalPaid)
        await ctx.adminClient
          .from('tailoring_orders')
          .update({ total_paid: totalPaid, total_pending: totalPending })
          .eq('id', tailoring_order_id)
      }

      return success(undefined)
    } catch (e) {
      console.error('[deleteOrderPayment] unexpected:', e)
      return failure('Error al eliminar pago')
    }
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
      const { data: payment, error: insertError } = await ctx.adminClient
        .from('sale_payments')
        .insert({
          sale_id: input.sale_id,
          payment_method: input.payment_method,
          amount: input.amount,
          reference: input.reference ?? null,
          next_payment_date: input.next_payment_date ?? null,
        })
        .select('id, sale_id, payment_method, amount, reference, next_payment_date, created_at')
        .single()

      if (insertError) {
        console.error('[addSalePayment] insert:', insertError)
        return failure(insertError.message)
      }

      // Recalcular amount_paid y payment_status
      const { data: agg } = await ctx.adminClient
        .from('sale_payments')
        .select('amount')
        .eq('sale_id', input.sale_id)

      const { data: sale } = await ctx.adminClient
        .from('sales')
        .select('total')
        .eq('id', input.sale_id)
        .single()

      if (agg && sale) {
        const amountPaid = agg.reduce((sum, p) => sum + Number(p.amount), 0)
        const total = Number(sale.total)
        const paymentStatus =
          amountPaid >= total ? 'paid' : amountPaid > 0 ? 'partial' : 'pending'

        await ctx.adminClient
          .from('sales')
          .update({ amount_paid: amountPaid, payment_status: paymentStatus })
          .eq('id', input.sale_id)
      }

      return success(serializeForServerAction(payment!))
    } catch (e) {
      console.error('[addSalePayment] unexpected:', e)
      return failure('Error al registrar pago')
    }
  }
)

// ─── Cobros pendientes (para el panel) ────────────────────────────────────────

export interface PendingPaymentRow {
  id: string
  entity_type: 'tailoring_order' | 'sale'
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
  store_name: string | null
}

export const getPendingPayments = protectedAction<
  { type?: 'all' | 'orders' | 'sales'; search?: string },
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
          .select('id, order_number, total, total_paid, total_pending, created_at, client_id, clients(id, full_name), stores(name)')
          .gt('total_pending', 0)
          .not('status', 'in', '("delivered","cancelled")')
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
              store_name: store?.name ?? null,
            })
          }
        }
      }

      if (type === 'all' || type === 'sales') {
        let query = ctx.adminClient
          .from('sales')
          .select('id, ticket_number, total, amount_paid, payment_status, created_at, client_id, clients(id, full_name), stores(name)')
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
        .select('id, order_number, total, total_paid, total_pending, created_at, client_id, clients(id, full_name), stores(name)')
        .eq('client_id', client_id)
        .gt('total_pending', 0)
        .not('status', 'in', '("delivered","cancelled")')
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
          store_name: store?.name ?? null,
        })
      }

      const { data: sales } = await ctx.adminClient
        .from('sales')
        .select('id, ticket_number, total, amount_paid, payment_status, created_at, client_id, clients(id, full_name), stores(name)')
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
