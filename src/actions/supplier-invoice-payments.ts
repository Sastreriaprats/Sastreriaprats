'use server'

import { protectedAction } from '@/lib/server/action-wrapper'
import { success, failure } from '@/lib/errors'
import { serializeForServerAction } from '@/lib/server/serialize'
import {
  SUPPLIER_PAYMENT_METHOD_LABEL,
  type SupplierPaymentMethod,
} from '@/lib/constants/supplier-payment-methods'

const PERMISSION = 'supplier_invoices.manage'
const TABLE = 'ap_supplier_invoice_payments'
const INVOICES_TABLE = 'ap_supplier_invoices'

export type SupplierInvoicePayment = {
  id: string
  supplier_invoice_id: string
  payment_date: string
  payment_method: SupplierPaymentMethod | string
  amount: number
  reference: string | null
  notes: string | null
  created_by: string | null
  created_at: string
}

export type SupplierVencimientoRow = {
  id: string
  supplier_id: string | null
  supplier_name: string
  supplier_cif: string | null
  invoice_number: string
  invoice_date: string
  due_date: string
  total_amount: number
  amount_paid: number
  amount_pending: number
  status: string
  last_payment_date: string | null
  last_payment_method: string | null
  notes: string | null
  days_overdue: number
  created_at: string
}

export type SupplierVencimientosKpis = {
  totalPendiente: number
  totalVencidas: number
  totalProximas30: number
  countPendientes: number
  countVencidas: number
  countProximas30: number
  countPagadasEsteMes: number
}

const today = () => new Date().toISOString().slice(0, 10)

// ─── Registrar pago ──────────────────────────────────────────────────────────

export const registerSupplierInvoicePayment = protectedAction<
  {
    supplier_invoice_id: string
    amount: number
    payment_date?: string
    payment_method?: SupplierPaymentMethod
    reference?: string | null
    notes?: string | null
    create_accounting_entry?: boolean
  },
  { id: string; amount_paid: number; amount_pending: number; status: string }
>(
  {
    permission: PERMISSION,
    auditModule: 'accounting',
    auditAction: 'payment',
    auditEntity: 'supplier_invoice',
  },
  async (ctx, input) => {
    if (!input.supplier_invoice_id) return failure('Factura no indicada', 'VALIDATION')
    const amount = Number(input.amount)
    if (!Number.isFinite(amount) || amount <= 0) {
      return failure('El importe debe ser mayor que 0', 'VALIDATION')
    }

    const { data: invoice, error: invErr } = await ctx.adminClient
      .from(INVOICES_TABLE)
      .select('id, total_amount, supplier_name, invoice_number')
      .eq('id', input.supplier_invoice_id)
      .maybeSingle()
    if (invErr || !invoice) return failure(invErr?.message || 'Factura no encontrada')

    const { data: existingPays } = await ctx.adminClient
      .from(TABLE)
      .select('amount')
      .eq('supplier_invoice_id', input.supplier_invoice_id)

    const currentPaid = (existingPays || []).reduce(
      (s: number, p: any) => s + Number(p.amount ?? 0),
      0,
    )
    const total = Number((invoice as any).total_amount ?? 0)
    const pending = Math.max(0, total - currentPaid)
    if (amount > pending + 0.01) {
      return failure(`El importe supera el pendiente (${pending.toFixed(2)}€)`, 'VALIDATION')
    }

    const paymentDate = input.payment_date || today()
    const paymentMethod = (input.payment_method || 'transfer') as SupplierPaymentMethod

    let manualTransactionId: string | null = null
    if (input.create_accounting_entry !== false) {
      const mtPayload = {
        type: 'expense',
        date: paymentDate,
        description: `Pago factura ${(invoice as any).invoice_number} · ${(invoice as any).supplier_name}`,
        category: 'proveedores',
        amount,
        tax_rate: 0,
        tax_amount: 0,
        total: amount,
        notes: `Método: ${SUPPLIER_PAYMENT_METHOD_LABEL[paymentMethod] ?? paymentMethod}${input.reference ? ` · Ref: ${input.reference}` : ''}`,
        created_by: ctx.userId,
      }
      const { data: mt, error: mtErr } = await ctx.adminClient
        .from('manual_transactions')
        .insert(mtPayload)
        .select('id')
        .single()
      if (mtErr) {
        console.error('[registerSupplierInvoicePayment] manual_transactions error:', mtErr.message)
      } else if (mt) {
        manualTransactionId = String((mt as any).id)
      }
    }

    const { data: pay, error: payErr } = await ctx.adminClient
      .from(TABLE)
      .insert({
        supplier_invoice_id: input.supplier_invoice_id,
        payment_date: paymentDate,
        payment_method: paymentMethod,
        amount,
        reference: input.reference?.trim() || null,
        notes: input.notes?.trim() || null,
        manual_transaction_id: manualTransactionId,
        created_by: ctx.userId,
      })
      .select('id')
      .single()
    if (payErr) {
      if (manualTransactionId) {
        await ctx.adminClient.from('manual_transactions').delete().eq('id', manualTransactionId)
      }
      return failure(payErr.message || 'Error al registrar pago')
    }

    const newPaid = currentPaid + amount
    const newPending = Math.max(0, total - newPaid)
    const newStatus = newPaid >= total - 0.005 ? 'pagada' : newPaid > 0 ? 'parcial' : 'pendiente'

    return success({
      id: String((pay as any).id),
      amount_paid: Math.round(newPaid * 100) / 100,
      amount_pending: Math.round(newPending * 100) / 100,
      status: newStatus,
    })
  },
)

