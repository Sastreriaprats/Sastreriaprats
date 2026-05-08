'use server'

import { createAdminClient } from '@/lib/supabase/admin'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { checkUserPermission } from '@/actions/auth'

export type GoalType = 'boutique' | 'sastreria' | 'online'

export interface StoreMonthlyGoal {
  id: string
  store_id: string
  year: number
  month: number
  goal_type: GoalType
  target_amount: number
}

export interface StoreGoalsRow {
  store_id: string
  store_code: string
  store_name: string
  hosts_online: boolean
  boutique_target: number
  sastreria_target: number
  online_target: number
  boutique_actual: number
  sastreria_actual: number
  online_actual: number
}

// Código de la tienda que hospeda el canal online (única tienda que tiene
// objetivo 'online' y agrega las ventas de la tabla online_orders).
const ONLINE_HOST_STORE_CODE = 'PIN'

const BOUTIQUE_SALE_TYPES = ['boutique']
const SASTRERIA_SALE_TYPES = ['tailoring_deposit', 'tailoring_final', 'alteration']
// Estados de online_orders que se consideran facturación realizada.
const ONLINE_COUNTED_STATUSES = ['paid', 'processing', 'shipped', 'delivered']

/** Devuelve una fila por tienda con sus objetivos para el mes indicado. */
export async function getStoreGoalsForMonth(
  year: number,
  month: number,
): Promise<{ data?: StoreGoalsRow[]; error?: string }> {
  try {
    const supabase = await createServerSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { error: 'No autenticado' }

    const admin = createAdminClient()
    const pad = (n: number) => String(n).padStart(2, '0')
    const monthStart = `${year}-${pad(month)}-01T00:00:00`
    const nextMonth = month === 12 ? { y: year + 1, m: 1 } : { y: year, m: month + 1 }
    const nextMonthStart = `${nextMonth.y}-${pad(nextMonth.m)}-01T00:00:00`

    const [storesRes, goalsRes, salesRes, onlineRes] = await Promise.all([
      admin.from('stores').select('id, code, name, store_type').eq('is_active', true).order('name'),
      admin.from('store_monthly_goals').select('store_id, goal_type, target_amount').eq('year', year).eq('month', month),
      admin.from('sales').select('store_id, total, tax_amount, sale_type').eq('status', 'completed').gte('created_at', monthStart).lt('created_at', nextMonthStart),
      admin.from('online_orders').select('total, tax_amount').in('status', ONLINE_COUNTED_STATUSES).gte('created_at', monthStart).lt('created_at', nextMonthStart),
    ])

    if (storesRes.error) return { error: storesRes.error.message }
    if (goalsRes.error) return { error: goalsRes.error.message }
    if (salesRes.error) return { error: salesRes.error.message }
    if (onlineRes.error) return { error: onlineRes.error.message }

    const goalsByStore = new Map<string, { boutique: number; sastreria: number; online: number }>()
    for (const g of (goalsRes.data || []) as { store_id: string; goal_type: GoalType; target_amount: string | number }[]) {
      const entry = goalsByStore.get(g.store_id) ?? { boutique: 0, sastreria: 0, online: 0 }
      entry[g.goal_type] = Number(g.target_amount) || 0
      goalsByStore.set(g.store_id, entry)
    }

    // Los objetivos se miden en base imponible (sin IVA): total - tax_amount.
    const actualByStore = new Map<string, { boutique: number; sastreria: number }>()
    for (const r of (salesRes.data || []) as { store_id: string | null; total: number | string | null; tax_amount: number | string | null; sale_type: string | null }[]) {
      if (!r.store_id) continue
      const entry = actualByStore.get(r.store_id) ?? { boutique: 0, sastreria: 0 }
      const net = (Number(r.total) || 0) - (Number(r.tax_amount) || 0)
      const st = r.sale_type ?? ''
      if (BOUTIQUE_SALE_TYPES.includes(st)) entry.boutique += net
      else if (SASTRERIA_SALE_TYPES.includes(st)) entry.sastreria += net
      actualByStore.set(r.store_id, entry)
    }

    const onlineActualTotal = (onlineRes.data || []).reduce(
      (sum: number, o: { total: number | string | null; tax_amount: number | string | null }) =>
        sum + ((Number(o.total) || 0) - (Number(o.tax_amount) || 0)),
      0,
    )

    const rows: StoreGoalsRow[] = (storesRes.data || [])
      .filter((s: { store_type?: string | null }) => (s.store_type ?? 'physical') !== 'online')
      .map((s: { id: string; code: string; name: string }) => {
      const g = goalsByStore.get(s.id) ?? { boutique: 0, sastreria: 0, online: 0 }
      const a = actualByStore.get(s.id) ?? { boutique: 0, sastreria: 0 }
      const hostsOnline = s.code === ONLINE_HOST_STORE_CODE
      return {
        store_id: s.id,
        store_code: s.code,
        store_name: s.name,
        hosts_online: hostsOnline,
        boutique_target: g.boutique,
        sastreria_target: g.sastreria,
        online_target: hostsOnline ? g.online : 0,
        boutique_actual: a.boutique,
        sastreria_actual: a.sastreria,
        online_actual: hostsOnline ? onlineActualTotal : 0,
      }
    })

    return { data: rows }
  } catch (err) {
    console.error('[getStoreGoalsForMonth]', err)
    return { error: err instanceof Error ? err.message : 'Error al cargar objetivos' }
  }
}

