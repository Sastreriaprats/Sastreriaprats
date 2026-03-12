'use server'

import { protectedAction } from '@/lib/server/action-wrapper'
import { success, failure } from '@/lib/errors'
import { generateInvoicePdf } from '@/lib/pdf/invoice-pdf'
import { generateEstimatePdf } from '@/lib/pdf/estimate-pdf'
import { sendEstimateEmail } from '@/lib/email/transactional'
import { createInvoiceJournalEntry } from '@/actions/accounting-triggers'

export type AccountingSummary = {
  income: number
  expenses: number
  profit: number
  vatToPay: number
  monthlyData: { month: string; income: number; expenses: number }[]
  latestInvoices: { id: string; invoice_number: string; client_name: string; invoice_date: string; total: number; status: string }[]
}

export const getAccountingSummary = protectedAction<{ year: number }, AccountingSummary>(
  { permission: 'accounting.view', auditModule: 'accounting' },
  async (ctx, { year }) => {
    const start = `${year}-01-01`
    const end = `${year}-12-31T23:59:59`

    const [salesRes, purchasesRes, invoicesRes] = await Promise.all([
      ctx.adminClient.from('sales').select('total, subtotal, tax_amount, created_at').gte('created_at', start).lte('created_at', end).eq('status', 'completed'),
      ctx.adminClient.from('supplier_orders').select('total, tax_amount, created_at').gte('created_at', start).lte('created_at', end).in('status', ['received', 'partially_received']),
      ctx.adminClient.from('invoices').select('id, invoice_number, client_name, invoice_date, total, status').eq('invoice_type', 'issued').order('invoice_date', { ascending: false }).limit(10),
    ])

    const sales = salesRes.data || []
    const purchases = purchasesRes.data || []
    const income = sales.reduce((s: number, x: Record<string, unknown>) => s + (Number((x as any).subtotal ?? (x as any).total) || 0), 0)
    const vatCollected = sales.reduce((s: number, x: Record<string, unknown>) => s + (Number((x as any).tax_amount) || 0), 0)
    const expenses = purchases.reduce((s: number, x: Record<string, unknown>) => s + (Number((x as any).total) - Number((x as any).tax_amount || 0)), 0)
    const vatPaid = purchases.reduce((s: number, x: Record<string, unknown>) => s + (Number((x as any).tax_amount) || 0), 0)

    const byMonth: Record<string, { income: number; expenses: number }> = {}
    for (let m = 1; m <= 12; m++) {
      const key = `${year}-${String(m).padStart(2, '0')}`
      byMonth[key] = { income: 0, expenses: 0 }
    }
    for (const x of sales) {
      const d = (x as any).created_at
      if (d) {
        const key = d.slice(0, 7)
        if (!byMonth[key]) byMonth[key] = { income: 0, expenses: 0 }
        byMonth[key].income += Number((x as any).subtotal ?? (x as any).total) || 0
      }
    }
    for (const x of purchases) {
      const d = (x as any).created_at
      if (d) {
        const key = d.slice(0, 7)
        if (!byMonth[key]) byMonth[key] = { income: 0, expenses: 0 }
        byMonth[key].expenses += Number((x as any).total) - Number((x as any).tax_amount || 0) || 0
      }
    }
    const monthlyData = Object.entries(byMonth)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, v]) => ({ month, ...v }))

    const latestInvoices = (invoicesRes.data || []).map((inv: Record<string, unknown>) => ({
      id: String(inv.id),
      invoice_number: String(inv.invoice_number ?? ''),
      client_name: String(inv.client_name ?? ''),
      invoice_date: String(inv.invoice_date ?? ''),
      total: Number(inv.total ?? 0),
      status: String(inv.status ?? 'draft'),
    }))

    return success({
      income,
      expenses,
      profit: income - expenses,
      vatToPay: vatCollected - vatPaid,
      monthlyData,
      latestInvoices,
    })
  }
)

export type InvoiceRow = {
  id: string
  invoice_number: string
  client_id: string | null
  client_name: string
  invoice_date: string
  total: number
  status: string
  pdf_url: string | null
  sent_to_client: boolean
}

export const getInvoices = protectedAction<
  { search?: string; status?: string; dateFrom?: string; dateTo?: string },
  InvoiceRow[]
>(
  { permission: 'accounting.view', auditModule: 'accounting' },
  async (ctx, { search, status, dateFrom, dateTo }) => {
    let q = ctx.adminClient
      .from('invoices')
      .select('id, invoice_number, client_id, client_name, invoice_date, total, status, pdf_url, sent_to_client')
      .eq('invoice_type', 'issued')
      .order('invoice_date', { ascending: false })

    if (status && status !== 'all') q = q.eq('status', status === 'sent' ? 'issued' : status)
    if (dateFrom) q = q.gte('invoice_date', dateFrom)
    if (dateTo) q = q.lte('invoice_date', dateTo)
    if (search) q = q.or(`invoice_number.ilike.%${search}%,client_name.ilike.%${search}%`)

    const { data } = await q
    return success((data || []).map((r: Record<string, unknown>) => ({
      id: String(r.id),
      invoice_number: String(r.invoice_number ?? ''),
      client_id: (r.client_id as string) ?? null,
      client_name: String(r.client_name ?? ''),
      invoice_date: String(r.invoice_date ?? ''),
      total: Number(r.total ?? 0),
      status: String(r.status ?? 'draft'),
      pdf_url: (r.pdf_url as string) ?? null,
      sent_to_client: Boolean(r.sent_to_client),
    })))
  }
)

export type EstimateRow = {
  id: string
  estimate_number: string
  client_name: string
  client_email: string | null
  estimate_date: string
  valid_until: string | null
  total: number
  status: string
  invoice_id: string | null
}

export const getEstimates = protectedAction<
  { search?: string; status?: string },
  EstimateRow[]
>(
  { permission: 'accounting.view', auditModule: 'accounting' },
  async (ctx, { search, status }) => {
    let q = ctx.adminClient
      .from('estimates')
      .select('id, estimate_number, client_name, client_email, estimate_date, valid_until, total, status, invoice_id')
      .order('estimate_date', { ascending: false })

    if (status && status !== 'all') q = q.eq('status', status)
    if (search) q = q.or(`estimate_number.ilike.%${search}%,client_name.ilike.%${search}%`)

    const { data } = await q
    return success((data || []).map((r: Record<string, unknown>) => ({
      id: String(r.id),
      estimate_number: String(r.estimate_number ?? ''),
      client_name: String(r.client_name ?? ''),
      client_email: (r.client_email as string) ?? null,
      estimate_date: String(r.estimate_date ?? ''),
      valid_until: (r.valid_until as string) ?? null,
      total: Number(r.total ?? 0),
      status: String(r.status ?? 'draft'),
      invoice_id: (r.invoice_id as string) ?? null,
    })))
  }
)

