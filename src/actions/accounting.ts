'use server'

import { protectedAction, type AdminClient } from '@/lib/server/action-wrapper'
import { success, failure } from '@/lib/errors'
import { normalizeSearchTerm } from '@/lib/utils'
import { generateInvoicePdf } from '@/lib/pdf/invoice-pdf'
import { generateEstimatePdf } from '@/lib/pdf/estimate-pdf'
import { sendEstimateEmail } from '@/lib/email/transactional'
import { createInvoiceJournalEntry, reverseInvoiceJournalEntry } from '@/actions/accounting-triggers'
import { formatClientAddress } from '@/lib/clients/format'

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
      ctx.adminClient.from('sales').select('total, total_returned, subtotal, tax_amount, created_at').gte('created_at', start).lte('created_at', end).in('status', ['completed', 'partially_returned']),
      ctx.adminClient.from('supplier_orders').select('total, tax_amount, created_at').gte('created_at', start).lte('created_at', end).in('status', ['received', 'partially_received']),
      ctx.adminClient.from('invoices').select('id, invoice_number, client_name, invoice_date, total, status').eq('invoice_type', 'issued').order('invoice_date', { ascending: false }).limit(10),
    ])

    const sales = salesRes.data || []
    const purchases = purchasesRes.data || []

    // Para ventas con devolución parcial: prorratear subtotal/IVA por la
    // proporción del importe que NO se devolvió. Las fully_returned ya están
    // excluidas por el filtro (status IN completed, partially_returned).
    const netSale = (x: Record<string, unknown>) => {
      const total = Number((x as any).total) || 0
      const returned = Number((x as any).total_returned) || 0
      const subtotal = Number((x as any).subtotal) || 0
      const tax = Number((x as any).tax_amount) || 0
      const proportion = total > 0 ? Math.max(0, (total - returned) / total) : 0
      return {
        netBase: (subtotal || total) * proportion,
        netVat: tax * proportion,
      }
    }

    const income = sales.reduce((s: number, x: Record<string, unknown>) => s + netSale(x).netBase, 0)
    const vatCollected = sales.reduce((s: number, x: Record<string, unknown>) => s + netSale(x).netVat, 0)
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
        byMonth[key].income += netSale(x).netBase
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
  client_nif: string | null
  client_address: string | null
  client_email: string | null
  client_phone: string | null
  payment_method: string | null
  invoice_date: string
  due_date: string | null
  total: number
  tax_rate: number
  irpf_rate: number
  notes: string | null
  status: string
  pdf_url: string | null
  sent_to_client: boolean
  verifactu_sent: boolean
  is_rectifying: boolean
  invoice_series: string
}

export const getInvoices = protectedAction<
  { search?: string; status?: string; dateFrom?: string; dateTo?: string },
  InvoiceRow[]
>(
  { permission: ['accounting.view', 'accounting.manage_invoices'], auditModule: 'accounting' },
  async (ctx, { search, status, dateFrom, dateTo }) => {
    let q = ctx.adminClient
      .from('invoices')
      .select('id, invoice_number, invoice_series, client_id, client_name, client_nif, client_address, client_email, client_phone, payment_method, invoice_date, due_date, total, tax_rate, irpf_rate, notes, status, pdf_url, sent_to_client, verifactu_sent, is_rectifying')
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
      client_nif: (r.client_nif as string) ?? null,
      client_address: (r.client_address as string) ?? null,
      client_email: (r.client_email as string) ?? null,
      client_phone: (r.client_phone as string) ?? null,
      payment_method: (r.payment_method as string) ?? null,
      invoice_date: String(r.invoice_date ?? ''),
      due_date: (r.due_date as string) ?? null,
      total: Number(r.total ?? 0),
      tax_rate: Number(r.tax_rate ?? 21),
      irpf_rate: Number(r.irpf_rate ?? 0),
      notes: (r.notes as string) ?? null,
      status: String(r.status ?? 'draft'),
      pdf_url: (r.pdf_url as string) ?? null,
      sent_to_client: Boolean(r.sent_to_client),
      verifactu_sent: Boolean(r.verifactu_sent),
      is_rectifying: Boolean(r.is_rectifying),
      invoice_series: String(r.invoice_series ?? 'F'),
    })))
  }
)

/** Re-fetch ligero del status actual de una factura (para pre-check antes de
 *  editar — el listado puede estar stale si otro usuario emitió/anuló). */
export const getInvoiceStatusAction = protectedAction<string, { status: string; verifactu_sent: boolean; sent_to_client: boolean }>(
  { permission: 'accounting.manage_invoices', auditModule: 'accounting' },
  async (ctx, invoiceId) => {
    const { data, error } = await ctx.adminClient
      .from('invoices')
      .select('status, verifactu_sent, sent_to_client')
      .eq('id', invoiceId)
      .single()
    if (error || !data) return failure('Factura no encontrada', 'NOT_FOUND')
    const d = data as { status?: string; verifactu_sent?: boolean; sent_to_client?: boolean }
    return success({
      status: String(d.status ?? ''),
      verifactu_sent: d.verifactu_sent === true,
      sent_to_client: d.sent_to_client === true,
    })
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
    if (search) {
      const normalized = normalizeSearchTerm(search)
      if (normalized) {
        q = q.or(`estimate_number.ilike.%${normalized}%,client_name.ilike.%${normalized}%`)
      }
    }

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
  reference_type: string | null
  is_period_closed: boolean
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
        id, entry_number, fiscal_year, fiscal_month, entry_date, description, entry_type, status, total_debit, total_credit, reference_type, is_period_closed
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
        .eq('journal_entry_id', e.id as string)
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
        reference_type: (e.reference_type as string) ?? null,
        is_period_closed: Boolean(e.is_period_closed),
        lines: lineList,
      })
    }
    return success(withLines)
  }
)

// ── Asientos manuales (journal_entries.manage + isFullAdmin) ────────────────
async function userIsFullAdmin(ctx: { adminClient: AdminClient; userId: string }): Promise<boolean> {
  const { data: roleRows } = await ctx.adminClient
    .from('user_roles').select('roles!inner(name)').eq('user_id', ctx.userId)
  return (roleRows ?? []).some((ur: { roles?: { name?: string } | { name?: string }[] }) => {
    const r = ur.roles
    const name = Array.isArray(r) ? r[0]?.name : r?.name
    return name === 'administrador' || name === 'super_admin'
  })
}

export type ChartAccountOption = { account_code: string; name: string; account_type: string }

export const listChartOfAccountsDetail = protectedAction<void, ChartAccountOption[]>(
  { permission: 'accounting.view', auditModule: 'accounting' },
  async (ctx) => {
    const { data, error } = await ctx.adminClient
      .from('chart_of_accounts')
      .select('account_code, name, account_type')
      .eq('is_detail', true).eq('is_active', true)
      .order('account_code')
    if (error) return failure(error.message)
    return success((data ?? []).map((c: Record<string, unknown>) => ({
      account_code: String(c.account_code), name: String(c.name), account_type: String(c.account_type),
    })))
  }
)

type JournalLineInput = { account_code: string; debit: number; credit: number; description?: string | null }

// Espejo de la validación de la RPC (defensa en profundidad + feedback rápido).
function validateLinesClientMirror(lines: JournalLineInput[]): string | null {
  if (!Array.isArray(lines) || lines.length < 2) return 'El asiento debe tener al menos 2 líneas.'
  let d = 0, c = 0
  for (const l of lines) {
    if (!l.account_code) return 'Todas las líneas deben tener una cuenta.'
    const deb = Number(l.debit) || 0, cre = Number(l.credit) || 0
    if (deb < 0 || cre < 0) return 'Los importes no pueden ser negativos.'
    if ((deb > 0 && cre > 0) || (deb === 0 && cre === 0)) return 'Cada línea debe tener importe solo en Debe o solo en Haber.'
    d += deb; c += cre
  }
  if (Math.round((d - c) * 100) !== 0) return 'El asiento no cuadra (Debe ≠ Haber).'
  if (d <= 0) return 'El importe del asiento debe ser mayor que 0.'
  return null
}

function normalizeLines(lines: JournalLineInput[]): JournalLineInput[] {
  return lines.map((l) => ({
    account_code: String(l.account_code),
    debit: Math.round((Number(l.debit) || 0) * 100) / 100,
    credit: Math.round((Number(l.credit) || 0) * 100) / 100,
    description: (l.description ?? '').trim() || null,
  }))
}

