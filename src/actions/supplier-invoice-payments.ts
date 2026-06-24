'use server'

import { protectedAction, type AdminClient } from '@/lib/server/action-wrapper'
import { success, failure } from '@/lib/errors'
import { serializeForServerAction } from '@/lib/server/serialize'
import {
  SUPPLIER_PAYMENT_METHOD_LABEL,
  type SupplierPaymentMethod,
} from '@/lib/constants/supplier-payment-methods'

const PERMISSION = 'supplier_invoices.manage'
const TABLE = 'ap_supplier_invoice_payments'
const INVOICES_TABLE = 'ap_supplier_invoices'
const DUE_DATES_TABLE = 'ap_supplier_invoice_due_dates'

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
  /** ID de la cuota si viene de la tabla de cuotas; si no, ID de la factura. */
  id: string
  /** ID de la factura AP a la que pertenece la cuota. */
  supplier_invoice_id: string
  supplier_id: string | null
  supplier_name: string
  supplier_cif: string | null
  invoice_number: string
  invoice_date: string
  /** Fecha de vencimiento de ESTA cuota. */
  due_date: string
  /** Total de la factura (para contexto). */
  total_amount: number
  /** Importe de esta cuota. */
  installment_amount: number
  /** Nº de cuota (1-based). */
  installment_index: number
  /** Total de cuotas de la factura. */
  installment_count: number
  /** Importe pagado de esta cuota: igual a installment_amount si is_paid, 0 si no. */
  amount_paid: number
  /** Importe pendiente de esta cuota. */
  amount_pending: number
  /** Estado agregado de la cuota: 'pagada' | 'vencida' | 'pendiente' | 'parcial' (no aplica) */
  status: string
  is_paid: boolean
  paid_at: string | null
  payment_method: string | null
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

/**
 * Re-deriva is_paid de las cuotas de una factura desde el dinero realmente pagado
 * (Σ ap_supplier_invoice_payments), con el MISMO orden FIFO (sort_order, due_date) y
 * el MISMO umbral (0.005) que registerSupplierInvoicePayment. Marca las cuotas que el
 * total pagado cubre consecutivamente y DESMARCA (is_paid=false, paid_at=null,
 * payment_method=null) las que ya no se cubren. Maneja ambos sentidos por robustez,
 * pero al BORRAR un pago el dinero solo baja → en la práctica solo desmarca.
 * Solo toca la clasificación de cuotas — nunca importes, pagos ni espejos de caja.
 */
async function rederiveDueDatesFifo(adminClient: AdminClient, invoiceId: string): Promise<void> {
  if (!invoiceId) return

  const { data: pays } = await adminClient
    .from(TABLE)
    .select('amount')
    .eq('supplier_invoice_id', invoiceId)
  const realPaid = (pays || []).reduce((s: number, p: { amount: number | null }) => s + Number(p.amount ?? 0), 0)

  const { data: dueRows } = await adminClient
    .from(DUE_DATES_TABLE)
    .select('id, amount, sort_order, due_date, is_paid')
    .eq('supplier_invoice_id', invoiceId)
    .order('sort_order', { ascending: true })
    .order('due_date', { ascending: true })

  const idsToMarkPaid: string[] = []
  const idsToUnmark: string[] = []
  let remaining = realPaid
  let covered = true // FIFO estricto: tras la primera cuota no cubierta, ninguna posterior se paga
  for (const r of (dueRows || []) as Array<{ id: string; amount: number | null; is_paid: boolean }>) {
    const amt = Number(r.amount ?? 0)
    const shouldBePaid = covered && remaining + 0.005 >= amt
    if (shouldBePaid) {
      if (!r.is_paid) idsToMarkPaid.push(String(r.id))
      remaining = Math.round((remaining - amt) * 100) / 100
    } else {
      covered = false
      if (r.is_paid) idsToUnmark.push(String(r.id))
    }
  }

  if (idsToMarkPaid.length > 0) {
    await adminClient
      .from(DUE_DATES_TABLE)
      .update({ is_paid: true, paid_at: today(), payment_method: 'transfer' })
      .in('id', idsToMarkPaid)
  }
  if (idsToUnmark.length > 0) {
    await adminClient
      .from(DUE_DATES_TABLE)
      .update({ is_paid: false, paid_at: null, payment_method: null })
      .in('id', idsToUnmark)
  }
}

