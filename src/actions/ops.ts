'use server'

import { createAdminClient } from '@/lib/supabase/admin'
import { getViewerAccess, assertScope, assertCanManage, type ViewerAccess } from '@/lib/ops/access'
import { seal, open, dedupTag } from '@/lib/ops/crypto'
import {
  listEntries, insertEntry, updateEntry, deleteEntry,
  listAccess, grantAccess, revokeAccess, type Scope,
} from '@/lib/ops/db'
import type { LedgerPayload, LedgerLine, Metrics } from '@/lib/ops/types'

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

// ---------------------------------------------------------------------------
// CAPA B — control de efectivo
// ---------------------------------------------------------------------------
async function loadAll(year?: number): Promise<LedgerLine[]> {
  const rows = await listEntries()
  const lines: LedgerLine[] = []
  for (const r of rows) {
    try {
      const p = open<LedgerPayload>(r.payload)
      if (year && !String(p.date).startsWith(String(year))) continue
      lines.push({ ...p, id: r.id })
    } catch { /* clave incorrecta o fila corrupta: se omite */ }
  }
  return lines.sort((a, b) => a.date.localeCompare(b.date))
}

export async function listLedger(year?: number) {
  try {
    await assertScope('B')
    return ok(await loadAll(year))
  } catch { return fail() }
}

export async function createManualEntry(input: {
  date: string; concept: string; direction: 'in' | 'out'; amount: number; includeInC: boolean
}) {
  try {
    await assertScope('B')
    const amount = r2(Number(input.amount) || 0)
    if (amount <= 0) return fail('Importe inválido')
    const base = r2(amount / 1.21)
    const payload: LedgerPayload = {
      kind: 'manual',
      date: input.date,
      concept: String(input.concept || '').slice(0, 200),
      direction: input.direction === 'out' ? 'out' : 'in',
      base, vat: r2(amount - base), amount,
      includeInC: !!input.includeInC,
    }
    await insertEntry(seal(payload), null)
    return ok(true)
  } catch { return fail() }
}

export async function updateLedgerEntry(id: string, input: {
  date: string; concept: string; direction: 'in' | 'out'; amount: number; includeInC: boolean
}) {
  try {
    await assertScope('B')
    const all = await loadAll()
    const current = all.find((l) => l.id === id)
    if (!current) return fail()
    const amount = r2(Number(input.amount) || 0)
    if (amount <= 0) return fail('Importe inválido')
    // Las líneas 'erp' conservan su importe/origen; solo se cura el flag include.
    const base = current.kind === 'erp' ? current.base : r2(amount / 1.21)
    const payload: LedgerPayload = {
      ...current,
      date: current.kind === 'erp' ? current.date : input.date,
      concept: current.kind === 'erp' ? current.concept : String(input.concept || '').slice(0, 200),
      direction: current.kind === 'erp' ? current.direction : (input.direction === 'out' ? 'out' : 'in'),
      base,
      vat: current.kind === 'erp' ? current.vat : r2(amount - base),
      amount: current.kind === 'erp' ? current.amount : amount,
      includeInC: !!input.includeInC,
    }
    await updateEntry(id, seal(payload))
    return ok(true)
  } catch { return fail() }
}

export async function setIncludeInC(id: string, includeInC: boolean) {
  try {
    await assertScope('B')
    const all = await loadAll()
    const current = all.find((l) => l.id === id)
    if (!current) return fail()
    await updateEntry(id, seal({ ...current, includeInC: !!includeInC, id: undefined } as LedgerPayload))
    return ok(true)
  } catch { return fail() }
}

export async function removeLedgerEntry(id: string) {
  try {
    await assertScope('B')
    await deleteEntry(id)
    return ok(true)
  } catch { return fail() }
}

/** Importa los cobros 100% efectivo del ERP (serie CLP-E) al ledger, idempotente. */
export async function syncErpCash(year: number) {
  try {
    await assertScope('B')
    const admin = createAdminClient()
    const start = `${year}-01-01`
    const end = `${year}-12-31T23:59:59`

    // Traer todas las E del año (paginado para sortear el tope de 1000).
    const tickets: { id: string; ref: string; amount: number; created_at: string; source: string }[] = []
    for (let from = 0; ; from += 1000) {
      const { data, error } = await admin
        .from('cash_internal_tickets')
        .select('id, ref, amount, created_at, source')
        .eq('series', 'E')
        .gte('created_at', start)
        .lte('created_at', end)
        .order('created_at', { ascending: true })
        .range(from, from + 999)
      if (error) return fail()
      const batch = (data ?? []) as typeof tickets
      tickets.push(...batch)
      if (batch.length < 1000) break
    }

    let imported = 0
    for (const t of tickets) {
      const amount = r2(Number(t.amount) || 0)
      if (amount <= 0) continue
      const base = r2(amount / 1.21)
      const payload: LedgerPayload = {
        kind: 'erp',
        date: String(t.created_at).slice(0, 10),
        concept: t.ref,
        direction: 'in',
        base, vat: r2(amount - base), amount,
        includeInC: true,
        source: t.source,
        sourceId: t.id,
      }
      // dedup_tag opaco sobre el id del ticket -> ON CONFLICT DO NOTHING en BD.
      await insertEntry(seal(payload), dedupTag(t.id))
      imported++ // cuenta de procesados; los repetidos no insertan por el conflicto
    }
    return ok({ scanned: tickets.length })
  } catch { return fail() }
}