// ─── Listado de pagos de una factura ──────────────────────────────────────────

export const listSupplierInvoicePayments = protectedAction<
  { supplier_invoice_id: string },
  SupplierInvoicePayment[]
>(
  { permission: PERMISSION, auditModule: 'accounting' },
  async (ctx, { supplier_invoice_id }) => {
    if (!supplier_invoice_id) return success([])
    const { data, error } = await ctx.adminClient
      .from(TABLE)
      .select('id, supplier_invoice_id, payment_date, payment_method, amount, reference, notes, created_by, created_at')
      .eq('supplier_invoice_id', supplier_invoice_id)
      .order('payment_date', { ascending: false })
      .order('created_at', { ascending: false })
    if (error) return failure(error.message)
    return success(serializeForServerAction(data || []) as SupplierInvoicePayment[])
  },
)

// ─── Eliminar pago ───────────────────────────────────────────────────────────

export const deleteSupplierInvoicePayment = protectedAction<{ id: string }, void>(
  {
    permission: PERMISSION,
    auditModule: 'accounting',
    auditAction: 'delete',
    auditEntity: 'supplier_invoice_payment',
  },
  async (ctx, { id }) => {
    if (!id) return failure('Pago no indicado', 'VALIDATION')

    const { data: existing } = await ctx.adminClient
      .from(TABLE)
      .select('manual_transaction_id')
      .eq('id', id)
      .maybeSingle()

    const mtId = (existing as any)?.manual_transaction_id ?? null

    const { error } = await ctx.adminClient.from(TABLE).delete().eq('id', id)
    if (error) return failure(error.message || 'Error al eliminar pago')

    if (mtId) {
      await ctx.adminClient.from('manual_transactions').delete().eq('id', mtId)
    }

    return success(undefined)
  },
)

// ─── KPIs de la sección Vencimientos ─────────────────────────────────────────

export const getSupplierVencimientosKpis = protectedAction<
  void,
  SupplierVencimientosKpis
>(
  { permission: PERMISSION, auditModule: 'accounting' },
  async (ctx) => {
    const t = today()
    const startMonth = t.slice(0, 8) + '01'
    const endMonth = t.slice(0, 8) + '31'
    const in30 = new Date()
    in30.setDate(in30.getDate() + 30)
    const in30Str = in30.toISOString().slice(0, 10)

    const { data: invoices, error: invErr } = await ctx.adminClient
      .from(INVOICES_TABLE)
      .select('id, total_amount, status, due_date, payment_date')
    if (invErr) return failure(invErr.message)

    const invoiceIds = (invoices || []).map((r: any) => String(r.id))
    const paidMap = new Map<string, number>()
    if (invoiceIds.length > 0) {
      const { data: pays } = await ctx.adminClient
        .from(TABLE)
        .select('supplier_invoice_id, amount')
        .in('supplier_invoice_id', invoiceIds)
      for (const p of (pays || []) as any[]) {
        const key = String(p.supplier_invoice_id)
        paidMap.set(key, (paidMap.get(key) ?? 0) + Number(p.amount ?? 0))
      }
    }

    let totalPendiente = 0
    let totalVencidas = 0
    let totalProximas30 = 0
    let countPendientes = 0
    let countVencidas = 0
    let countProximas30 = 0
    let countPagadasEsteMes = 0

    for (const r of (invoices || []) as any[]) {
      const total = Number(r.total_amount ?? 0)
      const paid = paidMap.get(String(r.id)) ?? 0
      const pending = Math.max(0, total - paid)
      if (r.status === 'pagada') {
        if (r.payment_date && r.payment_date >= startMonth && r.payment_date <= endMonth) {
          countPagadasEsteMes++
        }
        continue
      }
      if (pending <= 0) continue
      totalPendiente += pending
      countPendientes++
      if (r.due_date < t) {
        totalVencidas += pending
        countVencidas++
      } else if (r.due_date <= in30Str) {
        totalProximas30 += pending
        countProximas30++
      }
    }

    return success({
      totalPendiente: Math.round(totalPendiente * 100) / 100,
      totalVencidas: Math.round(totalVencidas * 100) / 100,
      totalProximas30: Math.round(totalProximas30 * 100) / 100,
      countPendientes,
      countVencidas,
      countProximas30,
      countPagadasEsteMes,
    })
  },
)