// ─── Registrar pago ──────────────────────────────────────────────────────────

type ApplyPaymentInput = {
  supplier_invoice_id: string
  amount: number
  payment_date?: string
  payment_method?: SupplierPaymentMethod
  reference?: string | null
  notes?: string | null
  create_accounting_entry?: boolean
}

type ApplyPaymentResult =
  | {
      ok: true
      id: string
      amount_paid: number
      amount_pending: number
      status: string
      invoice_number: string
      supplier_name: string
      amount: number
    }
  | { ok: false; error: string; code?: string }

/**
 * Núcleo del registro de un pago de factura de proveedor: inserta el pago en
 * `ap_supplier_invoice_payments`, crea el asiento de gasto ligado a la factura,
 * propaga FIFO a las cuotas y sincroniza el status de la cabecera. Lo comparten
 * el alta individual (`registerSupplierInvoicePayment`) y la del lote
 * (`registerBulkSupplierInvoicePayments`) para garantizar IDÉNTICO comportamiento.
 */
async function applySupplierInvoicePayment(
  adminClient: AdminClient,
  userId: string | null,
  input: ApplyPaymentInput,
): Promise<ApplyPaymentResult> {
  if (!input.supplier_invoice_id) return { ok: false, error: 'Factura no indicada', code: 'VALIDATION' }
  const amount = Number(input.amount)
  if (!Number.isFinite(amount) || amount <= 0) {
    return { ok: false, error: 'El importe debe ser mayor que 0', code: 'VALIDATION' }
  }

  const { data: invoice, error: invErr } = await adminClient
    .from(INVOICES_TABLE)
    .select('id, total_amount, supplier_name, invoice_number')
    .eq('id', input.supplier_invoice_id)
    .maybeSingle()
  if (invErr || !invoice) return { ok: false, error: invErr?.message || 'Factura no encontrada' }

  const { data: existingPays } = await adminClient
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
    return { ok: false, error: `El importe supera el pendiente (${pending.toFixed(2)}€)`, code: 'VALIDATION' }
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
      created_by: userId,
      // Enlace estructural con la factura pagada (para el desglose del informe de
      // gastos por tipo de proveedor y por factura, sin depender del texto).
      ap_supplier_invoice_id: input.supplier_invoice_id,
    }
    const { data: mt, error: mtErr } = await adminClient
      .from('manual_transactions')
      .insert(mtPayload)
      .select('id')
      .single()
    if (mtErr) {
      console.error('[applySupplierInvoicePayment] manual_transactions error:', mtErr.message)
    } else if (mt) {
      manualTransactionId = String((mt as any).id)
    }
  }

  const { data: pay, error: payErr } = await adminClient
    .from(TABLE)
    .insert({
      supplier_invoice_id: input.supplier_invoice_id,
      payment_date: paymentDate,
      payment_method: paymentMethod,
      amount,
      reference: input.reference?.trim() || null,
      notes: input.notes?.trim() || null,
      manual_transaction_id: manualTransactionId,
      created_by: userId,
    })
    .select('id')
    .single()
  if (payErr) {
    if (manualTransactionId) {
      await adminClient.from('manual_transactions').delete().eq('id', manualTransactionId)
    }
    return { ok: false, error: payErr.message || 'Error al registrar pago' }
  }

  const newPaid = currentPaid + amount
  const newPending = Math.max(0, total - newPaid)
  const newStatus = newPaid >= total - 0.005 ? 'pagada' : newPaid > 0 ? 'parcial' : 'pendiente'

  // Propagar a las cuotas: asignar el total pagado en orden (FIFO) y marcar
  // como pagadas las que queden cubiertas. Sin esto, la pantalla de
  // Vencimientos seguiría mostrando la factura como pendiente.
  const { data: dueRows } = await adminClient
    .from(DUE_DATES_TABLE)
    .select('id, amount, sort_order, due_date, is_paid')
    .eq('supplier_invoice_id', input.supplier_invoice_id)
    .order('sort_order', { ascending: true })
    .order('due_date', { ascending: true })

  const idsToMarkPaid: string[] = []
  let remaining = newPaid
  for (const r of (dueRows || []) as any[]) {
    const amt = Number(r.amount ?? 0)
    if (remaining + 0.005 >= amt) {
      if (!r.is_paid) idsToMarkPaid.push(String(r.id))
      remaining = Math.round((remaining - amt) * 100) / 100
    } else {
      break
    }
  }
  if (idsToMarkPaid.length > 0) {
    await adminClient
      .from(DUE_DATES_TABLE)
      .update({ is_paid: true, paid_at: paymentDate, payment_method: paymentMethod })
      .in('id', idsToMarkPaid)
  }

  // Sincronizar status de la factura
  const invoiceUpdate: Record<string, unknown> = {
    status: newStatus,
    updated_at: new Date().toISOString(),
  }
  if (newStatus === 'pagada') {
    invoiceUpdate.payment_date = paymentDate
    invoiceUpdate.payment_method = paymentMethod
  }
  await adminClient
    .from(INVOICES_TABLE)
    .update(invoiceUpdate)
    .eq('id', input.supplier_invoice_id)

  return {
    ok: true,
    id: String((pay as any).id),
    amount_paid: Math.round(newPaid * 100) / 100,
    amount_pending: Math.round(newPending * 100) / 100,
    status: newStatus,
    invoice_number: String((invoice as any).invoice_number ?? ''),
    supplier_name: String((invoice as any).supplier_name ?? ''),
    amount,
  }
}

