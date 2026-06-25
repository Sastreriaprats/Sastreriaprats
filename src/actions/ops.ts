'use server'

import { createAdminClient } from '@/lib/supabase/admin'
import { getViewerAccess, assertScope, assertCanManage, type ViewerAccess } from '@/lib/ops/access'
import { seal, open } from '@/lib/ops/crypto'
import {
  listEntries, insertEntry, deleteEntry,
  listAccess, grantAccess, revokeAccess, type Scope,
} from '@/lib/ops/db'
import type {
  CashEntryPayload, CashEntry, AccountingView, MonthPoint, QuarterRow, MovementRow, LedgerMovement, ViewB, ViewC,
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
      .select('id,ticket_number,total,total_returned,subtotal,tax_amount,created_at,payment_method,status')
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

async function readAllTailoringPayments(admin: ReturnType<typeof createAdminClient>, year: number) {
  const out: Record<string, unknown>[] = []
  for (let from = 0; ; from += 1000) {
    const { data } = await admin.from('tailoring_order_payments')
      .select('amount,payment_date,payment_method,tailoring_order:tailoring_orders(order_number,subtotal,total)')
      .gte('payment_date', `${year}-01-01`).lte('payment_date', `${year}-12-31`)
      .order('payment_date', { ascending: true })
      .range(from, from + 999)
    const b = (data ?? []) as Record<string, unknown>[]
    out.push(...b)
    if (b.length < 1000) break
  }
  return out
}

// Fracción de cada venta cobrada EN EFECTIVO (0..1), leyendo el desglose real
// de sale_payments. Necesario porque una venta mixta (efectivo + tarjeta) lleva
// payment_method = 'mixed' en `sales`: mirar solo ese campo dejaba fuera la parte
// en efectivo de las mixtas. Devuelve mapa sale_id → fracción efectivo.
async function readCashFractions(admin: ReturnType<typeof createAdminClient>, start: string, end: string) {
  const acc: Record<string, { cash: number; total: number }> = {}
  for (let from = 0; ; from += 1000) {
    const { data } = await admin.from('sale_payments')
      .select('sale_id, payment_method, amount, sales!inner(created_at, status)')
      .gte('sales.created_at', start).lte('sales.created_at', end)
      .in('sales.status', ['completed', 'partially_returned'])
      .order('sale_id', { ascending: true })
      .range(from, from + 999)
    const b = (data ?? []) as Record<string, unknown>[]
    for (const p of b) {
      const sid = String((p as any).sale_id)
      const amt = Number((p as any).amount) || 0
      const e = acc[sid] ?? { cash: 0, total: 0 }
      e.total += amt
      if ((p as any).payment_method === 'cash') e.cash += amt
      acc[sid] = e
    }
    if (b.length < 1000) break
  }
  const frac = new Map<string, number>()
  for (const sid in acc) {
    const e = acc[sid]
    frac.set(sid, e.total > 0 ? Math.min(1, Math.max(0, e.cash / e.total)) : 0)
  }
  return frac
}

async function computeYear(year: number) {
  const admin = createAdminClient()
  const start = `${year}-01-01`, end = `${year}-12-31T23:59:59`
  const sales = await readAllSales(admin, start, end)
  const cashFrac = await readCashFractions(admin, start, end)
  const tailoringPayments = await readAllTailoringPayments(admin, year)
  // Gastos / IVA soportado = FACTURAS RECIBIDAS (ap_supplier_invoices)
  const { data: apInv } = await admin.from('ap_supplier_invoices')
    .select('invoice_number, supplier_name, amount, tax_amount, invoice_date')
    .eq('is_proforma', false)
    .gte('invoice_date', `${year}-01-01`).lte('invoice_date', `${year}-12-31`)

  // Mapa venta -> nº de ticket oficial (CLP)
  const { data: clpRows } = await admin.from('cash_internal_tickets')
    .select('sale_id, ref').eq('source', 'sale').eq('year', year)
  const clpMap: Record<string, string> = {}
  for (const r of (clpRows ?? []) as Record<string, unknown>[]) {
    if (r.sale_id) clpMap[String(r.sale_id)] = String(r.ref)
  }

  const cash = emptyBucket(), noncash = emptyBucket()
  const cashMoves: MovementRow[] = []
  const incomeLedger: LedgerMovement[] = []

  const addIncome = (isCash: boolean, base: number, vat: number, month: string, q: number) => {
    const bk = isCash ? cash : noncash
    bk.income += base; bk.vat += vat; bk.count += 1
    bk.monthly[month] = (bk.monthly[month] || 0) + base
    bk.quarters[q].base += base; bk.quarters[q].vat += vat; bk.quarters[q].count += 1
  }

  // Ingresos por TICKETS. Cada venta se reparte entre efectivo (capa B) y
  // no-efectivo (capa C) según la fracción REAL cobrada en efectivo
  // (sale_payments). Una venta mixta aporta su parte de efectivo a B y el resto
  // a C, de modo que A = B + C sigue cuadrando exactamente.
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
    const sid = String(x.id)
    // Fracción de efectivo: del desglose sale_payments; si no hay desglose,
    // fallback al método de cabecera (cash → 1, resto → 0).
    const fr = cashFrac.has(sid) ? cashFrac.get(sid)! : (x.payment_method === 'cash' ? 1 : 0)
    const cashBase = base * fr, cashVat = vat * fr
    const ncBase = base - cashBase, ncVat = vat - cashVat
    const ref = clpMap[sid] ?? String(x.ticket_number ?? '')
    if (cashBase > 0.0001) {
      addIncome(true, cashBase, cashVat, month, q)
      cashMoves.push({ saleId: sid, date: created.slice(0, 10), ref, concept: 'Venta', method: fr >= 0.9999 ? 'efectivo' : 'efectivo (parte de mixto)', base: r2(cashBase), vat: r2(cashVat), total: r2(cashBase + cashVat) })
    }
    if (ncBase > 0.0001) {
      addIncome(false, ncBase, ncVat, month, q)
      incomeLedger.push({ date: created.slice(0, 10), type: 'Ticket', concept: `Ticket ${ref}`, base: r2(ncBase), vat: r2(ncVat), total: r2(ncBase + ncVat), saleId: sid })
    }
  }

  // Ingresos por COBROS DE SASTRERÍA (backoffice). amount bruto → base/IVA
  // prorrateando subtotal/total del pedido. Se reparten cash/noncash por
  // payment_method, igual que los tickets: efectivo → capa B; resto → C.
  for (const p of tailoringPayments) {
    const amount = Number((p as any).amount) || 0
    const order = ((p as any).tailoring_order as Record<string, unknown>) || {}
    const oTotal = Number((order as any).total) || 0
    const oSub = Number((order as any).subtotal) || 0
    const ratio = oTotal > 0 ? oSub / oTotal : 1
    const base = amount * ratio
    const vat = amount - base
    const d = String((p as any).payment_date ?? '')
    const month = d.slice(0, 7)
    const q = Math.ceil(Number(d.slice(5, 7)) / 3)
    const isCash = (p as any).payment_method === 'cash'
    addIncome(isCash, base, vat, month, q)
    const num = String((order as any).order_number ?? '')
    const concept = num ? `Sastrería ${num}` : 'Cobro sastrería'
    if (isCash) {
      cashMoves.push({ date: d.slice(0, 10), ref: num, concept, method: String((p as any).payment_method ?? ''), base: r2(base), vat: r2(vat), total: r2(base + vat) })
    } else {
      incomeLedger.push({ date: d.slice(0, 10), type: 'Sastrería', concept, base: r2(base), vat: r2(vat), total: r2(base + vat) })
    }
  }

  // Ingresos por FACTURAS emitidas NO asociadas a un ticket (sale_id null).
  // Excluimos las ligadas a un pedido de sastrería (tailoring_order_id): ese
  // cobro ya se cuenta arriba vía tailoring_order_payments → evita doble conteo.
  const { data: stInv } = await admin.from('invoices')
    .select('invoice_number, subtotal, tax_amount, total, payment_method, invoice_date')
    .eq('invoice_type', 'issued')
    .is('sale_id', null)
    .is('tailoring_order_id', null)
    .not('status', 'in', '(draft,cancelled)')
    .gte('invoice_date', `${year}-01-01`).lte('invoice_date', `${year}-12-31`)
  for (const x of (stInv ?? []) as Record<string, unknown>[]) {
    const total = Number(x.total) || 0
    const tax = Number(x.tax_amount) || 0
    const base = Number(x.subtotal) || (total - tax)
    const d = String(x.invoice_date)
    const month = d.slice(0, 7)
    const q = Math.ceil(Number(d.slice(5, 7)) / 3)
    const isCash = x.payment_method === 'cash'
    addIncome(isCash, base, tax, month, q)
    const num = String(x.invoice_number ?? '')
    if (isCash) {
      cashMoves.push({ date: d.slice(0, 10), ref: num, concept: `Factura ${num}`, method: String(x.payment_method ?? ''), base: r2(base), vat: r2(tax), total: r2(base + tax) })
    } else {
      incomeLedger.push({ date: d.slice(0, 10), type: 'Factura', concept: `Factura ${num}`, base: r2(base), vat: r2(tax), total: r2(base + tax) })
    }
  }

  // Gastos = base de facturas recibidas; IVA soportado = su IVA; + ledger de gasto.
  const expenseLedger: LedgerMovement[] = []
  let expenses = 0, vatPaidSummary = 0
  const expMonthly: Record<string, number> = {}
  const apQ = emptyQ()
  for (const x of (apInv ?? []) as Record<string, unknown>[]) {
    const base = Number(x.amount) || 0
    const vat = Number(x.tax_amount) || 0
    const d = String(x.invoice_date)
    const m = d.slice(0, 7)
    const q = Math.ceil(Number(d.slice(5, 7)) / 3)
    expenses += base
    vatPaidSummary += vat
    expMonthly[m] = (expMonthly[m] || 0) + base
    apQ[q].base += base; apQ[q].vat += vat; apQ[q].count += 1
    expenseLedger.push({
      date: d.slice(0, 10), type: 'Factura recibida',
      concept: `${String(x.supplier_name ?? '')} ${String(x.invoice_number ?? '')}`.trim() || 'Factura recibida',
      base: r2(base), vat: r2(vat), total: r2(-(base + vat)),
    })
  }

  return { cash, noncash, expenses, vatPaidSummary, expMonthly, apQ, cashMoves, incomeLedger, expenseLedger }
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
    // Movimientos manuales (cifrados); si su lectura falla no debe tumbar B.
    let entries: CashEntry[] = []
    try { entries = await loadEntries(year) } catch { /* ledger no disponible */ }
    const ein = entries.filter((e) => e.direction === 'in')
    const eout = entries.filter((e) => e.direction === 'out')
    const sum = (arr: CashEntry[], k: 'base' | 'vat' | 'amount') => r2(arr.reduce((s, e) => s + e[k], 0))
    const manual = {
      inBase: sum(ein, 'base'), inVat: sum(ein, 'vat'), inTotal: sum(ein, 'amount'),
      outBase: sum(eout, 'base'), outVat: sum(eout, 'vat'), outTotal: sum(eout, 'amount'),
    }
    // Cobros en efectivo = tickets 100% efectivo + cobros manuales
    const manualCobros: MovementRow[] = ein.map((e) => ({
      date: e.date, ref: 'Manual', concept: e.concept || e.category, method: 'efectivo manual',
      base: e.base, vat: e.vat, total: e.amount,
    }))
    const movements = [...c.cashMoves, ...manualCobros].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 1000)
    return ok({ view, movements, entries, manual } as ViewB)
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
    const admin = createAdminClient()

    // Ledger COMPRENSIVO: ingresos (tickets + facturas emitidas sin ticket) + gastos (facturas recibidas)
    const ledger: LedgerMovement[] = [...c.incomeLedger, ...c.expenseLedger].sort((a, b) => b.date.localeCompare(a.date))

    // Facturas emitidas del año (documentos fiscales; se ven en C)
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

    return ok({ A, C, ledger: ledger.slice(0, 2000), invoices } as ViewC)
  } catch { return fail() }
}