/** Upsert (insert o update) de un objetivo concreto. */
export async function upsertStoreGoalAction(input: {
  store_id: string
  year: number
  month: number
  goal_type: GoalType
  target_amount: number
}): Promise<{ success?: boolean; error?: string }> {
  try {
    const supabase = await createServerSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { error: 'No autenticado' }
    const hasPerm = await checkUserPermission(user.id, 'config.manage_stores')
    if (!hasPerm) return { error: 'Sin permisos para gestionar objetivos' }

    if (input.month < 1 || input.month > 12) return { error: 'Mes inválido' }
    if (!['boutique', 'sastreria', 'online'].includes(input.goal_type)) return { error: 'Tipo inválido' }
    if (!(input.target_amount >= 0)) return { error: 'Importe inválido' }

    const admin = createAdminClient()

    // Si es objetivo online, comprobar que la tienda hospeda el canal online.
    if (input.goal_type === 'online') {
      const { data: store, error: storeErr } = await admin
        .from('stores')
        .select('code')
        .eq('id', input.store_id)
        .maybeSingle()
      if (storeErr) return { error: storeErr.message }
      if (!store || store.code !== ONLINE_HOST_STORE_CODE) {
        return { error: 'Esta tienda no gestiona ventas online' }
      }
    }

    const { error } = await admin
      .from('store_monthly_goals')
      .upsert(
        {
          store_id: input.store_id,
          year: input.year,
          month: input.month,
          goal_type: input.goal_type,
          target_amount: input.target_amount,
          updated_by: user.id,
          created_by: user.id,
        },
        { onConflict: 'store_id,year,month,goal_type' },
      )

    if (error) return { error: error.message }

    await admin.rpc('log_audit', {
      p_user_id: user.id,
      p_action: 'update',
      p_module: 'config',
      p_entity_type: 'store_monthly_goal',
      p_description: `Objetivo ${input.goal_type} ${String(input.month).padStart(2, '0')}/${input.year}: ${input.target_amount.toFixed(2)} €`,
      p_new_data: input,
    })

    revalidatePath('/admin/configuracion')
    revalidatePath('/admin/dashboard')
    return { success: true }
  } catch (err) {
    console.error('[upsertStoreGoalAction]', err)
    return { error: err instanceof Error ? err.message : 'Error al guardar objetivo' }
  }
}

// ============================================================================
// Objetivos por empleado dentro de cada tienda
// ============================================================================

export type EmployeeGoalType = 'boutique' | 'sastreria'

export interface EmployeeGoalRow {
  employee_id: string
  employee_name: string
  boutique_target: number
  sastreria_target: number
  boutique_actual: number
  sastreria_actual: number
  total_target: number
  total_actual: number
}

/**
 * Devuelve un row por empleado asignado a la tienda con objetivos y ventas
 * reales del mes. Las ventas se filtran por sales.salesperson_id (la fuente
 * de verdad: cada venta TPV tiene vendedor obligatorio).
 *
 * Importes en base imponible (sin IVA): total - tax_amount.
 */