export const registerSupplierInvoicePayment = protectedAction<
  ApplyPaymentInput,
  { id: string; amount_paid: number; amount_pending: number; status: string; auditEntityId: string; auditDescription: string }
>(
  {
    permission: PERMISSION,
    auditModule: 'accounting',
    auditAction: 'payment',
    auditEntity: 'supplier_invoice',
  },
  async (ctx, input) => {
    const r = await applySupplierInvoicePayment(ctx.adminClient, ctx.userId, input)
    if (!r.ok) return failure(r.error, r.code)
    return success({
      id: r.id,
      amount_paid: r.amount_paid,
      amount_pending: r.amount_pending,
      status: r.status,
      auditEntityId: String(input.supplier_invoice_id),
      auditDescription: `Pago de factura ${r.invoice_number} · ${r.supplier_name} (${r.amount.toFixed(2)} €)`,
    })
  },
)

// ─── Registrar pago COMPLETO de varias facturas a la vez ──────────────────────
// Caso de uso: en el banco se paga un lote de facturas de golpe. Por cada factura
// seleccionada se registra un pago por su importe PENDIENTE íntegro (mismo flujo
// que el pago individual: asiento de gasto + cuotas FIFO + status). Las que ya no
// tienen pendiente se omiten; los fallos individuales no abortan el resto del lote.

export const registerBulkSupplierInvoicePayments = protectedAction<
  {
    ids: string[]
    payment_date?: string
    payment_method?: SupplierPaymentMethod
    create_accounting_entry?: boolean
  },
  {
    paid: number
    skipped: number
    failed: number
    total_amount: number
    errors: string[]
    auditEntityId: string
    auditDescription: string
  }
