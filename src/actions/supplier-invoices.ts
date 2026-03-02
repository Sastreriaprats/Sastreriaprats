'use server'

import { protectedAction } from '@/lib/server/action-wrapper'
import { success, failure } from '@/lib/errors'

const PERMISSION = 'supplier_invoices.manage'
const TABLE = 'ap_supplier_invoices'

export type ApSupplierInvoiceRow = {
  id: string
  store_id: string | null
  supplier_name: string
  supplier_cif: string | null
  invoice_number: string
  invoice_date: string
  due_date: string
  amount: number
  tax_amount: number
  total_amount: number
  currency: string
  status: string
  payment_date: string | null
  payment_method: string | null
  notes: string | null
  attachment_url: string | null
  created_at: string
}

export type ApSupplierInvoiceInput = {
  store_id?: string | null
  supplier_name: string
  supplier_cif?: string | null
  invoice_number: string
  invoice_date: string
  due_date: string
  amount: number
  tax_amount?: number
  total_amount: number
  payment_method?: string | null
  notes?: string | null
  attachment_url?: string | null
}

export type SupplierInvoicesKpis = {
  totalPendiente: number
  countVencidas: number
  countProximas30: number
  countPagadasEsteMes: number
}

const today = () => new Date().toISOString().slice(0, 10)

export const getSupplierInvoicesKpis = protectedAction<void, SupplierInvoicesKpis>(
  { permission: PERMISSION, auditModule: 'accounting' },
  async (ctx) => {
    const t = today()
    const startMonth = t.slice(0, 8) + '01'
    const endMonth = t.slice(0, 8) + '31'
    const in30 = new Date()
    in30.setDate(in30.getDate() + 30)
    const in30Str = in30.toISOString().slice(0, 10)

    const { data: all } = await ctx.adminClient
      .from(TABLE)
      .select('total_amount, status, due_date, payment_date')

    const rows = (all || []) as { total_amount: number; status: string; due_date: string; payment_date: string | null }[]
    let totalPendiente = 0
    let countVencidas = 0
    let countProximas30 = 0
    let countPagadasEsteMes = 0

    for (const r of rows) {
      const amt = Number(r.total_amount ?? 0)
      if (r.status === 'pendiente' || r.status === 'vencida' || r.status === 'parcial') {
        totalPendiente += amt
        if (r.due_date < t) countVencidas++
        else if (r.due_date <= in30Str) countProximas30++
      }
      if (r.status === 'pagada' && r.payment_date && r.payment_date >= startMonth && r.payment_date <= endMonth) {
        countPagadasEsteMes++
      }
    }

    return success({
      totalPendiente,
      countVencidas,
      countProximas30,
      countPagadasEsteMes,
    })
  }
)

export const getOverdueSupplierInvoicesCount = protectedAction<void, number>(
  { permission: PERMISSION, auditModule: 'accounting' },
  async (ctx) => {
    const t = today()
    const { count } = await ctx.adminClient
      .from(TABLE)
      .select('*', { count: 'exact', head: true })
      .lt('due_date', t)
      .in('status', ['pendiente', 'vencida'])
    return success(count ?? 0)
  }
)

export const listSupplierInvoices = protectedAction<
  { status?: string; supplierSearch?: string; dateFrom?: string; dateTo?: string },
  ApSupplierInvoiceRow[]
