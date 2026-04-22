'use server'

import { protectedAction } from '@/lib/server/action-wrapper'
import { success, failure } from '@/lib/errors'

const PERMISSION = 'supplier_invoices.manage'
const TABLE = 'ap_supplier_invoices'
const LINK_TABLE = 'ap_supplier_invoice_delivery_notes'

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
  supplier_id?: string | null
  supplier_name: string
  supplier_cif?: string | null
  invoice_number: string
  invoice_date: string
  due_date?: string | null
  amount: number
  tax_amount?: number
  shipping_amount?: number
  total_amount: number
  payment_method?: string | null
  notes?: string | null
  attachment_url?: string | null
  delivery_note_ids?: string[]
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

function addDaysISO(dateStr: string, days: number): string {
  const d = new Date(dateStr)
  d.setDate(d.getDate() + days)
  return d.toISOString().slice(0, 10)
}

function computeDueDate(invoiceDate: string, terms: string | null): string {
  switch (terms) {
    case 'immediate': return invoiceDate
    case 'net_15': return addDaysISO(invoiceDate, 15)
    case 'net_30': return addDaysISO(invoiceDate, 30)
    case 'net_60': return addDaysISO(invoiceDate, 60)
    case 'net_90': return addDaysISO(invoiceDate, 90)
    default: return addDaysISO(invoiceDate, 30)
  }
}

type InstallmentSpec = { due_date: string; amount: number; sort_order: number }

/**
 * Construye la lista de cuotas a generar para una factura.
 * - custom + plan con importes > 0 → cuotas del plan; el último sumidero absorbe residuos.
 * - En cualquier otro caso → 1 sola cuota con el total.
 */
function buildInstallments(
  invoiceDate: string,
  fallbackDueDate: string,
  totalAmount: number,
  supplier: {
    payment_terms: string | null
    custom_payment_plan: Array<{ amount: number; days?: number | null }> | null
  } | null,
): InstallmentSpec[] {
  const total = Math.round(totalAmount * 100) / 100
  const plan = supplier?.custom_payment_plan ?? null
  if (supplier?.payment_terms === 'custom' && plan && plan.length > 0) {
    // Calcular proporción para escalar el plan al total real de la factura
    const planTotal = plan.reduce((s, p) => s + (Number(p.amount) || 0), 0)
    const ratio = planTotal > 0 ? total / planTotal : 1
    const out: InstallmentSpec[] = []
    let accumulated = 0
    plan.forEach((p, idx) => {
      const rawDays = p.days
      const days = rawDays !== undefined && rawDays !== null && Number.isFinite(Number(rawDays))
        ? Number(rawDays)
        : 30
      let amount = Math.round(Number(p.amount) * ratio * 100) / 100
      if (idx === plan.length - 1) {
        // Última cuota absorbe la diferencia por redondeo
        amount = Math.round((total - accumulated) * 100) / 100
      } else {
        accumulated = Math.round((accumulated + amount) * 100) / 100
      }
      if (amount < 0) amount = 0
      out.push({
        due_date: addDaysISO(invoiceDate, days),
        amount,
        sort_order: idx,
      })
    })
    return out
  }
  return [{ due_date: fallbackDueDate, amount: total, sort_order: 0 }]
}