export type JournalEntryRow = {
  id: string
  entry_number: number
  fiscal_year: number
  fiscal_month: number
  entry_date: string
  description: string
  entry_type: string
  status: string
  total_debit: number
  total_credit: number
  lines?: { account_code: string; name?: string; debit: number; credit: number; description: string | null }[]
}

export const getJournalEntries = protectedAction<
  { year?: number; month?: number },
  JournalEntryRow[]
>(
  { permission: 'accounting.view', auditModule: 'accounting' },
  async (ctx, { year, month }) => {
    const y = year ?? new Date().getFullYear()
    let q = ctx.adminClient
      .from('journal_entries')
      .select(`
        id, entry_number, fiscal_year, fiscal_month, entry_date, description, entry_type, status, total_debit, total_credit
      `)
      .eq('fiscal_year', y)
      .order('entry_date', { ascending: false })

    if (month) q = q.eq('fiscal_month', month)

    const { data: entries } = await q
    const list = (entries || []) as Record<string, unknown>[]
    const withLines: JournalEntryRow[] = []
    for (const e of list) {
      const { data: lines } = await ctx.adminClient
        .from('journal_entry_lines')
        .select('account_code, debit, credit, description')
        .eq('journal_entry_id', e.id)
        .order('sort_order')
      const lineList = (lines || []).map((l: Record<string, unknown>) => ({
        account_code: String(l.account_code),
        name: undefined as string | undefined,
        debit: Number(l.debit ?? 0),
        credit: Number(l.credit ?? 0),
        description: (l.description as string) ?? null,
      }))
      withLines.push({
        id: String(e.id),
        entry_number: Number(e.entry_number),
        fiscal_year: Number(e.fiscal_year),
        fiscal_month: Number(e.fiscal_month),
        entry_date: String(e.entry_date),
        description: String(e.description ?? ''),
        entry_type: String(e.entry_type ?? 'manual'),
        status: String(e.status ?? 'draft'),
        total_debit: Number(e.total_debit ?? 0),
        total_credit: Number(e.total_credit ?? 0),
        lines: lineList,
      })
    }
    return success(withLines)
  }
)

export type VatQuarterRow = {
  quarter: string
  period: string
  baseImponibleSales: number
  ivaRepercutido: number
  baseImponiblePurchases: number
  ivaSoportado: number
  resultado: number
}

export const getVatQuarterly = protectedAction<
  { year: number },
  { quarters: VatQuarterRow[]; totalRepercutido: number; totalSoportado: number }
>(
  { permission: 'accounting.view', auditModule: 'accounting' },
  async (ctx, { year }) => {
    const yearStart = `${year}-01-01T00:00:00`
    const yearEnd = `${year}-12-31T23:59:59`

    // 2 queries para todo el año (antes: 8 = 2 por trimestre)
    const [salesRes, purchasesRes] = await Promise.all([
      ctx.adminClient.from('sales').select('total, subtotal, tax_amount, created_at').gte('created_at', yearStart).lte('created_at', yearEnd).eq('status', 'completed'),
      ctx.adminClient.from('supplier_orders').select('total, tax_amount, created_at').gte('created_at', yearStart).lte('created_at', yearEnd).in('status', ['received', 'partially_received']),
    ])
    const sales = (salesRes.data || []) as Array<{ total?: number; subtotal?: number; tax_amount?: number; created_at?: string }>
    const purchases = (purchasesRes.data || []) as Array<{ total?: number; tax_amount?: number; created_at?: string }>

    const quarterFromMonth = (m: number) => Math.ceil(m / 3) as 1 | 2 | 3 | 4
    const byQuarter: Record<number, { baseSales: number; ivaRepercutido: number; basePurchases: number; ivaSoportado: number }> = { 1: { baseSales: 0, ivaRepercutido: 0, basePurchases: 0, ivaSoportado: 0 }, 2: { baseSales: 0, ivaRepercutido: 0, basePurchases: 0, ivaSoportado: 0 }, 3: { baseSales: 0, ivaRepercutido: 0, basePurchases: 0, ivaSoportado: 0 }, 4: { baseSales: 0, ivaRepercutido: 0, basePurchases: 0, ivaSoportado: 0 } }
    for (const x of sales) {
      const d = x.created_at
      if (d) {
        const month = Number(d.slice(5, 7))
        const q = quarterFromMonth(month)
        const base = Number(x.subtotal ?? x.total) || 0
        const iva = Number(x.tax_amount) || 0
        byQuarter[q].baseSales += base
        byQuarter[q].ivaRepercutido += iva
      }
    }
    for (const x of purchases) {
      const d = x.created_at
      if (d) {
        const month = Number(d.slice(5, 7))
        const q = quarterFromMonth(month)
        const total = Number(x.total) || 0
        const iva = Number(x.tax_amount) || 0
        byQuarter[q].basePurchases += total - iva
        byQuarter[q].ivaSoportado += iva
      }
    }

    const quarters: VatQuarterRow[] = []
    for (let q = 1; q <= 4; q++) {
      const startMonth = (q - 1) * 3 + 1
      const endMonth = q * 3
      const start = `${year}-${String(startMonth).padStart(2, '0')}-01`
      const endDate = new Date(year, endMonth, 0)
      const end = `${year}-${String(endMonth).padStart(2, '0')}-${String(endDate.getDate()).padStart(2, '0')}`
      const v = byQuarter[q]
      quarters.push({
        quarter: `T${q}`,
        period: `${start.slice(5, 7)}/${year} - ${end.slice(5, 7)}/${year}`,
        baseImponibleSales: v.baseSales,
        ivaRepercutido: v.ivaRepercutido,
        baseImponiblePurchases: v.basePurchases,
        ivaSoportado: v.ivaSoportado,
        resultado: v.ivaRepercutido - v.ivaSoportado,
      })
    }
    const totalRepercutido = quarters.reduce((s, x) => s + x.ivaRepercutido, 0)
    const totalSoportado = quarters.reduce((s, x) => s + x.ivaSoportado, 0)
    return success({ quarters, totalRepercutido, totalSoportado })
  }
)

export const getClientsForInvoice = protectedAction<void, { id: string; full_name: string; email: string | null }[]>(
  { permission: 'accounting.edit', auditModule: 'accounting' },
  async (ctx) => {
    const { data } = await ctx.adminClient.from('clients').select('id, first_name, last_name, full_name, email').order('last_name').limit(500)
    return success((data || []).map((c: Record<string, unknown>) => {
      const fn = (c as any).full_name ?? `${(c as any).first_name ?? ''} ${(c as any).last_name ?? ''}`.trim()
      return { id: String(c.id), full_name: String(fn || 'Sin nombre'), email: (c.email as string) ?? null }
    }))
  }
)

/** Productos para añadir como líneas en factura/presupuesto (búsqueda por nombre o SKU). */
export const getProductsForInvoice = protectedAction<
  { search?: string },
  { id: string; name: string; sku: string; base_price: number }[]
