'use server'

import { protectedAction, type AdminClient } from '@/lib/server/action-wrapper'
import { success, failure } from '@/lib/errors'
import { normalizeSearchTerm } from '@/lib/utils'
import {
  buildInstallments,
  computeDueDate,
  replaceInvoiceInstallments,
} from '@/lib/server/supplier-payments'

const PERMISSION = 'supplier_invoices.manage'
const TABLE = 'ap_supplier_invoices'
const LINK_TABLE = 'ap_supplier_invoice_delivery_notes'
const LINES_TABLE = 'ap_supplier_invoice_lines'

// Defensa en profundidad: el filtro envía el SLUG (card, transfer…), pero datos
// históricos guardaron el método como ETIQUETA española ('Tarjeta', 'Transferencia'…).
// Tras la normalización solo deberían quedar slugs, pero el filtro acepta ambos por
// si se cuela algún valor sucio, para no volver a devolver vacío.
const PAYMENT_METHOD_ALIASES: Record<string, string[]> = {
  card: ['card', 'Tarjeta'],
  transfer: ['transfer', 'Transferencia'],
  direct_debit: ['direct_debit', 'Domiciliación'],
  bank_draft: ['bank_draft', 'Pagaré', 'Giro'],
  cash: ['cash', 'Efectivo'],
  check: ['check', 'Cheque'],
}

// Inverso: etiqueta/slug → slug canónico. Para NORMALIZAR al guardar y no volver a
// meter etiquetas en payment_method (origen del bug: listSuppliersForInvoice devolvía
// el método del proveedor labelizado y el form lo guardaba tal cual).
const PAYMENT_METHOD_LABEL_TO_SLUG: Record<string, string> = Object.fromEntries(
  Object.entries(PAYMENT_METHOD_ALIASES).flatMap(([slug, vals]) => vals.map((v) => [v, slug])),
)
function toPaymentMethodSlug(v: string | null | undefined): string | null {
  const t = (v ?? '').trim()
  if (!t) return null
  return PAYMENT_METHOD_LABEL_TO_SLUG[t] ?? t
}

export type ApSupplierInvoiceRow = {
  id: string
  store_id: string | null
  supplier_id: string | null
  supplier_name: string
  supplier_cif: string | null
  invoice_number: string
  invoice_date: string
  due_date: string
  amount: number
  tax_amount: number
  shipping_amount: number
  retention_rate: number
  retention_amount: number
  total_amount: number
  currency: string
  status: string
  payment_date: string | null
  payment_method: string | null
  notes: string | null
  attachment_url: string | null
  created_at: string
  is_rectifying?: boolean
  rectifies_invoice_id?: string | null
  rectification_reason?: string | null
  is_proforma?: boolean
}

export type ApSupplierInvoiceInput = {
  store_id?: string | null
  supplier_id?: string | null
  supplier_name: string
  supplier_cif?: string | null
  invoice_number: string
  invoice_date: string
  due_date?: string | null
  amount: number
  tax_amount?: number
  shipping_amount?: number
  retention_rate?: number
  retention_amount?: number
  total_amount: number
  payment_method?: string | null
  notes?: string | null
  attachment_url?: string | null
  delivery_note_ids?: string[]
  /** Cuotas explícitas para esta factura. Si viene con datos sustituye al
   * cálculo automático (buildInstallments). */
  installments?: Array<{ amount: number; due_date: string }>
  /** Líneas con base + IVA por factura. Si llega y tiene datos, se persisten
   * en ap_supplier_invoice_lines y la cabecera (amount/tax_amount) se
   * recalcula como Σ de las líneas. Si no llega o está vacío, comportamiento
   * legacy: se usa amount/tax_amount/tax_rate de cabecera. */
  lines?: Array<{
    description?: string | null
    base: number
    tax_rate: number
    sort_order?: number
  }>
  /** Abono/rectificativa recibida: si true, los importes son negativos y se
   * exige rectifies_invoice_id + rectification_reason (mín. 10 caracteres). */
  is_rectifying?: boolean
  rectifies_invoice_id?: string | null
  rectification_reason?: string | null
  /** Proforma de proveedor: documento SIN validez fiscal/contable. No cuenta para
   * IVA soportado, libro de recibidas, deuda/pagos ni asientos, y no genera cuotas
   * de vencimiento. Al llegar la factura real se edita la fila y se quita el flag. */
  is_proforma?: boolean
}

export type ApSupplierInvoiceLineRow = {
  id: string
  supplier_invoice_id: string
  description: string | null
  base: number
  tax_rate: number
  tax_amount: number
  sort_order: number
}

export type SupplierOptionForInvoice = {
  id: string
  name: string
  nif_cif: string | null
  payment_terms: string | null
  payment_days: number | null
  payment_method: string | null
  default_tax_rate: number
  custom_payment_plan: Array<{ amount: number; days: number | null }> | null
}

const SUPPLIER_PAYMENT_METHOD_LABEL: Record<string, string> = {
  transfer: 'Transferencia',
  direct_debit: 'Domiciliación',
  check: 'Cheque',
  cash: 'Efectivo',
  card: 'Tarjeta',
  bank_draft: 'Pagaré',
}

function supplierPaymentMethodLabel(code: string | null | undefined): string | null {
  if (!code) return null
  return SUPPLIER_PAYMENT_METHOD_LABEL[code] ?? null
}

