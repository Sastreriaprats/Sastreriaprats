import type { AdminClient } from '@/lib/server/action-wrapper'

export type SupplierPaymentConfig = {
  payment_terms: string | null
  payment_days: number | null
  custom_payment_plan: Array<{ amount: number; days?: number | null }> | null
}

export type InstallmentSpec = { due_date: string; amount: number; sort_order: number }

export function addDaysISO(dateStr: string, days: number): string {
  const d = new Date(dateStr)
  d.setDate(d.getDate() + days)
  return d.toISOString().slice(0, 10)
}

export function computeDueDate(
  invoiceDate: string,
  paymentDays: number | null,
  terms: string | null,
): string {
  if (paymentDays !== null && Number.isFinite(paymentDays) && paymentDays >= 0) {
    return addDaysISO(invoiceDate, paymentDays)
  }
  switch (terms) {
    case 'immediate': return invoiceDate
    case 'net_15': return addDaysISO(invoiceDate, 15)
    case 'net_30': return addDaysISO(invoiceDate, 30)
    case 'net_60': return addDaysISO(invoiceDate, 60)
    case 'net_90': return addDaysISO(invoiceDate, 90)
    default: return addDaysISO(invoiceDate, 30)
  }
}

/**
 * Construye la lista de cuotas a generar para una factura.
 * - custom + plan con importes > 0 → cuotas del plan; el último sumidero absorbe residuos.
 * - En cualquier otro caso → 1 sola cuota con el total.
 */
export function buildInstallments(
  invoiceDate: string,
  fallbackDueDate: string,
  totalAmount: number,
  supplier: SupplierPaymentConfig | null,
): InstallmentSpec[] {
  const total = Math.round(totalAmount * 100) / 100
  const plan = supplier?.custom_payment_plan ?? null
  if (supplier?.payment_terms === 'custom' && plan && plan.length > 0) {
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

export async function replaceInvoiceInstallments(
  adminClient: AdminClient,
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

/**
 * Recalcula `due_date` y cuotas (`ap_supplier_invoice_due_dates`) de TODAS las
 * facturas pendientes (no pagadas) de un proveedor según su configuración de
 * pago actual. Las facturas con cuotas ya cobradas se omiten para no destruir
 * cobros registrados.
 *
 * Devuelve cuántas facturas se actualizaron y cuántas se omitieron por tener
 * cuotas pagadas.
 */
export async function recalculatePendingInvoicesForSupplier(
  adminClient: AdminClient,
  supplierId: string,
  supplier: SupplierPaymentConfig,
): Promise<{ updated: number; skippedHasPaid: number }> {
  const { data: invoices, error: invErr } = await adminClient
    .from('ap_supplier_invoices')
    .select('id, invoice_date, total_amount, status')
    .eq('supplier_id', supplierId)
    .in('status', ['pendiente', 'vencida', 'parcial'])
  if (invErr || !invoices || invoices.length === 0) {
    return { updated: 0, skippedHasPaid: 0 }
  }

  const invoiceIds = (invoices as any[]).map((r) => String(r.id))
  const { data: cuotas } = await adminClient
    .from('ap_supplier_invoice_due_dates')
    .select('supplier_invoice_id, is_paid')
    .in('supplier_invoice_id', invoiceIds)
  const paidByInvoice = new Set<string>()
  for (const r of (cuotas || []) as any[]) {
    if (r.is_paid) paidByInvoice.add(String(r.supplier_invoice_id))
  }

  let updated = 0
  let skippedHasPaid = 0

  for (const inv of invoices as any[]) {
    const invId = String(inv.id)
    if (paidByInvoice.has(invId)) {
      skippedHasPaid++
      continue
    }
    const newDue = computeDueDate(
      String(inv.invoice_date),
      supplier.payment_days ?? null,
      supplier.payment_terms ?? null,
    )
    const { error: upErr } = await adminClient
      .from('ap_supplier_invoices')
      .update({ due_date: newDue, updated_at: new Date().toISOString() })
      .eq('id', invId)
    if (upErr) continue

    const installments = buildInstallments(
      String(inv.invoice_date),
      newDue,
      Number(inv.total_amount ?? 0),
      supplier,
    )
    await replaceInvoiceInstallments(adminClient, invId, installments)
    updated++
  }

  return { updated, skippedHasPaid }
}