>(
  { permission: 'accounting.edit', auditModule: 'accounting' },
  async (ctx, { search }) => {
    let q = ctx.adminClient
      .from('products')
      .select('id, name, sku, base_price')
      .eq('is_active', true)
      .order('name')
      .limit(50)
    if (search && search.trim()) {
      const term = `%${search.trim()}%`
      q = q.or(`name.ilike.${term},sku.ilike.${term}`)
    }
    const { data } = await q
    return success((data || []).map((p: Record<string, unknown>) => ({
      id: String(p.id),
      name: String((p as any).name ?? ''),
      sku: String((p as any).sku ?? ''),
      base_price: Number((p as any).base_price ?? 0),
    })))
  }
)

/** Pedidos de sastrería para cargar líneas en factura/presupuesto (opcionalmente por cliente). */
export const listTailoringOrdersForInvoice = protectedAction<
  { clientId?: string },
  { id: string; order_number: string; total: number; client_name: string }[]
>(
  { permission: 'accounting.edit', auditModule: 'accounting' },
  async (ctx, { clientId }) => {
    let q = ctx.adminClient
      .from('tailoring_orders')
      .select('id, order_number, total, client_id, clients(full_name)')
      .not('status', 'in', '("cancelled")')
      .order('created_at', { ascending: false })
      .limit(100)
    if (clientId) q = q.eq('client_id', clientId)
    const { data } = await q
    return success((data || []).map((o: Record<string, unknown>) => ({
      id: String(o.id),
      order_number: String((o as any).order_number ?? ''),
      total: Number((o as any).total ?? 0),
      client_name: String((o as any).clients?.full_name ?? '') || '—',
    })))
  }
)

/** Líneas de un pedido formateadas para factura/presupuesto. */
export const getTailoringOrderLinesForInvoice = protectedAction<
  string,
  { description: string; quantity: number; unit_price: number; tax_rate: number; line_total: number }[]
>(
  { permission: 'accounting.edit', auditModule: 'accounting' },
  async (ctx, orderId) => {
    const { data: orderLines } = await ctx.adminClient
      .from('tailoring_order_lines')
      .select(`
        unit_price, discount_percentage, tax_rate, line_total,
        garment_types ( name ),
        fabrics ( name, fabric_code ),
        fabric_description, model_name
      `)
      .eq('tailoring_order_id', orderId)
      .order('sort_order')

    const lines = (orderLines || []).map((l: Record<string, unknown>) => {
      const gt = (l as any).garment_types
      const fab = (l as any).fabrics
      const parts = [
        gt?.name ?? 'Prenda',
        fab?.name || (l as any).fabric_description || '',
        (l as any).model_name ? ` (${(l as any).model_name})` : '',
      ].filter(Boolean)
      const description = parts.join(' – ').trim() || 'Línea de pedido'
      const unitPrice = Number((l as any).unit_price ?? 0)
      const qty = 1
      const taxRate = Number((l as any).tax_rate ?? 21)
      const lineTotal = Number((l as any).line_total ?? unitPrice * qty * (1 + taxRate / 100))
      return {
        description,
        quantity: qty,
        unit_price: unitPrice,
        tax_rate: taxRate,
        line_total: lineTotal,
      }
    })
    return success(lines)
  }
)

// ─── Manual Transactions ─────────────────────────────────────────────────────

export type AccountingMovementRow = {
  id: string
  source: 'sale' | 'invoice' | 'supplier_order' | 'online_order' | 'manual'
  sourceLabel: string
  date: string
  description: string
  type: 'income' | 'expense'
  amount: number
  tax_amount?: number
  total: number
  category?: string
  referenceId?: string
  referenceNumber?: string
  isManual: boolean
  journalEntryId?: string
  storeId?: string | null
  storeName?: string | null
}

export const getAccountingMovements = protectedAction<
  { type?: 'income' | 'expense'; year?: number; month?: number },
  AccountingMovementRow[]
>(
  { permission: 'accounting.view', auditModule: 'accounting' },
  async (ctx, { type, year, month }) => {
    const y = year ?? new Date().getFullYear()
    const dateFrom = month
      ? `${y}-${String(month).padStart(2, '0')}-01`
      : `${y}-01-01`
    const dateTo = month
      ? new Date(y, month, 0).toISOString().split('T')[0]
      : `${y}-12-31`

    const rows: AccountingMovementRow[] = []

    const { data: entries } = await ctx.adminClient
      .from('journal_entries')
      .select('id, entry_date, description, entry_type, reference_type, reference_id, total_debit, total_credit')
      .gte('entry_date', dateFrom)
      .lte('entry_date', dateTo)
      .eq('status', 'posted')
      .not('reference_type', 'in', '("sale","invoice","online_order")')
      .order('entry_date', { ascending: false })

    const entriesList = (entries || []) as Array<{
      id: string
      entry_date: string
      description: string
      entry_type: string
      reference_type: string | null
      reference_id: string | null
      total_debit: number
      total_credit: number
    }>

    const saleIds = entriesList.filter(e => e.reference_type === 'sale').map(e => e.reference_id).filter(Boolean) as string[]
    const invoiceIds = entriesList.filter(e => e.reference_type === 'invoice').map(e => e.reference_id).filter(Boolean) as string[]
    const supplierOrderIds = entriesList.filter(e => e.reference_type === 'supplier_order').map(e => e.reference_id).filter(Boolean) as string[]
    const onlineOrderIds = entriesList.filter(e => e.reference_type === 'online_order').map(e => e.reference_id).filter(Boolean) as string[]

    let ticketBySaleId: Record<string, string> = {}
    let numberByInvoiceId: Record<string, string> = {}
    let numberByOrderId: Record<string, string> = {}
    let numberByOnlineId: Record<string, string> = {}

    // Una ronda de queries en paralelo para todas las referencias (antes: hasta 4 secuenciales)
    const [salesRes, invsRes, ordersRes, onlinesRes] = await Promise.all([
      saleIds.length > 0 ? ctx.adminClient.from('sales').select('id, ticket_number').in('id', saleIds) : Promise.resolve({ data: [] }),
      invoiceIds.length > 0 ? ctx.adminClient.from('invoices').select('id, invoice_number').in('id', invoiceIds) : Promise.resolve({ data: [] }),
      supplierOrderIds.length > 0 ? ctx.adminClient.from('supplier_orders').select('id, order_number').in('id', supplierOrderIds) : Promise.resolve({ data: [] }),
      onlineOrderIds.length > 0 ? ctx.adminClient.from('online_orders').select('id, order_number').in('id', onlineOrderIds) : Promise.resolve({ data: [] }),
    ])
    for (const s of salesRes.data || []) {
      ticketBySaleId[(s as { id: string }).id] = (s as { ticket_number: string }).ticket_number ?? ''
    }
    for (const inv of invsRes.data || []) {
      numberByInvoiceId[(inv as { id: string }).id] = (inv as { invoice_number: string }).invoice_number ?? ''
    }
    for (const o of ordersRes.data || []) {
      numberByOrderId[(o as { id: string }).id] = (o as { order_number?: string }).order_number ?? (o as { id: string }).id.slice(0, 8)
    }
    for (const o of onlinesRes.data || []) {
      numberByOnlineId[(o as { id: string }).id] = (o as { order_number?: string }).order_number ?? (o as { id: string }).id.slice(0, 8)
    }

    const sourceLabels: Record<string, string> = {
      sale: 'Ticket',
      invoice: 'Factura',
      supplier_order: 'Compra',
      online_order: 'Pedido online',
    }

    for (const e of entriesList) {
      const refType = e.reference_type || 'manual'
      const refId = e.reference_id
      let referenceNumber: string | undefined
      if (refType === 'sale' && refId) referenceNumber = ticketBySaleId[refId]
      else if (refType === 'invoice' && refId) referenceNumber = numberByInvoiceId[refId]
      else if (refType === 'supplier_order' && refId) referenceNumber = numberByOrderId[refId]
      else if (refType === 'online_order' && refId) referenceNumber = numberByOnlineId[refId]

      const movementType = e.entry_type === 'purchase' ? 'expense' : 'income'
      if (type && movementType !== type) continue

      const total = Number(e.total_debit ?? e.total_credit ?? 0)
      const sourceLabel = refType === 'manual'
        ? 'Asiento contable'
        : (referenceNumber ? `${sourceLabels[refType] || refType} ${referenceNumber}` : (sourceLabels[refType] || refType))
      rows.push({
        id: e.id,
        source: (refType === 'manual' ? 'manual' : refType) as AccountingMovementRow['source'],
        sourceLabel,
        date: String(e.entry_date),
        description: e.description,
        type: movementType,
        amount: total,
        total,
        referenceId: refId ?? undefined,
        referenceNumber: referenceNumber ?? undefined,
        isManual: false,
        journalEntryId: e.id,
      })
    }

    let q = ctx.adminClient
      .from('manual_transactions')
      .select('id, type, date, description, category, amount, tax_rate, tax_amount, total, notes, created_at, cash_sessions(store_id, stores(name))')
      .gte('date', dateFrom)
      .lte('date', dateTo)
      .order('date', { ascending: false })

    if (type) q = q.eq('type', type)

    const { data: manual } = await q
    const manualList = (manual || []) as Array<Record<string, unknown>>
    for (const m of manualList) {
      const storeName = (m as any).cash_sessions?.stores?.name ?? null
      const storeId = (m as any).cash_sessions?.store_id ?? null
      rows.push({
        id: String(m.id),
        source: 'manual',
        sourceLabel: m.type === 'income' ? 'Ingreso manual' : 'Gasto manual',
        date: String(m.date),
        description: String(m.description),
        type: String(m.type) as 'income' | 'expense',
        amount: Number(m.amount),
        tax_amount: Number(m.tax_amount),
        total: Number(m.total),
        category: String(m.category),
        isManual: true,
        storeId,
        storeName,
      })
    }

    rows.sort((a, b) => {
      const d = b.date.localeCompare(a.date)
      if (d !== 0) return d
      return b.id.localeCompare(a.id)
    })

    return success(rows)
  }
)