export async function getEmployeeGoals(input: {
  storeId: string
  year: number
  month: number
}): Promise<{ data?: EmployeeGoalRow[]; error?: string }> {
  try {
    const { storeId, year, month } = input
    const supabase = await createServerSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { error: 'No autenticado' }

    const admin = createAdminClient()
    const pad = (n: number) => String(n).padStart(2, '0')
    const monthStart = `${year}-${pad(month)}-01T00:00:00`
    const nextMonth = month === 12 ? { y: year + 1, m: 1 } : { y: year, m: month + 1 }
    const nextMonthStart = `${nextMonth.y}-${pad(nextMonth.m)}-01T00:00:00`

    const [assignedRes, goalsRes, salesRes] = await Promise.all([
      admin
        .from('user_stores')
        .select('user_id, profiles!user_stores_user_id_fkey(id, full_name, is_active)')
        .eq('store_id', storeId),
      admin
        .from('employee_monthly_goals')
        .select('employee_id, goal_type, target_amount')
        .eq('store_id', storeId)
        .eq('year', year)
        .eq('month', month),
      admin
        .from('sales')
        .select('salesperson_id, total, tax_amount, sale_type')
        .eq('store_id', storeId)
        .eq('status', 'completed')
        .gte('created_at', monthStart)
        .lt('created_at', nextMonthStart),
    ])

    if (assignedRes.error) return { error: assignedRes.error.message }
    if (goalsRes.error) return { error: goalsRes.error.message }
    if (salesRes.error) return { error: salesRes.error.message }

    type AssignedRow = { user_id: string; profiles: { id: string; full_name: string | null; is_active: boolean | null } | { id: string; full_name: string | null; is_active: boolean | null }[] | null }
    const employees = new Map<string, { full_name: string }>()
    for (const r of (assignedRes.data || []) as AssignedRow[]) {
      const p = Array.isArray(r.profiles) ? r.profiles[0] : r.profiles
      if (!p || p.is_active === false) continue
      employees.set(r.user_id, { full_name: p.full_name ?? 'Sin nombre' })
    }

    // Asegura que también aparezcan empleados con ventas en la tienda aunque
    // no estén formalmente asignados (vendedor visitante, traspasos, etc.).
    const extraSalesperson = new Set<string>()
    for (const s of (salesRes.data || []) as { salesperson_id: string | null }[]) {
      if (s.salesperson_id && !employees.has(s.salesperson_id)) {
        extraSalesperson.add(s.salesperson_id)
      }
    }
    if (extraSalesperson.size > 0) {
      const { data: extraProfiles } = await admin
        .from('profiles')
        .select('id, full_name')
        .in('id', Array.from(extraSalesperson))
      for (const p of (extraProfiles || []) as { id: string; full_name: string | null }[]) {
        employees.set(p.id, { full_name: p.full_name ?? 'Sin nombre' })
      }
    }

    const targets = new Map<string, { boutique: number; sastreria: number }>()
    for (const g of (goalsRes.data || []) as { employee_id: string; goal_type: EmployeeGoalType; target_amount: string | number }[]) {
      const e = targets.get(g.employee_id) ?? { boutique: 0, sastreria: 0 }
      e[g.goal_type] = Number(g.target_amount) || 0
      targets.set(g.employee_id, e)
    }

    const actuals = new Map<string, { boutique: number; sastreria: number }>()
    for (const r of (salesRes.data || []) as { salesperson_id: string | null; total: number | string | null; tax_amount: number | string | null; sale_type: string | null }[]) {
      if (!r.salesperson_id) continue
      const net = (Number(r.total) || 0) - (Number(r.tax_amount) || 0)
      const e = actuals.get(r.salesperson_id) ?? { boutique: 0, sastreria: 0 }
      const st = r.sale_type ?? ''
      if (BOUTIQUE_SALE_TYPES.includes(st)) e.boutique += net
      else if (SASTRERIA_SALE_TYPES.includes(st)) e.sastreria += net
      actuals.set(r.salesperson_id, e)
    }

    const rows: EmployeeGoalRow[] = Array.from(employees.entries())
      .map(([employeeId, info]) => {
        const t = targets.get(employeeId) ?? { boutique: 0, sastreria: 0 }
        const a = actuals.get(employeeId) ?? { boutique: 0, sastreria: 0 }
        return {
          employee_id: employeeId,
          employee_name: info.full_name,
          boutique_target: t.boutique,
          sastreria_target: t.sastreria,
          boutique_actual: a.boutique,
          sastreria_actual: a.sastreria,
          total_target: t.boutique + t.sastreria,
          total_actual: a.boutique + a.sastreria,
        }
      })
      .sort((a, b) => a.employee_name.localeCompare(b.employee_name, 'es'))

    return { data: rows }
  } catch (err) {
    console.error('[getEmployeeGoals]', err)
    return { error: err instanceof Error ? err.message : 'Error al cargar objetivos de empleados' }
  }
}

