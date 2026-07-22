'use server'
/* eslint-disable @typescript-eslint/no-explicit-any -- el cliente admin de Supabase es any por diseño; las filas leídas se castean puntualmente */

import { protectedAction } from '@/lib/server/action-wrapper'
import { success, failure } from '@/lib/errors'
import { createAdminClient } from '@/lib/supabase/admin'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { checkUserPermission, checkUserExplicitPermission } from '@/actions/auth'
import { revalidatePath } from 'next/cache'

// ============================================================================
// Comisiones de VENDEDORES (configurable). Ver mig 231.
//
// Base medida IGUAL que los Objetivos (employee_monthly_goals): ventas de
// `sales` por salesperson_id, en base imponible (total - tax_amount), bucket por
// sale_type. Así el % "sobre/bajo objetivo" es coherente con el objetivo que se
// fija en el panel de Objetivos. NO se mezclan los pagos de backoffice
// (tailoring_order_payments) ni los pedidos creados: usan otra vara y romperían
// la comparación con el objetivo (eso sería un motor distinto).
// ============================================================================

const SASTRERIA_SALE_TYPES = ['tailoring_deposit', 'tailoring_final', 'alteration']
const BOUTIQUE_SALE_TYPE = 'boutique'
const GIFT_CARD_SALE_TYPE = 'gift_card'

// Mes YYYY-MM del instante en hora de Madrid (los created_at se guardan en UTC).
const _madridDayFmt = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Madrid', year: 'numeric', month: '2-digit', day: '2-digit' })
const madridMonthKey = (iso: string): string => _madridDayFmt.format(new Date(iso)).slice(0, 7)

const pad = (n: number) => String(n).padStart(2, '0')
const round2 = (n: number) => Math.round(n * 100) / 100

/** Lee TODAS las filas de una query paginando de 1000 en 1000 (el tope del
 *  servidor NO se evita con .limit(); solo .range() pagina de verdad). */
async function readAllPaged<T = Record<string, unknown>>(
  build: (from: number, to: number) => PromiseLike<{ data: T[] | null }>,
): Promise<T[]> {
  const out: T[] = []
  for (let from = 0; ; from += 1000) {
    const { data } = await build(from, from + 999)
    const batch = data ?? []
    out.push(...batch)
    if (batch.length < 1000) break
  }
  return out
}

/** Lista de claves YYYY-MM entre dos fechas YYYY-MM-DD (inclusive). */
function monthKeysInRange(start: string, end: string): string[] {
  const [sy, sm] = start.split('-').map(Number)
  const [ey, em] = end.split('-').map(Number)
  const out: string[] = []
  let y = sy, m = sm
  while (y < ey || (y === ey && m <= em)) {
    out.push(`${y}-${pad(m)}`)
    m++; if (m > 12) { m = 1; y++ }
  }
  return out
}

// ── Tipos ───────────────────────────────────────────────────────────────────
export interface CommissionPlan {
  id: string
  name: string
  store_id: string | null
  base_boutique: boolean
  base_gift_cards: boolean
  base_sastreria: boolean
  rate_below: number
  rate_above: number
  use_target: boolean
  is_active: boolean
}

export interface CommissionAssignment {
  id: string
  employee_id: string
  plan_id: string | null
  is_active: boolean
}

export interface GroupBonus {
  id: string
  name: string
  period_type: string
  rate: number
  base_type: string
  goal_types: string[]
  is_active: boolean
  store_ids: string[]
  member_ids: string[]
}

export interface EmployeeCommission {
  employee_id: string
  employee_name: string
  plan_id: string
  plan_name: string
  base_boutique: number
  base_sastreria: number
  tiered: number       // comisión por tramos
  bonus: number        // parte del bonus grupal atribuida
  total: number        // tiered + bonus
}

export interface GroupBonusResult {
  bonus_id: string
  name: string
  quarter_label: string
  applies: boolean
  rate: number
  base_type: string
  stores: { store_id: string; store_name: string; target: number; actual: number; beat: boolean }[]
  pool: number
  per_member: number
  members: { employee_id: string; employee_name: string; amount: number }[]
}