export type ManualTransaction = {
  id: string
  type: 'income' | 'expense'
  date: string
  description: string
  category: string
  amount: number
  tax_rate: number
  tax_amount: number
  total: number
  notes: string | null
  created_at: string
}

export const getManualTransactions = protectedAction<
  { type?: 'income' | 'expense'; year?: number; month?: number },
  ManualTransaction[]
>(
  { permission: 'accounting.view', auditModule: 'accounting' },
  async (ctx, { type, year, month }) => {
    const y = year ?? new Date().getFullYear()
    const dateFrom = month
      ? `${y}-${String(month).padStart(2, '0')}-01`
      : `${y}-01-01`
    const dateTo = month
      ? new Date(y, month, 0).toISOString().split('T')[0]
      : `${y}-12-31`

    let q = ctx.adminClient
      .from('manual_transactions')
      .select('id, type, date, description, category, amount, tax_rate, tax_amount, total, notes, created_at')
      .gte('date', dateFrom)
      .lte('date', dateTo)
      .order('date', { ascending: false })

    if (type) q = q.eq('type', type)

    const { data } = await q
    return success((data || []).map((r: Record<string, unknown>) => ({
      id: String(r.id),
      type: String(r.type) as 'income' | 'expense',
      date: String(r.date),
      description: String(r.description),
      category: String(r.category),
      amount: Number(r.amount),
      tax_rate: Number(r.tax_rate),
      tax_amount: Number(r.tax_amount),
      total: Number(r.total),
      notes: (r.notes as string) ?? null,
      created_at: String(r.created_at),
    })))
  }
)

export const createManualTransaction = protectedAction<
  {
    type: 'income' | 'expense'
    date: string
    description: string
    category: string
    amount: number
    tax_rate: number
    notes?: string
    generateJournalEntry?: boolean
  },
  { id: string }
>(
  { permission: 'accounting.edit', auditModule: 'accounting' },
  async (ctx, input) => {
    const tax_amount = input.amount * (input.tax_rate / 100)
    const total = input.amount + tax_amount

    const { data, error } = await ctx.adminClient
      .from('manual_transactions')
      .insert({
        type: input.type,
        date: input.date,
        description: input.description,
        category: input.category,
        amount: input.amount,
        tax_rate: input.tax_rate,
        tax_amount,
        total,
        notes: input.notes ?? null,
        created_by: ctx.userId,
      })
      .select('id')
      .single()

    if (error || !data) {
      const { failure } = await import('@/lib/errors')
      return failure('Error al guardar el movimiento')
    }

    return success({ id: String(data.id) })
  }
)

export const deleteManualTransaction = protectedAction<{ id: string }, void>(
  { permission: 'accounting.edit', auditModule: 'accounting' },
  async (ctx, { id }) => {
    await ctx.adminClient.from('manual_transactions').delete().eq('id', id)
    return success(undefined)
  }
)

export type CreateInvoiceInput = {
  client_id: string | null
  client_name: string
  client_nif: string | null
  invoice_date: string
  due_date: string | null
  subtotal: number
  tax_rate: number
  tax_amount: number
  irpf_rate: number
  irpf_amount: number
  total: number
  notes: string | null
  lines: {
    description: string
    quantity: number
    unit_price: number
    tax_rate: number
    line_total: number
  }[]
}