>(
  {
    permission: PERMISSION,
    auditModule: 'accounting',
    auditAction: 'payment',
    auditEntity: 'supplier_invoice',
  },
  async (ctx, input) => {
    const ids = Array.from(new Set((input.ids || []).filter(Boolean)))
    if (ids.length === 0) return failure('No hay facturas seleccionadas', 'VALIDATION')

    const paymentDate = input.payment_date || today()
    const paymentMethod = (input.payment_method || 'transfer') as SupplierPaymentMethod

    // Pendiente por factura = total − Σ pagos ya registrados.
    const { data: invoices, error: invErr } = await ctx.adminClient
      .from(INVOICES_TABLE)
      .select('id, total_amount, supplier_name, invoice_number')
      .in('id', ids)
    if (invErr) return failure(invErr.message)

    const { data: pays } = await ctx.adminClient
      .from(TABLE)
      .select('supplier_invoice_id, amount')
      .in('supplier_invoice_id', ids)
    const paidByInvoice = new Map<string, number>()
    for (const p of (pays || []) as any[]) {
      const k = String(p.supplier_invoice_id)
      paidByInvoice.set(k, (paidByInvoice.get(k) ?? 0) + Number(p.amount ?? 0))
    }

    let paid = 0
    let skipped = 0
    let failed = 0
    let totalAmount = 0
    const errors: string[] = []

    for (const inv of (invoices || []) as any[]) {
      const id = String(inv.id)
      const total = Number(inv.total_amount ?? 0)
      const already = paidByInvoice.get(id) ?? 0
      const pending = Math.round((total - already) * 100) / 100
      const label = `${inv.invoice_number ?? ''} · ${inv.supplier_name ?? ''}`.trim()
      if (pending <= 0.005) {
        skipped++
        continue
      }
      const r = await applySupplierInvoicePayment(ctx.adminClient, ctx.userId, {
        supplier_invoice_id: id,
        amount: pending,
        payment_date: paymentDate,
        payment_method: paymentMethod,
        create_accounting_entry: input.create_accounting_entry,
      })
      if (r.ok) {
        paid++
        totalAmount = Math.round((totalAmount + pending) * 100) / 100
      } else {
        failed++
        errors.push(`${label}: ${r.error}`)
      }
    }

    if (paid === 0 && failed > 0) {
      return failure(`No se pudo registrar ningún pago. ${errors[0] ?? ''}`.trim())
    }

    return success({
      paid,
      skipped,
      failed,
      total_amount: totalAmount,
      errors,
      auditEntityId: ids[0],
      auditDescription: `Pago en lote de ${paid} factura(s) de proveedor (${totalAmount.toFixed(2)} €)`,
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

export const deleteSupplierInvoicePayment = protectedAction<
  { id: string },
  { auditEntityId: string; auditDescription: string }
>(
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
      .select('manual_transaction_id, supplier_invoice_id, amount, invoice:ap_supplier_invoices!supplier_invoice_id(invoice_number)')
      .eq('id', id)
      .maybeSingle()

    const ex = existing as { manual_transaction_id: string | null; supplier_invoice_id: string | null; amount: number | null; invoice: { invoice_number: string | null } | null } | null
    const mtId = ex?.manual_transaction_id ?? null
    const invoiceId = ex?.supplier_invoice_id ?? null
    const invoiceNumber = ex?.invoice?.invoice_number ?? ''

    const { error } = await ctx.adminClient.from(TABLE).delete().eq('id', id)
    if (error) return failure(error.message || 'Error al eliminar pago')

    if (mtId) {
      await ctx.adminClient.from('manual_transactions').delete().eq('id', mtId)
    }

    // Re-derivar is_paid de las cuotas desde el dinero que queda (arregla el "fantasma":
    // cuotas marcadas pagadas cuyo pago se acaba de borrar). El status de cabecera ya lo
    // re-deriva el trigger ap_sipay_recalc; aquí solo la clasificación de cuotas.
    if (invoiceId) {
      await rederiveDueDatesFifo(ctx.adminClient, invoiceId)
    }

    return success({
      auditEntityId: String(invoiceId ?? id),
      auditDescription: `Pago eliminado de la factura ${invoiceNumber}`,
    })
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

    const { data: cuotas, error: cuotasErr } = await ctx.adminClient
      .from(DUE_DATES_TABLE)
      .select('amount, due_date, is_paid, paid_at')
    if (cuotasErr) return failure(cuotasErr.message)

    let totalPendiente = 0
    let totalVencidas = 0
    let totalProximas30 = 0
    let countPendientes = 0
    let countVencidas = 0
    let countProximas30 = 0
    let countPagadasEsteMes = 0

    for (const c of (cuotas || []) as any[]) {
      const amt = Number(c.amount ?? 0)
      if (c.is_paid) {
        if (c.paid_at && c.paid_at >= startMonth && c.paid_at <= endMonth) {
          countPagadasEsteMes++
        }
        continue
      }
      if (amt <= 0) continue
      totalPendiente += amt
      countPendientes++
      const due = String(c.due_date ?? '')
      if (due && due < t) {
        totalVencidas += amt
        countVencidas++
      } else if (due && due <= in30Str) {
        totalProximas30 += amt
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
    // 1. Traemos cuotas con su factura embebida.
    const { data: cuotas, error: cuotasErr } = await ctx.adminClient
      .from(DUE_DATES_TABLE)
      .select(`
        id, supplier_invoice_id, due_date, amount, sort_order, is_paid, paid_at, payment_method, created_at,
        invoice:ap_supplier_invoices!supplier_invoice_id (
          id, supplier_id, supplier_name, supplier_cif, invoice_number, invoice_date, total_amount, status, notes
        )
      `)
      .order('due_date', { ascending: true })
      .limit(1000)
    if (cuotasErr) return failure(cuotasErr.message)

    const term = (search ?? '').trim().toLowerCase()
    const todayStr = today()

    // 2. Contar cuotas por factura para mostrar "Cuota 1 de N"
    const countByInvoice = new Map<string, number>()
    for (const c of (cuotas || []) as any[]) {
      const invId = String(c.supplier_invoice_id)
      countByInvoice.set(invId, (countByInvoice.get(invId) ?? 0) + 1)
    }

    // 3. Para cada factura, calcular el índice de la cuota (ordenadas por due_date/sort_order)
    const sortedIndexByCuota = new Map<string, number>()
    const grouped = new Map<string, any[]>()
    for (const c of (cuotas || []) as any[]) {
      const invId = String(c.supplier_invoice_id)
      if (!grouped.has(invId)) grouped.set(invId, [])
      grouped.get(invId)!.push(c)
    }
    for (const [, list] of grouped.entries()) {
      list.sort((a: any, b: any) => {
        const byOrder = Number(a.sort_order ?? 0) - Number(b.sort_order ?? 0)
        if (byOrder !== 0) return byOrder
        return String(a.due_date).localeCompare(String(b.due_date))
      })
      list.forEach((c: any, i: number) => sortedIndexByCuota.set(String(c.id), i + 1))
    }

    const rows: SupplierVencimientoRow[] = []
    for (const c of (cuotas || []) as any[]) {
      const inv = c.invoice
      if (!inv) continue

      // Filtro de búsqueda (por proveedor o nº factura)
      if (term) {
        const name = String(inv.supplier_name ?? '').toLowerCase()
        const num = String(inv.invoice_number ?? '').toLowerCase()
        if (!name.includes(term) && !num.includes(term)) continue
      }

      const due = String(c.due_date ?? '')
      const amt = Number(c.amount ?? 0)
      const isOverdue = !c.is_paid && due && due < todayStr
      const daysOverdue = isOverdue
        ? Math.floor((new Date(todayStr).getTime() - new Date(due).getTime()) / 86400000)
        : 0

      // Derivar estado visible de la cuota
      let rowStatus: 'pagada' | 'vencida' | 'pendiente'
      if (c.is_paid) rowStatus = 'pagada'
      else if (isOverdue) rowStatus = 'vencida'
      else rowStatus = 'pendiente'

      // Filtros
      if (status === 'pagada' && rowStatus !== 'pagada') continue
      if (status === 'pendiente' && rowStatus !== 'pendiente') continue
      if (status === 'vencida' && rowStatus !== 'vencida') continue
      if (status === 'parcial') continue // ya no aplica al modelo por cuota
      if (status === 'all' && rowStatus === 'pagada') continue // por defecto oculta pagadas
      if (onlyOverdue && rowStatus !== 'vencida') continue

      const cuotaId = String(c.id)
      rows.push({
        id: cuotaId,
        supplier_invoice_id: String(c.supplier_invoice_id),
        supplier_id: inv.supplier_id ? String(inv.supplier_id) : null,
        supplier_name: String(inv.supplier_name ?? ''),
        supplier_cif: inv.supplier_cif ? String(inv.supplier_cif) : null,
        invoice_number: String(inv.invoice_number ?? ''),
        invoice_date: String(inv.invoice_date ?? ''),
        due_date: due,
        total_amount: Number(inv.total_amount ?? 0),
        installment_amount: Math.round(amt * 100) / 100,
        installment_index: sortedIndexByCuota.get(cuotaId) ?? 1,
        installment_count: countByInvoice.get(String(c.supplier_invoice_id)) ?? 1,
        amount_paid: c.is_paid ? Math.round(amt * 100) / 100 : 0,
        amount_pending: c.is_paid ? 0 : Math.round(amt * 100) / 100,
        status: rowStatus,
        is_paid: Boolean(c.is_paid),
        paid_at: c.paid_at ? String(c.paid_at) : null,
        payment_method: c.payment_method ? String(c.payment_method) : null,
        last_payment_date: c.paid_at ? String(c.paid_at) : null,
        last_payment_method: c.payment_method ? String(c.payment_method) : null,
        notes: inv.notes ? String(inv.notes) : null,
        days_overdue: daysOverdue,
        created_at: String(c.created_at ?? ''),
      })
    }

    return success(rows)
  },
)

// ─── Marcar cuota como pagada ────────────────────────────────────────────────

export const markSupplierInvoiceDueDatePaid = protectedAction<
  { id: string; paid_at?: string; payment_method?: SupplierPaymentMethod | string; create_accounting_entry?: boolean },
  { id: string; invoice_status: string; all_paid: boolean; auditEntityId: string; auditDescription: string }
>(
  {
    permission: PERMISSION,
    auditModule: 'accounting',
    auditAction: 'payment',
    auditEntity: 'ap_supplier_invoice_due_date',
  },
  async (ctx, input) => {
    if (!input.id) return failure('Cuota no indicada', 'VALIDATION')

    const { data: cuota, error: cuotaErr } = await ctx.adminClient
      .from(DUE_DATES_TABLE)
      .select('id, supplier_invoice_id, amount, is_paid')
      .eq('id', input.id)
      .maybeSingle()
    if (cuotaErr || !cuota) return failure(cuotaErr?.message || 'Cuota no encontrada')
    if ((cuota as any).is_paid) return failure('La cuota ya estaba pagada', 'VALIDATION')

    const paidAt = input.paid_at || today()
    const paymentMethod = (input.payment_method || 'transfer') as SupplierPaymentMethod

    // Leer factura para registrar pago asociado + descripción
    const { data: invoice } = await ctx.adminClient
      .from(INVOICES_TABLE)
      .select('id, total_amount, supplier_name, invoice_number')
      .eq('id', (cuota as any).supplier_invoice_id)
      .maybeSingle()

    // 1. Registrar pago en ap_supplier_invoice_payments + manual_transaction
    const invoiceId = (cuota as any).supplier_invoice_id
    let manualTransactionId: string | null = null
    if (input.create_accounting_entry !== false && invoice) {
      const mtPayload = {
        type: 'expense',
        date: paidAt,
        description: `Pago cuota factura ${(invoice as any).invoice_number} · ${(invoice as any).supplier_name}`,
        category: 'proveedores',
        // FK estructural a la factura (igual que registerSupplierInvoicePayment): sin
        // ella el espejo cae en "Sin clasificar" en el informe de gasto por proveedor.
        ap_supplier_invoice_id: invoiceId,
        amount: Number((cuota as any).amount),
        tax_rate: 0,
        tax_amount: 0,
        total: Number((cuota as any).amount),
        notes: `Método: ${SUPPLIER_PAYMENT_METHOD_LABEL[paymentMethod] ?? paymentMethod}`,
        created_by: ctx.userId,
      }
      const { data: mt } = await ctx.adminClient
        .from('manual_transactions')
        .insert(mtPayload)
        .select('id')
        .single()
      if (mt) manualTransactionId = String((mt as any).id)
    }

    if (invoice) {
      await ctx.adminClient.from(TABLE).insert({
        supplier_invoice_id: invoiceId,
        payment_date: paidAt,
        payment_method: paymentMethod,
        amount: Number((cuota as any).amount),
        reference: null,
        notes: `Cuota ${input.id}`,
        manual_transaction_id: manualTransactionId,
        created_by: ctx.userId,
      })
    }

    // 2. Marcar la cuota como pagada
    const { error: updErr } = await ctx.adminClient
      .from(DUE_DATES_TABLE)
      .update({ is_paid: true, paid_at: paidAt, payment_method: paymentMethod })
      .eq('id', input.id)
    if (updErr) return failure(updErr.message || 'Error al marcar cuota')

    // 3. Si todas las cuotas de la factura están pagadas → status='pagada'
    const { data: remaining } = await ctx.adminClient
      .from(DUE_DATES_TABLE)
      .select('id, is_paid')
      .eq('supplier_invoice_id', (cuota as any).supplier_invoice_id)
    const allPaid = Array.isArray(remaining) && remaining.length > 0 && remaining.every((r: any) => r.is_paid)
    let invoiceStatus = 'parcial'
    if (allPaid) {
      invoiceStatus = 'pagada'
      await ctx.adminClient
        .from(INVOICES_TABLE)
        .update({ status: 'pagada', payment_date: paidAt, payment_method: paymentMethod, updated_at: new Date().toISOString() })
        .eq('id', (cuota as any).supplier_invoice_id)
    } else {
      await ctx.adminClient
        .from(INVOICES_TABLE)
        .update({ status: 'parcial', updated_at: new Date().toISOString() })
        .eq('id', (cuota as any).supplier_invoice_id)
    }

    return success({
      id: input.id,
      invoice_status: invoiceStatus,
      all_paid: allPaid,
      auditEntityId: String((cuota as any).supplier_invoice_id),
      auditDescription: `Vencimiento pagado · factura ${(invoice as any)?.invoice_number ?? ''} · ${(invoice as any)?.supplier_name ?? ''}`,
    })
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

    const { data: cuotas, error: cuotasErr } = await ctx.adminClient
      .from(DUE_DATES_TABLE)
      .select(`
        id, supplier_invoice_id, due_date, amount, sort_order, is_paid, paid_at, payment_method, created_at,
        invoice:ap_supplier_invoices!supplier_invoice_id (
          id, supplier_id, supplier_name, supplier_cif, invoice_number, invoice_date, total_amount, status, notes
        )
      `)
      .eq('invoice.supplier_id', supplier_id)
      .eq('is_paid', false)
      .order('due_date', { ascending: true })
      .limit(500)
    if (cuotasErr) return failure(cuotasErr.message)

    // Filtrar por proveedor en TS (el embedded filter puede no cubrirlo todo)
    const filtered = (cuotas || []).filter((c: any) => c.invoice && String(c.invoice.supplier_id) === String(supplier_id))

    // Contar cuotas por factura para el índice
    const countByInvoice = new Map<string, number>()
    for (const c of filtered as any[]) {
      const invId = String(c.supplier_invoice_id)
      countByInvoice.set(invId, (countByInvoice.get(invId) ?? 0) + 1)
    }

    const todayStr = today()
    let total_pending = 0
    let overdue_pending = 0
    let count_overdue = 0
    const rows: SupplierVencimientoRow[] = []

    for (const c of filtered as any[]) {
      const inv = c.invoice
      const amt = Math.round(Number(c.amount ?? 0) * 100) / 100
      if (amt <= 0) continue
      const due = String(c.due_date ?? '')
      const daysOverdue = due && due < todayStr
        ? Math.floor((new Date(todayStr).getTime() - new Date(due).getTime()) / 86400000)
        : 0

      total_pending += amt
      if (daysOverdue > 0) {
        overdue_pending += amt
        count_overdue++
      }

      rows.push({
        id: String(c.id),
        supplier_invoice_id: String(c.supplier_invoice_id),
        supplier_id: inv.supplier_id ? String(inv.supplier_id) : null,
        supplier_name: String(inv.supplier_name ?? ''),
        supplier_cif: inv.supplier_cif ? String(inv.supplier_cif) : null,
        invoice_number: String(inv.invoice_number ?? ''),
        invoice_date: String(inv.invoice_date ?? ''),
        due_date: due,
        total_amount: Number(inv.total_amount ?? 0),
        installment_amount: amt,
        installment_index: 1,
        installment_count: countByInvoice.get(String(c.supplier_invoice_id)) ?? 1,
        amount_paid: 0,
        amount_pending: amt,
        status: daysOverdue > 0 ? 'vencida' : 'pendiente',
        is_paid: false,
        paid_at: null,
        payment_method: c.payment_method ? String(c.payment_method) : null,
        last_payment_date: null,
        last_payment_method: null,
        notes: inv.notes ? String(inv.notes) : null,
        days_overdue: daysOverdue,
        created_at: String(c.created_at ?? ''),
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