export const createManualJournalEntry = protectedAction<
  { date: string; description: string; lines: JournalLineInput[] },
  { success?: boolean; message?: string; entry_id?: string; entry_number?: number; error?: string }
>(
  { permission: 'journal_entries.manage', auditModule: 'accounting', auditAction: 'create', auditEntity: 'journal_entry', revalidate: ['/admin/contabilidad'] },
  async (ctx, { date, description, lines }) => {
    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return failure('Fecha inválida', 'VALIDATION')
    if (!description?.trim()) return failure('La descripción es obligatoria', 'VALIDATION')
    const clean = normalizeLines(lines || [])
    const err = validateLinesClientMirror(clean)
    if (err) return failure(err, 'VALIDATION')
    if (!(await userIsFullAdmin(ctx))) return failure('Solo un administrador puede crear asientos manuales.', 'FORBIDDEN')

    const { data, error } = await ctx.adminClient.rpc('rpc_create_manual_journal_entry', {
      p_date: date, p_description: description.trim(), p_lines: clean, p_user_id: ctx.userId,
    })
    if (error) return failure(error.message)
    if (data && data.success === false) return failure(String(data.error || 'No se pudo crear el asiento'), 'CONFLICT')
    return success({ ...data, auditDescription: `Asiento manual #${data?.entry_number} creado` } as any)
  }
)

export const updateManualJournalEntry = protectedAction<
  { id: string; date: string; description: string; lines: JournalLineInput[] },
  { success?: boolean; message?: string; error?: string; auditEntityId: string; auditDescription: string }
>(
  { permission: 'journal_entries.manage', auditModule: 'accounting', auditAction: 'update', auditEntity: 'journal_entry', revalidate: ['/admin/contabilidad'] },
  async (ctx, { id, date, description, lines }) => {
    if (!id) return failure('Falta el identificador del asiento', 'VALIDATION')
    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return failure('Fecha inválida', 'VALIDATION')
    if (!description?.trim()) return failure('La descripción es obligatoria', 'VALIDATION')
    const clean = normalizeLines(lines || [])
    const err = validateLinesClientMirror(clean)
    if (err) return failure(err, 'VALIDATION')
    if (!(await userIsFullAdmin(ctx))) return failure('Solo un administrador puede editar asientos manuales.', 'FORBIDDEN')

    const { data, error } = await ctx.adminClient.rpc('rpc_update_manual_journal_entry', {
      p_id: id, p_date: date, p_description: description.trim(), p_lines: clean, p_user_id: ctx.userId,
    })
    if (error) return failure(error.message)
    if (data && data.success === false) return failure(String(data.error || 'No se pudo actualizar el asiento'), 'CONFLICT')

    const { data: entry } = await ctx.adminClient
      .from('journal_entries')
      .select('entry_number')
      .eq('id', id)
      .maybeSingle()
    const entryNumber = (entry as { entry_number?: number } | null)?.entry_number
    return success({ ...data, auditEntityId: String(id), auditDescription: `Asiento ${entryNumber ?? ''}`.trim() })
  }
)

export const deleteJournalEntry = protectedAction<
  { id: string },
  { success?: boolean; message?: string; error?: string; auditEntityId: string; auditDescription: string }
>(
  { permission: 'journal_entries.manage', auditModule: 'accounting', auditAction: 'delete', auditEntity: 'journal_entry', revalidate: ['/admin/contabilidad'] },
  async (ctx, { id }) => {
    if (!id) return failure('Falta el identificador del asiento', 'VALIDATION')
    if (!(await userIsFullAdmin(ctx))) return failure('Solo un administrador puede anular asientos.', 'FORBIDDEN')

    const { data: entry } = await ctx.adminClient
      .from('journal_entries')
      .select('entry_number')
      .eq('id', id)
      .maybeSingle()
    const entryNumber = (entry as { entry_number?: number } | null)?.entry_number

    const { data, error } = await ctx.adminClient.rpc('rpc_delete_journal_entry', { p_id: id })
    if (error) return failure(error.message)
    if (data && data.success === false) return failure(String(data.error || 'No se pudo anular el asiento'), 'CONFLICT')
    return success({ ...data, auditEntityId: String(id), auditDescription: `Asiento ${entryNumber ?? ''} eliminado`.replace('  ', ' ').trim() })
  }
)

export type ManualJournalEntry = {
  id: string; entry_number: number; entry_date: string; description: string
  entry_type: string; reference_type: string | null; is_period_closed: boolean
  editable: boolean
  lines: { account_code: string; account_name: string | null; debit: number; credit: number; description: string | null }[]
}

export const getManualJournalEntry = protectedAction<string, ManualJournalEntry>(
  { permission: 'accounting.view', auditModule: 'accounting' },
  async (ctx, id) => {
    if (!id) return failure('Falta el identificador', 'VALIDATION')
    const { data: e, error } = await ctx.adminClient
      .from('journal_entries')
      .select('id, entry_number, entry_date, description, entry_type, reference_type, is_period_closed')
      .eq('id', id).maybeSingle()
    if (error) return failure(error.message)
    if (!e) return failure('Asiento no encontrado', 'NOT_FOUND')

    const { data: lines } = await ctx.adminClient
      .from('journal_entry_lines')
      .select('account_code, debit, credit, description')
      .eq('journal_entry_id', id).order('sort_order')

    // nombres de cuenta
    const codes = [...new Set((lines ?? []).map((l: Record<string, unknown>) => String(l.account_code)))]
    const nameByCode = new Map<string, string>()
    if (codes.length) {
      const { data: accs } = await ctx.adminClient.from('chart_of_accounts').select('account_code, name').in('account_code', codes)
      for (const a of accs ?? []) nameByCode.set(String(a.account_code), String(a.name))
    }
    const er = e as Record<string, unknown>
    return success({
      id: String(er.id), entry_number: Number(er.entry_number), entry_date: String(er.entry_date),
      description: String(er.description ?? ''), entry_type: String(er.entry_type), reference_type: (er.reference_type as string) ?? null,
      is_period_closed: Boolean(er.is_period_closed),
      editable: er.entry_type === 'manual' && er.reference_type == null && !er.is_period_closed,
      lines: (lines ?? []).map((l: Record<string, unknown>) => ({
        account_code: String(l.account_code), account_name: nameByCode.get(String(l.account_code)) ?? null,
        debit: Number(l.debit ?? 0), credit: Number(l.credit ?? 0), description: (l.description as string) ?? null,
      })),
    })
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
  /** Nº de tickets/ventas que contribuyeron al trimestre. */
  salesCount: number
  /** Nº de facturas recibidas que contribuyeron al trimestre. */
  purchasesCount: number
}

export const getVatQuarterly = protectedAction<
  { year: number },
  { quarters: VatQuarterRow[]; totalRepercutido: number; totalSoportado: number }
>(
  { permission: 'accounting.view', auditModule: 'accounting' },
  async (ctx, { year }) => {
    const yearStart = `${year}-01-01T00:00:00`
    const yearEnd = `${year}-12-31T23:59:59`

    // Ventas: sigue siendo sales (tickets TPV). Compras: AHORA se lee de
    // ap_supplier_invoices (facturas RECIBIDAS, con su IVA desglosado), NO
    // de supplier_orders (pedidos al proveedor, que rara vez llevan IVA
    // discriminado y que daban "IVA soportado = 0").
    // Sin filtro de status: el IVA soportado se contabiliza al RECIBIR la
    // factura, independientemente del estado de pago.
    const [salesRes, purchasesRes] = await Promise.all([
      ctx.adminClient.from('sales').select('total, total_returned, subtotal, tax_amount, created_at').gte('created_at', yearStart).lte('created_at', yearEnd).in('status', ['completed', 'partially_returned']),
      ctx.adminClient.from('ap_supplier_invoices').select('amount, tax_amount, invoice_date').eq('is_proforma', false).gte('invoice_date', `${year}-01-01`).lte('invoice_date', `${year}-12-31`),
    ])
    const sales = (salesRes.data || []) as Array<{ total?: number; total_returned?: number; subtotal?: number; tax_amount?: number; created_at?: string }>
    const purchases = (purchasesRes.data || []) as Array<{ amount?: number; tax_amount?: number; invoice_date?: string }>

    const quarterFromMonth = (m: number) => Math.ceil(m / 3) as 1 | 2 | 3 | 4
    const byQuarter: Record<number, {
      baseSales: number; ivaRepercutido: number; basePurchases: number; ivaSoportado: number
      salesCount: number; purchasesCount: number
    }> = {
      1: { baseSales: 0, ivaRepercutido: 0, basePurchases: 0, ivaSoportado: 0, salesCount: 0, purchasesCount: 0 },
      2: { baseSales: 0, ivaRepercutido: 0, basePurchases: 0, ivaSoportado: 0, salesCount: 0, purchasesCount: 0 },
      3: { baseSales: 0, ivaRepercutido: 0, basePurchases: 0, ivaSoportado: 0, salesCount: 0, purchasesCount: 0 },
      4: { baseSales: 0, ivaRepercutido: 0, basePurchases: 0, ivaSoportado: 0, salesCount: 0, purchasesCount: 0 },
    }
    for (const x of sales) {
      const d = x.created_at
      if (d) {
        const month = Number(d.slice(5, 7))
        const q = quarterFromMonth(month)
        const total = Number(x.total) || 0
        const returned = Number(x.total_returned) || 0
        const proportion = total > 0 ? Math.max(0, (total - returned) / total) : 0
        const base = (Number(x.subtotal ?? x.total) || 0) * proportion
        const iva = (Number(x.tax_amount) || 0) * proportion
        byQuarter[q].baseSales += base
        byQuarter[q].ivaRepercutido += iva
        byQuarter[q].salesCount += 1
      }
    }
    for (const x of purchases) {
      const d = x.invoice_date
      if (d) {
        const month = Number(d.slice(5, 7))
        const q = quarterFromMonth(month)
        byQuarter[q].basePurchases += Number(x.amount) || 0
        byQuarter[q].ivaSoportado += Number(x.tax_amount) || 0
        byQuarter[q].purchasesCount += 1
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
        salesCount: v.salesCount,
        purchasesCount: v.purchasesCount,
      })
    }
    const totalRepercutido = quarters.reduce((s, x) => s + x.ivaRepercutido, 0)
    const totalSoportado = quarters.reduce((s, x) => s + x.ivaSoportado, 0)
    return success({ quarters, totalRepercutido, totalSoportado })
  }
)