export const createInvoiceAction = protectedAction<CreateInvoiceInput, { id: string; invoice_number: string }>(
  {
    permission: 'accounting.manage_invoices',
    auditModule: 'accounting',
    auditAction: 'create',
    auditEntity: 'invoice',
  },
  async (ctx, input) => {
    const year = new Date().getFullYear()
    const { count } = await ctx.adminClient
      .from('invoices')
      .select('*', { count: 'exact', head: true })
      .like('invoice_number', `F${year}-%`)

    const seq = String((count ?? 0) + 1).padStart(4, '0')
    const invoice_number = `F${year}-${seq}`

    const { data: inv, error } = await ctx.adminClient
      .from('invoices')
      .insert({
        invoice_number,
        invoice_series: 'F',
        invoice_type: 'issued',
        client_id: input.client_id || null,
        client_name: input.client_name,
        client_nif: input.client_nif || null,
        company_name: 'Sastrería Prats',
        company_nif: 'B12345678',
        company_address: 'Madrid, España',
        invoice_date: input.invoice_date,
        due_date: input.due_date || null,
        subtotal: input.subtotal,
        tax_rate: input.tax_rate,
        tax_amount: input.tax_amount,
        irpf_rate: input.irpf_rate,
        irpf_amount: input.irpf_amount,
        total: input.total,
        status: 'draft',
        notes: input.notes || null,
        created_by: ctx.userId,
      })
      .select('id')
      .single()

    if (error || !inv) {
      console.error('Error creating invoice:', error)
      return failure(error?.message ?? 'Error al crear la factura')
    }

    const { error: linesError } = await ctx.adminClient
      .from('invoice_lines')
      .insert(
        input.lines.map((l, i) => ({
          invoice_id: inv.id,
          description: l.description,
          quantity: l.quantity,
          unit_price: l.unit_price,
          tax_rate: l.tax_rate,
          line_total: l.line_total,
          sort_order: i,
        }))
      )

    if (linesError) {
      console.error('Error creating invoice lines:', linesError)
      return failure(linesError.message ?? 'Error al crear las líneas de factura')
    }

    const displayNumber = `F-${invoice_number}`
    const auditDescription = `Factura ${displayNumber} · ${Number(input.total).toFixed(2)}€`
    return success({ id: inv.id as string, invoice_number, auditDescription })
  }
)

// ── Crear factura desde ticket/venta TPV ─────────────────────────────────────
export const createInvoiceFromSaleAction = protectedAction<string, { id: string; invoice_number: string }>(
  {
    permission: 'accounting.manage_invoices',
    auditModule: 'accounting',
    auditAction: 'create',
    auditEntity: 'invoice',
  },
  async (ctx, saleId) => {
    const { data: sale, error: saleError } = await ctx.adminClient
      .from('sales')
      .select('id, subtotal, tax_amount, total, client_id, store_id')
      .eq('id', saleId)
      .single()

    if (saleError || !sale) return failure('Venta no encontrada', 'NOT_FOUND')

    const existing = await ctx.adminClient
      .from('invoices')
      .select('id, invoice_number')
      .eq('sale_id', saleId)
      .limit(1)
      .maybeSingle()

    if (existing.data?.id) {
      return success({
        id: existing.data.id as string,
        invoice_number: (existing.data as { invoice_number: string }).invoice_number,
      })
    }

    const { data: lines } = await ctx.adminClient
      .from('sale_lines')
      .select('description, quantity, unit_price, tax_rate, line_total')
      .eq('sale_id', saleId)
      .order('sort_order', { ascending: true })

    const saleLines = lines ?? []
    if (saleLines.length === 0) return failure('La venta no tiene líneas', 'VALIDATION')

    let clientName = 'Consumidor final'
    let clientNif: string | null = null
    const clientId = (sale as { client_id?: string }).client_id ?? null
    if (clientId) {
      const { data: client } = await ctx.adminClient
        .from('clients')
        .select('full_name, company_name, company_nif, document_number')
        .eq('id', clientId)
        .single()
      if (client) {
        const c = client as { full_name?: string; company_name?: string; company_nif?: string; document_number?: string }
        clientName = c.full_name || c.company_name || clientName
        clientNif = c.company_nif || c.document_number || null
      }
    }

    const year = new Date().getFullYear()
    const { count } = await ctx.adminClient
      .from('invoices')
      .select('*', { count: 'exact', head: true })
      .like('invoice_number', `F${year}-%`)
    const seq = String((count ?? 0) + 1).padStart(4, '0')
    const invoice_number = `F${year}-${seq}`

    const subtotal = Number((sale as { subtotal?: number }).subtotal ?? 0)
    const taxAmount = Number((sale as { tax_amount?: number }).tax_amount ?? 0)
    const total = Number((sale as { total?: number }).total ?? 0)
    const storeId = (sale as { store_id?: string }).store_id ?? null
    const today = new Date().toISOString().slice(0, 10)
    const dueDate = new Date()
    dueDate.setDate(dueDate.getDate() + 15)

    const { data: inv, error } = await ctx.adminClient
      .from('invoices')
      .insert({
        invoice_number,
        invoice_series: 'F',
        invoice_type: 'issued',
        client_id: clientId,
        client_name: clientName,
        client_nif: clientNif,
        company_name: 'Sastrería Prats',
        company_nif: 'B12345678',
        company_address: 'Madrid, España',
        invoice_date: today,
        due_date: dueDate.toISOString().slice(0, 10),
        subtotal,
        tax_rate: 21,
        tax_amount: taxAmount,
        irpf_rate: 0,
        irpf_amount: 0,
        total,
        status: 'issued',
        sale_id: saleId,
        store_id: storeId,
        created_by: ctx.userId,
      })
      .select('id')
      .single()

    if (error || !inv) {
      console.error('Error creating invoice from sale:', error)
      return failure(error?.message ?? 'Error al crear la factura')
    }

    const { error: linesError } = await ctx.adminClient
      .from('invoice_lines')
      .insert(
        saleLines.map((l: { description: string; quantity: number; unit_price: number; tax_rate?: number; line_total: number }, i: number) => ({
          invoice_id: inv.id,
          description: l.description,
          quantity: l.quantity,
          unit_price: l.unit_price,
          tax_rate: l.tax_rate ?? 21,
          line_total: Number(l.line_total),
          sort_order: i,
        }))
      )

    if (linesError) {
      console.error('Error creating invoice lines from sale:', linesError)
      return failure(linesError.message ?? 'Error al crear las líneas')
    }

    createInvoiceJournalEntry(inv.id as string).catch((e) => console.error('Journal entry from sale invoice:', e))
    return success({ id: inv.id as string, invoice_number })
  }
)

// ── Crear factura desde pedido de sastrería ─────────────────────────────────
export const createInvoiceFromTailoringOrderAction = protectedAction<
  string,
  { id: string; invoice_number: string }