// ============================================================================
// MOTOR: comisiones por empleado para un rango. Lo consume el informe.
// ============================================================================
export const getEmployeeCommissions = protectedAction<
  { start_date: string; end_date: string },
  { employees: EmployeeCommission[]; groupBonuses: GroupBonusResult[] }
>(
  { permission: ['reports.view', 'reports.view_own', 'reports.view_all_employees'], auditModule: 'reports' },
  async (ctx, { start_date, end_date }) => {
    const admin = ctx.adminClient
    // Solo quien tiene reports.view_all_employees EXPLÍCITO (sin bypass de admin)
    // ve a todos; el resto, únicamente su propia comisión.
    const canViewAll = await checkUserExplicitPermission(ctx.userId, 'reports.view_all_employees')
    const monthKeys = new Set(monthKeysInRange(start_date, end_date))
    const years = Array.from(new Set([...monthKeys].map(k => Number(k.slice(0, 4)))))

    const [plansRes, assignRes, salesRows, goalsRows, bonusesRes, bonusStoresRes, bonusMembersRes, storesRes] = await Promise.all([
      admin.from('commission_plans').select('*').eq('is_active', true),
      admin.from('commission_assignments').select('*').eq('is_active', true),
      // Paginado real: un .limit(20000) NO evita el tope del servidor (max-rows
      // 1000, verificado empíricamente) — solo .range() pagina de verdad.
      // Incluye partially_returned: las devoluciones RESTAN de la base
      // (prorrateo por total_returned), no eliminan el ticket entero.
      readAllPaged((f, t) => admin.from('sales')
        .select('salesperson_id, total, total_returned, tax_amount, sale_type, created_at')
        .in('status', ['completed', 'partially_returned'])
        .gte('created_at', start_date)
        .lte('created_at', end_date + 'T23:59:59')
        .order('created_at', { ascending: true })
        .range(f, t)),
      readAllPaged((f, t) => admin.from('employee_monthly_goals')
        .select('employee_id, goal_type, target_amount, year, month')
        .in('year', years.length ? years : [0])
        .order('id', { ascending: true })
        .range(f, t)),
      admin.from('commission_group_bonuses').select('*').eq('is_active', true),
      admin.from('commission_group_bonus_stores').select('bonus_id, store_id'),
      admin.from('commission_group_bonus_members').select('bonus_id, employee_id'),
      admin.from('stores').select('id, name'),
    ])

    if (plansRes.error) return failure(plansRes.error.message, 'INTERNAL')

    const plans = new Map<string, CommissionPlan>()
    for (const p of (plansRes.data || []) as any[]) {
      plans.set(p.id, {
        id: p.id, name: p.name, store_id: p.store_id,
        base_boutique: p.base_boutique, base_gift_cards: p.base_gift_cards, base_sastreria: p.base_sastreria,
        rate_below: Number(p.rate_below) || 0, rate_above: Number(p.rate_above) || 0,
        use_target: p.use_target, is_active: p.is_active,
      })
    }
    const assignByEmp = new Map<string, string>()  // employee_id → plan_id
    for (const a of (assignRes.data || []) as any[]) assignByEmp.set(a.employee_id, a.plan_id)

    const storeNames = new Map<string, string>()
    for (const s of (storesRes.data || []) as any[]) storeNames.set(s.id, s.name)

    // Ventas netas por empleado, mes y bucket. Las devoluciones restan: la base
    // se prorratea por lo NO devuelto (misma proporción que el criterio general
    // de facturación); una devolución parcial ya no elimina el ticket entero.
    type Buckets = { boutique: number; gift_cards: number; sastreria: number }
    const empSales = new Map<string, Map<string, Buckets>>()  // emp → monthKey → buckets
    for (const r of (salesRows || []) as any[]) {
      const emp = r.salesperson_id as string | null
      if (!emp) continue
      const mk = madridMonthKey(r.created_at)
      if (!monthKeys.has(mk)) continue
      const total = Number(r.total) || 0
      const returned = Number(r.total_returned) || 0
      const proportion = total > 0 ? Math.max(0, (total - returned) / total) : 0
      const net = (total - (Number(r.tax_amount) || 0)) * proportion
      const st = (r.sale_type ?? '') as string
      let byMonth = empSales.get(emp)
      if (!byMonth) { byMonth = new Map(); empSales.set(emp, byMonth) }
      const b = byMonth.get(mk) ?? { boutique: 0, gift_cards: 0, sastreria: 0 }
      if (st === BOUTIQUE_SALE_TYPE) b.boutique += net
      else if (st === GIFT_CARD_SALE_TYPE) b.gift_cards += net
      else if (SASTRERIA_SALE_TYPES.includes(st)) b.sastreria += net
      byMonth.set(mk, b)
    }

    // Objetivos por empleado y mes (sumados sobre tiendas).
    const empGoals = new Map<string, Map<string, { boutique: number; sastreria: number }>>()
    for (const g of (goalsRows || []) as any[]) {
      const mk = `${g.year}-${pad(g.month)}`
      if (!monthKeys.has(mk)) continue
      const emp = g.employee_id as string
      let byMonth = empGoals.get(emp)
      if (!byMonth) { byMonth = new Map(); empGoals.set(emp, byMonth) }
      const t = byMonth.get(mk) ?? { boutique: 0, sastreria: 0 }
      const gt = g.goal_type as string
      if (gt === 'boutique' || gt === 'sastreria') t[gt] += Number(g.target_amount) || 0
      byMonth.set(mk, t)
    }

    // ── Comisión por tramos, por empleado con plan asignado ───────────────────
    const result = new Map<string, EmployeeCommission>()
    for (const [emp, planId] of assignByEmp) {
      const plan = plans.get(planId)
      if (!plan) continue
      const byMonth = empSales.get(emp)
      let tiered = 0, baseBoutiqueTot = 0, baseSastreriaTot = 0
      if (byMonth) {
        for (const [mk, b] of byMonth) {
          const boutiqueBase = (plan.base_boutique ? b.boutique : 0) + (plan.base_gift_cards ? b.gift_cards : 0)
          const sastreriaBase = plan.base_sastreria ? b.sastreria : 0
          baseBoutiqueTot += boutiqueBase
          baseSastreriaTot += sastreriaBase
          if (!plan.use_target) {
            tiered += (boutiqueBase + sastreriaBase) * plan.rate_below / 100
          } else {
            const goals = empGoals.get(emp)?.get(mk) ?? { boutique: 0, sastreria: 0 }
            for (const [base, target] of [[boutiqueBase, goals.boutique], [sastreriaBase, goals.sastreria]] as const) {
              if (target > 0) {
                const below = Math.min(base, target)
                const above = Math.max(0, base - target)
                tiered += below * plan.rate_below / 100 + above * plan.rate_above / 100
              } else {
                // Sin objetivo cargado ese mes: tramo BAJO para toda la base.
                // (Antes, target=0 mandaba TODO al tramo alto — sobrepagaba
                // cada mes en que nadie hubiera fijado el objetivo.)
                tiered += base * plan.rate_below / 100
              }
            }
          }
        }
      }
      result.set(emp, {
        employee_id: emp, employee_name: emp, plan_id: planId, plan_name: plan.name,
        base_boutique: round2(baseBoutiqueTot), base_sastreria: round2(baseSastreriaTot),
        tiered: round2(tiered), bonus: 0, total: round2(tiered),
      })
    }

    // ── Bonus grupal (por trimestre que solapa el rango) ──────────────────────
    const bonuses = (bonusesRes.data || []) as any[]
    const storesByBonus = new Map<string, string[]>()
    for (const r of (bonusStoresRes.data || []) as any[]) {
      const arr = storesByBonus.get(r.bonus_id) ?? []; arr.push(r.store_id); storesByBonus.set(r.bonus_id, arr)
    }
    const membersByBonus = new Map<string, string[]>()
    for (const r of (bonusMembersRes.data || []) as any[]) {
      const arr = membersByBonus.get(r.bonus_id) ?? []; arr.push(r.employee_id); membersByBonus.set(r.bonus_id, arr)
    }

    // Trimestres que solapan el rango.
    const quarters = new Map<string, { qy: number; q: number; months: number[] }>()
    for (const mk of monthKeys) {
      const y = Number(mk.slice(0, 4)), m = Number(mk.slice(5, 7))
      const q = Math.floor((m - 1) / 3) + 1
      const key = `${y}-Q${q}`
      if (!quarters.has(key)) quarters.set(key, { qy: y, q, months: [(q - 1) * 3 + 1, (q - 1) * 3 + 2, (q - 1) * 3 + 3] })
    }

    const groupBonuses: GroupBonusResult[] = []
    const needNames = new Set<string>([...result.keys()])

    for (const bonus of bonuses) {
      const bStores = storesByBonus.get(bonus.id) ?? []
      const bMembers = membersByBonus.get(bonus.id) ?? []
      const goalTypes: string[] = (bonus.goal_types || []).filter((t: string) => t === 'boutique' || t === 'sastreria')
      bMembers.forEach(m => needNames.add(m))
      if (bStores.length === 0 || bMembers.length === 0) continue

      for (const { qy, q, months } of quarters.values()) {
        const qStart = `${qy}-${pad(months[0])}-01`
        const qEndMonth = months[2]
        const qEnd = `${qy}-${pad(qEndMonth)}-${pad(new Date(qy, qEndMonth, 0).getDate())}`

        const [sgRes, ssRows] = await Promise.all([
          admin.from('store_monthly_goals')
            .select('store_id, goal_type, target_amount')
            .eq('year', qy).in('month', months).in('store_id', bStores).in('goal_type', goalTypes),
          // Paginado: un trimestre de varias tiendas supera 1000 ventas con
          // facilidad y el tope del servidor truncaba el "actual" en silencio
          // (bonus que no se activaba o pool menor).
          readAllPaged((f, t) => admin.from('sales')
            .select('store_id, total, total_returned, tax_amount, sale_type')
            .in('status', ['completed', 'partially_returned']).in('store_id', bStores)
            .gte('created_at', qStart).lte('created_at', qEnd + 'T23:59:59')
            .order('created_at', { ascending: true })
            .range(f, t)),
        ])

        const targetByStore = new Map<string, number>()
        for (const g of (sgRes.data || []) as any[]) targetByStore.set(g.store_id, (targetByStore.get(g.store_id) || 0) + (Number(g.target_amount) || 0))
        const actualByStore = new Map<string, number>()
        for (const r of (ssRows || []) as any[]) {
          const st = (r.sale_type ?? '') as string
          const inGoal = (goalTypes.includes('boutique') && st === BOUTIQUE_SALE_TYPE) || (goalTypes.includes('sastreria') && SASTRERIA_SALE_TYPES.includes(st))
          if (!inGoal) continue
          const total = Number(r.total) || 0
          const proportion = total > 0 ? Math.max(0, (total - (Number(r.total_returned) || 0)) / total) : 0
          const net = (total - (Number(r.tax_amount) || 0)) * proportion
          actualByStore.set(r.store_id, (actualByStore.get(r.store_id) || 0) + net)
        }

        const storeRows = bStores.map(sid => {
          const target = round2(targetByStore.get(sid) || 0)
          const actual = round2(actualByStore.get(sid) || 0)
          return { store_id: sid, store_name: storeNames.get(sid) || 'Tienda', target, actual, beat: target > 0 && actual > target }
        })
        const applies = storeRows.length > 0 && storeRows.every(s => s.beat)
        let pool = 0
        if (applies) {
          const poolBase = bonus.base_type === 'total'
            ? storeRows.reduce((s, r) => s + r.actual, 0)
            : storeRows.reduce((s, r) => s + (r.actual - r.target), 0)
          pool = round2(poolBase * (Number(bonus.rate) || 0) / 100)
        }
        const perMember = applies && bMembers.length > 0 ? round2(pool / bMembers.length) : 0

        groupBonuses.push({
          bonus_id: bonus.id, name: bonus.name,
          quarter_label: `T${q} ${qy}`,
          applies, rate: Number(bonus.rate) || 0, base_type: bonus.base_type,
          stores: storeRows, pool, per_member: perMember,
          members: bMembers.map(emp => ({ employee_id: emp, employee_name: emp, amount: perMember })),
        })

        if (applies) {
          for (const emp of bMembers) {
            const existing = result.get(emp)
            if (existing) {
              existing.bonus = round2(existing.bonus + perMember)
              existing.total = round2(existing.tiered + existing.bonus)
            } else {
              // Beneficiario sin plan de tramos: solo bonus.
              result.set(emp, {
                employee_id: emp, employee_name: emp, plan_id: '', plan_name: '—',
                base_boutique: 0, base_sastreria: 0, tiered: 0, bonus: perMember, total: perMember,
              })
            }
          }
        }
      }
    }

    // Resolver nombres.
    const ids = Array.from(needNames)
    if (ids.length > 0) {
      const { data: profiles } = await admin.from('profiles').select('id, full_name').in('id', ids)
      const nameById = new Map<string, string>()
      for (const p of (profiles || []) as any[]) nameById.set(p.id, p.full_name || p.id)
      for (const e of result.values()) e.employee_name = nameById.get(e.employee_id) || e.employee_id
      for (const gb of groupBonuses) for (const m of gb.members) m.employee_name = nameById.get(m.employee_id) || m.employee_id
    }

    // Scoping de privacidad: si NO puede ver a todos, solo su propia fila y sin
    // el desglose del bonus grupal (que revela cifras de tienda y otros empleados).
    if (!canViewAll) {
      const mine = result.get(ctx.userId)
      return success({ employees: mine ? [mine] : [], groupBonuses: [] })
    }

    return success({
      employees: Array.from(result.values()).sort((a, b) => b.total - a.total),
      groupBonuses,
    })
  }
)