// ─── IVA trimestral: detalle para Excel descargable ─────────────────────────
export type VatInvoiceIssuedRow = {
  trimestre: string
  invoice_number: string
  invoice_date: string
  client_name: string
  client_nif: string | null
  subtotal: number
  tax_rate: number
  tax_amount: number
  irpf_rate: number
  irpf_amount: number
  total: number
  status: string
  origen: 'ticket' | 'sastrería' | 'presupuesto' | 'manual'
}
export type VatInvoiceReceivedRow = {
  trimestre: string
  invoice_number: string
  invoice_date: string
  supplier_name: string
  supplier_cif: string | null
  amount: number
  tax_amount: number
  iva_pct_calculado: number | null
  total_amount: number
  retention_amount: number
  status: string
  payment_date: string | null
}

export const getVatQuarterlyDetail = protectedAction<
  { year: number },
  {
    quarters: VatQuarterRow[]
    totalRepercutido: number
    totalSoportado: number
    invoicesIssued: VatInvoiceIssuedRow[]
    invoicesReceived: VatInvoiceReceivedRow[]
  }
>(
  { permission: 'accounting.view', auditModule: 'accounting' },
  async (ctx, { year }) => {
    const yearStart = `${year}-01-01`
    const yearEnd = `${year}-12-31`
    const quarterFromMonth = (m: number) => Math.ceil(m / 3) as 1 | 2 | 3 | 4
    const quarterTag = (iso?: string | null) => {
      if (!iso) return 'T?'
      const month = Number(iso.slice(5, 7))
      return `T${quarterFromMonth(month)}`
    }

    // El resumen de cuadre lo reusamos del action existente — misma fuente.
    const summaryRes = await getVatQuarterly({ year })
    if (!summaryRes.success) return failure(summaryRes.error)

    // Facturas EMITIDAS del año. Excluye draft y cancelled del modelo 303.
    const [issuedRes, receivedRes] = await Promise.all([
      ctx.adminClient
        .from('invoices')
        .select('invoice_number, invoice_date, client_name, client_nif, subtotal, tax_rate, tax_amount, irpf_rate, irpf_amount, total, status, sale_id, tailoring_order_id, id')
        .gte('invoice_date', yearStart)
        .lte('invoice_date', yearEnd)
        .not('status', 'in', '(draft,cancelled)')
        .order('invoice_date', { ascending: true }),
      ctx.adminClient
        .from('ap_supplier_invoices')
        .select('invoice_number, invoice_date, supplier_name, supplier_cif, amount, tax_amount, total_amount, retention_amount, status, payment_date')
        .eq('is_proforma', false) // las proformas no entran en el libro de facturas recibidas
        .gte('invoice_date', yearStart)
        .lte('invoice_date', yearEnd)
        .order('invoice_date', { ascending: true }),
    ])

    // Para determinar el "origen" de cada factura emitida sin sale_id ni
    // tailoring_order_id, miramos si hay un estimate enlazado.
    const issuedRows = (issuedRes.data || []) as Array<{
      id: string; invoice_number?: string; invoice_date?: string; client_name?: string; client_nif?: string | null
      subtotal?: number; tax_rate?: number; tax_amount?: number; irpf_rate?: number; irpf_amount?: number
      total?: number; status?: string; sale_id?: string | null; tailoring_order_id?: string | null
    }>
    const issuedWithoutSourceIds = issuedRows
      .filter(r => !r.sale_id && !r.tailoring_order_id)
      .map(r => r.id)
    const estimateInvoiceIds = new Set<string>()
    if (issuedWithoutSourceIds.length > 0) {
      const { data: estimates } = await ctx.adminClient
        .from('estimates')
        .select('invoice_id')
        .in('invoice_id', issuedWithoutSourceIds)
      for (const e of (estimates ?? []) as Array<{ invoice_id?: string | null }>) {
        if (e.invoice_id) estimateInvoiceIds.add(e.invoice_id)
      }
    }

    const invoicesIssued: VatInvoiceIssuedRow[] = issuedRows.map((r) => {
      let origen: VatInvoiceIssuedRow['origen']
      if (r.sale_id) origen = 'ticket'
      else if (r.tailoring_order_id) origen = 'sastrería'
      else if (estimateInvoiceIds.has(r.id)) origen = 'presupuesto'
      else origen = 'manual'
      return {
        trimestre: quarterTag(r.invoice_date),
        invoice_number: String(r.invoice_number ?? ''),
        invoice_date: String(r.invoice_date ?? ''),
        client_name: String(r.client_name ?? ''),
        client_nif: r.client_nif ?? null,
        subtotal: Number(r.subtotal) || 0,
        tax_rate: Number(r.tax_rate) || 0,
        tax_amount: Number(r.tax_amount) || 0,
        irpf_rate: Number(r.irpf_rate) || 0,
        irpf_amount: Number(r.irpf_amount) || 0,
        total: Number(r.total) || 0,
        status: String(r.status ?? ''),
        origen,
      }
    })

    const invoicesReceived: VatInvoiceReceivedRow[] = ((receivedRes.data || []) as Array<{
      invoice_number?: string; invoice_date?: string; supplier_name?: string; supplier_cif?: string | null
      amount?: number; tax_amount?: number; total_amount?: number; retention_amount?: number
      status?: string; payment_date?: string | null
    }>).map((r) => {
      const base = Number(r.amount) || 0
      const iva = Number(r.tax_amount) || 0
      const ivaPct = base > 0 ? Math.round((iva / base * 100) * 100) / 100 : null
      return {
        trimestre: quarterTag(r.invoice_date),
        invoice_number: String(r.invoice_number ?? ''),
        invoice_date: String(r.invoice_date ?? ''),
        supplier_name: String(r.supplier_name ?? ''),
        supplier_cif: r.supplier_cif ?? null,
        amount: base,
        tax_amount: iva,
        iva_pct_calculado: ivaPct,
        total_amount: Number(r.total_amount) || 0,
        retention_amount: Number(r.retention_amount) || 0,
        status: String(r.status ?? ''),
        payment_date: r.payment_date ?? null,
      }
    })

    return success({
      quarters: summaryRes.data.quarters,
      totalRepercutido: summaryRes.data.totalRepercutido,
      totalSoportado: summaryRes.data.totalSoportado,
      invoicesIssued,
      invoicesReceived,
    })
  }
)

export type ClientForInvoiceCompany = {
  id: string
  company_name: string
  nif: string | null
  contact_email: string | null
  is_default: boolean
}
export type ClientForInvoice = {
  id: string
  full_name: string
  email: string | null
  phone: string | null
  nif: string | null
  address: string | null
  postal_code: string | null
  city: string | null
  province: string | null
  country: string | null
  companies: ClientForInvoiceCompany[]
}