/** Upsert de un objetivo de empleado concreto. */
export async function upsertEmployeeGoal(input: {
  storeId: string
  employeeId: string
  year: number
  month: number
  goalType: EmployeeGoalType
  targetAmount: number
}): Promise<{ success?: boolean; error?: string }> {
  try {
    const supabase = await createServerSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { error: 'No autenticado' }

    const hasPerm = await checkUserPermission(user.id, 'config.manage_stores')
    if (!hasPerm) return { error: 'Sin permisos para gestionar objetivos' }

    if (input.month < 1 || input.month > 12) return { error: 'Mes inválido' }
    if (!['boutique', 'sastreria'].includes(input.goalType)) return { error: 'Tipo inválido' }
    if (!(input.targetAmount >= 0)) return { error: 'Importe inválido' }

    const admin = createAdminClient()

    const { error } = await admin
      .from('employee_monthly_goals')
      .upsert(
        {
          store_id: input.storeId,
          employee_id: input.employeeId,
          year: input.year,
          month: input.month,
          goal_type: input.goalType,
          target_amount: input.targetAmount,
          updated_by: user.id,
          created_by: user.id,
        },
        { onConflict: 'store_id,employee_id,year,month,goal_type' },
      )

    if (error) return { error: error.message }

    await admin.rpc('log_audit', {
      p_user_id: user.id,
      p_action: 'update',
      p_module: 'config',
      p_entity_type: 'employee_monthly_goal',
      p_description: `Objetivo empleado ${input.goalType} ${String(input.month).padStart(2, '0')}/${input.year}: ${input.targetAmount.toFixed(2)} €`,
      p_new_data: input,
    })

    revalidatePath('/admin/configuracion')
    return { success: true }
  } catch (err) {
    console.error('[upsertEmployeeGoal]', err)
    return { error: err instanceof Error ? err.message : 'Error al guardar objetivo' }
  }
}

/**
 * Copia los objetivos de empleado del mes anterior al mes/año indicado para
 * la tienda dada. Útil al abrir un mes nuevo sin objetivos definidos. Solo
 * copia targets > 0. Idempotente vía UPSERT por la clave única.
 */
export async function copyEmployeeGoalsFromPreviousMonth(input: {
  storeId: string
  year: number
  month: number
}): Promise<{ success?: boolean; copied?: number; error?: string }> {
  try {
    const supabase = await createServerSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { error: 'No autenticado' }

    const hasPerm = await checkUserPermission(user.id, 'config.manage_stores')
    if (!hasPerm) return { error: 'Sin permisos' }

    if (input.month < 1 || input.month > 12) return { error: 'Mes inválido' }

    const prev = input.month === 1
      ? { y: input.year - 1, m: 12 }
      : { y: input.year, m: input.month - 1 }

    const admin = createAdminClient()

    const { data: prevGoals, error: readErr } = await admin
      .from('employee_monthly_goals')
      .select('employee_id, goal_type, target_amount')
      .eq('store_id', input.storeId)
      .eq('year', prev.y)
      .eq('month', prev.m)
    if (readErr) return { error: readErr.message }

    const rows = ((prevGoals ?? []) as { employee_id: string; goal_type: EmployeeGoalType; target_amount: string | number }[])
      .filter(g => Number(g.target_amount) > 0)
      .map(g => ({
        store_id: input.storeId,
        employee_id: g.employee_id,
        year: input.year,
        month: input.month,
        goal_type: g.goal_type,
        target_amount: Number(g.target_amount),
        created_by: user.id,
        updated_by: user.id,
      }))

    if (rows.length === 0) return { success: true, copied: 0 }

    const { error: insErr } = await admin
      .from('employee_monthly_goals')
      .upsert(rows, { onConflict: 'store_id,employee_id,year,month,goal_type' })
    if (insErr) return { error: insErr.message }

    await admin.rpc('log_audit', {
      p_user_id: user.id,
      p_action: 'create',
      p_module: 'config',
      p_entity_type: 'employee_monthly_goal',
      p_description: `Copia objetivos empleados ${String(prev.m).padStart(2, '0')}/${prev.y} → ${String(input.month).padStart(2, '0')}/${input.year} (${rows.length})`,
      p_new_data: { from: prev, to: { year: input.year, month: input.month }, store_id: input.storeId, count: rows.length },
    })

    revalidatePath('/admin/configuracion')
    return { success: true, copied: rows.length }
  } catch (err) {
    console.error('[copyEmployeeGoalsFromPreviousMonth]', err)
    return { error: err instanceof Error ? err.message : 'Error al copiar objetivos' }
  }
}