// ============================================================================
// CONFIGURACIÓN (panel) — lectura
// ============================================================================
export async function getCommissionConfig(): Promise<{
  data?: {
    plans: CommissionPlan[]
    assignments: CommissionAssignment[]
    bonuses: GroupBonus[]
    stores: { id: string; name: string }[]
    employees: { id: string; full_name: string }[]
  }
  error?: string
}> {
  try {
    const supabase = await createServerSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { error: 'No autenticado' }
    // La configuración revela tarifas, quién comisiona y bonus: solo para
    // quien gestiona configuración (antes bastaba cualquier sesión).
    const canRead = await checkUserPermission(user.id, 'config.edit')
    if (!canRead) return { error: 'Sin permisos para ver la configuración de comisiones' }

    const admin = createAdminClient()
    const [plansRes, assignRes, bonusesRes, bStoresRes, bMembersRes, storesRes, profilesRes] = await Promise.all([
      admin.from('commission_plans').select('*').order('name'),
      admin.from('commission_assignments').select('*'),
      admin.from('commission_group_bonuses').select('*').order('name'),
      admin.from('commission_group_bonus_stores').select('bonus_id, store_id'),
      admin.from('commission_group_bonus_members').select('bonus_id, employee_id'),
      admin.from('stores').select('id, name').eq('is_active', true).order('name'),
      admin.from('profiles').select('id, full_name').eq('is_active', true).order('full_name'),
    ])
    if (plansRes.error) return { error: plansRes.error.message }

    const storesByBonus = new Map<string, string[]>()
    for (const r of (bStoresRes.data || []) as any[]) { const a = storesByBonus.get(r.bonus_id) ?? []; a.push(r.store_id); storesByBonus.set(r.bonus_id, a) }
    const membersByBonus = new Map<string, string[]>()
    for (const r of (bMembersRes.data || []) as any[]) { const a = membersByBonus.get(r.bonus_id) ?? []; a.push(r.employee_id); membersByBonus.set(r.bonus_id, a) }

    return {
      data: {
        plans: (plansRes.data || []).map((p: any) => ({
          id: p.id, name: p.name, store_id: p.store_id,
          base_boutique: p.base_boutique, base_gift_cards: p.base_gift_cards, base_sastreria: p.base_sastreria,
          rate_below: Number(p.rate_below) || 0, rate_above: Number(p.rate_above) || 0,
          use_target: p.use_target, is_active: p.is_active,
        })),
        assignments: (assignRes.data || []).map((a: any) => ({ id: a.id, employee_id: a.employee_id, plan_id: a.plan_id, is_active: a.is_active })),
        bonuses: (bonusesRes.data || []).map((b: any) => ({
          id: b.id, name: b.name, period_type: b.period_type, rate: Number(b.rate) || 0, base_type: b.base_type,
          goal_types: b.goal_types || [], is_active: b.is_active,
          store_ids: storesByBonus.get(b.id) ?? [], member_ids: membersByBonus.get(b.id) ?? [],
        })),
        stores: (storesRes.data || []) as { id: string; name: string }[],
        employees: (profilesRes.data || []).map((p: any) => ({ id: p.id, full_name: p.full_name || p.id })),
      },
    }
  } catch (err) {
    console.error('[getCommissionConfig]', err)
    return { error: err instanceof Error ? err.message : 'Error al cargar configuración de comisiones' }
  }
}

