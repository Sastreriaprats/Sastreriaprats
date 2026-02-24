'use server'

import { protectedAction } from '@/lib/server/action-wrapper'
import { success, failure } from '@/lib/errors'
import { generateInvoicePdf } from '@/lib/pdf/invoice-pdf'
import { generateEstimatePdf } from '@/lib/pdf/estimate-pdf'

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
      .select('id, invoice_number, client_name, invoice_date, total, status, pdf_url, sent_to_client')
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
      .select('id, estimate_number, client_name, estimate_date, valid_until, total, status, invoice_id')
      .order('estimate_date', { ascending: false })

    if (status && status !== 'all') q = q.eq('status', status)
    if (search) q = q.or(`estimate_number.ilike.%${search}%,client_name.ilike.%${search}%`)

    const { data } = await q
    return success((data || []).map((r: Record<string, unknown>) => ({
      id: String(r.id),
      estimate_number: String(r.estimate_number ?? ''),
      client_name: String(r.client_name ?? ''),
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
    const quarters: VatQuarterRow[] = []
    for (let q = 1; q <= 4; q++) {
      const startMonth = (q - 1) * 3 + 1
      const endMonth = q * 3
      const start = `${year}-${String(startMonth).padStart(2, '0')}-01`
      const endDate = new Date(year, endMonth, 0)
      const end = `${year}-${String(endMonth).padStart(2, '0')}-${String(endDate.getDate()).padStart(2, '0')}`

      const [salesRes, purchasesRes] = await Promise.all([
        ctx.adminClient.from('sales').select('total, subtotal, tax_amount, created_at').gte('created_at', `${start}T00:00:00`).lte('created_at', `${end}T23:59:59`).eq('status', 'completed'),
        ctx.adminClient.from('supplier_orders').select('total, tax_amount, created_at').gte('created_at', `${start}T00:00:00`).lte('created_at', `${end}T23:59:59`).in('status', ['received', 'partially_received']),
      ])
      const sales = salesRes.data || []
      const purchases = purchasesRes.data || []
      const baseSales = sales.reduce((s: number, x: Record<string, unknown>) => s + (Number((x as any).subtotal ?? (x as any).total) || 0), 0)
      const ivaRepercutido = sales.reduce((s: number, x: Record<string, unknown>) => s + (Number((x as any).tax_amount) || 0), 0)
      const basePurchases = purchases.reduce((s: number, x: Record<string, unknown>) => s + (Number((x as any).total) - Number((x as any).tax_amount || 0)), 0)
      const ivaSoportado = purchases.reduce((s: number, x: Record<string, unknown>) => s + (Number((x as any).tax_amount) || 0), 0)

      quarters.push({
        quarter: `T${q}`,
        period: `${start.slice(5, 7)}/${year} - ${end.slice(5, 7)}/${year}`,
        baseImponibleSales: baseSales,
        ivaRepercutido,
        baseImponiblePurchases: basePurchases,
        ivaSoportado,
        resultado: ivaRepercutido - ivaSoportado,
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
    const { data } = await ctx.adminClient.from('clients').select('id, first_name, last_name, full_name, email').order('last_name')
    return success((data || []).map((c: Record<string, unknown>) => {
      const fn = (c as any).full_name ?? `${(c as any).first_name ?? ''} ${(c as any).last_name ?? ''}`.trim()
      return { id: String(c.id), full_name: String(fn || 'Sin nombre'), email: (c.email as string) ?? null }
    }))
  }
)

// ─── Manual Transactions ─────────────────────────────────────────────────────

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
        client_name: input.client_name,
        client_nif: input.client_nif || null,
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

export const generateInvoicePdfAction = protectedAction<string, { url: string }>(
  { permission: 'accounting.manage_invoices', auditModule: 'accounting' },
  async (ctx, invoiceId) => {
    const { data: inv } = await ctx.adminClient.from('invoices').select('pdf_url').eq('id', invoiceId).single()
    if (inv?.pdf_url) return success({ url: inv.pdf_url as string })
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