async function replaceInvoiceInstallments(
  adminClient: any,
  supplierInvoiceId: string,
  installments: InstallmentSpec[],
): Promise<string | null> {
  const { error: delErr } = await adminClient
    .from('ap_supplier_invoice_due_dates')
    .delete()
    .eq('supplier_invoice_id', supplierInvoiceId)
  if (delErr) return delErr.message || 'Error al limpiar cuotas'

  if (installments.length === 0) return null
  const rows = installments.map((it) => ({
    supplier_invoice_id: supplierInvoiceId,
    due_date: it.due_date,
    amount: it.amount,
    sort_order: it.sort_order,
    is_paid: false,
  }))
  const { error: insErr } = await adminClient
    .from('ap_supplier_invoice_due_dates')
    .insert(rows)
  if (insErr) return insErr.message || 'Error al crear cuotas'
  return null
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

    const [{ data: all }, { data: schedAll }] = await Promise.all([
      ctx.adminClient
        .from(TABLE)
        .select('total_amount, status, due_date, payment_date'),
      ctx.adminClient
        .from('supplier_order_payment_schedule')
        .select('amount, is_paid, due_date, paid_at'),
    ])

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

    // Plazos de pago de pedidos (además de facturas AP)
    const schedRows = (schedAll || []) as { amount: number; is_paid: boolean; due_date: string; paid_at: string | null }[]
    for (const s of schedRows) {
      const amt = Number(s.amount ?? 0)
      if (!s.is_paid) {
        totalPendiente += amt
        if (s.due_date < t) countVencidas++
        else if (s.due_date <= in30Str) countProximas30++
      } else if (s.paid_at && s.paid_at >= startMonth && s.paid_at <= endMonth) {
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
    const [{ count: invCount }, { count: schedCount }] = await Promise.all([
      ctx.adminClient
        .from(TABLE)
        .select('*', { count: 'exact', head: true })
        .lt('due_date', t)
        .in('status', ['pendiente', 'vencida']),
      ctx.adminClient
        .from('supplier_order_payment_schedule')
        .select('*', { count: 'exact', head: true })
        .lt('due_date', t)
        .eq('is_paid', false),
    ])
    return success((invCount ?? 0) + (schedCount ?? 0))
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
      supplier_id: r.supplier_id != null ? String(r.supplier_id) : null,
      supplier_name: String(r.supplier_name ?? ''),
      supplier_cif: r.supplier_cif != null ? String(r.supplier_cif) : null,
      invoice_number: String(r.invoice_number ?? ''),
      invoice_date: String(r.invoice_date ?? ''),
      due_date: String(r.due_date ?? ''),
      amount: Number(r.amount ?? 0),
      tax_amount: Number(r.tax_amount ?? 0),
      shipping_amount: Number(r.shipping_amount ?? 0),
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

async function resolveSupplierDefaults(
  adminClient: any,
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
  adminClient: any,
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

    const dueDate = input.due_date?.trim()
      ? input.due_date
      : computeDueDate(input.invoice_date, supplierDefaults?.payment_terms ?? null)

    if (new Date(dueDate) < new Date(input.invoice_date)) {
      return failure('La fecha de vencimiento no puede ser anterior a la fecha de factura')
    }
    if (Number(input.total_amount) <= 0) return failure('El total debe ser mayor que 0')

    const deliveryNoteIds = Array.from(new Set((input.delivery_note_ids || []).map((s) => String(s).trim()).filter(Boolean)))
    if (deliveryNoteIds.length > 0) {
      if (!input.supplier_id?.trim()) return failure('Selecciona un proveedor registrado para vincular albaranes')
      const errMsg = await validateDeliveryNoteLink(ctx.adminClient, deliveryNoteIds, input.supplier_id.trim(), null)
      if (errMsg) return failure(errMsg, 'VALIDATION')
    }

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
        amount: Number(input.amount),
        tax_amount: Number(input.tax_amount ?? 0),
        shipping_amount: Number(input.shipping_amount ?? 0),
        total_amount: Number(input.total_amount),
        payment_method: input.payment_method?.trim() || supplierDefaults?.payment_method || null,
        notes: input.notes?.trim() || null,
        attachment_url: input.attachment_url?.trim() || null,
        created_by: ctx.userId,
      })
      .select('id')
      .single()

    if (error) return failure(error.message)

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
    }

    // Generar cuotas de vencimiento
    const installments = buildInstallments(
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
    const supplierDefaults = await resolveSupplierDefaults(ctx.adminClient, rest.supplier_id)

    const supplierName = (supplierDefaults?.supplier_name || rest.supplier_name || '').trim()
    const supplierCif = rest.supplier_cif?.trim() || supplierDefaults?.supplier_cif || null

    if (!supplierName) return failure('El proveedor es obligatorio')

    const dueDate = rest.due_date?.trim()
      ? rest.due_date
      : computeDueDate(rest.invoice_date, supplierDefaults?.payment_terms ?? null)

    if (new Date(dueDate) < new Date(rest.invoice_date)) {
      return failure('La fecha de vencimiento no puede ser anterior a la fecha de factura')
    }
    if (Number(rest.total_amount) <= 0) return failure('El total debe ser mayor que 0')

    const deliveryNoteIds = Array.from(new Set((rest.delivery_note_ids || []).map((s) => String(s).trim()).filter(Boolean)))
    if (deliveryNoteIds.length > 0) {
      if (!rest.supplier_id?.trim()) return failure('Selecciona un proveedor registrado para vincular albaranes')
      const errMsg = await validateDeliveryNoteLink(ctx.adminClient, deliveryNoteIds, rest.supplier_id.trim(), id)
      if (errMsg) return failure(errMsg, 'VALIDATION')
    }

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
        amount: Number(rest.amount),
        tax_amount: Number(rest.tax_amount ?? 0),
        shipping_amount: Number(rest.shipping_amount ?? 0),
        total_amount: Number(rest.total_amount),
        payment_method: rest.payment_method?.trim() || supplierDefaults?.payment_method || null,
        notes: rest.notes?.trim() || null,
        attachment_url: rest.attachment_url?.trim() || null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)

    if (error) return failure(error.message)

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
    }

    // Regenerar cuotas. Si ya existen cuotas pagadas las conservamos porque el
    // usuario ya cobró por ellas; solo regeneramos las pendientes.
    const { data: existing } = await ctx.adminClient
      .from('ap_supplier_invoice_due_dates')
      .select('id, amount, is_paid')
      .eq('supplier_invoice_id', id)
    const hasPaid = Array.isArray(existing) && existing.some((r: any) => r.is_paid)
    if (!hasPaid) {
      const installments = buildInstallments(
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

    const { error } = await ctx.adminClient
      .from(TABLE)
      .delete()
      .eq('id', id)

    if (error) return failure(error.message || 'Error al eliminar la factura', 'INTERNAL')
    return success(undefined)
  }
)