// ── Helper de permiso + admin client para mutaciones ─────────────────────────
async function requireConfigEdit() {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'No autenticado' as const }
  const ok = await checkUserPermission(user.id, 'config.edit')
  if (!ok) return { error: 'Sin permisos para gestionar comisiones' as const }
  return { user, admin: createAdminClient() }
}

// ============================================================================
// CONFIGURACIÓN — mutaciones
// ============================================================================
export async function upsertCommissionPlan(input: {
  id?: string
  name: string
  store_id?: string | null
  base_boutique: boolean
  base_gift_cards: boolean
  base_sastreria: boolean
  rate_below: number
  rate_above: number
  use_target: boolean
  is_active?: boolean
}): Promise<{ success?: boolean; id?: string; error?: string }> {
  try {
    const auth = await requireConfigEdit()
    if ('error' in auth) return { error: auth.error }
    const { user, admin } = auth

    if (!input.name?.trim()) return { error: 'El plan necesita un nombre' }
    const rateBelow = Number(input.rate_below ?? 0)
    const rateAbove = Number(input.rate_above ?? 0)
    if (!Number.isFinite(rateBelow) || rateBelow < 0 || rateBelow > 100 ||
        !Number.isFinite(rateAbove) || rateAbove < 0 || rateAbove > 100) {
      return { error: 'Los porcentajes deben estar entre 0 y 100' }
    }
    const row = {
      name: input.name.trim(),
      store_id: input.store_id || null,
      base_boutique: !!input.base_boutique,
      base_gift_cards: !!input.base_gift_cards,
      base_sastreria: !!input.base_sastreria,
      rate_below: rateBelow,
      rate_above: rateAbove,
      use_target: input.use_target ?? true,
      is_active: input.is_active ?? true,
      updated_at: new Date().toISOString(),
    }

    let id = input.id
    if (id) {
      const { error } = await admin.from('commission_plans').update(row).eq('id', id)
      if (error) return { error: error.message }
    } else {
      const { data, error } = await admin.from('commission_plans').insert({ ...row, created_by: user.id }).select('id').single()
      if (error) return { error: error.message }
      id = data.id
    }

    await admin.rpc('log_audit', {
      p_user_id: user.id, p_action: input.id ? 'update' : 'create', p_module: 'config',
      p_entity_type: 'commission_plan', p_entity_id: id,
      p_description: `Plan de comisión "${row.name}" (${row.rate_below}%/${row.rate_above}%)`,
      p_new_data: row,
    })
    revalidatePath('/admin/configuracion')
    revalidatePath('/admin/reporting')
    return { success: true, id }
  } catch (err) {
    console.error('[upsertCommissionPlan]', err)
    return { error: err instanceof Error ? err.message : 'Error al guardar el plan' }
  }
}