export type UnlinkedDeliveryNoteOption = {
  id: string
  supplier_reference: string | null
  delivery_date: string | null
  status: string
  total_amount: number
  line_count: number
}

export type SupplierInvoicesKpis = {
  // Solo ap_supplier_invoices
  totalPendiente: number
  countVencidas: number
  countProximas30: number
  countPagadasEsteMes: number
  // Solo supplier_order_payment_schedule (cuotas de pedidos a proveedor)
  totalPendientePedidos: number
  countVencidasPedidos: number
  countProximas30Pedidos: number
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

    const [{ data: all }, { data: schedAll }] = await Promise.all([
      ctx.adminClient
        .from(TABLE)
        .select('total_amount, status, due_date, payment_date')
        .eq('is_proforma', false), // las proformas no son deuda
      ctx.adminClient
        .from('supplier_order_payment_schedule')
        .select('amount, is_paid, due_date, paid_at'),
    ])

    const rows = (all || []) as { total_amount: number; status: string; due_date: string; payment_date: string | null }[]
    // KPIs de facturas (ap_supplier_invoices) — separadas de cuotas de pedidos
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

    // KPIs separados de cuotas de pedidos a proveedor (supplier_order_payment_schedule)
    const schedRows = (schedAll || []) as { amount: number; is_paid: boolean; due_date: string; paid_at: string | null }[]
    let totalPendientePedidos = 0
    let countVencidasPedidos = 0
    let countProximas30Pedidos = 0
    for (const s of schedRows) {
      const amt = Number(s.amount ?? 0)
      if (!s.is_paid) {
        totalPendientePedidos += amt
        if (s.due_date < t) countVencidasPedidos++
        else if (s.due_date <= in30Str) countProximas30Pedidos++
      } else if (s.paid_at && s.paid_at >= startMonth && s.paid_at <= endMonth) {
        // "Pagadas este mes" agrega ambas fuentes (es la métrica de actividad de pago)
        countPagadasEsteMes++
      }
    }

    return success({
      totalPendiente,
      countVencidas,
      countProximas30,
      countPagadasEsteMes,
      totalPendientePedidos,
      countVencidasPedidos,
      countProximas30Pedidos,
    })
  }
)

export const getOverdueSupplierInvoicesCount = protectedAction<void, number>(
  { permission: PERMISSION, auditModule: 'accounting' },
  async (ctx) => {
    const t = today()
    const { count } = await ctx.adminClient
      .from('ap_supplier_invoice_due_dates')
      .select('*', { count: 'exact', head: true })
      .lt('due_date', t)
      .eq('is_paid', false)
      .gt('amount', 0)
    return success(count ?? 0)
  }
)

export const listSupplierInvoices = protectedAction<
  { status?: string; supplierSearch?: string; dateFrom?: string; dateTo?: string; paymentMethod?: string },
  ApSupplierInvoiceRow[]