// ─── Listado de vencimientos (facturas con estado pendiente/parcial/vencida) ──

export const listSupplierVencimientos = protectedAction<
  {
    search?: string
    status?: 'all' | 'pendiente' | 'parcial' | 'vencida' | 'pagada'
    onlyOverdue?: boolean
  },
  SupplierVencimientoRow[]
>(
  { permission: PERMISSION, auditModule: 'accounting' },
  async (ctx, { search, status = 'all', onlyOverdue = false }) => {
    let q = ctx.adminClient
      .from(INVOICES_TABLE)
      .select('id, supplier_id, supplier_name, supplier_cif, invoice_number, invoice_date, due_date, total_amount, status, notes, created_at')
      .order('due_date', { ascending: true })
      .limit(500)

    if (status === 'pendiente' || status === 'parcial' || status === 'pagada') {
      q = q.eq('status', status)
    } else if (status === 'vencida') {
      q = q.lt('due_date', today()).in('status', ['pendiente', 'parcial'])
    } else {
      q = q.in('status', ['pendiente', 'parcial', 'vencida'])
    }

    const term = (search ?? '').trim()
    if (term) {
      q = q.or(`supplier_name.ilike.%${term}%,invoice_number.ilike.%${term}%`)
    }

    const { data: invoices, error: invErr } = await q
    if (invErr) return failure(invErr.message)

    const invoiceIds = (invoices || []).map((r: any) => String(r.id))
    const payMap = new Map<string, { paid: number; last_date: string | null; last_method: string | null }>()
    if (invoiceIds.length > 0) {
      const { data: pays } = await ctx.adminClient
        .from(TABLE)
        .select('supplier_invoice_id, amount, payment_date, payment_method')
        .in('supplier_invoice_id', invoiceIds)
        .order('payment_date', { ascending: false })
      for (const p of (pays || []) as any[]) {
        const key = String(p.supplier_invoice_id)
        const prev = payMap.get(key) ?? { paid: 0, last_date: null, last_method: null }
        prev.paid += Number(p.amount ?? 0)
        if (!prev.last_date && p.payment_date) {
          prev.last_date = String(p.payment_date)
          prev.last_method = p.payment_method ? String(p.payment_method) : null
        }
        payMap.set(key, prev)
      }
    }

    const todayStr = today()
    const rows: SupplierVencimientoRow[] = []
    for (const r of (invoices || []) as any[]) {
      const total = Number(r.total_amount ?? 0)
      const agg = payMap.get(String(r.id)) ?? { paid: 0, last_date: null, last_method: null }
      const paid = Math.round(agg.paid * 100) / 100
      const pending = Math.max(0, Math.round((total - paid) * 100) / 100)
      if (status !== 'pagada' && pending <= 0) continue

      const due = String(r.due_date ?? '')
      const daysOverdue = due && due < todayStr
        ? Math.floor((new Date(todayStr).getTime() - new Date(due).getTime()) / 86400000)
        : 0

      if (onlyOverdue && daysOverdue <= 0) continue

      rows.push({
        id: String(r.id),
        supplier_id: r.supplier_id ? String(r.supplier_id) : null,
        supplier_name: String(r.supplier_name ?? ''),
        supplier_cif: r.supplier_cif ? String(r.supplier_cif) : null,
        invoice_number: String(r.invoice_number ?? ''),
        invoice_date: String(r.invoice_date ?? ''),
        due_date: due,
        total_amount: total,
        amount_paid: paid,
        amount_pending: pending,
        status: String(r.status ?? 'pendiente'),
        last_payment_date: agg.last_date,
        last_payment_method: agg.last_method,
        notes: r.notes ? String(r.notes) : null,
        days_overdue: daysOverdue,
        created_at: String(r.created_at ?? ''),
      })
    }

    return success(rows)
  },
)

// ─── Map de importe pagado por facturas (para listados) ──────────────────────

export const getSupplierInvoicesPaidMap = protectedAction<
  { invoice_ids: string[] },
  Record<string, number>