>(
  {
    permission: 'accounting.manage_invoices',
    auditModule: 'accounting',
    auditAction: 'create',
    auditEntity: 'invoice',
  },
  async (ctx, orderId) => {
    const existing = await ctx.adminClient
      .from('invoices')
      .select('id, invoice_number')
      .eq('tailoring_order_id', orderId)
      .limit(1)
      .maybeSingle()

    if (existing.data?.id) {
      return success({
        id: existing.data.id as string,
        invoice_number: (existing.data as { invoice_number: string }).invoice_number,
      })
    }

    const { data: order, error: orderError } = await ctx.adminClient
      .from('tailoring_orders')
      .select('id, client_id, total, store_id')
      .eq('id', orderId)
      .single()

    if (orderError || !order) return failure('Pedido no encontrado', 'NOT_FOUND')

    const orderTotal = Number((order as { total?: number }).total ?? 0)
    if (orderTotal <= 0) return failure('El pedido no tiene importe', 'VALIDATION')

    const { data: orderLines } = await ctx.adminClient
      .from('tailoring_order_lines')
      .select(`
        unit_price, discount_percentage, tax_rate, line_total, quantity,
        line_type, configuration,
        garment_types ( name ),
        fabrics ( name, fabric_code ),
        fabric_description, model_name,
        product_variants ( size, color, products ( name ) )
      `)
      .eq('tailoring_order_id', orderId)
      .order('sort_order')

    let camisaIdx = 0
    const lines = (orderLines || []).map((l: Record<string, unknown>) => {
      const gt = (l as any).garment_types
      const fab = (l as any).fabrics
      const lineType = (l as any).line_type ?? ''
      const config = (l as any).configuration ?? {}
      const pv = (l as any).product_variants
      let description: string
      if (lineType === 'camiseria') {
        camisaIdx += 1
        description = `Camisa ${camisaIdx}`
      } else if (lineType === 'complemento') {
        const productName = (config.product_name as string) ?? (pv?.products?.name ?? 'Complemento')
        const parts = [productName]
        if (pv?.size || pv?.color) parts.push([pv.size, pv.color].filter(Boolean).join(' / '))
        description = parts.join(' · ')
      } else {
        const parts = [
          gt?.name ?? 'Prenda',
          fab?.name || (l as any).fabric_description || '',
          (l as any).model_name ? ` (${(l as any).model_name})` : '',
        ].filter(Boolean)
        description = parts.join(' – ').trim() || 'Línea de pedido'
      }
      const unitPrice = Number((l as any).unit_price ?? 0)
      const qty = Math.max(1, Number((l as any).quantity) ?? 1)
      const taxRate = Number((l as any).tax_rate ?? 21)
      const lineTotal = Number((l as any).line_total ?? unitPrice * qty * (1 + taxRate / 100))
      const unitPriceNoTax = lineTotal / (1 + taxRate / 100) / qty
      return {
        description,
        quantity: qty,
        unit_price: unitPriceNoTax,
        tax_rate: taxRate,
        line_total: lineTotal,
      }
    })

    if (lines.length === 0) return failure('El pedido no tiene líneas para facturar', 'VALIDATION')

    let clientName = 'Consumidor final'
    let clientNif: string | null = null
    const clientId = (order as { client_id?: string }).client_id ?? null
    if (clientId) {
      const { data: client } = await ctx.adminClient
        .from('clients')
        .select('full_name, company_name, company_nif, document_number')
        .eq('id', clientId)
        .single()
      if (client) {
        const c = client as { full_name?: string; company_name?: string; company_nif?: string; document_number?: string }
        clientName = c.full_name || c.company_name || clientName
        clientNif = c.company_nif || c.document_number || null
      }
    }

    const year = new Date().getFullYear()
    const { count } = await ctx.adminClient
      .from('invoices')
      .select('*', { count: 'exact', head: true })
      .like('invoice_number', `F${year}-%`)
    const seq = String((count ?? 0) + 1).padStart(4, '0')
    const invoice_number = `F${year}-${seq}`

    const subtotal = lines.reduce((s, l) => s + l.quantity * l.unit_price, 0)
    const taxAmount = lines.reduce((s, l) => s + (l.line_total - l.quantity * l.unit_price), 0)
    const total = lines.reduce((s, l) => s + l.line_total, 0)
    const storeId = (order as { store_id?: string }).store_id ?? null
    const today = new Date().toISOString().slice(0, 10)
    const dueDate = new Date()
    dueDate.setDate(dueDate.getDate() + 15)

    const { data: inv, error } = await ctx.adminClient
      .from('invoices')
      .insert({
        invoice_number,
        invoice_series: 'F',
        invoice_type: 'issued',
        client_id: clientId,
        client_name: clientName,
        client_nif: clientNif,
        company_name: 'Sastrería Prats',
        company_nif: 'B12345678',
        company_address: 'Madrid, España',
        invoice_date: today,
        due_date: dueDate.toISOString().slice(0, 10),
        subtotal,
        tax_rate: 21,
        tax_amount: taxAmount,
        irpf_rate: 0,
        irpf_amount: 0,
        total,
        status: 'issued',
        tailoring_order_id: orderId,
        store_id: storeId,
        created_by: ctx.userId,
      })
      .select('id')
      .single()

    if (error || !inv) {
      console.error('Error creating invoice from tailoring order:', error)
      return failure(error?.message ?? 'Error al crear la factura')
    }

    const { error: linesError } = await ctx.adminClient
      .from('invoice_lines')
      .insert(
        lines.map((l, i) => ({
          invoice_id: inv.id,
          description: l.description,
          quantity: l.quantity,
          unit_price: l.unit_price,
          tax_rate: l.tax_rate ?? 21,
          line_total: l.line_total,
          sort_order: i,
        }))
      )

    if (linesError) {
      console.error('Error creating invoice lines from tailoring order:', linesError)
      return failure(linesError.message ?? 'Error al crear las líneas')
    }

    createInvoiceJournalEntry(inv.id as string).catch((e) => console.error('Journal entry from tailoring order invoice:', e))
    return success({ id: inv.id as string, invoice_number })
  }
)

// ── Editar factura borrador ───────────────────────────────────────────────────
export type UpdateInvoiceInput = CreateInvoiceInput & { id: string }

export const updateInvoiceAction = protectedAction<UpdateInvoiceInput, { id: string }>(
  { permission: 'accounting.manage_invoices', auditModule: 'accounting', auditAction: 'update', auditEntity: 'invoice' },
  async (ctx, input) => {
    // Solo se puede editar si está en borrador
    const { data: existing } = await ctx.adminClient.from('invoices').select('status').eq('id', input.id).single()
    if (!existing) return failure('Factura no encontrada', 'NOT_FOUND')
    if ((existing as { status: string }).status !== 'draft') return failure('Solo se pueden editar facturas en borrador', 'FORBIDDEN')

    const { error } = await ctx.adminClient.from('invoices').update({
      client_id: input.client_id || null,
      client_name: input.client_name,
      client_nif: input.client_nif || null,
      invoice_date: input.invoice_date,
      due_date: input.due_date || null,
      subtotal: input.subtotal,
      tax_rate: input.tax_rate,
      tax_amount: input.tax_amount,
      irpf_rate: input.irpf_rate,
      irpf_amount: input.irpf_amount,
      total: input.total,
      notes: input.notes || null,
      pdf_url: null, // regenerar PDF al siguiente acceso
    }).eq('id', input.id)

    if (error) return failure(error.message)

    // Reemplazar líneas
    await ctx.adminClient.from('invoice_lines').delete().eq('invoice_id', input.id)
    if (input.lines.length > 0) {
      await ctx.adminClient.from('invoice_lines').insert(
        input.lines.map((l, i) => ({
          invoice_id: input.id,
          description: l.description,
          quantity: l.quantity,
          unit_price: l.unit_price,
          tax_rate: l.tax_rate,
          line_total: l.line_total,
          sort_order: i,
        }))
      )
    }
    return success({ id: input.id })
  }
)