>(
  { permission: PERMISSION, auditModule: 'accounting' },
  async (ctx, { status, supplierSearch, dateFrom, dateTo, paymentMethod }) => {
    let q = ctx.adminClient
      .from(TABLE)
      .select('*')
      .order('due_date', { ascending: false })

    if (status === 'vencida') {
      q = q.in('status', ['pendiente', 'parcial']).lt('due_date', new Date().toISOString().slice(0, 10))
    } else if (status && status !== 'all') {
      q = q.eq('status', status)
    }
    if (supplierSearch && supplierSearch.trim()) {
      const normalized = normalizeSearchTerm(supplierSearch)
      if (normalized) {
        q = q.ilike('search_text', `%${normalized}%`)
      }
    }
    if (dateFrom) q = q.gte('due_date', dateFrom)
    if (dateTo) q = q.lte('due_date', dateTo)
    if (paymentMethod && paymentMethod !== 'all') {
      if (paymentMethod === 'none') {
        q = q.is('payment_method', null)
      } else {
        // Tolerante a slug + etiqueta histórica (ver PAYMENT_METHOD_ALIASES).
        const aliases = PAYMENT_METHOD_ALIASES[paymentMethod] ?? [paymentMethod]
        q = q.in('payment_method', aliases)
      }
    }

    const { data, error } = await q
    if (error) return failure(error.message)

    const list = (data || []).map((r: Record<string, unknown>) => ({
      id: String(r.id),
      store_id: r.store_id != null ? String(r.store_id) : null,
      supplier_id: r.supplier_id != null ? String(r.supplier_id) : null,
      supplier_name: String(r.supplier_name ?? ''),
      supplier_cif: r.supplier_cif != null ? String(r.supplier_cif) : null,
      invoice_number: String(r.invoice_number ?? ''),
      invoice_date: String(r.invoice_date ?? ''),
      due_date: String(r.due_date ?? ''),
      amount: Number(r.amount ?? 0),
      tax_amount: Number(r.tax_amount ?? 0),
      shipping_amount: Number(r.shipping_amount ?? 0),
      retention_rate: Number(r.retention_rate ?? 0),
      retention_amount: Number(r.retention_amount ?? 0),
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

export const listSuppliersForInvoice = protectedAction<void, SupplierOptionForInvoice[]>(
  { permission: PERMISSION, auditModule: 'accounting' },
  async (ctx) => {
    const { data, error } = await ctx.adminClient
      .from('suppliers')
      .select('id, name, nif_cif, payment_terms, payment_days, payment_method, default_tax_rate, custom_payment_plan')
      .eq('is_active', true)
      .order('name', { ascending: true })
    if (error) return failure(error.message)
    const list = (data || []).map((r: Record<string, unknown>) => {
      const rawPlan = (r as any).custom_payment_plan
      const plan = Array.isArray(rawPlan)
        ? rawPlan
            .map((p: any) => ({
              amount: Number(p?.amount ?? 0),
              days: p?.days !== undefined && p?.days !== null && p?.days !== '' ? Number(p.days) : null,
            }))
            .filter((p: { amount: number }) => Number.isFinite(p.amount) && p.amount > 0)
        : null
      return {
        id: String(r.id),
        name: String(r.name ?? ''),
        nif_cif: r.nif_cif != null ? String(r.nif_cif) : null,
        payment_terms: r.payment_terms != null ? String(r.payment_terms) : null,
        payment_days: r.payment_days != null ? Number(r.payment_days) : null,
        payment_method: supplierPaymentMethodLabel(r.payment_method as string | null),
        default_tax_rate: r.default_tax_rate != null ? Number(r.default_tax_rate) : 21,
        custom_payment_plan: plan && plan.length > 0 ? plan : null,
      }
    })
    return success(list)
  }
)

export const listUnlinkedDeliveryNotesForSupplier = protectedAction<
  { supplierId: string; excludeInvoiceId?: string | null },
  UnlinkedDeliveryNoteOption[]
>(
  { permission: PERMISSION, auditModule: 'accounting' },
  async (ctx, { supplierId, excludeInvoiceId }) => {
    if (!supplierId?.trim()) return success([])

    const { data: linkedRows, error: linkedErr } = await ctx.adminClient
      .from(LINK_TABLE)
      .select('supplier_delivery_note_id, supplier_invoice_id')
    if (linkedErr) return failure(linkedErr.message)

    const linkedIds = new Set<string>()
    for (const r of (linkedRows || []) as any[]) {
      if (excludeInvoiceId && String(r.supplier_invoice_id) === excludeInvoiceId) continue
      linkedIds.add(String(r.supplier_delivery_note_id))
    }

    let query = ctx.adminClient
      .from('supplier_delivery_notes')
      .select(`
        id, supplier_reference, delivery_date, status, supplier_order_id,
        lines:supplier_delivery_note_lines(quantity_ordered, quantity_received, unit_price)
      `)
      .eq('supplier_id', supplierId.trim())
      .order('delivery_date', { ascending: false, nullsFirst: false })
      .order('created_at', { ascending: false })
      .limit(200)

    const { data, error } = await query
    if (error) return failure(error.message)

    const rows = (data || []) as any[]
    // Prefetch del total de los pedidos de proveedor asociados para usarlo
    // como fallback cuando el albarán no tiene líneas con importe propio
    // (flujo habitual: el importe vive en el pedido PEDPROV, no en el albarán).
    const orderIds = Array.from(
      new Set(rows.map((r) => (r.supplier_order_id ? String(r.supplier_order_id) : null)).filter(Boolean) as string[]),
    )
    const orderTotals = new Map<string, number>()
    if (orderIds.length > 0) {
      const { data: orders } = await ctx.adminClient
        .from('supplier_orders')
        .select('id, total')
        .in('id', orderIds)
      for (const o of (orders || []) as any[]) {
        orderTotals.set(String(o.id), Number(o.total ?? 0))
      }
    }

    const list: UnlinkedDeliveryNoteOption[] = []
    for (const row of rows) {
      if (linkedIds.has(String(row.id))) continue
      const lines = (row.lines || []) as Array<{ quantity_ordered: number | null; quantity_received: number | null; unit_price: string | number | null }>
      let total = 0
      for (const l of lines) {
        const qty = l.quantity_received != null ? Number(l.quantity_received) : Number(l.quantity_ordered ?? 0)
        const unit = l.unit_price != null ? Number(l.unit_price) : 0
        if (Number.isFinite(qty) && Number.isFinite(unit)) total += qty * unit
      }
      if (total <= 0 && row.supplier_order_id) {
        const fallback = orderTotals.get(String(row.supplier_order_id))
        if (fallback && Number.isFinite(fallback)) total = fallback
      }
      list.push({
        id: String(row.id),
        supplier_reference: row.supplier_reference ?? null,
        delivery_date: row.delivery_date ?? null,
        status: String(row.status ?? 'pendiente'),
        total_amount: Math.round(total * 100) / 100,
        line_count: lines.length,
      })
    }
    return success(list)
  }
)

export const getSupplierInvoiceDeliveryNoteIds = protectedAction<string, string[]>(
  { permission: PERMISSION, auditModule: 'accounting' },
  async (ctx, invoiceId) => {
    if (!invoiceId?.trim()) return success([])
    const { data, error } = await ctx.adminClient
      .from(LINK_TABLE)
      .select('supplier_delivery_note_id')
      .eq('supplier_invoice_id', invoiceId)
    if (error) return failure(error.message)
    return success((data || []).map((r: any) => String(r.supplier_delivery_note_id)))
  }
)

export const getSupplierInvoiceLines = protectedAction<string, ApSupplierInvoiceLineRow[]>(
  { permission: PERMISSION, auditModule: 'accounting' },
  async (ctx, invoiceId) => {
    if (!invoiceId?.trim()) return success([])
    const { data, error } = await ctx.adminClient
      .from(LINES_TABLE)
      .select('id, supplier_invoice_id, description, base, tax_rate, tax_amount, sort_order')
      .eq('supplier_invoice_id', invoiceId)
      .order('sort_order', { ascending: true })
    if (error) return failure(error.message)
    const list: ApSupplierInvoiceLineRow[] = (data || []).map((r: Record<string, unknown>) => ({
      id: String(r.id),
      supplier_invoice_id: String(r.supplier_invoice_id),
      description: r.description != null ? String(r.description) : null,
      base: Number(r.base ?? 0),
      tax_rate: Number(r.tax_rate ?? 0),
      tax_amount: Number(r.tax_amount ?? 0),
      sort_order: Number(r.sort_order ?? 0),
    }))
    return success(list)
  }
)

/**
 * Normaliza las líneas que vienen del cliente. Si llega un array vacío o
 * undefined, devuelve null (modo legacy: la cabecera lleva la base/IVA).
 * Si llega con datos, valida que cada línea sea numéricamente sana.
 */
function normalizeInvoiceLines(
  rawLines: ApSupplierInvoiceInput['lines'],
): Array<{ description: string | null; base: number; tax_rate: number; tax_amount: number; sort_order: number }> | null {
  if (!Array.isArray(rawLines) || rawLines.length === 0) return null
  const out: Array<{ description: string | null; base: number; tax_rate: number; tax_amount: number; sort_order: number }> = []
  rawLines.forEach((l, idx) => {
    const base = Number(l?.base)
    const rate = Number(l?.tax_rate)
    if (!Number.isFinite(base) || base <= 0) return
    if (!Number.isFinite(rate) || rate < 0) return
    const taxAmount = Math.round(base * rate) / 100
    out.push({
      description: typeof l?.description === 'string' && l.description.trim() ? l.description.trim() : null,
      base: Math.round(base * 100) / 100,
      tax_rate: Math.round(rate * 100) / 100,
      tax_amount: taxAmount,
      sort_order: Number.isFinite(l?.sort_order) ? Number(l?.sort_order) : idx,
    })
  })
  return out.length > 0 ? out : null
}

async function resolveSupplierDefaults(
  adminClient: AdminClient,
  supplierId: string | null | undefined,
): Promise<{
  supplier_name: string
  supplier_cif: string | null
  payment_terms: string | null
  payment_days: number | null
  payment_method: string | null
  custom_payment_plan: Array<{ amount: number; days?: number | null }> | null
} | null> {
  if (!supplierId?.trim()) return null
  const { data } = await adminClient
    .from('suppliers')
    .select('id, name, nif_cif, payment_terms, payment_days, payment_method, custom_payment_plan')
    .eq('id', supplierId.trim())
    .maybeSingle()
  if (!data) return null
  const rawPlan = (data as any).custom_payment_plan
  const plan = Array.isArray(rawPlan)
    ? rawPlan
        .map((r: any) => ({
          amount: Number(r?.amount ?? 0),
          days: r?.days !== undefined && r?.days !== null && r?.days !== '' ? Number(r.days) : null,
        }))
        .filter((r: { amount: number }) => Number.isFinite(r.amount) && r.amount > 0)
    : null
  return {
    supplier_name: String((data as any).name ?? ''),
    supplier_cif: (data as any).nif_cif != null ? String((data as any).nif_cif) : null,
    payment_terms: (data as any).payment_terms != null ? String((data as any).payment_terms) : null,
    payment_days: (data as any).payment_days != null ? Number((data as any).payment_days) : null,
    payment_method: supplierPaymentMethodLabel((data as any).payment_method as string | null),
    custom_payment_plan: plan,
  }
}

async function validateDeliveryNoteLink(
  adminClient: AdminClient,
  deliveryNoteIds: string[],
  supplierId: string,
  excludeInvoiceId: string | null,
): Promise<string | null> {
  if (deliveryNoteIds.length === 0) return null

  const { data: notes } = await adminClient
    .from('supplier_delivery_notes')
    .select('id, supplier_id')
    .in('id', deliveryNoteIds)
  const byId = new Map<string, string | null>((notes || []).map((n: any) => [String(n.id), n.supplier_id ? String(n.supplier_id) : null]))
  for (const id of deliveryNoteIds) {
    const owner = byId.get(id)
    if (!owner) return `Albarán ${id} no encontrado`
    if (owner !== supplierId) return 'Todos los albaranes deben pertenecer al proveedor seleccionado'
  }

  const { data: links } = await adminClient
    .from(LINK_TABLE)
    .select('supplier_delivery_note_id, supplier_invoice_id')
    .in('supplier_delivery_note_id', deliveryNoteIds)
  for (const l of (links || []) as any[]) {
    if (excludeInvoiceId && String(l.supplier_invoice_id) === excludeInvoiceId) continue
    return 'Alguno de los albaranes ya está vinculado a otra factura'
  }
  return null
}

export const createSupplierInvoiceAction = protectedAction<ApSupplierInvoiceInput, { id: string }>(
  {
    permission: PERMISSION,
    auditModule: 'accounting',
    auditAction: 'create',
    auditEntity: 'supplier_invoice',
  },
  async (ctx, input) => {
    const supplierDefaults = await resolveSupplierDefaults(ctx.adminClient, input.supplier_id)

    const supplierName = (supplierDefaults?.supplier_name || input.supplier_name || '').trim()
    const supplierCif = input.supplier_cif?.trim() || supplierDefaults?.supplier_cif || null

    if (!supplierName) return failure('El proveedor es obligatorio')
    if (!input.invoice_number?.trim()) return failure('El número de factura es obligatorio')
    // Proforma y abono son excluyentes: una fila no puede ser ambas cosas.
    if (input.is_proforma && input.is_rectifying) {
      return failure('Una factura no puede ser proforma y abono a la vez', 'VALIDATION')
    }

    const dueDate = input.due_date?.trim()
      ? input.due_date
      : computeDueDate(
          input.invoice_date,
          supplierDefaults?.payment_days ?? null,
          supplierDefaults?.payment_terms ?? null,
        )

    if (new Date(dueDate) < new Date(input.invoice_date)) {
      return failure('La fecha de vencimiento no puede ser anterior a la fecha de factura')
    }
    // Abono (rectificativa recibida): importes negativos + validaciones propias.
    // Factura normal: importe estrictamente positivo (comportamiento previo).
    if (input.is_rectifying) {
      if (!input.rectifies_invoice_id?.trim()) return failure('Falta la factura que rectifica el abono', 'VALIDATION')
      if (!input.rectification_reason || input.rectification_reason.trim().length < 10) {
        return failure('Indica el motivo del abono (mínimo 10 caracteres)', 'VALIDATION')
      }
      if (Number(input.total_amount) >= 0) return failure('El total de un abono debe ser negativo', 'VALIDATION')
      const { data: orig } = await ctx.adminClient
        .from(TABLE).select('id, is_rectifying').eq('id', input.rectifies_invoice_id.trim()).maybeSingle()
      if (!orig) return failure('La factura original del abono no existe', 'NOT_FOUND')
      if ((orig as { is_rectifying?: boolean }).is_rectifying) return failure('No se puede rectificar un abono', 'VALIDATION')
    } else if (Number(input.total_amount) <= 0) {
      return failure('El total debe ser mayor que 0')
    }

    const deliveryNoteIds = Array.from(new Set((input.delivery_note_ids || []).map((s) => String(s).trim()).filter(Boolean)))
    if (deliveryNoteIds.length > 0) {
      if (!input.supplier_id?.trim()) return failure('Selecciona un proveedor registrado para vincular albaranes')
      const errMsg = await validateDeliveryNoteLink(ctx.adminClient, deliveryNoteIds, input.supplier_id.trim(), null)
      if (errMsg) return failure(errMsg, 'VALIDATION')
    }

    // Si vienen líneas multi-base, las usamos para los agregados de cabecera.
    // Si no, se mantiene el modo legacy (amount/tax_amount del payload).
    const lines = normalizeInvoiceLines(input.lines)
    const headerAmount = lines
      ? Math.round(lines.reduce((s, l) => s + l.base, 0) * 100) / 100
      : Number(input.amount)
    const headerTaxAmount = lines
      ? Math.round(lines.reduce((s, l) => s + l.tax_amount, 0) * 100) / 100
      : Number(input.tax_amount ?? 0)

    const { data, error } = await ctx.adminClient
      .from(TABLE)
      .insert({
        store_id: input.store_id || null,
        supplier_id: input.supplier_id?.trim() || null,
        supplier_name: supplierName,
        supplier_cif: supplierCif,
        invoice_number: input.invoice_number.trim(),
        invoice_date: input.invoice_date,
        due_date: dueDate,
        amount: headerAmount,
        tax_amount: headerTaxAmount,
        shipping_amount: Number(input.shipping_amount ?? 0),
        retention_rate: Number(input.retention_rate ?? 0),
        retention_amount: Number(input.retention_amount ?? 0),
        total_amount: Number(input.total_amount),
        payment_method: toPaymentMethodSlug(input.payment_method || supplierDefaults?.payment_method),
        notes: input.notes?.trim() || null,
        attachment_url: input.attachment_url?.trim() || null,
        is_rectifying: input.is_rectifying === true,
        rectifies_invoice_id: input.is_rectifying ? (input.rectifies_invoice_id?.trim() || null) : null,
        rectification_reason: input.is_rectifying ? (input.rectification_reason?.trim() || null) : null,
        is_proforma: input.is_proforma === true,
        created_by: ctx.userId,
      })
      .select('id')
      .single()

    if (error) return failure(error.message)

    if (lines) {
      const rows = lines.map((l) => ({
        supplier_invoice_id: String(data.id),
        description: l.description,
        base: l.base,
        tax_rate: l.tax_rate,
        tax_amount: l.tax_amount,
        sort_order: l.sort_order,
      }))
      const { error: linesErr } = await ctx.adminClient.from(LINES_TABLE).insert(rows)
      if (linesErr) {
        await ctx.adminClient.from(TABLE).delete().eq('id', data.id)
        return failure(linesErr.message || 'Error al guardar las líneas de la factura', 'INTERNAL')
      }
    }

    if (deliveryNoteIds.length > 0) {
      const rows = deliveryNoteIds.map((noteId) => ({
        supplier_invoice_id: String(data.id),
        supplier_delivery_note_id: noteId,
      }))
      const { error: linkErr } = await ctx.adminClient.from(LINK_TABLE).insert(rows)
      if (linkErr) {
        await ctx.adminClient.from(TABLE).delete().eq('id', data.id)
        return failure(linkErr.message || 'Error al vincular albaranes', 'INTERNAL')
      }

      // Auto-marcar albaranes vinculados como recibidos.
      // Solo afecta a los que estén en 'pendiente' — evita enmascarar
      // incidencias u otros estados intermedios.
      await ctx.adminClient
        .from('supplier_delivery_notes')
        .update({ status: 'recibido' })
        .in('id', deliveryNoteIds)
        .eq('status', 'pendiente')
    }

    // Generar cuotas de vencimiento. Si el formulario manda cuotas explícitas
    // (editor de plazos), las usamos directamente; si no, buildInstallments.
    const explicitInstallments = (input.installments ?? [])
      .filter((it) => Number(it.amount) > 0 && it.due_date)
    // Un abono (importe negativo) no tiene calendario de pago propio: reduce la
    // deuda con el proveedor. Una proforma tampoco genera cuotas (no es pagadera
    // hasta que llega la factura real). No generamos cuotas de vencimiento.
    const installments = input.is_rectifying || input.is_proforma
      ? []
      : explicitInstallments.length > 0
        ? explicitInstallments.map((it, idx) => ({
            due_date: String(it.due_date),
            amount: Math.round(Number(it.amount) * 100) / 100,
            sort_order: idx,
          }))
        : buildInstallments(
            input.invoice_date,
            dueDate,
            Number(input.total_amount),
            supplierDefaults,
          )
    const schedErr = await replaceInvoiceInstallments(ctx.adminClient, String(data.id), installments)
    if (schedErr) {
      console.error('[createSupplierInvoiceAction] cuotas:', schedErr)
      // No abortamos la factura por un fallo de cuotas; se reintenta al editar.
    }

    return success({
      id: String(data.id),
      auditEntityId: String(data.id),
      auditDescription: `Factura ${input.invoice_number.trim()} · ${supplierName}`,
    })
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

    // Bloqueo: una factura ya pagada no puede modificarse desde aquí.
    const { data: current } = await ctx.adminClient
      .from(TABLE)
      .select('status, is_rectifying')
      .eq('id', id)
      .maybeSingle()
    if ((current as { status?: string } | null)?.status === 'pagada') {
      return failure('La factura está pagada y no puede editarse', 'VALIDATION')
    }
    const isRectifying = (current as { is_rectifying?: boolean } | null)?.is_rectifying === true || rest.is_rectifying === true
    if (rest.is_proforma && isRectifying) {
      return failure('Una factura no puede ser proforma y abono a la vez', 'VALIDATION')
    }

    const supplierDefaults = await resolveSupplierDefaults(ctx.adminClient, rest.supplier_id)

    const supplierName = (supplierDefaults?.supplier_name || rest.supplier_name || '').trim()
    const supplierCif = rest.supplier_cif?.trim() || supplierDefaults?.supplier_cif || null

    if (!supplierName) return failure('El proveedor es obligatorio')

    const dueDate = rest.due_date?.trim()
      ? rest.due_date
      : computeDueDate(
          rest.invoice_date,
          supplierDefaults?.payment_days ?? null,
          supplierDefaults?.payment_terms ?? null,
        )

    if (new Date(dueDate) < new Date(rest.invoice_date)) {
      return failure('La fecha de vencimiento no puede ser anterior a la fecha de factura')
    }
    if (isRectifying) {
      if (Number(rest.total_amount) >= 0) return failure('El total de un abono debe ser negativo', 'VALIDATION')
    } else if (Number(rest.total_amount) <= 0) {
      return failure('El total debe ser mayor que 0')
    }

    const deliveryNoteIds = Array.from(new Set((rest.delivery_note_ids || []).map((s) => String(s).trim()).filter(Boolean)))
    if (deliveryNoteIds.length > 0) {
      if (!rest.supplier_id?.trim()) return failure('Selecciona un proveedor registrado para vincular albaranes')
      const errMsg = await validateDeliveryNoteLink(ctx.adminClient, deliveryNoteIds, rest.supplier_id.trim(), id)
      if (errMsg) return failure(errMsg, 'VALIDATION')
    }

    // Si vienen líneas multi-base, las usamos para los agregados de cabecera.
    // Si no, se mantiene el modo legacy (amount/tax_amount del payload).
    const lines = normalizeInvoiceLines(rest.lines)
    const headerAmount = lines
      ? Math.round(lines.reduce((s, l) => s + l.base, 0) * 100) / 100
      : Number(rest.amount)
    const headerTaxAmount = lines
      ? Math.round(lines.reduce((s, l) => s + l.tax_amount, 0) * 100) / 100
      : Number(rest.tax_amount ?? 0)

    const { error } = await ctx.adminClient
      .from(TABLE)
      .update({
        store_id: rest.store_id || null,
        supplier_id: rest.supplier_id?.trim() || null,
        supplier_name: supplierName,
        supplier_cif: supplierCif,
        invoice_number: rest.invoice_number.trim(),
        invoice_date: rest.invoice_date,
        due_date: dueDate,
        amount: headerAmount,
        tax_amount: headerTaxAmount,
        shipping_amount: Number(rest.shipping_amount ?? 0),
        retention_rate: Number(rest.retention_rate ?? 0),
        retention_amount: Number(rest.retention_amount ?? 0),
        total_amount: Number(rest.total_amount),
        payment_method: toPaymentMethodSlug(rest.payment_method || supplierDefaults?.payment_method),
        notes: rest.notes?.trim() || null,
        attachment_url: rest.attachment_url?.trim() || null,
        is_proforma: rest.is_proforma === true,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)

    if (error) return failure(error.message)

    // Reemplazar las líneas: borrar las existentes e insertar las nuevas.
    // Si lines === null (modo legacy), se borran sin reinsertar para no
    // dejar líneas huérfanas si la usuaria simplificó la factura.
    const { error: delLinesErr } = await ctx.adminClient
      .from(LINES_TABLE)
      .delete()
      .eq('supplier_invoice_id', id)
    if (delLinesErr) return failure(delLinesErr.message || 'Error al actualizar las líneas de la factura', 'INTERNAL')

    if (lines) {
      const rows = lines.map((l) => ({
        supplier_invoice_id: id,
        description: l.description,
        base: l.base,
        tax_rate: l.tax_rate,
        tax_amount: l.tax_amount,
        sort_order: l.sort_order,
      }))
      const { error: insLinesErr } = await ctx.adminClient.from(LINES_TABLE).insert(rows)
      if (insLinesErr) return failure(insLinesErr.message || 'Error al guardar las líneas de la factura', 'INTERNAL')
    }

    const { error: delErr } = await ctx.adminClient
      .from(LINK_TABLE)
      .delete()
      .eq('supplier_invoice_id', id)
    if (delErr) return failure(delErr.message || 'Error al actualizar vínculos de albaranes', 'INTERNAL')

    if (deliveryNoteIds.length > 0) {
      const rows = deliveryNoteIds.map((noteId) => ({
        supplier_invoice_id: id,
        supplier_delivery_note_id: noteId,
      }))
      const { error: insErr } = await ctx.adminClient.from(LINK_TABLE).insert(rows)
      if (insErr) return failure(insErr.message || 'Error al vincular albaranes', 'INTERNAL')

      // Auto-marcar albaranes vinculados como recibidos.
      // Solo afecta a los que estén en 'pendiente' — evita enmascarar
      // incidencias u otros estados intermedios.
      await ctx.adminClient
        .from('supplier_delivery_notes')
        .update({ status: 'recibido' })
        .in('id', deliveryNoteIds)
        .eq('status', 'pendiente')
    }

    // Regenerar cuotas. Si ya existen cuotas pagadas las conservamos porque el
    // usuario ya cobró por ellas; solo regeneramos las pendientes.
    const { data: existing } = await ctx.adminClient
      .from('ap_supplier_invoice_due_dates')
      .select('id, amount, is_paid')
      .eq('supplier_invoice_id', id)
    const hasPaid = Array.isArray(existing) && existing.some((r: any) => r.is_paid)
    if (!hasPaid) {
      const explicitInstallments = (rest.installments ?? [])
        .filter((it) => Number(it.amount) > 0 && it.due_date)
      // Una proforma no genera cuotas. Al convertirla en factura real (quitar el
      // flag) este mismo update sí las generará.
      const installments = rest.is_proforma
        ? []
        : explicitInstallments.length > 0
        ? explicitInstallments.map((it, idx) => ({
            due_date: String(it.due_date),
            amount: Math.round(Number(it.amount) * 100) / 100,
            sort_order: idx,
          }))
        : buildInstallments(
            rest.invoice_date,
            dueDate,
            Number(rest.total_amount),
            supplierDefaults,
          )
      const schedErr = await replaceInvoiceInstallments(ctx.adminClient, id, installments)
      if (schedErr) {
        console.error('[updateSupplierInvoiceAction] cuotas:', schedErr)
      }
    }

    return success(undefined)
  }
)

export const listSupplierInvoiceInstallments = protectedAction<
  { invoice_id: string },
  Array<{ id: string; amount: number; due_date: string; is_paid: boolean; sort_order: number }>
>(
  { permission: PERMISSION, auditModule: 'accounting' },
  async (ctx, { invoice_id }) => {
    if (!invoice_id) return success([])
    const { data, error } = await ctx.adminClient
      .from('ap_supplier_invoice_due_dates')
      .select('id, amount, due_date, is_paid, sort_order')
      .eq('supplier_invoice_id', invoice_id)
      .order('sort_order', { ascending: true })
      .order('due_date', { ascending: true })
    if (error) return failure(error.message)
    return success(((data ?? []) as Array<Record<string, unknown>>).map((r) => ({
      id: String(r.id),
      amount: Number(r.amount ?? 0),
      due_date: String(r.due_date ?? ''),
      is_paid: Boolean(r.is_paid),
      sort_order: Number(r.sort_order ?? 0),
    })))
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

    // Marcar TODAS las cuotas pendientes como pagadas, si no la pantalla de
    // Vencimientos sigue mostrando la factura como pendiente.
    const { error: cuotasErr } = await ctx.adminClient
      .from('ap_supplier_invoice_due_dates')
      .update({ is_paid: true, paid_at: payment_date, payment_method: payment_method || null })
      .eq('supplier_invoice_id', id)
      .eq('is_paid', false)
    if (cuotasErr) {
      console.error('[markSupplierInvoicePaidAction] cuotas:', cuotasErr.message)
    }

    return success(undefined)
  }
)

/** Marca un plazo de pago de pedido a proveedor como pagado. */
export const markSupplierOrderScheduleItemPaidAction = protectedAction<
  { id: string; payment_date: string; payment_method?: string },
  void
>(
  {
    permission: PERMISSION,
    auditModule: 'accounting',
    auditAction: 'payment',
    auditEntity: 'supplier_order_payment_schedule',
  },
  async (ctx, { id, payment_date, payment_method }) => {
    const { error } = await ctx.adminClient
      .from('supplier_order_payment_schedule')
      .update({
        is_paid: true,
        paid_at: payment_date,
        payment_method: payment_method || null,
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

/** Eventos para calendario: facturas AP + plazos de pedidos a proveedor. */
export const getSupplierInvoicesForCalendar = protectedAction<
  { year: number; month: number },
  {
    id: string
    title: string
    start: string
    status: string
    total_amount: number
    supplier_name: string
    /** 'invoice' = ap_supplier_invoices · 'schedule' = supplier_order_payment_schedule */
    kind: 'invoice' | 'schedule'
    /** Nº del pedido (solo cuando kind=schedule) */
    order_number?: string | null
    /** Posición del plazo (1, 2, 3) cuando kind=schedule */
    installment?: number | null
  }[]
>(
  { permission: PERMISSION, auditModule: 'accounting' },
  async (ctx, { year, month }) => {
    const start = `${year}-${String(month).padStart(2, '0')}-01`
    const endDate = new Date(year, month, 0)
    const end = `${year}-${String(month).padStart(2, '0')}-${String(endDate.getDate()).padStart(2, '0')}`

    const [{ data }, { data: scheduleData }] = await Promise.all([
      ctx.adminClient
        .from(TABLE)
        .select('id, due_date, supplier_name, invoice_number, total_amount, status')
        .eq('is_proforma', false) // las proformas no entran en el calendario de pagos
        .gte('due_date', start)
        .lte('due_date', end)
        .order('due_date'),
      ctx.adminClient
        .from('supplier_order_payment_schedule')
        .select('id, due_date, amount, is_paid, sort_order, supplier_order_id, supplier_orders!inner(order_number, suppliers(name))')
        .gte('due_date', start)
        .lte('due_date', end)
        .order('due_date'),
    ])

    const list: Array<{
      id: string
      title: string
      start: string
      status: string
      total_amount: number
      supplier_name: string
      kind: 'invoice' | 'schedule'
      order_number?: string | null
      installment?: number | null
    }> = (data || []).map((r: Record<string, unknown>) => ({
      id: String(r.id),
      title: `${(r as any).supplier_name ?? ''} - ${(r as any).invoice_number ?? ''} (${Number((r as any).total_amount ?? 0).toFixed(2)} €)`,
      start: String(r.due_date),
      status: String(r.status ?? 'pendiente'),
      total_amount: Number((r as any).total_amount ?? 0),
      supplier_name: String((r as any).supplier_name ?? ''),
      kind: 'invoice' as const,
    }))

    for (const s of (scheduleData || []) as any[]) {
      const supplierName = s.supplier_orders?.suppliers?.name ?? ''
      const orderNumber = s.supplier_orders?.order_number ?? null
      const installment = (Number(s.sort_order) || 0) + 1
      list.push({
        id: `sch:${s.id}`,
        title: `${supplierName} · ${orderNumber ?? ''} · Plazo ${installment} (${Number(s.amount ?? 0).toFixed(2)} €)`,
        start: String(s.due_date),
        status: s.is_paid ? 'pagada' : 'pendiente',
        total_amount: Number(s.amount ?? 0),
        supplier_name: supplierName,
        kind: 'schedule' as const,
        order_number: orderNumber,
        installment,
      })
    }

    list.sort((a, b) => (a.start < b.start ? -1 : a.start > b.start ? 1 : 0))
    return success(list)
  }
)

/**
 * Eliminar una factura de proveedor. Solo accesible con permiso
 * `supplier_invoices.manage` (asignado al rol administrador).
 * Los vínculos con albaranes se borran en cascada por FK.
 */
export const deleteSupplierInvoiceAction = protectedAction<{ id: string }, void>(
  {
    permission: PERMISSION,
    auditModule: 'accounting',
    auditAction: 'delete',
    auditEntity: 'supplier_invoice',
  },
  async (ctx, { id }) => {
    if (!id) return failure('Falta el identificador de la factura', 'VALIDATION')

    const { data: current } = await ctx.adminClient
      .from(TABLE)
      .select('status')
      .eq('id', id)
      .maybeSingle()
    if ((current as { status?: string } | null)?.status === 'pagada') {
      return failure('La factura está pagada y no puede eliminarse', 'VALIDATION')
    }

    const { error } = await ctx.adminClient
      .from(TABLE)
      .delete()
      .eq('id', id)

    if (error) return failure(error.message || 'Error al eliminar la factura', 'INTERNAL')
    return success(undefined)
  }
)