export async function deleteCommissionPlan(id: string): Promise<{ success?: boolean; error?: string }> {
  try {
    const auth = await requireConfigEdit()
    if ('error' in auth) return { error: auth.error }
    const { user, admin } = auth
    const { error } = await admin.from('commission_plans').delete().eq('id', id)
    if (error) return { error: error.message }
    await admin.rpc('log_audit', {
      p_user_id: user.id, p_action: 'delete', p_module: 'config',
      p_entity_type: 'commission_plan', p_entity_id: id, p_description: 'Plan de comisión eliminado',
    })
    revalidatePath('/admin/configuracion'); revalidatePath('/admin/reporting')
    return { success: true }
  } catch (err) {
    console.error('[deleteCommissionPlan]', err)
    return { error: err instanceof Error ? err.message : 'Error al eliminar el plan' }
  }
}

/**
 * Cambia el plan de un empleado que YA está en la lista de comisionables.
 * plan_id=null deja la fila con "sin plan" (sigue en la lista, sin comisión); el
 * empleado solo se quita de la lista con removeCommissionEmployee.
 */
export async function assignCommissionPlan(input: { employee_id: string; plan_id: string | null }): Promise<{ success?: boolean; error?: string }> {
  try {
    const auth = await requireConfigEdit()
    if ('error' in auth) return { error: auth.error }
    const { user, admin } = auth

    const { error } = await admin.from('commission_assignments')
      .upsert({ employee_id: input.employee_id, plan_id: input.plan_id, is_active: true, created_by: user.id, updated_at: new Date().toISOString() }, { onConflict: 'employee_id' })
    if (error) return { error: error.message }

    await admin.rpc('log_audit', {
      p_user_id: user.id, p_action: 'update', p_module: 'config',
      p_entity_type: 'commission_assignment', p_entity_id: input.employee_id,
      p_description: input.plan_id ? 'Plan de comisión asignado' : 'Plan de comisión retirado',
      p_new_data: input,
    })
    revalidatePath('/admin/configuracion'); revalidatePath('/admin/reporting')
    return { success: true }
  } catch (err) {
    console.error('[assignCommissionPlan]', err)
    return { error: err instanceof Error ? err.message : 'Error al asignar el plan' }
  }
}

