'use server'

import { createAdminClient } from '@/lib/supabase/admin'

/** Cuentas usadas en asientos automáticos. Código -> { name, level, account_type } */
const REQUIRED_ACCOUNTS: Record<string, { name: string; level: number; account_type: string }> = {
  '430': { name: 'Clientes', level: 3, account_type: 'asset' },
  '700': { name: 'Ventas mercaderías', level: 3, account_type: 'income' },
  '477': { name: 'HP IVA repercutido', level: 3, account_type: 'liability' },
  '472': { name: 'HP IVA soportado', level: 3, account_type: 'asset' },
  '473': { name: 'HP retenciones y pagos a cuenta', level: 3, account_type: 'asset' },
  '400': { name: 'Proveedores', level: 3, account_type: 'liability' },
  '600': { name: 'Compras mercaderías', level: 3, account_type: 'expense' },
}

async function ensureChartAccounts(admin: ReturnType<typeof createAdminClient>) {
  for (const [code, { name, level, account_type }] of Object.entries(REQUIRED_ACCOUNTS)) {
    await admin.from('chart_of_accounts').upsert(
      {
        account_code: code,
        name,
        level,
        account_type,
        normal_balance: ['asset', 'expense'].includes(account_type) ? 'debit' : 'credit',
        is_detail: true,
        is_active: true,
      },
      { onConflict: 'account_code', ignoreDuplicates: true }
    )
  }
}

async function getNextEntryNumber(admin: ReturnType<typeof createAdminClient>, fiscalYear: number): Promise<number> {
  const { data } = await admin
    .from('journal_entries')
    .select('entry_number')
    .eq('fiscal_year', fiscalYear)
    .order('entry_number', { ascending: false })
    .limit(1)
    .single()
  return ((data as { entry_number?: number } | null)?.entry_number ?? 0) + 1
}

/**
 * Crea asiento contable por venta (TPV): Debe 430 (Clientes), Haber 700 (Ventas), Haber 477 (IVA).
 * Actualiza sales.journal_entry_id si la columna existe.
 */
export async function createSaleJournalEntry(saleId: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const admin = createAdminClient()
    const { data: sale, error: saleError } = await admin
      .from('sales')
      .select('id, total, subtotal, tax_amount, client_id, created_at')
      .eq('id', saleId)
      .single()

    if (saleError || !sale) return { ok: false, error: 'Venta no encontrada' }

    const total = Number(sale.total ?? 0)
    const subtotal = Number(sale.subtotal ?? sale.total) ?? 0
    const taxAmount = Number(sale.tax_amount ?? 0)
    const saleDate = (sale as { created_at?: string }).created_at
    const date = saleDate ? saleDate.slice(0, 10) : new Date().toISOString().split('T')[0]
    const fiscalYear = new Date(date).getFullYear()
    const fiscalMonth = new Date(date).getMonth() + 1

    await ensureChartAccounts(admin)
    const entryNumber = await getNextEntryNumber(admin, fiscalYear)

    const { data: entry, error: entryError } = await admin
      .from('journal_entries')
      .insert({
        entry_number: entryNumber,
        fiscal_year: fiscalYear,
        fiscal_month: fiscalMonth,
        entry_date: date,
        description: `Venta TPV #${saleId.slice(0, 8)}`,
        entry_type: 'sale',
        reference_type: 'sale',
        reference_id: saleId,
        status: 'posted',
        total_debit: total,
        total_credit: total,
      })
      .select('id')
      .single()

    if (entryError || !entry) return { ok: false, error: entryError?.message ?? 'Error al crear asiento' }

    const entryId = (entry as { id: string }).id
    await admin.from('journal_entry_lines').insert([
      { journal_entry_id: entryId, account_code: '430', debit: total, credit: 0, description: 'Cliente', sort_order: 0 },
      { journal_entry_id: entryId, account_code: '700', debit: 0, credit: subtotal, description: 'Ventas', sort_order: 1 },
      { journal_entry_id: entryId, account_code: '477', debit: 0, credit: taxAmount, description: 'IVA repercutido', sort_order: 2 },
    ])

    await admin.from('sales').update({ journal_entry_id: entryId }).eq('id', saleId)
    return { ok: true }
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Error desconocido'
    return { ok: false, error: msg }
  }
}

