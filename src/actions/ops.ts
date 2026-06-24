'use server'

import { createAdminClient } from '@/lib/supabase/admin'
import { getViewerAccess, assertScope, assertCanManage, type ViewerAccess } from '@/lib/ops/access'
import { seal, open } from '@/lib/ops/crypto'
import {
  listEntries, insertEntry, deleteEntry,
  listAccess, grantAccess, revokeAccess, type Scope,
} from '@/lib/ops/db'
import type {
  CashPaymentPayload, CashPayment, AccountingView, MonthPoint, QuarterRow, MovementRow, ViewB, ViewC,
} from '@/lib/ops/types'

const r2 = (n: number) => Math.round(n * 100) / 100
const ok = <T,>(data: T) => ({ ok: true as const, data })
const fail = (msg = 'No encontrado') => ({ ok: false as const, error: msg })

// ---------------------------------------------------------------------------
// Acceso del viewer (seguro de exponer: [] si no autorizado). Para el menú/UI.
// ---------------------------------------------------------------------------
export async function getMyAccess(): Promise<{ scopes: Scope[]; canManage: boolean }> {
  const a = await getViewerAccess()
  return { scopes: a.scopes, canManage: a.canManage }
}

// ===========================================================================
// CÁLCULO DE CONTABILIDAD (espejo de getAccountingSummary + getVatQuarterly de A)
// Partimos las ventas por payment_method: cash vs resto. Gastos/soportado = de A.
// ===========================================================================
type QMap = Record<number, { base: number; vat: number; count: number }>
type Bucket = { income: number; vat: number; count: number; monthly: Record<string, number>; quarters: QMap }
const emptyQ = (): QMap => ({ 1: { base: 0, vat: 0, count: 0 }, 2: { base: 0, vat: 0, count: 0 }, 3: { base: 0, vat: 0, count: 0 }, 4: { base: 0, vat: 0, count: 0 } })
const emptyBucket = (): Bucket => ({ income: 0, vat: 0, count: 0, monthly: {}, quarters: emptyQ() })

async function readAllSales(admin: ReturnType<typeof createAdminClient>, start: string, end: string) {
  const out: Record<string, unknown>[] = []
  for (let from = 0; ; from += 1000) {
    const { data } = await admin.from('sales')
      .select('ticket_number,total,total_returned,subtotal,tax_amount,created_at,payment_method,status')
      .gte('created_at', start).lte('created_at', end)
      .in('status', ['completed', 'partially_returned'])
      .order('created_at', { ascending: true })
      .range(from, from + 999)
    const b = (data ?? []) as Record<string, unknown>[]
    out.push(...b)
    if (b.length < 1000) break
  }
  return out
}

async function computeYear(year: number) {
  const admin = createAdminClient()
  const start = `${year}-01-01`, end = `${year}-12-31T23:59:59`
  const sales = await readAllSales(admin, start, end)
  const { data: purch } = await admin.from('supplier_orders')
    .select('total,tax_amount,created_at')
    .gte('created_at', start).lte('created_at', end)
    .in('status', ['received', 'partially_received'])
  const { data: apInv } = await admin.from('ap_supplier_invoices')
    .select('amount,tax_amount,invoice_date')
    .eq('is_proforma', false)
    .gte('invoice_date', `${year}-01-01`).lte('invoice_date', `${year}-12-31`)

  const cash = emptyBucket(), noncash = emptyBucket()
  const cashMoves: MovementRow[] = [], noncashMoves: MovementRow[] = []

  for (const x of sales) {
    const total = Number(x.total) || 0
    const returned = Number(x.total_returned) || 0
    const subtotal = Number(x.subtotal) || 0
    const tax = Number(x.tax_amount) || 0
    const prop = total > 0 ? Math.max(0, (total - returned) / total) : 0
    const base = (subtotal || total) * prop
    const vat = tax * prop
    const created = String(x.created_at)
    const month = created.slice(0, 7)
    const q = Math.ceil(Number(created.slice(5, 7)) / 3)
    const isCash = x.payment_method === 'cash'
    const bk = isCash ? cash : noncash
    bk.income += base; bk.vat += vat; bk.count += 1
    bk.monthly[month] = (bk.monthly[month] || 0) + base
    bk.quarters[q].base += base; bk.quarters[q].vat += vat; bk.quarters[q].count += 1
    const mv: MovementRow = {
      date: created.slice(0, 10), ref: String(x.ticket_number ?? ''), concept: 'Venta',
      method: String(x.payment_method ?? ''), base: r2(base), vat: r2(vat), total: r2(base + vat),
    }
    ;(isCash ? cashMoves : noncashMoves).push(mv)
  }

  // Gastos (resumen) de supplier_orders — igual que A; no varía entre A y C.
  const expenses = (purch ?? []).reduce((s: number, x: Record<string, unknown>) => s + (Number(x.total) - Number(x.tax_amount || 0)), 0)
  const vatPaidSummary = (purch ?? []).reduce((s: number, x: Record<string, unknown>) => s + (Number(x.tax_amount) || 0), 0)
  const expMonthly: Record<string, number> = {}
  for (const x of (purch ?? []) as Record<string, unknown>[]) {
    const m = String(x.created_at).slice(0, 7)
    expMonthly[m] = (expMonthly[m] || 0) + (Number(x.total) - Number(x.tax_amount || 0))
  }
  // IVA soportado por trimestre (ap_supplier_invoices) — igual que A.
  const apQ = emptyQ()
  for (const x of (apInv ?? []) as Record<string, unknown>[]) {
    const q = Math.ceil(Number(String(x.invoice_date).slice(5, 7)) / 3)
    apQ[q].base += Number(x.amount) || 0
    apQ[q].vat += Number(x.tax_amount) || 0
    apQ[q].count += 1
  }

  return { cash, noncash, expenses, vatPaidSummary, expMonthly, apQ, cashMoves, noncashMoves }
}