// ---------------------------------------------------------------------------
// CAPA C — escenario sin efectivo (informe al vuelo, NO se persiste)
// ---------------------------------------------------------------------------
export async function getScenarioC(year: number) {
  try {
    await assertScope('C')
    const admin = createAdminClient()
    const start = `${year}-01-01`
    const end = `${year}-12-31T23:59:59`

    // --- A (réplica de getAccountingSummary, lectura intacta) ---
    const sales: any[] = []
    for (let from = 0; ; from += 1000) {
      const { data } = await admin.from('sales')
        .select('total, total_returned, subtotal, tax_amount, created_at')
        .gte('created_at', start).lte('created_at', end)
        .in('status', ['completed', 'partially_returned'])
        .range(from, from + 999)
      const batch = data ?? []
      sales.push(...batch)
      if (batch.length < 1000) break
    }
    const { data: purchases } = await admin.from('supplier_orders')
      .select('total, tax_amount, created_at')
      .gte('created_at', start).lte('created_at', end)
      .in('status', ['received', 'partially_received'])

    const netSale = (x: any) => {
      const total = Number(x.total) || 0
      const returned = Number(x.total_returned) || 0
      const subtotal = Number(x.subtotal) || 0
      const tax = Number(x.tax_amount) || 0
      const proportion = total > 0 ? Math.max(0, (total - returned) / total) : 0
      return { netBase: (subtotal || total) * proportion, netVat: tax * proportion }
    }
    const facturacionA = sales.reduce((s, x) => s + netSale(x).netBase, 0)
    const ivaRepercutidoA = sales.reduce((s, x) => s + netSale(x).netVat, 0)
    const gastosA = (purchases ?? []).reduce((s, x: any) => s + (Number(x.total) - Number(x.tax_amount || 0)), 0)
    const ivaSoportadoA = (purchases ?? []).reduce((s, x: any) => s + (Number(x.tax_amount) || 0), 0)

    const A: Metrics = {
      facturacion: r2(facturacionA), gastos: r2(gastosA), resultado: r2(facturacionA - gastosA),
      ivaRepercutido: r2(ivaRepercutidoA), ivaSoportado: r2(ivaSoportadoA), ivaAPagar: r2(ivaRepercutidoA - ivaSoportadoA),
    }

    // --- Efectivo marcado en B para este año ---
    const lines = (await loadAll(year)).filter((l) => l.includeInC)
    const cashInBase = lines.filter((l) => l.direction === 'in').reduce((s, l) => s + l.base, 0)
    const cashInVat = lines.filter((l) => l.direction === 'in').reduce((s, l) => s + l.vat, 0)
    const cashOutBase = lines.filter((l) => l.direction === 'out').reduce((s, l) => s + l.base, 0)
    const cashOutVat = lines.filter((l) => l.direction === 'out').reduce((s, l) => s + l.vat, 0)

    const facturacionC = facturacionA - cashInBase
    const gastosC = gastosA - cashOutBase
    const ivaRepC = ivaRepercutidoA - cashInVat
    const ivaSopC = ivaSoportadoA - cashOutVat
    const C: Metrics = {
      facturacion: r2(facturacionC), gastos: r2(gastosC), resultado: r2(facturacionC - gastosC),
      ivaRepercutido: r2(ivaRepC), ivaSoportado: r2(ivaSopC), ivaAPagar: r2(ivaRepC - ivaSopC),
    }

    return ok({
      A, C,
      removed: { base: r2(cashInBase - cashOutBase), vat: r2(cashInVat - cashOutVat), lines: lines.length },
    })
  } catch { return fail() }
}

// ---------------------------------------------------------------------------
// Gestión de accesos (solo quien tiene capa B / canManage)
// ---------------------------------------------------------------------------
export async function listAccessGrants() {
  try {
    await assertCanManage()
    return ok(await listAccess())
  } catch { return fail() }
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
    return ok((data ?? []).map((u: any) => ({ id: u.id, email: u.email, fullName: u.full_name ?? '' })))
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