>(
  { permission: PERMISSION, auditModule: 'accounting' },
  async (ctx, { invoice_ids }) => {
    const ids = (invoice_ids || []).filter(Boolean)
    if (ids.length === 0) return success({} as Record<string, number>)
    const { data, error } = await ctx.adminClient
      .from(TABLE)
      .select('supplier_invoice_id, amount')
      .in('supplier_invoice_id', ids)
    if (error) return failure(error.message)
    const result: Record<string, number> = {}
    for (const p of (data || []) as any[]) {
      const key = String(p.supplier_invoice_id)
      result[key] = (result[key] ?? 0) + Number(p.amount ?? 0)
    }
    for (const k of Object.keys(result)) result[k] = Math.round(result[k] * 100) / 100
    return success(result)
  },
)

// ─── Pendiente de pago a un proveedor concreto (para ficha proveedor) ──────────

export const getSupplierPendingAp = protectedAction<
  { supplier_id: string },
  {
    total_pending: number
    count_pending: number
    count_overdue: number
    overdue_pending: number
    invoices: SupplierVencimientoRow[]
  }
>(
  { permission: PERMISSION, auditModule: 'accounting' },
  async (ctx, { supplier_id }) => {
    if (!supplier_id) {
      return success({ total_pending: 0, count_pending: 0, count_overdue: 0, overdue_pending: 0, invoices: [] })
    }

    const { data: invoices, error: invErr } = await ctx.adminClient
      .from(INVOICES_TABLE)
      .select('id, supplier_id, supplier_name, supplier_cif, invoice_number, invoice_date, due_date, total_amount, status, notes, created_at')
      .eq('supplier_id', supplier_id)
      .in('status', ['pendiente', 'parcial', 'vencida'])
      .order('due_date', { ascending: true })
    if (invErr) return failure(invErr.message)

    const invoiceIds = (invoices || []).map((r: any) => String(r.id))
    const payMap = new Map<string, { paid: number; last_date: string | null; last_method: string | null }>()
    if (invoiceIds.length > 0) {
      const { data: pays } = await ctx.adminClient
        .from(TABLE)
        .select('supplier_invoice_id, amount, payment_date, payment_method')
        .in('supplier_invoice_id', invoiceIds)
        .order('payment_date', { ascending: false })
      for (const p of (pays || []) as any[]) {
        const key = String(p.supplier_invoice_id)
        const prev = payMap.get(key) ?? { paid: 0, last_date: null, last_method: null }
        prev.paid += Number(p.amount ?? 0)
        if (!prev.last_date && p.payment_date) {
          prev.last_date = String(p.payment_date)
          prev.last_method = p.payment_method ? String(p.payment_method) : null
        }
        payMap.set(key, prev)
      }
    }

    const todayStr = today()
    let total_pending = 0
    let overdue_pending = 0
    let count_overdue = 0
    const rows: SupplierVencimientoRow[] = []

    for (const r of (invoices || []) as any[]) {
      const total = Number(r.total_amount ?? 0)
      const agg = payMap.get(String(r.id)) ?? { paid: 0, last_date: null, last_method: null }
      const paid = Math.round(agg.paid * 100) / 100
      const pending = Math.max(0, Math.round((total - paid) * 100) / 100)
      if (pending <= 0) continue

      const due = String(r.due_date ?? '')
      const daysOverdue = due && due < todayStr
        ? Math.floor((new Date(todayStr).getTime() - new Date(due).getTime()) / 86400000)
        : 0

      total_pending += pending
      if (daysOverdue > 0) {
        overdue_pending += pending
        count_overdue++
      }

      rows.push({
        id: String(r.id),
        supplier_id: r.supplier_id ? String(r.supplier_id) : null,
        supplier_name: String(r.supplier_name ?? ''),
        supplier_cif: r.supplier_cif ? String(r.supplier_cif) : null,
        invoice_number: String(r.invoice_number ?? ''),
        invoice_date: String(r.invoice_date ?? ''),
        due_date: due,
        total_amount: total,
        amount_paid: paid,
        amount_pending: pending,
        status: String(r.status ?? 'pendiente'),
        last_payment_date: agg.last_date,
        last_payment_method: agg.last_method,
        notes: r.notes ? String(r.notes) : null,
        days_overdue: daysOverdue,
        created_at: String(r.created_at ?? ''),
      })
    }

    return success({
      total_pending: Math.round(total_pending * 100) / 100,
      count_pending: rows.length,
      count_overdue,
      overdue_pending: Math.round(overdue_pending * 100) / 100,
      invoices: rows,
    })
  },
)