>(
  { permission: PERMISSION, auditModule: 'accounting' },
  async (ctx, { status, supplierSearch, dateFrom, dateTo }) => {
    let q = ctx.adminClient
      .from(TABLE)
      .select('*')
      .order('due_date', { ascending: false })

    if (status && status !== 'all') q = q.eq('status', status)
    if (supplierSearch && supplierSearch.trim()) {
      q = q.ilike('supplier_name', `%${supplierSearch.trim()}%`)
    }
    if (dateFrom) q = q.gte('due_date', dateFrom)
    if (dateTo) q = q.lte('due_date', dateTo)

    const { data, error } = await q
    if (error) return failure(error.message)

    const list = (data || []).map((r: Record<string, unknown>) => ({
      id: String(r.id),
      store_id: r.store_id != null ? String(r.store_id) : null,
      supplier_name: String(r.supplier_name ?? ''),
      supplier_cif: r.supplier_cif != null ? String(r.supplier_cif) : null,
      invoice_number: String(r.invoice_number ?? ''),
      invoice_date: String(r.invoice_date ?? ''),
      due_date: String(r.due_date ?? ''),
      amount: Number(r.amount ?? 0),
      tax_amount: Number(r.tax_amount ?? 0),
      total_amount: Number(r.total_amount ?? 0),
      currency: String(r.currency ?? 'EUR'),
      status: String(r.status ?? 'pendiente'),
      payment_date: r.payment_date != null ? String(r.payment_date) : null,
      payment_method: r.payment_method != null ? String(r.payment_method) : null,
      notes: r.notes != null ? String(r.notes) : null,
      attachment_url: r.attachment_url != null ? String(r.attachment_url) : null,
      created_at: String(r.created_at ?? ''),
    }))
    return success(list)
  }
)

export const createSupplierInvoiceAction = protectedAction<ApSupplierInvoiceInput, { id: string }>(
  {
    permission: PERMISSION,
    auditModule: 'accounting',
    auditAction: 'create',
    auditEntity: 'supplier_invoice',
  },
  async (ctx, input) => {
    if (!input.supplier_name?.trim()) return failure('El nombre del proveedor es obligatorio')
    if (!input.invoice_number?.trim()) return failure('El número de factura es obligatorio')
    if (new Date(input.due_date) <= new Date(input.invoice_date)) {
      return failure('La fecha de vencimiento debe ser posterior a la fecha de factura')
    }
    if (Number(input.total_amount) <= 0) return failure('El total debe ser mayor que 0')

    const { data, error } = await ctx.adminClient
      .from(TABLE)
      .insert({
        store_id: input.store_id || null,
        supplier_name: input.supplier_name.trim(),
        supplier_cif: input.supplier_cif?.trim() || null,
        invoice_number: input.invoice_number.trim(),
        invoice_date: input.invoice_date,
        due_date: input.due_date,
        amount: Number(input.amount),
        tax_amount: Number(input.tax_amount ?? 0),
        total_amount: Number(input.total_amount),
        payment_method: input.payment_method?.trim() || null,
        notes: input.notes?.trim() || null,
        attachment_url: input.attachment_url?.trim() || null,
        created_by: ctx.userId,
      })
      .select('id')
      .single()

    if (error) return failure(error.message)
    return success({ id: String(data.id) })
  }
)