/** Añade empleados a la lista de "usuarios que comisionan" (sin plan por defecto). */
export async function addCommissionEmployees(employeeIds: string[]): Promise<{ success?: boolean; error?: string }> {
  try {
    const auth = await requireConfigEdit()
    if ('error' in auth) return { error: auth.error }
    const { user, admin } = auth
    const ids = Array.from(new Set(employeeIds.filter(Boolean)))
    if (ids.length === 0) return { error: 'No hay empleados que añadir' }

    const rows = ids.map(id => ({ employee_id: id, plan_id: null, is_active: true, created_by: user.id, updated_at: new Date().toISOString() }))
    // ignoreDuplicates: no pisa el plan de quien ya esté en la lista.
    const { error } = await admin.from('commission_assignments').upsert(rows, { onConflict: 'employee_id', ignoreDuplicates: true })
    if (error) return { error: error.message }

    await admin.rpc('log_audit', {
      p_user_id: user.id, p_action: 'create', p_module: 'config',
      p_entity_type: 'commission_assignment', p_entity_id: ids[0],
      p_description: `Añadidos ${ids.length} empleado(s) a comisiones`, p_new_data: { employee_ids: ids },
    })
    revalidatePath('/admin/configuracion'); revalidatePath('/admin/reporting')
    return { success: true }
  } catch (err) {
    console.error('[addCommissionEmployees]', err)
    return { error: err instanceof Error ? err.message : 'Error al añadir empleados' }
  }
}