// ---------------------------------------------------------------------------
// Datos de un ticket para descargar su PDF (gateado por cualquier capa).
// ---------------------------------------------------------------------------
export async function getTicketData(saleId: string) {
  try {
    const a = await getViewerAccess()
    if (a.scopes.length === 0) return fail()
    const admin = createAdminClient()
    const { data: sale } = await admin.from('sales')
      .select('ticket_number, created_at, client_id, subtotal, discount_amount, discount_percentage, tax_amount, total, payment_method, is_tax_free')
      .eq('id', saleId).single()
    if (!sale) return fail()
    const s = sale as Record<string, unknown>
    const { data: clp } = await admin.from('cash_internal_tickets')
      .select('ref').eq('sale_id', saleId).eq('source', 'sale').limit(1)
    const { data: lines } = await admin.from('sale_lines')
      .select('description, quantity, unit_price, discount_percentage, line_total, tax_rate, sku')
      .eq('sale_id', saleId)
    const { data: payments } = await admin.from('sale_payments')
      .select('payment_method, amount').eq('sale_id', saleId)
    let clientName: string | null = null
    if (s.client_id) {
      const { data: cl } = await admin.from('clients').select('full_name').eq('id', s.client_id).single()
      clientName = ((cl as Record<string, unknown> | null)?.full_name as string) ?? null
    }
    const ref = (clp?.[0] as Record<string, unknown> | undefined)?.ref ?? null
    return ok({
      sale: { ...s, internal_ref: ref },
      lines: lines ?? [],
      payments: payments ?? [],
      clientName,
    })
  } catch { return fail() }
}