export const updateSupplierInvoiceAction = protectedAction<ApSupplierInvoiceInput & { id: string }, void>(
  {
    permission: PERMISSION,
    auditModule: 'accounting',
    auditAction: 'update',
    auditEntity: 'supplier_invoice',
  },
  async (ctx, input) => {
    const { id, ...rest } = input
    if (!rest.supplier_name?.trim()) return failure('El nombre del proveedor es obligatorio')
    if (new Date(rest.due_date) <= new Date(rest.invoice_date)) {
      return failure('La fecha de vencimiento debe ser posterior a la fecha de factura')
    }
    if (Number(rest.total_amount) <= 0) return failure('El total debe ser mayor que 0')

    const { error } = await ctx.adminClient
      .from(TABLE)
      .update({
        store_id: rest.store_id || null,
        supplier_name: rest.supplier_name.trim(),
        supplier_cif: rest.supplier_cif?.trim() || null,
        invoice_number: rest.invoice_number.trim(),
        invoice_date: rest.invoice_date,
        due_date: rest.due_date,
        amount: Number(rest.amount),
        tax_amount: Number(rest.tax_amount ?? 0),
        total_amount: Number(rest.total_amount),
        payment_method: rest.payment_method?.trim() || null,
        notes: rest.notes?.trim() || null,
        attachment_url: rest.attachment_url?.trim() || null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)

    if (error) return failure(error.message)
    return success(undefined)
  }
)

export const markSupplierInvoicePaidAction = protectedAction<
  { id: string; payment_date: string; payment_method?: string },
  void
>(
  {
    permission: PERMISSION,
    auditModule: 'accounting',
    auditAction: 'payment',
    auditEntity: 'supplier_invoice',
  },
  async (ctx, { id, payment_date, payment_method }) => {
    const { error } = await ctx.adminClient
      .from(TABLE)
      .update({
        status: 'pagada',
        payment_date,
        payment_method: payment_method || null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)

    if (error) return failure(error.message)
    return success(undefined)
  }
)

export const importSupplierInvoicesCsvAction = protectedAction<
  { rows: Array<Record<string, string>> },
  { created: number; errors: string[] }
>(
  {
    permission: PERMISSION,
    auditModule: 'accounting',
    auditAction: 'import',
    auditEntity: 'supplier_invoice',
  },
  async (ctx, { rows }) => {
    const errors: string[] = []
    let created = 0
    const todayStr = today()

    for (let i = 0; i < rows.length; i++) {
      const r = rows[i]
      const supplier_name = (r.proveedor ?? r.supplier_name ?? '').trim()
      const cif = (r.cif ?? r.supplier_cif ?? '').trim() || null
      const invoice_number = (r.numero_factura ?? r.invoice_number ?? '').trim()
      const invoice_date = (r.fecha_factura ?? r.invoice_date ?? '').trim()
      const due_date = (r.fecha_vencimiento ?? r.due_date ?? '').trim()
      const base = parseFloat(String(r.base ?? r.amount ?? 0).replace(',', '.')) || 0
      const ivaPct = parseFloat(String(r.iva ?? r.tax_rate ?? 21).replace(',', '.')) || 21
      const tax_amount = base * (ivaPct / 100)
      const total_amount = parseFloat(String(r.total ?? r.total_amount ?? 0).replace(',', '.')) || base + tax_amount
      const notes = (r.notas ?? r.notes ?? '').trim() || null

      if (!supplier_name || !invoice_number || !invoice_date || !due_date) {
        errors.push(`Fila ${i + 2}: faltan datos obligatorios`)
        continue
      }
      if (new Date(due_date) <= new Date(invoice_date)) {
        errors.push(`Fila ${i + 2}: fecha vencimiento debe ser posterior a fecha factura`)
        continue
      }
      if (total_amount <= 0) {
        errors.push(`Fila ${i + 2}: total debe ser mayor que 0`)
        continue
      }

      const { error } = await ctx.adminClient.from(TABLE).insert({
        supplier_name,
        supplier_cif: cif,
        invoice_number,
        invoice_date,
        due_date,
        amount: base,
        tax_amount,
        total_amount,
        notes,
        created_by: ctx.userId,
      })
      if (error) {
        errors.push(`Fila ${i + 2}: ${error.message}`)
      } else {
        created++
      }
    }

    return success({ created, errors })
  }
)

/** Eventos para calendario: id, title, start (date), status, total_amount */
export const getSupplierInvoicesForCalendar = protectedAction<
  { year: number; month: number },
  { id: string; title: string; start: string; status: string; total_amount: number; supplier_name: string }[]
>(
  { permission: PERMISSION, auditModule: 'accounting' },
  async (ctx, { year, month }) => {
    const start = `${year}-${String(month).padStart(2, '0')}-01`
    const endDate = new Date(year, month, 0)
    const end = `${year}-${String(month).padStart(2, '0')}-${String(endDate.getDate()).padStart(2, '0')}`

    const { data } = await ctx.adminClient
      .from(TABLE)
      .select('id, due_date, supplier_name, invoice_number, total_amount, status')
      .gte('due_date', start)
      .lte('due_date', end)
      .order('due_date')

    const list = (data || []).map((r: Record<string, unknown>) => ({
      id: String(r.id),
      title: `${(r as any).supplier_name ?? ''} - ${(r as any).invoice_number ?? ''} (${Number((r as any).total_amount ?? 0).toFixed(2)} €)`,
      start: String(r.due_date),
      status: String(r.status ?? 'pendiente'),
      total_amount: Number((r as any).total_amount ?? 0),
      supplier_name: String((r as any).supplier_name ?? ''),
    }))
    return success(list)
  }
)