/** Quita un empleado de la lista de comisionables (borra su asignación). */
export async function removeCommissionEmployee(employeeId: string): Promise<{ success?: boolean; error?: string }> {
  try {
    const auth = await requireConfigEdit()
    if ('error' in auth) return { error: auth.error }
    const { user, admin } = auth
    const { error } = await admin.from('commission_assignments').delete().eq('employee_id', employeeId)
    if (error) return { error: error.message }

    await admin.rpc('log_audit', {
      p_user_id: user.id, p_action: 'delete', p_module: 'config',
      p_entity_type: 'commission_assignment', p_entity_id: employeeId,
      p_description: 'Empleado retirado de comisiones',
    })
    revalidatePath('/admin/configuracion'); revalidatePath('/admin/reporting')
    return { success: true }
  } catch (err) {
    console.error('[removeCommissionEmployee]', err)
    return { error: err instanceof Error ? err.message : 'Error al quitar el empleado' }
  }
}

export async function upsertGroupBonus(input: {
  id?: string
  name: string
  rate: number
  base_type: string
  goal_types: string[]
  period_type?: string
  is_active?: boolean
  store_ids: string[]
  member_ids: string[]
}): Promise<{ success?: boolean; id?: string; error?: string }> {
  try {
    const auth = await requireConfigEdit()
    if ('error' in auth) return { error: auth.error }
    const { user, admin } = auth
    if (!input.name?.trim()) return { error: 'El bonus necesita un nombre' }
    const rate = Number(input.rate ?? 0)
    if (!Number.isFinite(rate) || rate < 0 || rate > 100) return { error: 'El porcentaje debe estar entre 0 y 100' }
    if (!input.store_ids?.length) return { error: 'El bonus necesita al menos una tienda' }
    if (!input.member_ids?.length) return { error: 'El bonus necesita al menos un beneficiario' }

    const row = {
      name: input.name.trim(),
      period_type: input.period_type || 'quarter',
      rate,
      base_type: input.base_type || 'excess',
      goal_types: input.goal_types?.length ? input.goal_types : ['boutique', 'sastreria'],
      is_active: input.is_active ?? true,
      updated_at: new Date().toISOString(),
    }

    let id = input.id
    if (id) {
      const { error } = await admin.from('commission_group_bonuses').update(row).eq('id', id)
      if (error) return { error: error.message }
    } else {
      const { data, error } = await admin.from('commission_group_bonuses').insert({ ...row, created_by: user.id }).select('id').single()
      if (error) return { error: error.message }
      id = data.id
    }

    // Reemplazar tiendas y miembros (set completo, con chequeo: un fallo aquí
    // dejaría el bonus sin tiendas/beneficiarios en silencio).
    const { error: delStoresErr } = await admin.from('commission_group_bonus_stores').delete().eq('bonus_id', id)
    if (delStoresErr) return { error: delStoresErr.message }
    if (input.store_ids.length) {
      const { error: insStoresErr } = await admin.from('commission_group_bonus_stores').insert(input.store_ids.map(s => ({ bonus_id: id, store_id: s })))
      if (insStoresErr) return { error: insStoresErr.message }
    }
    const { error: delMembersErr } = await admin.from('commission_group_bonus_members').delete().eq('bonus_id', id)
    if (delMembersErr) return { error: delMembersErr.message }
    if (input.member_ids.length) {
      const { error: insMembersErr } = await admin.from('commission_group_bonus_members').insert(input.member_ids.map(e => ({ bonus_id: id, employee_id: e })))
      if (insMembersErr) return { error: insMembersErr.message }
    }

    await admin.rpc('log_audit', {
      p_user_id: user.id, p_action: input.id ? 'update' : 'create', p_module: 'config',
      p_entity_type: 'commission_group_bonus', p_entity_id: id,
      p_description: `Bonus grupal "${row.name}" (${row.rate}%)`, p_new_data: { ...row, ...input },
    })
    revalidatePath('/admin/configuracion'); revalidatePath('/admin/reporting')
    return { success: true, id }
  } catch (err) {
    console.error('[upsertGroupBonus]', err)
    return { error: err instanceof Error ? err.message : 'Error al guardar el bonus' }
  }
}

export async function deleteGroupBonus(id: string): Promise<{ success?: boolean; error?: string }> {
  try {
    const auth = await requireConfigEdit()
    if ('error' in auth) return { error: auth.error }
    const { user, admin } = auth
    const { error } = await admin.from('commission_group_bonuses').delete().eq('id', id)
    if (error) return { error: error.message }
    await admin.rpc('log_audit', {
      p_user_id: user.id, p_action: 'delete', p_module: 'config',
      p_entity_type: 'commission_group_bonus', p_entity_id: id, p_description: 'Bonus grupal eliminado',
    })
    revalidatePath('/admin/configuracion'); revalidatePath('/admin/reporting')
    return { success: true }
  } catch (err) {
    console.error('[deleteGroupBonus]', err)
    return { error: err instanceof Error ? err.message : 'Error al eliminar el bonus' }
  }
}