export const getClientsForInvoice = protectedAction<{ query?: string } | void, ClientForInvoice[]>(
  { permission: ['accounting.edit', 'accounting.manage_invoices'], auditModule: 'accounting' },
  async (ctx, input) => {
    const q = ((input && typeof input === 'object' && 'query' in input ? input.query : '') || '').trim()
    // Sin término o término muy corto → no devolver nada. Evita cargar
    // los 1800+ clientes al abrir el dialog y deja el combobox limpio
    // hasta que el usuario escribe.
    if (q.length < 2) return success([])

    // Escape de caracteres especiales de PostgREST: la coma rompe el `.or()`
    // y `%`/`_` son comodines de ILIKE que el usuario no debe controlar.
    const escaped = q.replace(/[,%_]/g, (c) => `\\${c}`)
    const pattern = `%${escaped}%`

    const { data } = await ctx.adminClient
      .from('clients')
      .select('id, first_name, last_name, full_name, email, phone, document_number, address, postal_code, city, province, country, client_companies(id, company_name, nif, contact_email, is_default)')
      .or(`full_name.ilike.${pattern},first_name.ilike.${pattern},last_name.ilike.${pattern},email.ilike.${pattern},document_number.ilike.${pattern}`)
      .order('full_name')
      .limit(30)
    return success((data || []).map((c: Record<string, unknown>) => {
      const fn = (c as any).full_name ?? `${(c as any).first_name ?? ''} ${(c as any).last_name ?? ''}`.trim()
      const rawCompanies = ((c as any).client_companies ?? []) as Record<string, unknown>[]
      const companies: ClientForInvoiceCompany[] = rawCompanies
        .map(cc => ({
          id: String(cc.id),
          company_name: String((cc as any).company_name ?? ''),
          nif: ((cc as any).nif as string) ?? null,
          contact_email: ((cc as any).contact_email as string) ?? null,
          is_default: Boolean((cc as any).is_default),
        }))
        .sort((a, b) => Number(b.is_default) - Number(a.is_default))
      return {
        id: String(c.id),
        full_name: String(fn || 'Sin nombre'),
        email: (c.email as string) ?? null,
        phone: ((c as any).phone as string) ?? null,
        nif: ((c as any).document_number as string) ?? null,
        address: ((c as any).address as string) ?? null,
        postal_code: ((c as any).postal_code as string) ?? null,
        city: ((c as any).city as string) ?? null,
        province: ((c as any).province as string) ?? null,
        country: ((c as any).country as string) ?? null,
        companies,
      }
    }))
  }
)

/** Carga un cliente concreto por id en el formato ClientForInvoice. Útil
 *  para hidratar el combobox cuando se edita una factura/presupuesto que
 *  ya tiene cliente asignado, sin recargar la lista entera. */
export const getClientForInvoiceById = protectedAction<string, ClientForInvoice | null>(
  { permission: ['accounting.edit', 'accounting.manage_invoices'], auditModule: 'accounting' },
  async (ctx, id) => {
    if (!id) return success(null)
    const { data } = await ctx.adminClient
      .from('clients')
      .select('id, first_name, last_name, full_name, email, phone, document_number, address, postal_code, city, province, country, client_companies(id, company_name, nif, contact_email, is_default)')
      .eq('id', id)
      .maybeSingle()
    if (!data) return success(null)
    const c = data as Record<string, unknown>
    const fn = (c as any).full_name ?? `${(c as any).first_name ?? ''} ${(c as any).last_name ?? ''}`.trim()
    const rawCompanies = ((c as any).client_companies ?? []) as Record<string, unknown>[]
    const companies: ClientForInvoiceCompany[] = rawCompanies
      .map(cc => ({
        id: String(cc.id),
        company_name: String((cc as any).company_name ?? ''),
        nif: ((cc as any).nif as string) ?? null,
        contact_email: ((cc as any).contact_email as string) ?? null,
        is_default: Boolean((cc as any).is_default),
      }))
      .sort((a, b) => Number(b.is_default) - Number(a.is_default))
    return success({
      id: String(c.id),
      full_name: String(fn || 'Sin nombre'),
      email: (c.email as string) ?? null,
      phone: ((c as any).phone as string) ?? null,
      nif: ((c as any).document_number as string) ?? null,
      address: ((c as any).address as string) ?? null,
      postal_code: ((c as any).postal_code as string) ?? null,
      city: ((c as any).city as string) ?? null,
      province: ((c as any).province as string) ?? null,
      country: ((c as any).country as string) ?? null,
      companies,
    })
  }
)

/** Productos para añadir como líneas en factura/presupuesto (búsqueda por nombre o SKU). */
export const getProductsForInvoice = protectedAction<
  { search?: string },
  { id: string; name: string; sku: string; base_price: number }[]
