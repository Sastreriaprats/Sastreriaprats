'use server'

import { createAdminClient } from '@/lib/supabase/admin'
import { loadPedidoCobroBaseBySale } from '@/lib/accounting/pedido-cobro-lines'
import { getViewerAccess, assertScope, assertCanManage, type ViewerAccess } from '@/lib/ops/access'
import { seal, open, dedupTag } from '@/lib/ops/crypto'
import {
  listEntries, insertEntry, deleteEntry,
  listDeposits, listDepositTags, insertDeposit, deleteDeposit,
  listAccess, grantAccess, revokeAccess, type Scope,
} from '@/lib/ops/db'
import type {
  CashEntryPayload, CashEntry, AccountingView, MonthPoint, QuarterRow, MovementRow, LedgerMovement, ViewB, ViewC,
  MovementKind, DepositPayload, DepositItemPayload, DepositRow, ApInvoiceLite, VatRateRow,
} from '@/lib/ops/types'

const r2 = (n: number) => Math.round(n * 100) / 100
const ok = <T,>(data: T) => ({ ok: true as const, data })
const fail = (msg = 'No encontrado') => ({ ok: false as const, error: msg })

// ---------------------------------------------------------------------------
// Acceso del viewer (seguro de exponer: [] si no autorizado). Para el menú/UI.
// ---------------------------------------------------------------------------
export async function getMyAccess(): Promise<{ scopes: Scope[]; canManage: boolean; userId: string | null }> {
  const a = await getViewerAccess()
  return { scopes: a.scopes, canManage: a.canManage, userId: a.userId }
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
      .select('id,ticket_number,total,total_returned,subtotal,tax_amount,created_at,payment_method,status,client:clients(full_name)')
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
      .select('id,amount,payment_date,payment_method,tailoring_order:tailoring_orders(id,order_number,subtotal,total,client:clients(full_name))')
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

// Etiqueta HMAC estable de un cobro (misma que aux.deposit_items.dedup_tag).
const depositKey = (kind: MovementKind, id: string) => dedupTag(`${kind}:${id}`).toString('base64')

// Prefijos de NIF-IVA intracomunitario (países UE + XI Irlanda del Norte + EU
// del régimen OSS de no establecidos). ES fuera: esas son nacionales. GB no es
// UE desde el Brexit → va con el resto (importación, no intracomunitaria).
const EU_VAT_PREFIXES = new Set([
  'AT', 'BE', 'BG', 'CY', 'CZ', 'DE', 'DK', 'EE', 'EL', 'FI', 'FR', 'HR', 'HU',
  'IE', 'IT', 'LT', 'LU', 'LV', 'MT', 'NL', 'PL', 'PT', 'RO', 'SE', 'SI', 'SK', 'XI', 'EU',
])
const isIntraEUCif = (cif: unknown) => {
  const c = String(cif ?? '').trim().toUpperCase()
  return /^[A-Z]{2}/.test(c) && EU_VAT_PREFIXES.has(c.slice(0, 2))
}

// Líneas (base + tipo de IVA) de las facturas recibidas del año, para el
// desglose del IVA soportado por tipo impositivo.
async function readApInvoiceLines(admin: ReturnType<typeof createAdminClient>, year: number) {
  const out: Record<string, unknown>[] = []
  for (let from = 0; ; from += 1000) {
    const { data } = await admin.from('ap_supplier_invoice_lines')
      .select('supplier_invoice_id, base, tax_rate, tax_amount, ap_supplier_invoices!inner(invoice_date, is_proforma)')
      .eq('ap_supplier_invoices.is_proforma', false)
      .gte('ap_supplier_invoices.invoice_date', `${year}-01-01`)
      .lte('ap_supplier_invoices.invoice_date', `${year}-12-31`)
      .order('id', { ascending: true })
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
  // Lecturas independientes en paralelo. `deposited` = cobros ya ingresados al
  // banco: salen de B y pasan a C (A = B + C se mantiene). Si esa lectura falla,
  // computeYear falla entero: mejor sin datos que contar doble en B.
  const [sales, cashFrac, tailoringPayments, cobroBaseBySale, deposited, { data: apInv }, apLines, { data: clpRows }, { data: stInv }] = await Promise.all([
    readAllSales(admin, start, end),
    readCashFractions(admin, start, end),
    readAllTailoringPayments(admin, year),
    // Base de cobros de pedido embebidos en tickets: se resta al ticket para no
    // duplicar el total (el pedido ya la cuenta en el bucle de sastrería).
    loadPedidoCobroBaseBySale(admin, start, end),
    listDepositTags(),
    // Gastos / IVA soportado = FACTURAS RECIBIDAS (ap_supplier_invoices)
    admin.from('ap_supplier_invoices')
      .select('id, invoice_number, supplier_name, supplier_cif, amount, tax_amount, retention_rate, retention_amount, invoice_date, attachment_url')
      .eq('is_proforma', false)
      .gte('invoice_date', `${year}-01-01`).lte('invoice_date', `${year}-12-31`),
    readApInvoiceLines(admin, year),
    // Mapa venta -> nº de ticket oficial (CLP)
    admin.from('cash_internal_tickets')
      .select('sale_id, ref').eq('source', 'sale').eq('year', year),
    // Facturas emitidas NO asociadas a ticket, pedido NI reserva (se suman más
    // abajo). El filtro reservation_id replica el del Resumen de la capa A
    // (accounting.ts): sin él, una factura emitida desde reserva contaba en el
    // escenario y no en A → B+C dejaba de cuadrar con A.
    admin.from('invoices')
      .select('id, invoice_number, client_name, subtotal, tax_amount, total, payment_method, invoice_date, pdf_url')
      .eq('invoice_type', 'issued')
      .is('sale_id', null)
      .is('tailoring_order_id', null)
      .is('reservation_id', null)
      .not('status', 'in', '(draft,cancelled)')
      .gte('invoice_date', `${year}-01-01`).lte('invoice_date', `${year}-12-31`),
  ])
  const clpMap: Record<string, string> = {}
  for (const r of (clpRows ?? []) as Record<string, unknown>[]) {
    if (r.sale_id) clpMap[String(r.sale_id)] = String(r.ref)
  }

  const cash = emptyBucket(), noncash = emptyBucket()
  const cashMoves: MovementRow[] = []
  const incomeLedger: LedgerMovement[] = []
  let depositedYearTotal = 0, depositedYearCount = 0
  // Cobros 100% en efectivo SIN ingresar al banco: sus documentos (facturas
  // ligadas) NO pueden figurar en el escenario C. Solo se excluye lo que se
  // sabe seguro que es efectivo puro; lo mixto/desconocido se queda en C.
  const cashOnlySaleIds = new Set<string>()
  const ordersSeen = new Set<string>()      // pedidos con algún cobro este año
  const ordersWithC = new Set<string>()     // pedidos con algún cobro que pertenece a C
  const cashOnlyInvoiceIds = new Set<string>()

  // ¿Está este cobro en efectivo ya ingresado al banco? Si sí, lo acumula como
  // depositado (pasa a C). El guard de size evita HMACs cuando no hay depósitos.
  const takeDeposited = (kind: MovementKind, id: string, amount: number) => {
    if (deposited.size === 0 || !deposited.has(depositKey(kind, id))) return false
    depositedYearTotal += amount
    depositedYearCount += 1
    return true
  }

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
    // Resta la base de líneas que son cobro de un pedido de sastrería: ese dinero
    // se cuenta como ingreso por el lado del pedido (bucle de abajo). Solo queda
    // la parte de boutique. El IVA no se toca (esas líneas van al 0%).
    const cobroPedido = cobroBaseBySale.get(String(x.id)) || 0
    const base = Math.max(0, (subtotal || total) - cobroPedido) * prop
    const vat = tax * prop
    const created = String(x.created_at)
    const month = created.slice(0, 7)
    const q = Math.ceil(Number(created.slice(5, 7)) / 3)
    const sid = String(x.id)
    const client = String(((x.client as Record<string, unknown> | null)?.full_name as string) ?? '') || undefined
    // Fracción de efectivo: del desglose sale_payments; si no hay desglose,
    // fallback al método de cabecera (cash → 1, resto → 0).
    let fr = cashFrac.has(sid) ? cashFrac.get(sid)! : (x.payment_method === 'cash' ? 1 : 0)
    const wasMixed = fr < 0.9999
    // Si la parte en efectivo ya está ingresada al banco, cuenta como no-efectivo
    // (pasa al escenario C con su fecha original).
    if (fr > 0 && takeDeposited('sale', sid, (base + vat) * fr)) fr = 0
    const cashBase = base * fr, cashVat = vat * fr
    const ncBase = base - cashBase, ncVat = vat - cashVat
    const ref = clpMap[sid] ?? String(x.ticket_number ?? '')
    if (cashBase > 0.0001) {
      addIncome(true, cashBase, cashVat, month, q)
      cashMoves.push({ kind: 'sale', saleId: sid, date: created.slice(0, 10), ref, concept: 'Venta', method: wasMixed ? 'efectivo (parte de mixto)' : 'efectivo', client, base: r2(cashBase), vat: r2(cashVat), total: r2(cashBase + cashVat) })
    }
    if (ncBase > 0.0001) {
      addIncome(false, ncBase, ncVat, month, q)
      incomeLedger.push({ date: created.slice(0, 10), type: 'Ticket', concept: `Ticket ${ref}`, client, base: r2(ncBase), vat: r2(ncVat), total: r2(ncBase + ncVat), saleId: sid })
    } else if (cashBase > 0.0001) {
      cashOnlySaleIds.add(sid)
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
    const pid = String((p as any).id ?? '')
    const client = String((((order as any).client as Record<string, unknown> | null)?.full_name as string) ?? '') || undefined
    let isCash = (p as any).payment_method === 'cash'
    // Cobro en efectivo ya ingresado al banco → pasa al escenario C.
    if (isCash && takeDeposited('order_payment', pid, amount)) isCash = false
    addIncome(isCash, base, vat, month, q)
    const num = String((order as any).order_number ?? '')
    const concept = num ? `Sastrería ${num}` : 'Cobro sastrería'
    const orderId = String((order as any).id ?? '') || undefined
    if (orderId) {
      ordersSeen.add(orderId)
      if (!isCash) ordersWithC.add(orderId)
    }
    if (isCash) {
      cashMoves.push({ kind: 'order_payment', paymentId: pid, orderId, date: d.slice(0, 10), ref: num, concept, method: 'efectivo', client, base: r2(base), vat: r2(vat), total: r2(base + vat) })
    } else {
      incomeLedger.push({ date: d.slice(0, 10), type: 'Sastrería', concept, client, base: r2(base), vat: r2(vat), total: r2(base + vat), orderId })
    }
  }

  // Ingresos por FACTURAS emitidas NO asociadas a un ticket (sale_id null).
  // Excluimos las ligadas a un pedido de sastrería (tailoring_order_id): ese
  // cobro ya se cuenta arriba vía tailoring_order_payments → evita doble conteo.
  for (const x of (stInv ?? []) as Record<string, unknown>[]) {
    const total = Number(x.total) || 0
    const tax = Number(x.tax_amount) || 0
    const base = Number(x.subtotal) || (total - tax)
    const d = String(x.invoice_date)
    const month = d.slice(0, 7)
    const q = Math.ceil(Number(d.slice(5, 7)) / 3)
    const iid = String(x.id ?? '')
    const client = String(x.client_name ?? '') || undefined
    const pdfUrl = String(x.pdf_url ?? '') || undefined
    let isCash = x.payment_method === 'cash'
    // Factura cobrada en efectivo ya ingresada al banco → escenario C.
    if (isCash && takeDeposited('invoice', iid, base + tax)) isCash = false
    addIncome(isCash, base, tax, month, q)
    const num = String(x.invoice_number ?? '')
    if (isCash) {
      cashOnlyInvoiceIds.add(iid)
      cashMoves.push({ kind: 'invoice', invoiceId: iid, pdfUrl, date: d.slice(0, 10), ref: num, concept: `Factura ${num}`, method: 'efectivo', client, base: r2(base), vat: r2(tax), total: r2(base + tax) })
    } else {
      incomeLedger.push({ date: d.slice(0, 10), type: 'Factura', concept: `Factura ${num}`, client, base: r2(base), vat: r2(tax), total: r2(base + tax), pdfUrl })
    }
  }

  // Gastos = base de facturas recibidas; IVA soportado = su IVA; + ledger de gasto.
  const expenseLedger: LedgerMovement[] = []
  const apInvoices: ApInvoiceLite[] = []
  let expenses = 0, vatPaidSummary = 0
  const expMonthly: Record<string, number> = {}
  const apQ = emptyQ()

  // Desglose del IVA soportado por tipo impositivo. Las facturas CON líneas
  // aportan base y tipo reales por línea; las de solo cabecera derivan el tipo
  // de vat/base aproximándolo al tipo español más cercano (0/4/10/21).
  const rateAgg: Record<number, { base: number[]; vat: number[] }> = {}
  const addRate = (rate: number, q: number, base: number, vat: number) => {
    const r = (rateAgg[rate] ??= { base: [0, 0, 0, 0], vat: [0, 0, 0, 0] })
    r.base[q - 1] += base
    r.vat[q - 1] += vat
  }
  // Tipos de IVA presentes en cada factura con líneas (para mostrar el tipo del
  // documento en el listado: un único tipo → ese; varios → null = "varios").
  const ratesByInvoice = new Map<string, Set<number>>()
  for (const l of apLines) {
    const inv = l.ap_supplier_invoices as Record<string, unknown> | null
    const d = String(inv?.invoice_date ?? '')
    const q = Math.ceil(Number(d.slice(5, 7)) / 3)
    if (q >= 1 && q <= 4) addRate(Number(l.tax_rate) || 0, q, Number(l.base) || 0, Number(l.tax_amount) || 0)
    const iid = String(l.supplier_invoice_id)
    if (!ratesByInvoice.has(iid)) ratesByInvoice.set(iid, new Set())
    ratesByInvoice.get(iid)!.add(Number(l.tax_rate) || 0)
  }

  for (const x of (apInv ?? []) as Record<string, unknown>[]) {
    const base = Number(x.amount) || 0
    const vat = Number(x.tax_amount) || 0
    const retRate = Number(x.retention_rate) || 0
    const ret = Number(x.retention_amount) || 0
    const d = String(x.invoice_date)
    const m = d.slice(0, 7)
    const q = Math.ceil(Number(d.slice(5, 7)) / 3)
    expenses += base
    vatPaidSummary += vat
    expMonthly[m] = (expMonthly[m] || 0) + base
    apQ[q].base += base; apQ[q].vat += vat; apQ[q].count += 1
    // Tipo de IVA del documento: de sus líneas si las tiene (varios → null);
    // sin líneas, el tipo español más cercano al cociente IVA/base.
    const derivedRate = (() => {
      const raw = base !== 0 ? (vat / base) * 100 : 0
      return [0, 4, 10, 21].reduce((best, r) => (Math.abs(r - raw) < Math.abs(best - raw) ? r : best), 0)
    })()
    let vatRate: number | null = derivedRate
    const lineRates = ratesByInvoice.get(String(x.id))
    if (lineRates) vatRate = lineRates.size === 1 ? [...lineRates][0] : null
    else addRate(derivedRate, q, base, vat)
    const supplier = String(x.supplier_name ?? '')
    const num = String(x.invoice_number ?? '')
    const cif = String(x.supplier_cif ?? '').trim() || undefined
    const attachment = typeof x.attachment_url === 'string' && x.attachment_url.trim() ? x.attachment_url.trim() : undefined
    // Total del DOCUMENTO: la retención se resta del pago al proveedor
    // (se ingresa a Hacienda por el 111/115), no cambia base ni IVA.
    const docTotal = base + vat - ret
    expenseLedger.push({
      date: d.slice(0, 10), type: 'Factura recibida',
      concept: `${supplier} ${num}`.trim() || 'Factura recibida',
      client: supplier || undefined,
      base: r2(base), vat: r2(vat), total: r2(-docTotal),
      apPath: attachment,
    })
    apInvoices.push({
      number: num, supplier, cif, date: d.slice(0, 10), base: r2(base), vat: r2(vat), vatRate,
      retentionRate: r2(retRate), retentionAmount: r2(ret), total: r2(docTotal),
      isIntraEU: isIntraEUCif(cif), attachmentPath: attachment,
    })
  }

  const vatByRate: VatRateRow[] = Object.entries(rateAgg)
    .map(([rate, v]) => ({
      rate: Number(rate),
      byQuarter: v.base.map((b, i) => ({ base: r2(b), vat: r2(v.vat[i]) })),
      base: r2(v.base.reduce((s, n) => s + n, 0)),
      vat: r2(v.vat.reduce((s, n) => s + n, 0)),
    }))
    .sort((a, b) => b.rate - a.rate)

  return {
    cash, noncash, expenses, vatPaidSummary, expMonthly, apQ, cashMoves, incomeLedger, expenseLedger, apInvoices,
    vatByRate, depositedYearTotal, depositedYearCount,
    cashOnlySaleIds, ordersSeen, ordersWithC, cashOnlyInvoiceIds,
  }
}

function months(year: number, income: Record<string, number>, expenses: Record<string, number>): MonthPoint[] {
  const out: MonthPoint[] = []
  for (let m = 1; m <= 12; m++) {
    const key = `${year}-${String(m).padStart(2, '0')}`
    out.push({ month: key, income: r2(income[key] || 0), expenses: r2(expenses[key] || 0) })
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
    // El cálculo del año y los dos ledgers cifrados son independientes; si un
    // ledger falla no debe tumbar B (degrada a lista vacía).
    const [c, entries, deposits] = await Promise.all([
      computeYear(year),
      loadEntries(year).catch(() => [] as CashEntry[]),
      loadDeposits().catch(() => [] as DepositRow[]),
    ])
    const view: AccountingView = {
      income: r2(c.cash.income), expenses: 0, profit: r2(c.cash.income),
      ivaRepercutido: r2(c.cash.vat), ivaSoportado: 0, vatToPay: r2(c.cash.vat),
      monthly: months(year, c.cash.monthly, {}),
      quarters: buildQuarters(year, c.cash.quarters, emptyQ()),
      salesCount: c.cash.count,
    }
    const ein = entries.filter((e) => e.direction === 'in')
    const eout = entries.filter((e) => e.direction === 'out')
    const sum = (arr: CashEntry[], k: 'base' | 'vat' | 'amount') => r2(arr.reduce((s, e) => s + e[k], 0))
    const manual = {
      inBase: sum(ein, 'base'), inVat: sum(ein, 'vat'), inTotal: sum(ein, 'amount'),
      outBase: sum(eout, 'base'), outVat: sum(eout, 'vat'), outTotal: sum(eout, 'amount'),
    }
    // Cobros en efectivo = tickets 100% efectivo + cobros manuales
    const manualCobros: MovementRow[] = ein.map((e) => ({
      kind: 'manual' as const,
      date: e.date, ref: 'Manual', concept: e.concept || e.category, method: 'efectivo manual',
      base: e.base, vat: e.vat, total: e.amount,
    }))
    const movements = [...c.cashMoves, ...manualCobros].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 5000)
    return ok({
      view, movements, entries, manual, deposits,
      depositedTotal: r2(c.depositedYearTotal), depositedCount: c.depositedYearCount,
    } as ViewB)
  } catch { return fail() }
}

// Descifra y agrega los depósitos bancarios (más recientes primero).
async function loadDeposits(): Promise<DepositRow[]> {
  const rows = await listDeposits()
  const out: DepositRow[] = []
  for (const r of rows) {
    try {
      const p = open<DepositPayload>(r.payload)
      const items: DepositRow['items'] = []
      for (const i of r.items) {
        try { items.push({ ...open<DepositItemPayload>(i.payload), id: i.id }) } catch { /* fila ajena */ }
      }
      out.push({
        id: r.id, createdAt: r.createdAt,
        date: String(p.date ?? ''), note: String(p.note ?? ''),
        total: r2(items.reduce((s, i) => s + (Number(i.amount) || 0), 0)),
        items,
      })
    } catch { /* clave incorrecta / fila ajena: omitir */ }
  }
  return out.sort((a, b) => b.date.localeCompare(a.date))
}

// ===========================================================================
// CAPA C — escenario sin efectivo (A − cobros efectivo). NO se persiste.
// ===========================================================================
export async function getViewC(year: number) {
  try {
    await assertScope('C')
    const c = await computeYear(year)
    // La capa A no se calcula ni se devuelve: este panel lo ve el asesor externo
    // y la respuesta no debe contener la contabilidad íntegra.
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
      .select('id, invoice_number, client_name, client_nif, invoice_date, subtotal, tax_amount, total, status, payment_method, sale_id, tailoring_order_id, pdf_url')
      .eq('invoice_type', 'issued')
      .gte('invoice_date', `${year}-01-01`).lte('invoice_date', `${year}-12-31`)
      .not('status', 'in', '(draft,cancelled)')
      .order('invoice_date', { ascending: false })
    // En C NO puede figurar nada cobrado en efectivo: fuera las facturas cuyo
    // cobro es 100% efectivo sin ingresar al banco (venta efectiva, pedido con
    // todos los cobros en efectivo, o factura suelta cobrada en efectivo). Lo
    // mixto se queda (su parte no-efectivo pertenece a C) y lo desconocido
    // (p.ej. cobros de otro año) también, por prudencia.
    const isCashOnly = (x: Record<string, unknown>) => {
      if (x.sale_id) return c.cashOnlySaleIds.has(String(x.sale_id))
      if (x.tailoring_order_id) {
        const oid = String(x.tailoring_order_id)
        return c.ordersSeen.has(oid) && !c.ordersWithC.has(oid)
      }
      return c.cashOnlyInvoiceIds.has(String(x.id))
    }
    // El método de pago tampoco puede delatar efectivo: se vacía si lo menciona.
    const cleanMethod = (m: unknown) => {
      const s = String(m ?? '')
      return /cash|efectivo|mixed|mixto/i.test(s) ? '' : s
    }
    const invoices = ((inv ?? []) as Record<string, unknown>[])
      .filter((x) => !isCashOnly(x))
      .map((x) => {
        const total = Number(x.total) || 0
        const vat = Number(x.tax_amount) || 0
        return {
          number: String(x.invoice_number ?? ''),
          client: String(x.client_name ?? ''),
          nif: String(x.client_nif ?? '').trim() || undefined,
          date: String(x.invoice_date ?? ''),
          base: r2(Number(x.subtotal) || (total - vat)),
          vat: r2(vat),
          total,
          status: String(x.status ?? ''),
          method: cleanMethod(x.payment_method),
          saleId: x.sale_id ? String(x.sale_id) : undefined,
          orderId: x.tailoring_order_id ? String(x.tailoring_order_id) : undefined,
          pdfUrl: x.pdf_url ? String(x.pdf_url) : undefined,
        }
      })

    return ok({ C, ledger: ledger.slice(0, 5000), invoices, apInvoices: c.apInvoices, vatByRate: c.vatByRate } as ViewC)
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
// Datos de un pedido de sastrería para descargar su ticket en PDF.
// ---------------------------------------------------------------------------
export async function getOrderTicketData(orderId: string) {
  try {
    const a = await getViewerAccess()
    if (a.scopes.length === 0) return fail()
    const admin = createAdminClient()
    const { data: order } = await admin.from('tailoring_orders')
      .select('order_number, total, total_paid, total_pending, discount_amount, discount_percentage, created_at, store_id, stores(name), clients(full_name, client_code), tailoring_order_lines(unit_price, line_total, quantity, configuration, garment_types(name))')
      .eq('id', orderId).single()
    if (!order) return fail()
    return ok(order as Record<string, unknown>)
  } catch { return fail() }
}

// ---------------------------------------------------------------------------
// PDF adjunto de una factura recibida de proveedor (bucket privado
// supplier-invoices): signed URL al vuelo, gateado por cualquier capa.
// ---------------------------------------------------------------------------
export async function getApInvoicePdfUrl(attachmentPath: string) {
  try {
    const a = await getViewerAccess()
    if (a.scopes.length === 0) return fail()
    // Retrocompat: filas legacy guardaron la URL pública completa en vez del path.
    let path = attachmentPath
    const publicMarker = '/storage/v1/object/public/supplier-invoices/'
    if (path.includes(publicMarker)) path = path.split(publicMarker)[1]
    if (!path) return fail()
    const admin = createAdminClient()
    const { data, error } = await admin.storage.from('supplier-invoices').createSignedUrl(path, 3600)
    if (error || !data?.signedUrl) return fail('No se pudo abrir el archivo')
    return ok({ url: data.signedUrl })
  } catch { return fail() }
}

// ---------------------------------------------------------------------------
// INGRESOS DE EFECTIVO AL BANCO. Mueven cobros concretos de la capa B al
// escenario C (con su fecha original), manteniendo A = B + C. El importe de
// cada cobro lo fija el SERVIDOR recalculando el año (el cliente solo envía ids).
// ---------------------------------------------------------------------------
export async function createBankDeposit(input: {
  year: number
  date: string
  note: string
  items: { kind: MovementKind; id: string }[]
}) {
  try {
    await assertScope('B')
    const me = await getViewerAccess()
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(input.date))) return fail('Fecha inválida')
    const items = (input.items ?? []).filter((i) => i && i.id && i.kind !== 'manual')
    if (items.length === 0) return fail('Selecciona al menos un cobro')
    if (items.length > 500) return fail('Demasiados cobros en un solo ingreso')

    // Cobros en efectivo disponibles (no depositados) según el cálculo del servidor.
    const c = await computeYear(Number(input.year))
    const available = new Map<string, MovementRow>()
    for (const m of c.cashMoves) {
      const id = m.saleId ?? m.paymentId ?? m.invoiceId
      if (id) available.set(`${m.kind}:${id}`, m)
    }

    const payloadItems: DepositItemPayload[] = []
    for (const it of items) {
      const m = available.get(`${it.kind}:${it.id}`)
      if (!m) return fail('Algún cobro ya no está disponible o ya está ingresado en el banco')
      payloadItems.push({
        kind: it.kind as DepositItemPayload['kind'],
        itemId: it.id,
        amount: m.total,
        ref: m.ref,
        client: m.client,
        date: m.date,
      })
    }

    const payload: DepositPayload = { date: input.date, note: String(input.note || '').slice(0, 300) }
    await insertDeposit(
      seal(payload),
      me.userId,
      payloadItems.map((p) => ({ payload: seal(p), dedup: dedupTag(`${p.kind}:${p.itemId}`) })),
    )
    return ok(true)
  } catch (e) {
    const msg = e instanceof Error && /duplicate|unique/i.test(e.message)
      ? 'Alguno de los cobros ya estaba ingresado en el banco'
      : undefined
    return fail(msg)
  }
}

export async function deleteBankDeposit(id: string) {
  try {
    await assertScope('B')
    await deleteDeposit(id)
    return ok(true)
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

// Nadie puede quitar la capa B (gestión) al ÚLTIMO usuario que la tiene: el
// módulo quedaría huérfano (solo recuperable por SQL directo).
async function assertNotLastManager(userId: string) {
  const rows = await listAccess()
  const otherManagers = rows.filter((r) => r.scope === 'B' && r.userId !== userId)
  if (otherManagers.length === 0) throw new Error('last_manager')
}

export async function revokeUserScope(userId: string, scope: Scope) {
  try {
    await assertCanManage()
    if (scope === 'B') await assertNotLastManager(userId)
    await revokeAccess(userId, scope)
    return ok(true)
  } catch (e) {
    return fail(e instanceof Error && e.message === 'last_manager'
      ? 'No puedes quitar la capa Efectivo al último gestor'
      : undefined)
  }
}

// Elimina TODO el acceso de un usuario (todas sus capas) de una vez.
export async function removeUserAccess(userId: string) {
  try {
    await assertCanManage()
    const rows = await listAccess()
    const scopes = rows.filter((r) => r.userId === userId).map((r) => r.scope)
    if (scopes.length === 0) return ok(true)
    if (scopes.includes('B')) await assertNotLastManager(userId)
    for (const s of scopes) await revokeAccess(userId, s)
    return ok(true)
  } catch (e) {
    return fail(e instanceof Error && e.message === 'last_manager'
      ? 'No puedes eliminar al último gestor (capa Efectivo)'
      : undefined)
  }
}