// ── Emitir factura (draft → issued) y crear asiento ──────────────────────────
export const issueInvoiceAction = protectedAction<string, { id: string }>(
  { permission: 'accounting.manage_invoices', auditModule: 'accounting', auditAction: 'state_change', auditEntity: 'invoice' },
  async (ctx, invoiceId) => {
    const { error } = await ctx.adminClient.from('invoices').update({
      status: 'issued',
      sent_to_client: true,
      sent_at: new Date().toISOString(),
    }).eq('id', invoiceId)
    if (error) return failure(error.message)
    return success({ id: invoiceId })
  }
)

// ── Cargar líneas de una factura para editar ──────────────────────────────────
export const getInvoiceLinesAction = protectedAction<string, { lines: { description: string; quantity: number; unit_price: number; tax_rate: number; line_total: number }[] }>(
  { permission: 'accounting.manage_invoices', auditModule: 'accounting' },
  async (ctx, invoiceId) => {
    const { data, error } = await ctx.adminClient.from('invoice_lines')
      .select('description, quantity, unit_price, tax_rate, line_total')
      .eq('invoice_id', invoiceId)
      .order('sort_order', { ascending: true })
    if (error) return failure(error.message)
    return success({ lines: (data || []).map(l => ({
      description: String(l.description),
      quantity: Number(l.quantity),
      unit_price: Number(l.unit_price),
      tax_rate: Number(l.tax_rate),
      line_total: Number(l.line_total),
    })) })
  }
)

// ── Editar descripción de asiento ─────────────────────────────────────────────
export const updateJournalEntryDescriptionAction = protectedAction<{ id: string; description: string }, void>(
  { permission: 'accounting.manage_invoices', auditModule: 'accounting', auditAction: 'update', auditEntity: 'journal_entry' },
  async (ctx, { id, description }) => {
    const { error } = await ctx.adminClient.from('journal_entries').update({ description }).eq('id', id)
    if (error) return failure(error.message)
    return success(undefined)
  }
)

// ── Crear presupuesto ─────────────────────────────────────────────────────────
export type CreateEstimateInput = {
  client_id: string | null
  client_name: string
  client_nif: string | null
  client_email: string | null
  estimate_date: string
  valid_until: string | null
  subtotal: number
  tax_rate: number
  tax_amount: number
  irpf_rate: number
  irpf_amount: number
  total: number
  notes: string | null
  lines: {
    description: string
    quantity: number
    unit_price: number
    tax_rate: number
  }[]
}

export const createEstimateAction = protectedAction<CreateEstimateInput, { id: string; estimate_number: string }>(
  {
    permission: 'accounting.edit',
    auditModule: 'accounting',
    auditAction: 'create',
    auditEntity: 'estimate',
  },
  async (ctx, input) => {
    const year = new Date().getFullYear()
    const { count } = await ctx.adminClient
      .from('estimates')
      .select('*', { count: 'exact', head: true })
      .like('estimate_number', `PRES${year}-%`)

    const seq = String((count ?? 0) + 1).padStart(4, '0')
    const estimate_number = `PRES${year}-${seq}`

    const { data: est, error } = await ctx.adminClient
      .from('estimates')
      .insert({
        estimate_number,
        estimate_series: 'PRES',
        client_id: input.client_id || null,
        client_name: input.client_name?.trim() || '',
        client_nif: input.client_nif || null,
        client_email: input.client_email?.trim() || null,
        company_name: 'Sastrería Prats',
        company_nif: 'B12345678',
        company_address: 'Madrid, España',
        estimate_date: input.estimate_date,
        valid_until: input.valid_until || null,
        subtotal: input.subtotal,
        tax_rate: input.tax_rate,
        tax_amount: input.tax_amount,
        irpf_rate: input.irpf_rate || null,
        irpf_amount: input.irpf_amount || null,
        total: input.total,
        status: 'draft',
        notes: input.notes || null,
        created_by: ctx.userId,
      })
      .select('id')
      .single()

    if (error || !est) {
      console.error('Error creating estimate:', error)
      return failure(error?.message ?? 'Error al crear el presupuesto')
    }

    const { error: linesError } = await ctx.adminClient.from('estimate_lines').insert(
      input.lines.map((l, i) => ({
        estimate_id: est.id,
        line_order: i + 1,
        description: l.description,
        quantity: l.quantity,
        unit_price: l.unit_price,
        discount_pct: 0,
        subtotal: l.quantity * l.unit_price,
        tax_rate: l.tax_rate,
        tax_amount: l.quantity * l.unit_price * (l.tax_rate / 100),
        total: l.quantity * l.unit_price * (1 + l.tax_rate / 100),
      }))
    )

    if (linesError) {
      console.error('Error creating estimate lines:', linesError)
      return failure(linesError.message ?? 'Error al crear las líneas del presupuesto')
    }

    return success({ id: est.id as string, estimate_number })
  }
)

export const updateEstimateAction = protectedAction<
  { estimateId: string; client_email?: string | null },
  undefined
>(
  {
    permission: 'accounting.edit',
    auditModule: 'accounting',
    auditAction: 'update',
    auditEntity: 'estimate',
    revalidate: ['/admin/contabilidad'],
  },
  async (ctx, { estimateId, client_email }) => {
    const { data: est } = await ctx.adminClient.from('estimates').select('id').eq('id', estimateId).single()
    if (!est) return failure('Presupuesto no encontrado')

    const { error } = await ctx.adminClient
      .from('estimates')
      .update({ client_email: client_email?.trim() || null })
      .eq('id', estimateId)
    if (error) return failure(error.message)
    return success(undefined)
  }
)

// ── Presupuesto: enviar, aceptar, rechazar, convertir a factura ─────────────────