/**
 * Crea asiento por compra a proveedor: Debe 600 (Compras), Debe 472 (IVA soportado), Haber 400 (Proveedores).
 */
export async function createPurchaseJournalEntry(supplierOrderId: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const admin = createAdminClient()
    const { data: order, error: orderError } = await admin
      .from('supplier_orders')
      .select('id, total, subtotal, tax_amount, order_date, created_at')
      .eq('id', supplierOrderId)
      .single()

    if (orderError || !order) return { ok: false, error: 'Pedido no encontrado' }

    const total = Number(order.total ?? 0)
    const taxAmount = Number(order.tax_amount ?? 0)
    const subtotal = total - taxAmount
    const rawDate = (order as { order_date?: string; created_at?: string }).order_date ?? (order as { created_at?: string }).created_at
    const date = rawDate ? String(rawDate).slice(0, 10) : new Date().toISOString().split('T')[0]
    const fiscalYear = new Date(date).getFullYear()
    const fiscalMonth = new Date(date).getMonth() + 1

    await ensureChartAccounts(admin)
    const entryNumber = await getNextEntryNumber(admin, fiscalYear)

    const { data: entry, error: entryError } = await admin
      .from('journal_entries')
      .insert({
        entry_number: entryNumber,
        fiscal_year: fiscalYear,
        fiscal_month: fiscalMonth,
        entry_date: date,
        description: `Compra proveedor #${supplierOrderId.slice(0, 8)}`,
        entry_type: 'purchase',
        reference_type: 'supplier_order',
        reference_id: supplierOrderId,
        status: 'posted',
        total_debit: total,
        total_credit: total,
      })
      .select('id')
      .single()

    if (entryError || !entry) return { ok: false, error: entryError?.message ?? 'Error al crear asiento' }

    const entryId = (entry as { id: string }).id
    await admin.from('journal_entry_lines').insert([
      { journal_entry_id: entryId, account_code: '600', debit: subtotal, credit: 0, description: 'Compras', sort_order: 0 },
      { journal_entry_id: entryId, account_code: '472', debit: taxAmount, credit: 0, description: 'IVA soportado', sort_order: 1 },
      { journal_entry_id: entryId, account_code: '400', debit: 0, credit: total, description: 'Proveedor', sort_order: 2 },
    ])

    return { ok: true }
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Error desconocido'
    return { ok: false, error: msg }
  }
}

/**
 * Crea asiento por pedido online (mismo esquema que venta, reference_type='online_order').
 */
export async function createOnlineOrderJournalEntry(onlineOrderId: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const admin = createAdminClient()
    const { data: order, error: orderError } = await admin
      .from('online_orders')
      .select('id, total, subtotal, tax_amount, created_at')
      .eq('id', onlineOrderId)
      .single()

    if (orderError || !order) return { ok: false, error: 'Pedido online no encontrado' }

    const total = Number(order.total ?? 0)
    const subtotal = Number(order.subtotal ?? total - Number(order.tax_amount ?? 0))
    const taxAmount = Number(order.tax_amount ?? 0)
    const rawDate = (order as { created_at?: string }).created_at
    const date = rawDate ? rawDate.slice(0, 10) : new Date().toISOString().split('T')[0]
    const fiscalYear = new Date(date).getFullYear()
    const fiscalMonth = new Date(date).getMonth() + 1

    await ensureChartAccounts(admin)
    const entryNumber = await getNextEntryNumber(admin, fiscalYear)

    const { data: entry, error: entryError } = await admin
      .from('journal_entries')
      .insert({
        entry_number: entryNumber,
        fiscal_year: fiscalYear,
        fiscal_month: fiscalMonth,
        entry_date: date,
        description: `Venta online #${(order as { order_number?: string }).order_number ?? onlineOrderId.slice(0, 8)}`,
        entry_type: 'sale',
        reference_type: 'online_order',
        reference_id: onlineOrderId,
        status: 'posted',
        total_debit: total,
        total_credit: total,
      })
      .select('id')
      .single()

    if (entryError || !entry) return { ok: false, error: entryError?.message ?? 'Error al crear asiento' }

    const entryId = (entry as { id: string }).id
    await admin.from('journal_entry_lines').insert([
      { journal_entry_id: entryId, account_code: '430', debit: total, credit: 0, description: 'Cliente', sort_order: 0 },
      { journal_entry_id: entryId, account_code: '700', debit: 0, credit: subtotal, description: 'Ventas', sort_order: 1 },
      { journal_entry_id: entryId, account_code: '477', debit: 0, credit: taxAmount, description: 'IVA repercutido', sort_order: 2 },
    ])

    return { ok: true }
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Error desconocido'
    return { ok: false, error: msg }
  }
}