// ---------------------------------------------------------------------------
// Pagos en efectivo de CONTROL (proveedor, nómina…). Cifrados. NO afectan a C.
// ---------------------------------------------------------------------------
async function loadEntries(year?: number): Promise<CashEntry[]> {
  const rows = await listEntries()
  const out: CashEntry[] = []
  for (const r of rows) {
    try {
      const p = open<Partial<CashEntryPayload>>(r.payload)
      if (year && !String(p.date).startsWith(String(year))) continue
      const base = Number(p.base) || 0
      const vat = Number(p.vat) || 0
      out.push({
        date: String(p.date ?? ''),
        concept: String(p.concept ?? ''),
        category: String(p.category ?? 'otro'),
        direction: p.direction === 'in' ? 'in' : 'out',
        ivaRate: Number(p.ivaRate) || (base > 0 ? Math.round((vat / base) * 100) : 0),
        base, vat, amount: Number(p.amount) || r2(base + vat),
        id: r.id,
      })
    } catch { /* clave incorrecta / fila ajena: omitir */ }
  }
  return out.sort((a, b) => b.date.localeCompare(a.date))
}

const ALLOWED_IVA = [0, 10, 18, 21]

export async function addCashEntry(input: {
  date: string; concept: string; category: string; direction: 'in' | 'out'; base: number; ivaRate: number
}) {
  try {
    await assertScope('B')
    const base = r2(Number(input.base) || 0)
    if (base <= 0) return fail('Importe inválido')
    const ivaRate = ALLOWED_IVA.includes(Number(input.ivaRate)) ? Number(input.ivaRate) : 0
    const vat = r2(base * ivaRate / 100)
    const payload: CashEntryPayload = {
      date: input.date,
      concept: String(input.concept || '').slice(0, 200),
      category: input.category || 'otro',
      direction: input.direction === 'in' ? 'in' : 'out',
      ivaRate, base, vat, amount: r2(base + vat),
    }
    await insertEntry(seal(payload))
    return ok(true)
  } catch { return fail() }
}

export async function removeCashEntry(id: string) {
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
