'use server'

import { createAdminClient } from '@/lib/supabase/admin'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { checkUserPermission } from '@/actions/auth'

export type GoalType = 'boutique' | 'sastreria'

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
  boutique_target: number
  sastreria_target: number
  boutique_actual: number
  sastreria_actual: number
}

const BOUTIQUE_SALE_TYPES = ['boutique', 'online']
const SASTRERIA_SALE_TYPES = ['tailoring_deposit', 'tailoring_final', 'alteration']

/** Devuelve una fila por tienda con sus 2 objetivos para el mes indicado. */
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

    const [storesRes, goalsRes, salesRes] = await Promise.all([
      admin.from('stores').select('id, code, name').eq('is_active', true).order('name'),
      admin.from('store_monthly_goals').select('store_id, goal_type, target_amount').eq('year', year).eq('month', month),
      admin.from('sales').select('store_id, total, sale_type').eq('status', 'completed').gte('created_at', monthStart).lt('created_at', nextMonthStart),
    ])

    if (storesRes.error) return { error: storesRes.error.message }
    if (goalsRes.error) return { error: goalsRes.error.message }
    if (salesRes.error) return { error: salesRes.error.message }

    const goalsByStore = new Map<string, { boutique: number; sastreria: number }>()
    for (const g of (goalsRes.data || []) as { store_id: string; goal_type: GoalType; target_amount: string | number }[]) {
      const entry = goalsByStore.get(g.store_id) ?? { boutique: 0, sastreria: 0 }
      entry[g.goal_type] = Number(g.target_amount) || 0
      goalsByStore.set(g.store_id, entry)
    }

    const actualByStore = new Map<string, { boutique: number; sastreria: number }>()
    for (const r of (salesRes.data || []) as { store_id: string | null; total: number | string | null; sale_type: string | null }[]) {
      if (!r.store_id) continue
      const entry = actualByStore.get(r.store_id) ?? { boutique: 0, sastreria: 0 }
      const total = Number(r.total) || 0
      const st = r.sale_type ?? ''
      if (BOUTIQUE_SALE_TYPES.includes(st)) entry.boutique += total
      else if (SASTRERIA_SALE_TYPES.includes(st)) entry.sastreria += total
      actualByStore.set(r.store_id, entry)
    }

    const rows: StoreGoalsRow[] = (storesRes.data || []).map((s: { id: string; code: string; name: string }) => {
      const g = goalsByStore.get(s.id) ?? { boutique: 0, sastreria: 0 }
      const a = actualByStore.get(s.id) ?? { boutique: 0, sastreria: 0 }
      return {
        store_id: s.id,
        store_code: s.code,
        store_name: s.name,
        boutique_target: g.boutique,
        sastreria_target: g.sastreria,
        boutique_actual: a.boutique,
        sastreria_actual: a.sastreria,
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
    if (!['boutique', 'sastreria'].includes(input.goal_type)) return { error: 'Tipo inválido' }
    if (!(input.target_amount >= 0)) return { error: 'Importe inválido' }

    const admin = createAdminClient()
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