/**
 * Crea asiento por factura emitida. Incluye IRPF (cuenta 473) si aplica.
 */
export async function createInvoiceJournalEntry(invoiceId: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const admin = createAdminClient()
    const { data: inv, error: invError } = await admin
      .from('invoices')
      .select('id, invoice_number, total, subtotal, tax_amount, irpf_amount, invoice_date')
      .eq('id', invoiceId)
      .single()

    if (invError || !inv) return { ok: false, error: 'Factura no encontrada' }

    const total = Number(inv.total ?? 0)
    const subtotal = Number(inv.subtotal ?? 0)
    const taxAmount = Number(inv.tax_amount ?? 0)
    const irpfAmount = Number(inv.irpf_amount ?? 0)
    const date = (inv as { invoice_date?: string }).invoice_date
      ? String((inv as { invoice_date: string }).invoice_date).slice(0, 10)
      : new Date().toISOString().split('T')[0]
    const fiscalYear = new Date(date).getFullYear()
    const fiscalMonth = new Date(date).getMonth() + 1

    await ensureChartAccounts(admin)
    const entryNumber = await getNextEntryNumber(admin, fiscalYear)

    const lines: { journal_entry_id: string; account_code: string; debit: number; credit: number; description: string; sort_order: number }[] = [
      { journal_entry_id: '', account_code: '430', debit: total, credit: 0, description: 'Cliente', sort_order: 0 },
      { journal_entry_id: '', account_code: '700', debit: 0, credit: subtotal, description: 'Ventas', sort_order: 1 },
      { journal_entry_id: '', account_code: '477', debit: 0, credit: taxAmount, description: 'IVA repercutido', sort_order: 2 },
    ]
    if (irpfAmount > 0) {
      lines.push({ journal_entry_id: '', account_code: '473', debit: irpfAmount, credit: 0, description: 'IRPF', sort_order: 3 })
    }

    const totalDebit = lines.reduce((s, l) => s + l.debit, 0)
    const totalCredit = lines.reduce((s, l) => s + l.credit, 0)

    const { data: entry, error: entryError } = await admin
      .from('journal_entries')
      .insert({
        entry_number: entryNumber,
        fiscal_year: fiscalYear,
        fiscal_month: fiscalMonth,
        entry_date: date,
        description: `Factura ${(inv as { invoice_number?: string }).invoice_number ?? invoiceId.slice(0, 8)}`,
        entry_type: 'sale',
        reference_type: 'invoice',
        reference_id: invoiceId,
        status: 'posted',
        total_debit: totalDebit,
        total_credit: totalCredit,
      })
      .select('id')
      .single()

    if (entryError || !entry) return { ok: false, error: entryError?.message ?? 'Error al crear asiento' }

    const entryId = (entry as { id: string }).id
    await admin.from('journal_entry_lines').insert(
      lines.map((l, i) => ({
        journal_entry_id: entryId,
        account_code: l.account_code,
        debit: l.debit,
        credit: l.credit,
        description: l.description,
        sort_order: i,
      }))
    )

    await admin.from('invoices').update({ journal_entry_id: entryId }).eq('id', invoiceId)
    return { ok: true }
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Error desconocido'
    return { ok: false, error: msg }
  }
}