>(
  { permission: ['accounting.edit', 'accounting.manage_invoices'], auditModule: 'accounting' },
  async (ctx, { search }) => {
    let q = ctx.adminClient
      .from('products')
      .select('id, name, sku, base_price, price_with_tax')
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

export const updateManualTransaction = protectedAction<
  { id: string; total: number; payment_method: string },
  void
>(
  { permission: 'accounting.edit', auditModule: 'accounting' },
  async (ctx, { id, total, payment_method }) => {
    const amount = total / 1.21
    const tax_amount = total - amount

    const { data: current } = await ctx.adminClient
      .from('manual_transactions')
      .select('notes')
      .eq('id', id)
      .single()

    const paymentLabel: Record<string, string> = {
      cash: 'Efectivo', card: 'Tarjeta', bizum: 'Bizum', transfer: 'Transferencia',
    }
    const methodText = `Método: ${paymentLabel[payment_method] ?? payment_method}`
    const oldNotes: string = (current as any)?.notes ?? ''
    const newNotes = /Método:/.test(oldNotes)
      ? oldNotes.replace(/Método:[^\n]*/, methodText)
      : oldNotes ? `${oldNotes}\n${methodText}` : methodText

    const { error } = await ctx.adminClient
      .from('manual_transactions')
      .update({ total, amount, tax_amount, notes: newNotes })
      .eq('id', id)

    if (error) {
      const { failure: fail } = await import('@/lib/errors')
      return fail(error.message)
    }
    return success(undefined)
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
  client_address: string | null
  client_email: string | null
  client_phone: string | null
  payment_method: string | null
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
    discount_percentage?: number
    line_total: number
  }[]
}

/**
 * Recalcula totales de factura en SERVIDOR a partir de las líneas.
 * El cliente envía cifras pero confiamos solo en estas. Aplica
 * descuento por línea (discount_percentage) y el IRPF global de la
 * cabecera (irpf_rate). El tax_rate "global" guardado es el de la
 * primera línea, solo para reporting agregado.
 *
 * Fórmula por línea:
 *   subtotal_línea = unit_price × quantity × (1 - dto/100)
 *   iva_línea      = subtotal_línea × tax_rate/100
 *   line_total     = subtotal_línea + iva_línea
 */
function recalculateInvoiceTotals(
  lines: CreateInvoiceInput['lines'],
  irpfRate: number,
): {
  subtotal: number
  taxAmount: number
  irpfAmount: number
  total: number
  taxRate: number
  computedLines: Array<{
    description: string
    quantity: number
    unit_price: number
    tax_rate: number
    discount_percentage: number
    line_total: number
  }>
} {
  let subtotal = 0
  let taxAmount = 0
  const computedLines = lines.map((l) => {
    const qty = Number(l.quantity) || 0
    const price = Number(l.unit_price) || 0
    const dto = Number(l.discount_percentage ?? 0) || 0
    const tax = Number(l.tax_rate) || 0
    const lineSubtotal = price * qty * (1 - dto / 100)
    const lineTax = lineSubtotal * (tax / 100)
    const lineTotal = lineSubtotal + lineTax
    subtotal += lineSubtotal
    taxAmount += lineTax
    return {
      description: l.description,
      quantity: qty,
      unit_price: price,
      tax_rate: tax,
      discount_percentage: dto,
      line_total: Math.round(lineTotal * 100) / 100,
    }
  })
  const irpf = Math.max(0, Number(irpfRate) || 0)
  const irpfAmount = subtotal * (irpf / 100)
  const total = subtotal + taxAmount - irpfAmount
  const taxRate = computedLines[0]?.tax_rate ?? 21
  return {
    subtotal: Math.round(subtotal * 100) / 100,
    taxAmount: Math.round(taxAmount * 100) / 100,
    irpfAmount: Math.round(irpfAmount * 100) / 100,
    total: Math.round(total * 100) / 100,
    taxRate,
    computedLines,
  }
}

// Genera el siguiente número de una serie documental (facturas, presupuestos…)
// del año en curso. Usa el MÁXIMO de la secuencia existente + 1 (no el conteo):
// el conteo se rompe en cuanto hay un hueco —p. ej. un documento borrado o
// anulado— porque vuelve a producir un número ya usado y choca con la
// restricción UNIQUE de la columna (invoices_invoice_number_key, etc.).
async function nextSeriesNumber(
  adminClient: AdminClient,
  table: 'invoices' | 'estimates',
  column: string,
  prefix: string
): Promise<string> {
  const year = new Date().getFullYear()
  const { data } = await adminClient
    .from(table)
    .select(column)
    .like(column, `${prefix}${year}-%`)
    .order(column, { ascending: false })
    .limit(1)
  const last = (data?.[0] as Record<string, string | undefined> | undefined)?.[column]
  const lastSeq = last ? parseInt(last.split('-')[1], 10) || 0 : 0
  const seq = String(lastSeq + 1).padStart(4, '0')
  return `${prefix}${year}-${seq}`
}

const nextInvoiceNumber = (adminClient: AdminClient) =>
  nextSeriesNumber(adminClient, 'invoices', 'invoice_number', 'F')

export const createInvoiceAction = protectedAction<CreateInvoiceInput, { id: string; invoice_number: string }>(
  {
    permission: 'accounting.manage_invoices',
    auditModule: 'accounting',
    auditAction: 'create',
    auditEntity: 'invoice',
  },
  async (ctx, input) => {
    const invoice_number = await nextInvoiceNumber(ctx.adminClient)

    const recalc = recalculateInvoiceTotals(input.lines, input.irpf_rate)

    const { data: inv, error } = await ctx.adminClient
      .from('invoices')
      .insert({
        invoice_number,
        invoice_series: 'F',
        invoice_type: 'issued',
        client_id: input.client_id || null,
        client_name: input.client_name,
        client_nif: input.client_nif || null,
        client_address: input.client_address || null,
        client_email: input.client_email || null,
        client_phone: input.client_phone || null,
        payment_method: input.payment_method || null,
        company_name: 'Sastrería Prats',
        company_nif: 'B12345678',
        company_address: 'Madrid, España',
        invoice_date: input.invoice_date,
        due_date: input.due_date || null,
        subtotal: recalc.subtotal,
        tax_rate: recalc.taxRate,
        tax_amount: recalc.taxAmount,
        irpf_rate: input.irpf_rate,
        irpf_amount: recalc.irpfAmount,
        total: recalc.total,
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
        recalc.computedLines.map((l, i) => ({
          invoice_id: inv.id,
          description: l.description,
          quantity: l.quantity,
          unit_price: l.unit_price,
          tax_rate: l.tax_rate,
          discount_percentage: l.discount_percentage,
          line_total: l.line_total,
          sort_order: i,
        }))
      )

    if (linesError) {
      console.error('Error creating invoice lines:', linesError)
      return failure(linesError.message ?? 'Error al crear las líneas de factura')
    }

    const displayNumber = `F-${invoice_number}`
    const auditDescription = `Factura ${displayNumber} · ${recalc.total.toFixed(2)}€`
    return success({ id: inv.id as string, invoice_number, auditDescription })
  }
)

// ── Crear factura desde ticket/venta TPV ─────────────────────────────────────
export const createInvoiceFromSaleAction = protectedAction<
  { saleId: string; draft?: boolean },
  { id: string; invoice_number: string; auditEntityId: string; auditDescription: string }
>(
  {
    permission: 'accounting.manage_invoices',
    auditModule: 'accounting',
    auditAction: 'create',
    auditEntity: 'invoice',
  },
  async (ctx, { saleId, draft }) => {
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
      .not('status', 'in', '(cancelled)')
      .limit(1)
      .maybeSingle()

    if (existing.data?.id) {
      const num = (existing.data as { invoice_number: string }).invoice_number
      return success({
        id: existing.data.id as string,
        invoice_number: num,
        auditEntityId: String(existing.data.id),
        auditDescription: `Factura ${num}`,
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
    let clientAddress: string | null = null
    let clientEmail: string | null = null
    let clientPhone: string | null = null
    const clientId = (sale as { client_id?: string }).client_id ?? null
    if (clientId) {
      const { data: client } = await ctx.adminClient
        .from('clients')
        .select('full_name, company_name, company_nif, document_number, address, postal_code, city, province, country, email, phone')
        .eq('id', clientId)
        .single()
      if (client) {
        const c = client as { full_name?: string; company_name?: string; company_nif?: string; document_number?: string; address?: string; postal_code?: string; city?: string; province?: string; country?: string; email?: string; phone?: string }
        clientName = c.full_name || c.company_name || clientName
        clientNif = c.company_nif || c.document_number || null
        clientAddress = formatClientAddress(c) || null
        clientEmail = c.email || null
        clientPhone = c.phone || null
      }
    }

    const invoice_number = await nextInvoiceNumber(ctx.adminClient)

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
        client_address: clientAddress,
        client_email: clientEmail,
        client_phone: clientPhone,
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
        status: draft ? 'draft' : 'issued',
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
        saleLines.map((l: { description: string; quantity: number; unit_price: number; tax_rate?: number; line_total: number }, i: number) => {
          // sale_lines.unit_price viene CON IVA (PVP del TPV).
          // invoice_lines.unit_price es la base imponible (SIN IVA).
          // Convertimos vía line_total para evitar errores acumulados de redondeo
          // (mismo patrón que createInvoiceFromTailoringOrderAction).
          const qty = Math.max(1, Number(l.quantity) || 1)
          const taxRate = Number(l.tax_rate) || 21
          const lineTotal = Number(l.line_total)
          const unitPriceNoTax = lineTotal / (1 + taxRate / 100) / qty
          return {
            invoice_id: inv.id,
            description: l.description,
            quantity: qty,
            unit_price: Number(unitPriceNoTax.toFixed(2)),
            tax_rate: taxRate,
            line_total: lineTotal,
            sort_order: i,
          }
        })
      )

    if (linesError) {
      console.error('Error creating invoice lines from sale:', linesError)
      return failure(linesError.message ?? 'Error al crear las líneas')
    }

    // Solo crear asiento contable si se emite directamente. En modo draft el
    // asiento se generará al pulsar "Emitir" desde el editor.
    if (!draft) {
      createInvoiceJournalEntry(inv.id as string).catch((e) => console.error('Journal entry from sale invoice:', e))
    }
    return success({ id: inv.id as string, invoice_number, auditEntityId: String(inv.id), auditDescription: `Factura ${invoice_number}` })
  }
)

// ── Crear factura desde pedido de sastrería ─────────────────────────────────
export const createInvoiceFromTailoringOrderAction = protectedAction<
  string,
  { id: string; invoice_number: string; auditEntityId: string; auditDescription: string }
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
      const num = (existing.data as { invoice_number: string }).invoice_number
      return success({
        id: existing.data.id as string,
        invoice_number: num,
        auditEntityId: String(existing.data.id),
        auditDescription: `Factura ${num}`,
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
    let clientAddress: string | null = null
    let clientEmail: string | null = null
    let clientPhone: string | null = null
    const clientId = (order as { client_id?: string }).client_id ?? null
    if (clientId) {
      const { data: client } = await ctx.adminClient
        .from('clients')
        .select('full_name, company_name, company_nif, document_number, address, postal_code, city, province, country, email, phone')
        .eq('id', clientId)
        .single()
      if (client) {
        const c = client as { full_name?: string; company_name?: string; company_nif?: string; document_number?: string; address?: string; postal_code?: string; city?: string; province?: string; country?: string; email?: string; phone?: string }
        clientName = c.full_name || c.company_name || clientName
        clientNif = c.company_nif || c.document_number || null
        clientAddress = formatClientAddress(c) || null
        clientEmail = c.email || null
        clientPhone = c.phone || null
      }
    }

    const invoice_number = await nextInvoiceNumber(ctx.adminClient)

    const subtotal = lines.reduce((s: number, l: any) => s + l.quantity * l.unit_price, 0)
    const taxAmount = lines.reduce((s: number, l: any) => s + (l.line_total - l.quantity * l.unit_price), 0)
    const total = lines.reduce((s: number, l: any) => s + l.line_total, 0)
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
        client_address: clientAddress,
        client_email: clientEmail,
        client_phone: clientPhone,
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
        lines.map((l: any, i: number) => ({
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
    return success({ id: inv.id as string, invoice_number, auditEntityId: String(inv.id), auditDescription: `Factura ${invoice_number}` })
  }
)

// ── Editar factura borrador ───────────────────────────────────────────────────
export type UpdateInvoiceInput = CreateInvoiceInput & { id: string; conceptOnly?: boolean }

export const updateInvoiceAction = protectedAction<UpdateInvoiceInput, { id: string; auditEntityId: string; auditDescription: string }>(
  { permission: 'accounting.manage_invoices', auditModule: 'accounting', auditAction: 'update', auditEntity: 'invoice' },
  async (ctx, input) => {
    const { data: existing } = await ctx.adminClient
      .from('invoices')
      .select('status, verifactu_sent, invoice_number')
      .eq('id', input.id)
      .single()
    if (!existing) return failure('Factura no encontrada', 'NOT_FOUND')
    const status = (existing as { status: string }).status
    const verifactuSent = (existing as { verifactu_sent?: boolean }).verifactu_sent === true
    const invoiceNumber = (existing as { invoice_number?: string }).invoice_number ?? ''

    // Verifactu lock: si ya está en Hacienda, no se puede tocar nada
    // (ni siquiera descripciones de líneas). Hay que emitir rectificativa.
    if (verifactuSent) {
      return failure(
        'Esta factura ya fue enviada a Hacienda (Verifactu). No se puede editar — emite una factura rectificativa.',
        'FORBIDDEN',
      )
    }

    // Modo "solo concepto": permitido en estados emitidos (issued/paid/etc.)
    // siempre que no esté en Verifactu. Solo actualiza la descripción de
    // cada línea por orden (sort_order). No toca cabecera, totales,
    // fechas ni pdf_url.
    if (input.conceptOnly) {
      const { data: existingLines, error: linesErr } = await ctx.adminClient
        .from('invoice_lines')
        .select('id, sort_order')
        .eq('invoice_id', input.id)
        .order('sort_order', { ascending: true })

      if (linesErr) return failure(linesErr.message)

      const sorted = (existingLines ?? []) as Array<{ id: string; sort_order: number }>
      for (let i = 0; i < input.lines.length && i < sorted.length; i++) {
        const target = sorted[i]
        const { error: upErr } = await ctx.adminClient
          .from('invoice_lines')
          .update({ description: input.lines[i].description })
          .eq('id', target.id)
        if (upErr) return failure(upErr.message)
      }

      // No tocamos pdf_url ni totales: generateInvoicePdf siempre lee
      // de invoice_lines en caliente y reescribe el archivo del Storage.
      return success({ id: input.id, auditEntityId: String(input.id), auditDescription: `Factura ${invoiceNumber}` })
    }

    // Estados editables completos (sin Verifactu): draft + ciclo de vida
    // posterior mientras no se haya enviado a Hacienda. Cancelled/rectified
    // siguen siendo no editables (solo borrables o readonly).
    const editableStatuses = ['draft', 'issued', 'paid', 'partially_paid', 'overdue']
    if (!editableStatuses.includes(status)) {
      return failure(
        `No se pueden editar facturas en estado "${status}".`,
        'FORBIDDEN',
      )
    }

    if (!input.lines || input.lines.length === 0) {
      return failure('La factura necesita al menos una línea', 'VALIDATION')
    }

    // Recálculo de totales en servidor (fuente de verdad). Ignoramos lo
    // que envíe el cliente para subtotal/tax_amount/irpf_amount/total.
    const recalc = recalculateInvoiceTotals(input.lines, input.irpf_rate)

    const { error } = await ctx.adminClient.from('invoices').update({
      client_id: input.client_id || null,
      client_name: input.client_name,
      client_nif: input.client_nif || null,
      client_address: input.client_address || null,
      client_email: input.client_email || null,
      client_phone: input.client_phone || null,
      payment_method: input.payment_method || null,
      invoice_date: input.invoice_date,
      due_date: input.due_date || null,
      subtotal: recalc.subtotal,
      tax_rate: recalc.taxRate,
      tax_amount: recalc.taxAmount,
      irpf_rate: input.irpf_rate,
      irpf_amount: recalc.irpfAmount,
      total: recalc.total,
      notes: input.notes || null,
      pdf_url: null, // regenerar PDF al siguiente acceso
    }).eq('id', input.id)

    if (error) return failure(error.message)

    // Reemplazar líneas. Idealmente esto debería ser atómico (RPC), pero
    // por ahora al menos capturamos el error del INSERT — si fallara, las
    // líneas quedan vacías y el sastre lo verá inmediatamente.
    await ctx.adminClient.from('invoice_lines').delete().eq('invoice_id', input.id)
    if (recalc.computedLines.length > 0) {
      const { error: insertLinesError } = await ctx.adminClient.from('invoice_lines').insert(
        recalc.computedLines.map((l, i) => ({
          invoice_id: input.id,
          description: l.description,
          quantity: l.quantity,
          unit_price: l.unit_price,
          tax_rate: l.tax_rate,
          discount_percentage: l.discount_percentage,
          line_total: l.line_total,
          sort_order: i,
        }))
      )
      if (insertLinesError) return failure(insertLinesError.message)
    }
    return success({ id: input.id, auditEntityId: String(input.id), auditDescription: `Factura ${invoiceNumber}` })
  }
)

// ── Emitir factura (draft → issued) y crear asiento ──────────────────────────
export const issueInvoiceAction = protectedAction<string, { id: string; auditEntityId: string; auditDescription: string }>(
  { permission: 'accounting.manage_invoices', auditModule: 'accounting', auditAction: 'state_change', auditEntity: 'invoice' },
  async (ctx, invoiceId) => {
    const { error } = await ctx.adminClient.from('invoices').update({
      status: 'issued',
      sent_to_client: true,
      sent_at: new Date().toISOString(),
    }).eq('id', invoiceId)
    if (error) return failure(error.message)

    const { data: inv } = await ctx.adminClient
      .from('invoices')
      .select('invoice_number')
      .eq('id', invoiceId)
      .maybeSingle()
    const invoiceNumber = (inv as { invoice_number?: string } | null)?.invoice_number ?? ''
    return success({ id: invoiceId, auditEntityId: String(invoiceId), auditDescription: `Factura ${invoiceNumber} emitida` })
  }
)

/** Elimina una factura. SOLO permitido si está en borrador. Las facturas
 *  emitidas no se borran — se anulan con cancelInvoiceAction. */
export const deleteInvoiceAction = protectedAction<string, { deleted: true }>(
  {
    permission: 'accounting.manage_invoices',
    auditModule: 'accounting',
    auditAction: 'delete',
    auditEntity: 'invoice',
    revalidate: ['/admin/contabilidad'],
  },
  async (ctx, invoiceId) => {
    if (!invoiceId?.trim()) return failure('ID de factura requerido', 'VALIDATION')

    const { data: inv } = await ctx.adminClient
      .from('invoices')
      .select('id, invoice_number, status, verifactu_sent')
      .eq('id', invoiceId)
      .single()
    if (!inv) return failure('Factura no encontrada', 'NOT_FOUND')

    const status = (inv as { status: string }).status
    const verifactuSent = (inv as { verifactu_sent?: boolean }).verifactu_sent === true

    if (status !== 'draft' && status !== 'cancelled') {
      return failure(
        'Solo se pueden eliminar borradores o facturas canceladas. Para una factura emitida, anúlala primero.',
        'CONFLICT',
      )
    }

    if (status === 'cancelled' && verifactuSent) {
      return failure(
        'Esta factura ya fue enviada a Hacienda (Verifactu). No se puede borrar — debe quedar como rastro fiscal.',
        'CONFLICT',
      )
    }

    // Borrar líneas y luego la factura.
    await ctx.adminClient.from('invoice_lines').delete().eq('invoice_id', invoiceId)
    const { error } = await ctx.adminClient.from('invoices').delete().eq('id', invoiceId)
    if (error) return failure(error.message)

    return success({
      deleted: true,
      auditDescription: `Factura eliminada (borrador): ${(inv as { invoice_number: string }).invoice_number}`,
    } as any)
  }
)

/** Anula una factura ya emitida (status 'cancelled'). Para borradores hay
 *  que usar deleteInvoiceAction. Se requiere motivo y se preserva el
 *  registro fiscal. */
export const cancelInvoiceAction = protectedAction<
  { invoiceId: string; reason: string },
  { id: string; status: 'cancelled' }
>(
  {
    permission: 'accounting.manage_invoices',
    auditModule: 'accounting',
    auditAction: 'state_change',
    auditEntity: 'invoice',
    revalidate: ['/admin/contabilidad'],
  },
  async (ctx, { invoiceId, reason }) => {
    if (!invoiceId?.trim()) return failure('ID de factura requerido', 'VALIDATION')
    const trimmedReason = reason?.trim()
    if (!trimmedReason) return failure('El motivo de anulación es obligatorio', 'VALIDATION')

    const { data: inv } = await ctx.adminClient
      .from('invoices')
      .select('id, invoice_number, status, notes')
      .eq('id', invoiceId)
      .single()
    if (!inv) return failure('Factura no encontrada', 'NOT_FOUND')

    const status = (inv as { status: string }).status
    if (status === 'cancelled') return failure('La factura ya está anulada', 'CONFLICT')
    if (status === 'draft') {
      return failure(
        'Esta factura está en borrador: usa "Eliminar" en lugar de "Anular".',
        'CONFLICT',
      )
    }
    if (status === 'rectified') {
      return failure('La factura ya fue rectificada', 'CONFLICT')
    }

    const stamp = new Date().toISOString().slice(0, 10)
    const prevNotes = ((inv as { notes: string | null }).notes ?? '').trimEnd()
    const newLine = `[${stamp}] Anulada: ${trimmedReason}`
    const newNotes = prevNotes ? `${prevNotes}\n${newLine}` : newLine

    // Revertir el asiento contable (contrapartida espejo) ANTES de marcar la
    // anulación, para que la cuenta 700 y el resto neteen a cero. Idempotente: si
    // falla, no marcamos la factura como anulada (reintentable sin doble inverso).
    const reversal = await reverseInvoiceJournalEntry(invoiceId)
    if (!reversal.ok) {
      return failure(`No se pudo revertir el asiento contable de la factura: ${reversal.error ?? 'error desconocido'}`)
    }

    const { error } = await ctx.adminClient
      .from('invoices')
      .update({ status: 'cancelled', notes: newNotes })
      .eq('id', invoiceId)
    if (error) return failure(error.message)

    return success({
      id: invoiceId,
      status: 'cancelled' as const,
      auditDescription: `Factura ${(inv as { invoice_number: string }).invoice_number} anulada: ${trimmedReason}`,
      auditOldData: { status, notes: (inv as { notes: string | null }).notes },
      auditNewData: { status: 'cancelled', notes: newNotes },
    } as any)
  }
)

// ── Emitir factura rectificativa (abono total o parcial) ──────────────────────
// Delega en rpc_create_credit_note (mig 192). Doble cerrojo: permiso
// invoices.credit_note + isFullAdmin. La RPC valida por LÍNEA, asigna serie
// 'R' con retry, crea el asiento contrapartida (708/477/430 + 473 si IRPF) y
// marca la original 'rectified' solo si todas sus líneas quedan al 100%.
export interface CreateCreditNoteInput {
  invoiceId: string
  reason: string
  lines: { original_line_id: string; qty_to_rectify: number }[]
}
export interface CreateCreditNoteOutput {
  credit_note_id: string
  credit_note_number: string
  is_full: boolean
  subtotal: number
  tax_amount: number
  irpf_amount: number
  total: number
  original_status: string
}

export const createCreditNote = protectedAction<CreateCreditNoteInput, CreateCreditNoteOutput>(
  { permission: 'invoices.credit_note', auditAction: 'create', auditModule: 'accounting', auditEntity: 'invoice' },
  async (ctx, { invoiceId, reason, lines }) => {
    if (!invoiceId) return failure('Falta el identificador de la factura', 'VALIDATION')
    if (!reason || reason.trim().length < 10) {
      return failure('El motivo es obligatorio (mínimo 10 caracteres)', 'VALIDATION')
    }
    if (!Array.isArray(lines) || lines.length === 0) {
      return failure('Debe rectificarse al menos una línea', 'VALIDATION')
    }
    const cleaned = lines
      .filter(l => l && l.original_line_id && Number(l.qty_to_rectify) > 0)
      .map(l => ({ original_line_id: l.original_line_id, qty_to_rectify: Number(l.qty_to_rectify) }))
    if (cleaned.length === 0) {
      return failure('Debe rectificarse al menos una línea con cantidad mayor que 0', 'VALIDATION')
    }
    if (!(await userIsFullAdmin(ctx))) {
      return failure('Solo un administrador puede emitir facturas rectificativas.', 'FORBIDDEN')
    }

    const { data, error } = await ctx.adminClient.rpc('rpc_create_credit_note', {
      p_invoice_id: invoiceId,
      p_lines: cleaned,
      p_reason: reason.trim(),
      p_user_id: ctx.userId,
    })
    if (error) {
      console.error('[createCreditNote]', error)
      return failure(error.message)
    }
    if (data && data.success === false) {
      return failure(String(data.error || 'No se pudo emitir la rectificativa'), 'CONFLICT')
    }

    return success({
      credit_note_id: String(data.credit_note_id),
      credit_note_number: String(data.credit_note_number),
      is_full: Boolean(data.is_full),
      subtotal: Number(data.subtotal ?? 0),
      tax_amount: Number(data.tax_amount ?? 0),
      irpf_amount: Number(data.irpf_amount ?? 0),
      total: Number(data.total ?? 0),
      original_status: String(data.original_status ?? ''),
      auditDescription: `Rectificativa ${data.credit_note_number} emitida (${data.is_full ? 'total' : 'parcial'}, ${Number(data.total ?? 0).toFixed(2)} €): ${reason.trim()}`,
    } as any)
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
    return success({ lines: (data || []).map((l: any) => ({
      description: String(l.description),
      quantity: Number(l.quantity),
      unit_price: Number(l.unit_price),
      tax_rate: Number(l.tax_rate),
      line_total: Number(l.line_total),
    })) })
  }
)

// ── Editar descripción de asiento ─────────────────────────────────────────────
export const updateJournalEntryDescriptionAction = protectedAction<{ id: string; description: string }, { auditEntityId: string; auditDescription: string }>(
  { permission: 'accounting.manage_invoices', auditModule: 'accounting', auditAction: 'update', auditEntity: 'journal_entry' },
  async (ctx, { id, description }) => {
    const { error } = await ctx.adminClient.from('journal_entries').update({ description }).eq('id', id)
    if (error) return failure(error.message)

    const { data: entry } = await ctx.adminClient
      .from('journal_entries')
      .select('entry_number')
      .eq('id', id)
      .maybeSingle()
    const entryNumber = (entry as { entry_number?: number } | null)?.entry_number
    return success({ auditEntityId: String(id), auditDescription: `Asiento ${entryNumber ?? ''}`.trim() })
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

export const createEstimateAction = protectedAction<CreateEstimateInput, { id: string; estimate_number: string; auditEntityId: string; auditDescription: string }>(
  {
    permission: 'accounting.edit',
    auditModule: 'accounting',
    auditAction: 'create',
    auditEntity: 'estimate',
  },
  async (ctx, input) => {
    const estimate_number = await nextSeriesNumber(ctx.adminClient, 'estimates', 'estimate_number', 'PRES')

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

    return success({ id: est.id as string, estimate_number, auditEntityId: String(est.id), auditDescription: `Presupuesto ${estimate_number}` })
  }
)

export const updateEstimateAction = protectedAction<
  { estimateId: string; client_email?: string | null },
  { auditEntityId: string; auditDescription: string }
>(
  {
    permission: 'accounting.edit',
    auditModule: 'accounting',
    auditAction: 'update',
    auditEntity: 'estimate',
    revalidate: ['/admin/contabilidad'],
  },
  async (ctx, { estimateId, client_email }) => {
    const { data: est } = await ctx.adminClient.from('estimates').select('id, estimate_number').eq('id', estimateId).single()
    if (!est) return failure('Presupuesto no encontrado')

    const { error } = await ctx.adminClient
      .from('estimates')
      .update({ client_email: client_email?.trim() || null })
      .eq('id', estimateId)
    if (error) return failure(error.message)
    return success({ auditEntityId: String(estimateId), auditDescription: `Presupuesto ${(est as { estimate_number?: string }).estimate_number ?? ''}`.trim() })
  }
)

// ── Detalle para edición (datos + líneas) ──────────────────────────────────────

export type EstimateDetail = {
  id: string
  estimate_number: string
  client_id: string | null
  client_name: string
  client_nif: string | null
  client_email: string | null
  estimate_date: string
  valid_until: string | null
  notes: string | null
  subtotal: number
  tax_rate: number
  tax_amount: number
  irpf_rate: number
  irpf_amount: number
  total: number
  status: string
  lines: { description: string; quantity: number; unit_price: number; tax_rate: number }[]
}

export const getEstimateDetail = protectedAction<{ estimateId: string }, EstimateDetail>(
  { permission: 'accounting.view', auditModule: 'accounting' },
  async (ctx, { estimateId }) => {
    const { data: est, error } = await ctx.adminClient
      .from('estimates')
      .select(`id, estimate_number, client_id, client_name, client_nif, client_email,
        estimate_date, valid_until, notes, subtotal, tax_rate, tax_amount,
        irpf_rate, irpf_amount, total, status`)
      .eq('id', estimateId)
      .single()
    if (error || !est) return failure('Presupuesto no encontrado')

    const { data: rawLines = [] } = await ctx.adminClient
      .from('estimate_lines')
      .select('description, quantity, unit_price, tax_rate')
      .eq('estimate_id', estimateId)
      .order('line_order', { ascending: true })

    const e = est as Record<string, unknown>
    return success({
      id: String(e.id),
      estimate_number: String(e.estimate_number ?? ''),
      client_id: (e.client_id as string) ?? null,
      client_name: String(e.client_name ?? ''),
      client_nif: (e.client_nif as string) ?? null,
      client_email: (e.client_email as string) ?? null,
      estimate_date: String(e.estimate_date ?? ''),
      valid_until: (e.valid_until as string) ?? null,
      notes: (e.notes as string) ?? null,
      subtotal: Number(e.subtotal ?? 0),
      tax_rate: Number(e.tax_rate ?? 21),
      tax_amount: Number(e.tax_amount ?? 0),
      irpf_rate: Number(e.irpf_rate ?? 0),
      irpf_amount: Number(e.irpf_amount ?? 0),
      total: Number(e.total ?? 0),
      status: String(e.status ?? 'draft'),
      lines: (rawLines || []).map((l: Record<string, unknown>) => ({
        description: String(l.description ?? ''),
        quantity: Number(l.quantity ?? 1),
        unit_price: Number(l.unit_price ?? 0),
        tax_rate: Number(l.tax_rate ?? 21),
      })),
    })
  }
)

// ── Edición completa de presupuesto (cabecera + líneas) ────────────────────────

export type UpdateEstimateFullInput = CreateEstimateInput & { estimateId: string }

export const updateEstimateFullAction = protectedAction<UpdateEstimateFullInput, { id: string; auditEntityId: string; auditDescription: string }>(
  {
    permission: 'accounting.edit',
    auditModule: 'accounting',
    auditAction: 'update',
    auditEntity: 'estimate',
    revalidate: ['/admin/contabilidad'],
  },
  async (ctx, input) => {
    const { data: est } = await ctx.adminClient
      .from('estimates')
      .select('id, status, estimate_number')
      .eq('id', input.estimateId)
      .single()
    if (!est) return failure('Presupuesto no encontrado')
    if (!['draft', 'sent'].includes((est as { status?: string }).status ?? '')) {
      return failure('Solo se pueden editar presupuestos en borrador o enviados')
    }

    const { error: upErr } = await ctx.adminClient
      .from('estimates')
      .update({
        client_id: input.client_id || null,
        client_name: input.client_name?.trim() || '',
        client_nif: input.client_nif || null,
        client_email: input.client_email?.trim() || null,
        estimate_date: input.estimate_date,
        valid_until: input.valid_until || null,
        subtotal: input.subtotal,
        tax_rate: input.tax_rate,
        tax_amount: input.tax_amount,
        irpf_rate: input.irpf_rate || null,
        irpf_amount: input.irpf_amount || null,
        total: input.total,
        notes: input.notes || null,
        pdf_url: null,
      })
      .eq('id', input.estimateId)
    if (upErr) return failure(upErr.message)

    const { error: delErr } = await ctx.adminClient
      .from('estimate_lines')
      .delete()
      .eq('estimate_id', input.estimateId)
    if (delErr) return failure(delErr.message)

    const { error: insErr } = await ctx.adminClient.from('estimate_lines').insert(
      input.lines.map((l, i) => ({
        estimate_id: input.estimateId,
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
    if (insErr) return failure(insErr.message)

    return success({ id: input.estimateId, auditEntityId: String(input.estimateId), auditDescription: `Presupuesto ${(est as { estimate_number?: string }).estimate_number ?? ''}`.trim() })
  }
)

// ── Presupuesto: enviar, aceptar, rechazar, convertir a factura ─────────────────

export const sendEstimateAction = protectedAction<{ estimateId: string }, { auditEntityId: string; auditDescription: string }>(
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
    return success({ auditEntityId: String(estimateId), auditDescription: `Presupuesto ${String((est as { estimate_number?: string }).estimate_number ?? '')} enviado`.replace('  ', ' ').trim() })
  }
)

export const acceptEstimateAction = protectedAction<{ estimateId: string }, { auditEntityId: string; auditDescription: string }>(
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
    return success({ auditEntityId: String(estimateId), auditDescription: `Presupuesto ${String((est as { estimate_number?: string }).estimate_number ?? '')} aceptado`.replace('  ', ' ').trim() })
  }
)

export const rejectEstimateAction = protectedAction<{ estimateId: string; reason?: string }, { auditEntityId: string; auditDescription: string }>(
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
    return success({ auditEntityId: String(estimateId), auditDescription: `Presupuesto ${String((est as { estimate_number?: string }).estimate_number ?? '')} rechazado`.replace('  ', ' ').trim() })
  }
)

export const convertEstimateToInvoiceAction = protectedAction<{ estimateId: string }, { invoiceId: string; invoice_number: string; auditEntityId: string; auditDescription: string }>(
  {
    permission: 'accounting.edit',
    auditModule: 'accounting',
    auditAction: 'create',
    auditEntity: 'invoice',
    revalidate: ['/admin/contabilidad'],
  },
  async (ctx, { estimateId }) => {
    const { data: est } = await ctx.adminClient
      .from('estimates')
      .select('id, status, client_id, client_name, client_nif, client_email, subtotal, tax_rate, tax_amount, irpf_rate, irpf_amount, total, estimate_number, notes')
      .eq('id', estimateId)
      .single()
    if (!est) return failure('Presupuesto no encontrado')
    if (est.status !== 'accepted') return failure('Solo se pueden facturar presupuestos aceptados')

    const invoice_number = await nextInvoiceNumber(ctx.adminClient)

    const { data: lines } = await ctx.adminClient.from('estimate_lines').select('description, quantity, unit_price, tax_rate, total').eq('estimate_id', estimateId)

    // Copiamos el header directamente del estimate (es la fuente de verdad).
    // Antes esta función hardcodeaba tax_rate=21 y recalculaba subtotal como
    // total/1.21, lo cual ignoraba el IVA real (productos al 4/10/0%) y la
    // descomposición ya persistida. También perdía client_id, client_nif,
    // irpf y notes.
    const { data: inv, error } = await ctx.adminClient.from('invoices').insert({
      invoice_number,
      invoice_series: 'F',
      invoice_type: 'issued',
      client_id: est.client_id ?? null,
      client_name: est.client_name,
      client_nif: est.client_nif ?? null,
      company_name: 'Sastrería Prats',
      company_nif: 'B12345678',
      company_address: 'Madrid, España',
      invoice_date: new Date().toISOString().split('T')[0],
      subtotal: Number(est.subtotal),
      tax_rate: Number(est.tax_rate ?? 21),
      tax_amount: Number(est.tax_amount),
      irpf_rate: Number(est.irpf_rate ?? 0),
      irpf_amount: Number(est.irpf_amount ?? 0),
      total: Number(est.total),
      notes: est.notes ?? null,
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
    return success({
      invoiceId: inv.id as string,
      invoice_number,
      auditEntityId: String(inv.id),
      auditDescription: `Factura ${invoice_number} (desde presupuesto ${String((est as { estimate_number?: string }).estimate_number ?? '')})`.replace(' )', ')'),
    })
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
  async (_ctx, estimateId) => {
    try {
      const url = await generateEstimatePdf(estimateId)
      return success({ url })
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Error al generar PDF'
      return failure(msg, 'PDF_ERROR')
    }
  }
)