function months(year: number, income: Record<string, number>, expenses: Record<string, number>): MonthPoint[] {
  const out: MonthPoint[] = []
  for (let m = 1; m <= 12; m++) {
    const key = `${year}-${String(m).padStart(2, '0')}`
    out.push({ month: key, income: r2(income[key] || 0), expenses: r2(expenses[key] || 0) })
  }
  return out
}
const mergeMonthly = (a: Record<string, number>, b: Record<string, number>) => {
  const out: Record<string, number> = { ...a }
  for (const k in b) out[k] = (out[k] || 0) + b[k]
  return out
}
const mergeQ = (a: QMap, b: QMap): QMap => {
  const out = emptyQ()
  for (let q = 1; q <= 4; q++) {
    out[q].base = a[q].base + b[q].base
    out[q].vat = a[q].vat + b[q].vat
    out[q].count = a[q].count + b[q].count
  }
  return out
}
const qPeriod = (year: number, q: number) => `${String((q - 1) * 3 + 1).padStart(2, '0')}/${year} – ${String(q * 3).padStart(2, '0')}/${year}`
function buildQuarters(year: number, salesQ: QMap, purchQ: QMap): QuarterRow[] {
  const out: QuarterRow[] = []
  for (let q = 1; q <= 4; q++) {
    const s = salesQ[q], p = purchQ[q]
    out.push({
      quarter: `T${q}`, period: qPeriod(year, q),
      baseSales: r2(s.base), ivaRepercutido: r2(s.vat),
      basePurchases: r2(p.base), ivaSoportado: r2(p.vat),
      resultado: r2(s.vat - p.vat), salesCount: s.count, purchasesCount: p.count,
    })
  }
  return out
}

// ===========================================================================
// CAPA B — contabilidad en efectivo (cobros 100% efectivo) + pagos de control
// ===========================================================================
export async function getViewB(year: number) {
  try {
    await assertScope('B')
    const c = await computeYear(year)
    const view: AccountingView = {
      income: r2(c.cash.income), expenses: 0, profit: r2(c.cash.income),
      ivaRepercutido: r2(c.cash.vat), ivaSoportado: 0, vatToPay: r2(c.cash.vat),
      monthly: months(year, c.cash.monthly, {}),
      quarters: buildQuarters(year, c.cash.quarters, emptyQ()),
      salesCount: c.cash.count,
    }
    const movements = c.cashMoves.sort((a, b) => b.date.localeCompare(a.date)).slice(0, 1000)
    // Los pagos de control viven en el ledger cifrado; si su lectura falla no debe
    // tumbar toda la contabilidad de B (las demás pestañas no dependen de ellos).
    let payments: CashPayment[] = []
    try { payments = await loadPayments(year) } catch { /* ledger no disponible */ }
    const paymentsTotal = r2(payments.reduce((s, p) => s + p.amount, 0))
    return ok({ view, movements, payments, paymentsTotal } as ViewB)
  } catch { return fail() }
}

