'use server'

import { createAdminClient } from '@/lib/supabase/admin'
import { toCountryCode, countryName } from '@/lib/countries'

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

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyClient = any

async function ensureChartAccounts(db: AnyClient) {
  const rows = Object.entries(REQUIRED_ACCOUNTS).map(([code, { name, level, account_type }]) => ({
    account_code: code,
    name,
    level,
    account_type,
    normal_balance: ['asset', 'expense'].includes(account_type) ? 'debit' : 'credit',
    is_detail: true,
    is_active: true,
  }))
  await db.from('chart_of_accounts').upsert(rows, {
    onConflict: 'account_code',
    ignoreDuplicates: true,
  })
}

async function getNextEntryNumber(db: AnyClient, fiscalYear: number): Promise<number> {
  const { data } = await db
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
    const db: AnyClient = admin
    const { data: sale, error: saleError } = await admin
      .from('sales')
      .select('id, total, subtotal, tax_amount, client_id, created_at')
      .eq('id', saleId)
      .single()

    if (saleError || !sale) return { ok: false, error: 'Venta no encontrada' }

    const s = sale as any
    const total = Number(s.total ?? 0)
    const subtotal = Number(s.subtotal ?? s.total) ?? 0
    const taxAmount = Number(s.tax_amount ?? 0)
    const saleDate = s.created_at as string | undefined
    const date = saleDate ? saleDate.slice(0, 10) : new Date().toISOString().split('T')[0]
    const fiscalYear = new Date(date).getFullYear()
    const fiscalMonth = new Date(date).getMonth() + 1

    await ensureChartAccounts(db)
    const entryNumber = await getNextEntryNumber(db, fiscalYear)

    const { data: entry, error: entryError } = await db
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

    const entryId = entry.id
    await db.from('journal_entry_lines').insert([
      { journal_entry_id: entryId, account_code: '430', debit: total, credit: 0, description: 'Cliente', sort_order: 0 },
      { journal_entry_id: entryId, account_code: '700', debit: 0, credit: subtotal, description: 'Ventas', sort_order: 1 },
      { journal_entry_id: entryId, account_code: '477', debit: 0, credit: taxAmount, description: 'IVA repercutido', sort_order: 2 },
    ])

    await db.from('sales').update({ journal_entry_id: entryId }).eq('id', saleId)
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
    const db: AnyClient = admin
    const { data: order, error: orderError } = await admin
      .from('supplier_orders')
      .select('id, total, subtotal, tax_amount, order_date, created_at')
      .eq('id', supplierOrderId)
      .single()

    if (orderError || !order) return { ok: false, error: 'Pedido no encontrado' }

    const o = order as any
    const total = Number(o.total ?? 0)
    const taxAmount = Number(o.tax_amount ?? 0)
    const subtotal = total - taxAmount
    const rawDate = o.order_date ?? o.created_at
    const date = rawDate ? String(rawDate).slice(0, 10) : new Date().toISOString().split('T')[0]
    const fiscalYear = new Date(date).getFullYear()
    const fiscalMonth = new Date(date).getMonth() + 1

    await ensureChartAccounts(db)
    const entryNumber = await getNextEntryNumber(db, fiscalYear)

    const { data: entry, error: entryError } = await db
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

    const entryId = entry.id
    await db.from('journal_entry_lines').insert([
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
    const db: AnyClient = admin
    const { data: order, error: orderError } = await db
      .from('online_orders')
      .select('id, total, subtotal, tax_amount, created_at')
      .eq('id', onlineOrderId)
      .single()

    if (orderError || !order) return { ok: false, error: 'Pedido online no encontrado' }

    const total = Number(order.total ?? 0)
    const subtotal = Number(order.subtotal ?? total - Number(order.tax_amount ?? 0))
    const taxAmount = Number(order.tax_amount ?? 0)
    const date = order.created_at ? String(order.created_at).slice(0, 10) : new Date().toISOString().split('T')[0]
    const fiscalYear = new Date(date).getFullYear()
    const fiscalMonth = new Date(date).getMonth() + 1

    await ensureChartAccounts(db)
    const entryNumber = await getNextEntryNumber(db, fiscalYear)

    const { data: entry, error: entryError } = await db
      .from('journal_entries')
      .insert({
        entry_number: entryNumber,
        fiscal_year: fiscalYear,
        fiscal_month: fiscalMonth,
        entry_date: date,
        description: `Venta online #${order.order_number ?? onlineOrderId.slice(0, 8)}`,
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

    const entryId = entry.id
    await db.from('journal_entry_lines').insert([
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
 * Emite la factura de un pedido online pagado (serie W, W2026-0001…).
 * La llaman los webhooks de Redsys/Stripe al confirmar el cobro (y el backfill).
 *
 * - Idempotente: si ya existe factura vigente para el pedido, la devuelve
 *   (los webhooks reintentan; además la protege el índice único parcial
 *   uq_invoices_online_order_active de la mig 257).
 * - invoice_date = fecha de pago (relevante para el backfill y el IVA).
 * - NO crea asiento de factura: el pedido online ya tiene su asiento
 *   (reference_type='online_order', creado por createOnlineOrderJournalEntry);
 *   un asiento de la factura duplicaría ventas/IVA en el libro diario.
 * - client_country (ISO-2) para el control nacional/UE/extra-UE (OSS).
 * - Contabilidad A la suma vía online_order_id; el escenario C la recoge por
 *   su criterio de facturas emitidas sin sale_id/tailoring_order_id.
 */
export async function createOnlineOrderInvoice(onlineOrderId: string): Promise<{ ok: boolean; invoiceNumber?: string; error?: string; skipped?: boolean }> {
  try {
    const admin = createAdminClient()
    const db: AnyClient = admin

    const { data: order, error: orderError } = await admin
      .from('online_orders')
      .select('id, order_number, status, subtotal, tax_amount, shipping_cost, total, client_id, shipping_address, paid_at, created_at')
      .eq('id', onlineOrderId)
      .single()
    if (orderError || !order) return { ok: false, error: 'Pedido online no encontrado' }

    const o = order as {
      order_number?: string; status?: string; subtotal?: number; tax_amount?: number
      shipping_cost?: number; total?: number; client_id?: string | null
      shipping_address?: Record<string, unknown> | null; paid_at?: string | null; created_at?: string | null
    }
    if (!['paid', 'shipped', 'delivered'].includes(String(o.status))) {
      return { ok: true, skipped: true } // no facturamos pedidos no cobrados/cancelados
    }

    const existing = await admin
      .from('invoices')
      .select('id, invoice_number')
      .eq('online_order_id', onlineOrderId)
      .neq('status', 'cancelled')
      .limit(1)
      .maybeSingle()
    if (existing.data?.id) {
      return { ok: true, invoiceNumber: String((existing.data as { invoice_number?: string }).invoice_number ?? ''), skipped: true }
    }

    const { data: rawLines } = await admin
      .from('online_order_lines')
      .select('product_name, variant_sku, quantity, total')
      .eq('order_id', onlineOrderId)
      .order('created_at', { ascending: true })
    const orderLines = (rawLines ?? []) as Array<{ product_name?: string; variant_sku?: string; quantity?: number; total?: number }>
    if (orderLines.length === 0) return { ok: false, error: 'El pedido online no tiene líneas' }

    const shipping = Number(o.shipping_cost) || 0
    const orderTotal = Number(o.total) || 0
    const linesTotal = orderLines.reduce((s, l) => s + (Number(l.total) || 0), 0)
    // total = (líneas − descuento) + envío → descuento implícito si no cuadra.
    const discount = Math.round((linesTotal + shipping - orderTotal) * 100) / 100

    // invoice_lines: unit_price es base SIN IVA; line_total CON IVA (mismo
    // criterio que createInvoiceFromSaleAction, convertido vía line_total).
    type InvLine = { description: string; quantity: number; unit_price: number; tax_rate: number; line_total: number }
    const TAX = 21
    const invLines: InvLine[] = orderLines.map((l) => {
      const qty = Math.max(1, Number(l.quantity) || 1)
      const lineTotal = Number(l.total) || 0
      const sku = l.variant_sku ? ` (${l.variant_sku})` : ''
      return {
        description: `${l.product_name || 'Producto'}${sku}`,
        quantity: qty,
        unit_price: Number((lineTotal / (1 + TAX / 100) / qty).toFixed(2)),
        tax_rate: TAX,
        line_total: lineTotal,
      }
    })
    if (discount > 0.005) {
      invLines.push({
        description: 'Descuento',
        quantity: 1,
        unit_price: -Number((discount / (1 + TAX / 100)).toFixed(2)),
        tax_rate: TAX,
        line_total: -discount,
      })
    }
    if (shipping > 0.005) {
      invLines.push({
        description: 'Gastos de envío',
        quantity: 1,
        unit_price: Number((shipping / (1 + TAX / 100)).toFixed(2)),
        tax_rate: TAX,
        line_total: shipping,
      })
    }

    // Totales de la factura desde el total real cobrado (IVA español incluido;
    // el tratamiento OSS/exportación queda pendiente de la gestoría).
    const subtotal = Math.round((orderTotal / (1 + TAX / 100)) * 100) / 100
    const taxAmount = Math.round((orderTotal - subtotal) * 100) / 100

    // Datos del comprador: la dirección del pedido es la fiscalmente relevante;
    // el NIF (si existe) viene de la ficha de cliente.
    const addr = (o.shipping_address ?? {}) as Record<string, unknown>
    const first = String(addr.first_name ?? '').trim()
    const last = String(addr.last_name ?? '').trim()
    let clientName = [first, last].filter(Boolean).join(' ')
    let clientNif: string | null = null
    if (o.client_id) {
      const { data: client } = await admin
        .from('clients')
        .select('full_name, company_name, company_nif, document_number')
        .eq('id', o.client_id)
        .maybeSingle()
      const c = (client ?? {}) as { full_name?: string; company_name?: string; company_nif?: string; document_number?: string }
      clientName = clientName || c.full_name || c.company_name || ''
      clientNif = c.company_nif || c.document_number || null
    }
    clientName = clientName || 'Cliente tienda online'
    const clientCountry = toCountryCode(String(addr.country ?? ''))
    const addressParts = [
      String(addr.address ?? '').trim(),
      [String(addr.postal_code ?? '').trim(), String(addr.city ?? '').trim()].filter(Boolean).join(' '),
      String(addr.province ?? '').trim(),
      clientCountry ? countryName(clientCountry) : '',
    ].filter(Boolean)

    const paidDate = String(o.paid_at ?? o.created_at ?? new Date().toISOString()).slice(0, 10)
    const seriesYear = Number(paidDate.slice(0, 4))

    // Numeración serie W del año del pago: máximo + 1 (nunca count+1, ver
    // nextSeriesNumber en accounting.ts). Reintento ante carrera de webhooks:
    // si chocan dos inserciones, la segunda recalcula el número.
    for (let attempt = 0; attempt < 3; attempt++) {
      const { data: lastRow } = await admin
        .from('invoices')
        .select('invoice_number')
        .like('invoice_number', `W${seriesYear}-%`)
        .order('invoice_number', { ascending: false })
        .limit(1)
      const last = (lastRow?.[0] as { invoice_number?: string } | undefined)?.invoice_number
      const lastSeq = last ? parseInt(last.split('-')[1], 10) || 0 : 0
      const invoiceNumber = `W${seriesYear}-${String(lastSeq + 1).padStart(4, '0')}`

      const { data: inv, error } = await db
        .from('invoices')
        .insert({
          invoice_number: invoiceNumber,
          invoice_series: 'W',
          invoice_type: 'issued',
          client_id: o.client_id ?? null,
          client_name: clientName,
          client_nif: clientNif,
          client_address: addressParts.join(', ') || null,
          client_email: String(addr.email ?? '') || null,
          client_phone: String(addr.phone ?? '') || null,
          client_country: clientCountry,
          payment_method: 'card',
          company_name: 'Sastrería Prats',
          company_nif: 'B12345678',
          company_address: 'Madrid, España',
          invoice_date: paidDate,
          due_date: paidDate,
          subtotal,
          tax_rate: TAX,
          tax_amount: taxAmount,
          irpf_rate: 0,
          irpf_amount: 0,
          total: orderTotal,
          status: 'issued',
          online_order_id: onlineOrderId,
          notes: `Pedido online ${o.order_number ?? ''}`.trim(),
        })
        .select('id')
        .single()

      if (error) {
        const msg = String(error.message ?? '')
        if (error.code === '23505' && msg.includes('uq_invoices_online_order_active')) {
          return { ok: true, skipped: true } // otro webhook la creó a la vez
        }
        if (error.code === '23505') continue // choque de numeración: recalcular
        return { ok: false, error: msg }
      }

      const { error: linesError } = await db.from('invoice_lines').insert(
        invLines.map((l, i) => ({ invoice_id: inv.id, ...l, sort_order: i }))
      )
      if (linesError) {
        // No dejamos una factura sin líneas: se retira la cabecera y se reporta.
        await db.from('invoices').delete().eq('id', inv.id)
        return { ok: false, error: linesError.message }
      }
      return { ok: true, invoiceNumber }
    }
    return { ok: false, error: 'No se pudo asignar número de serie W (conflictos repetidos)' }
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
    const db: AnyClient = admin
    const { data: inv, error: invError } = await admin
      .from('invoices')
      .select('id, invoice_number, total, subtotal, tax_amount, irpf_amount, invoice_date')
      .eq('id', invoiceId)
      .single()

    if (invError || !inv) return { ok: false, error: 'Factura no encontrada' }

    const i = inv as any
    const total = Number(i.total ?? 0)
    const subtotal = Number(i.subtotal ?? 0)
    const taxAmount = Number(i.tax_amount ?? 0)
    const irpfAmount = Number(i.irpf_amount ?? 0)
    const date = i.invoice_date
      ? String(i.invoice_date).slice(0, 10)
      : new Date().toISOString().split('T')[0]
    const fiscalYear = new Date(date).getFullYear()
    const fiscalMonth = new Date(date).getMonth() + 1

    await ensureChartAccounts(db)
    const entryNumber = await getNextEntryNumber(db, fiscalYear)

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

    const { data: entry, error: entryError } = await db
      .from('journal_entries')
      .insert({
        entry_number: entryNumber,
        fiscal_year: fiscalYear,
        fiscal_month: fiscalMonth,
        entry_date: date,
        description: `Factura ${i.invoice_number ?? invoiceId.slice(0, 8)}`,
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

    const entryId = entry.id
    await db.from('journal_entry_lines').insert(
      lines.map((l, idx) => ({
        journal_entry_id: entryId,
        account_code: l.account_code,
        debit: l.debit,
        credit: l.credit,
        description: l.description,
        sort_order: idx,
      }))
    )

    await db.from('invoices').update({ journal_entry_id: entryId }).eq('id', invoiceId)
    return { ok: true }
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Error desconocido'
    return { ok: false, error: msg }
  }
}

/**
 * Crea el asiento INVERSO (contrapartida) de una factura al ANULARLA: espeja las
 * líneas del asiento original con Debe/Haber intercambiados, con fecha de la
 * cancelación. Así la cuenta 700 (Ventas) y el resto netean a cero sin borrar el
 * asiento posted original. Mismo principio que la contrapartida de las
 * rectificativas (mig 192), no se borra un asiento contabilizado, se contrarresta.
 *
 * Idempotente: si ya existe el inverso (asiento "Anulación factura …" para esta
 * factura) no crea otro. `skipped` = no había asiento que revertir (o ya revertido).
 */
export async function reverseInvoiceJournalEntry(invoiceId: string): Promise<{ ok: boolean; error?: string; skipped?: boolean }> {
  try {
    const admin = createAdminClient()
    const db: AnyClient = admin

    const { data: inv, error: invErr } = await admin
      .from('invoices')
      .select('id, invoice_number, journal_entry_id')
      .eq('id', invoiceId)
      .single()
    if (invErr || !inv) return { ok: false, error: 'Factura no encontrada' }

    const journalEntryId = (inv as { journal_entry_id?: string | null }).journal_entry_id ?? null
    if (!journalEntryId) return { ok: true, skipped: true } // sin asiento que revertir

    const { data: orig } = await admin
      .from('journal_entries')
      .select('id, status, entry_type')
      .eq('id', journalEntryId)
      .single()
    if (!orig) return { ok: true, skipped: true }
    if ((orig as { status?: string }).status !== 'posted') return { ok: true, skipped: true } // ya no cuenta

    // Idempotencia: ¿ya existe el inverso de esta factura? (lo marca la descripción
    // "Anulación factura …"; el entry_type debe ser uno permitido por el CHECK
    // journal_entries_entry_type_check, que NO admite valores nuevos.)
    const { data: existingRev } = await admin
      .from('journal_entries')
      .select('id')
      .eq('reference_id', invoiceId)
      .ilike('description', 'Anulación factura%')
      .limit(1)
      .maybeSingle()
    if (existingRev) return { ok: true, skipped: true }

    const { data: origLines } = await admin
      .from('journal_entry_lines')
      .select('account_code, debit, credit, description, sort_order')
      .eq('journal_entry_id', journalEntryId)
      .order('sort_order', { ascending: true })
    const lines = (origLines ?? []) as { account_code: string; debit: number | string | null; credit: number | string | null; description: string | null; sort_order: number }[]
    if (lines.length === 0) return { ok: true, skipped: true }

    const date = new Date().toISOString().split('T')[0]
    const fiscalYear = new Date(date).getFullYear()
    const fiscalMonth = new Date(date).getMonth() + 1
    const entryNumber = await getNextEntryNumber(db, fiscalYear)

    // Líneas espejo: Debe <-> Haber
    const swapped = lines.map((l, idx) => ({
      account_code: l.account_code,
      debit: Number(l.credit ?? 0),
      credit: Number(l.debit ?? 0),
      description: l.description ?? null,
      sort_order: idx,
    }))
    const totalDebit = swapped.reduce((s, l) => s + l.debit, 0)
    const totalCredit = swapped.reduce((s, l) => s + l.credit, 0)

    const { data: entry, error: entryErr } = await db
      .from('journal_entries')
      .insert({
        entry_number: entryNumber,
        fiscal_year: fiscalYear,
        fiscal_month: fiscalMonth,
        entry_date: date,
        description: `Anulación factura ${(inv as { invoice_number?: string }).invoice_number ?? invoiceId.slice(0, 8)}`,
        // entry_type debe ser uno permitido por el CHECK (sale/purchase/manual);
        // el inverso es de contexto venta, igual que el asiento original.
        entry_type: 'sale',
        reference_type: 'invoice',
        reference_id: invoiceId,
        status: 'posted',
        total_debit: totalDebit,
        total_credit: totalCredit,
      })
      .select('id')
      .single()
    if (entryErr || !entry) return { ok: false, error: entryErr?.message ?? 'Error al crear asiento inverso' }

    const { error: linesErr } = await db.from('journal_entry_lines').insert(
      swapped.map((l) => ({
        journal_entry_id: entry.id,
        account_code: l.account_code,
        debit: l.debit,
        credit: l.credit,
        description: l.description,
        sort_order: l.sort_order,
      }))
    )
    if (linesErr) return { ok: false, error: linesErr.message }

    return { ok: true }
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Error desconocido'
    return { ok: false, error: msg }
  }
}