export const sendEstimateAction = protectedAction<{ estimateId: string }, undefined>(
  {
    permission: 'accounting.edit',
    auditModule: 'accounting',
    auditAction: 'state_change',
    auditEntity: 'estimate',
    revalidate: ['/admin/contabilidad'],
  },
  async (ctx, { estimateId }) => {
    const { data: est } = await ctx.adminClient
      .from('estimates')
      .select('id, status, estimate_number, client_name, client_email, total, valid_until, pdf_url, company_name')
      .eq('id', estimateId)
      .single()

    if (!est) return failure('Presupuesto no encontrado')
    if ((est as { status?: string }).status !== 'draft') return failure('Solo se pueden enviar presupuestos en borrador')

    const email = (est as { client_email?: string }).client_email?.trim()
    if (!email) {
      return failure('El presupuesto no tiene email de cliente. Edita el presupuesto y añade el email antes de enviarlo.')
    }

    let pdfUrl = (est as { pdf_url?: string }).pdf_url
    if (!pdfUrl) {
      try {
        pdfUrl = await generateEstimatePdf(estimateId)
      } catch (e) {
        console.error('[sendEstimateAction] Error generando PDF:', e)
        pdfUrl = undefined
      }
    }

    const total = Number((est as { total?: number }).total ?? 0)
    const rawValidUntil = (est as { valid_until?: string }).valid_until
    const validUntil = rawValidUntil
      ? new Date(rawValidUntil).toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' })
      : '-'
    const companyName = String((est as { company_name?: string }).company_name ?? 'Sastrería Prats')

    try {
      await sendEstimateEmail({
        to: email,
        clientName: String((est as { client_name?: string }).client_name ?? ''),
        estimateNumber: String((est as { estimate_number?: string }).estimate_number ?? ''),
        total,
        validUntil,
        pdfUrl: pdfUrl || null,
        companyName,
      })
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Error desconocido'
      return failure('No se pudo enviar el email: ' + msg)
    }

    const { error } = await ctx.adminClient.from('estimates').update({ status: 'sent' }).eq('id', estimateId)
    if (error) return failure(error.message)
    return success(undefined)
  }
)

export const acceptEstimateAction = protectedAction<{ estimateId: string }, undefined>(
  {
    permission: 'accounting.edit',
    auditModule: 'accounting',
    auditAction: 'state_change',
    auditEntity: 'estimate',
    revalidate: ['/admin/contabilidad'],
  },
  async (ctx, { estimateId }) => {
    const { data: est } = await ctx.adminClient.from('estimates').select('id, status, estimate_number').eq('id', estimateId).single()
    if (!est) return failure('Presupuesto no encontrado')
    if (!['sent', 'draft'].includes(est.status)) return failure('Solo se pueden aceptar presupuestos enviados o en borrador')

    const { error } = await ctx.adminClient.from('estimates').update({ status: 'accepted' }).eq('id', estimateId)
    if (error) return failure(error.message)
    return success(undefined)
  }
)

export const rejectEstimateAction = protectedAction<{ estimateId: string; reason?: string }, undefined>(
  {
    permission: 'accounting.edit',
    auditModule: 'accounting',
    auditAction: 'state_change',
    auditEntity: 'estimate',
    revalidate: ['/admin/contabilidad'],
  },
  async (ctx, { estimateId, reason }) => {
    const { data: est } = await ctx.adminClient.from('estimates').select('id, status, estimate_number, notes').eq('id', estimateId).single()
    if (!est) return failure('Presupuesto no encontrado')
    if (!['sent', 'draft'].includes(est.status)) return failure('Solo se pueden rechazar presupuestos enviados o en borrador')

    const newNotes = reason?.trim()
      ? (est.notes ? `${est.notes}\n\nRechazado: ${reason.trim()}` : `Rechazado: ${reason.trim()}`)
      : est.notes

    const { error } = await ctx.adminClient.from('estimates').update({
      status: 'rejected',
      notes: newNotes ?? null,
    }).eq('id', estimateId)
    if (error) return failure(error.message)
    return success(undefined)
  }
)

export const convertEstimateToInvoiceAction = protectedAction<{ estimateId: string }, { invoiceId: string; invoice_number: string }>(
  {
    permission: 'accounting.edit',
    auditModule: 'accounting',
    auditAction: 'create',
    auditEntity: 'invoice',
    revalidate: ['/admin/contabilidad'],
  },
  async (ctx, { estimateId }) => {
    const { data: est } = await ctx.adminClient.from('estimates').select('id, status, client_name, total, estimate_number').eq('id', estimateId).single()
    if (!est) return failure('Presupuesto no encontrado')
    if (est.status !== 'accepted') return failure('Solo se pueden facturar presupuestos aceptados')

    const year = new Date().getFullYear()
    const { count } = await ctx.adminClient.from('invoices').select('*', { count: 'exact', head: true }).like('invoice_number', `F${year}-%`)
    const seq = String((count ?? 0) + 1).padStart(4, '0')
    const invoice_number = `F${year}-${seq}`

    const { data: lines } = await ctx.adminClient.from('estimate_lines').select('description, quantity, unit_price, tax_rate, total').eq('estimate_id', estimateId)

    const { data: inv, error } = await ctx.adminClient.from('invoices').insert({
      invoice_number,
      invoice_series: 'F',
      invoice_type: 'issued',
      client_name: est.client_name,
      company_name: 'Sastrería Prats',
      company_nif: 'B12345678',
      company_address: 'Madrid, España',
      invoice_date: new Date().toISOString().split('T')[0],
      subtotal: Number(est.total) / 1.21,
      tax_rate: 21,
      tax_amount: Number(est.total) - Number(est.total) / 1.21,
      irpf_rate: 0,
      irpf_amount: 0,
      total: Number(est.total),
      status: 'draft',
    }).select('id').single()

    if (error || !inv) return failure(error?.message ?? 'Error al crear la factura')

    if (lines?.length) {
      const { error: linesError } = await ctx.adminClient.from('invoice_lines').insert(
        lines.map((l: Record<string, unknown>, i: number) => ({
          invoice_id: inv.id,
          description: String(l.description),
          quantity: Number(l.quantity),
          unit_price: Number(l.unit_price),
          tax_rate: Number(l.tax_rate ?? 21),
          line_total: Number(l.total),
          sort_order: i,
        }))
      )
      if (linesError) return failure(linesError.message)
    }

    await ctx.adminClient.from('estimates').update({
      status: 'invoiced',
      invoice_id: inv.id,
      invoiced_at: new Date().toISOString(),
    }).eq('id', estimateId)

    createInvoiceJournalEntry(inv.id).catch(() => {})
    return success({ invoiceId: inv.id as string, invoice_number })
  }
)

export const generateInvoicePdfAction = protectedAction<string, { url: string }>(
  { permission: 'accounting.manage_invoices', auditModule: 'accounting' },
  async (ctx, invoiceId) => {
    const { data: inv } = await ctx.adminClient.from('invoices').select('pdf_url').eq('id', invoiceId).single()
    try {
      const url = await generateInvoicePdf(invoiceId)
      return success({ url })
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Error al generar PDF'
      return failure(msg, 'PDF_ERROR')
    }
  }
)

export const generateEstimatePdfAction = protectedAction<string, { url: string }>(
  { permission: 'accounting.edit', auditModule: 'accounting' },
  async (ctx, estimateId) => {
    const { data: est } = await ctx.adminClient.from('estimates').select('pdf_url').eq('id', estimateId).single()
    if (est?.pdf_url) return success({ url: est.pdf_url as string })
    try {
      const url = await generateEstimatePdf(estimateId)
      return success({ url })
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Error al generar PDF'
      return failure(msg, 'PDF_ERROR')
    }
  }
)