// ===========================================================================
// CAPA C — escenario sin efectivo (A − cobros efectivo). NO se persiste.
// ===========================================================================
export async function getViewC(year: number) {
  try {
    await assertScope('C')
    const c = await computeYear(year)
    const totIncome = c.cash.income + c.noncash.income
    const totVat = c.cash.vat + c.noncash.vat
    const totCount = c.cash.count + c.noncash.count
    const A: AccountingView = {
      income: r2(totIncome), expenses: r2(c.expenses), profit: r2(totIncome - c.expenses),
      ivaRepercutido: r2(totVat), ivaSoportado: r2(c.vatPaidSummary), vatToPay: r2(totVat - c.vatPaidSummary),
      monthly: months(year, mergeMonthly(c.cash.monthly, c.noncash.monthly), c.expMonthly),
      quarters: buildQuarters(year, mergeQ(c.cash.quarters, c.noncash.quarters), c.apQ),
      salesCount: totCount,
    }
    const C: AccountingView = {
      income: r2(c.noncash.income), expenses: r2(c.expenses), profit: r2(c.noncash.income - c.expenses),
      ivaRepercutido: r2(c.noncash.vat), ivaSoportado: r2(c.vatPaidSummary), vatToPay: r2(c.noncash.vat - c.vatPaidSummary),
      monthly: months(year, c.noncash.monthly, c.expMonthly),
      quarters: buildQuarters(year, c.noncash.quarters, c.apQ),
      salesCount: c.noncash.count,
    }
    const movements = c.noncashMoves.sort((a, b) => b.date.localeCompare(a.date)).slice(0, 1000)

    // Facturas emitidas del año (documentos fiscales; se ven en C)
    const admin = createAdminClient()
    const { data: inv } = await admin.from('invoices')
      .select('invoice_number, client_name, invoice_date, total, status, payment_method')
      .eq('invoice_type', 'issued')
      .gte('invoice_date', `${year}-01-01`).lte('invoice_date', `${year}-12-31`)
      .not('status', 'in', '(draft,cancelled)')
      .order('invoice_date', { ascending: false })
    const invoices = ((inv ?? []) as Record<string, unknown>[]).map((x) => ({
      number: String(x.invoice_number ?? ''),
      client: String(x.client_name ?? ''),
      date: String(x.invoice_date ?? ''),
      total: Number(x.total) || 0,
      status: String(x.status ?? ''),
      method: String(x.payment_method ?? ''),
    }))

    return ok({ A, C, movements, invoices } as ViewC)
  } catch { return fail() }
}

// ---------------------------------------------------------------------------
// Pagos en efectivo de CONTROL (proveedor, nómina…). Cifrados. NO afectan a C.
// ---------------------------------------------------------------------------
async function loadPayments(year?: number): Promise<CashPayment[]> {
  const rows = await listEntries()
  const out: CashPayment[] = []
  for (const r of rows) {
    try {
      const p = open<CashPaymentPayload>(r.payload)
      if (year && !String(p.date).startsWith(String(year))) continue
      out.push({ ...p, id: r.id })
    } catch { /* clave incorrecta / fila ajena: omitir */ }
  }
  return out.sort((a, b) => b.date.localeCompare(a.date))
}

export async function addCashPayment(input: { date: string; concept: string; category: string; amount: number }) {
  try {
    await assertScope('B')
    const amount = r2(Number(input.amount) || 0)
    if (amount <= 0) return fail('Importe inválido')
    const base = r2(amount / 1.21)
    const payload: CashPaymentPayload = {
      date: input.date,
      concept: String(input.concept || '').slice(0, 200),
      category: input.category || 'otro',
      base, vat: r2(amount - base), amount,
    }
    await insertEntry(seal(payload))
    return ok(true)
  } catch { return fail() }
}

export async function removeCashPayment(id: string) {
  try {
    await assertScope('B')
    await deleteEntry(id)
    return ok(true)
  } catch { return fail() }
}

// ---------------------------------------------------------------------------
// Gestión de accesos (solo quien tiene capa B / canManage)
// ---------------------------------------------------------------------------
export async function listAccessGrants() {
  try { await assertCanManage(); return ok(await listAccess()) } catch { return fail() }
}

export async function searchUsers(query: string) {
  try {
    await assertCanManage()
    const q = String(query || '').trim()
    if (q.length < 2) return ok([] as { id: string; email: string; fullName: string }[])
    const admin = createAdminClient()
    const { data } = await admin.from('profiles')
      .select('id, email, full_name')
      .or(`email.ilike.%${q}%,full_name.ilike.%${q}%`)
      .limit(10)
    return ok((data ?? []).map((u: Record<string, unknown>) => ({ id: String(u.id), email: String(u.email), fullName: String(u.full_name ?? '') })))
  } catch { return fail() }
}

export async function grantUserScope(userId: string, scope: Scope) {
  try {
    const me: ViewerAccess = await assertCanManage()
    if (scope !== 'B' && scope !== 'C') return fail('Capa inválida')
    await grantAccess(userId, scope, me.userId!)
    return ok(true)
  } catch { return fail() }
}

export async function revokeUserScope(userId: string, scope: Scope) {
  try {
    await assertCanManage()
    await revokeAccess(userId, scope)
    return ok(true)
  } catch { return fail() }
}
