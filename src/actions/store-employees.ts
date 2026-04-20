'use server'

import { createAdminClient } from '@/lib/supabase/admin'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { checkUserPermission } from '@/actions/auth'
import { revalidatePath } from 'next/cache'

/**
 * Empleados disponibles en el sistema (usuarios de la empresa) que pueden
 * ser asignados como vendedores en una tienda. Excluye usuarios rol 'client'.
 */
export async function listAvailableEmployees(): Promise<{
  data?: { id: string; full_name: string; email: string }[]
  error?: string
}> {
  try {
    const supabase = await createServerSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { error: 'No autenticado' }

    const hasPerm = await checkUserPermission(user.id, 'config.manage_stores')
    if (!hasPerm) return { error: 'Sin permisos' }

    const admin = createAdminClient()
    const { data: profiles, error } = await admin
      .from('profiles')
      .select('id, full_name, email, is_active')
      .eq('is_active', true)
      .order('full_name')
    if (error) return { error: error.message }

    const ids = (profiles ?? []).map((p) => p.id)
    const clientIds = new Set<string>()
    if (ids.length > 0) {
      const { data: roles } = await admin
        .from('user_roles')
        .select('user_id, roles(name)')
        .in('user_id', ids)
      for (const ur of roles ?? []) {
        const r = (ur as any).roles
        const name = Array.isArray(r) ? r[0]?.name : r?.name
        if ((name ?? '').toLowerCase() === 'client') {
          clientIds.add((ur as any).user_id)
        }
      }
    }

    const data = (profiles ?? [])
      .filter((p) => !clientIds.has(p.id))
      .map((p) => ({
        id: p.id,
        full_name: p.full_name ?? 'Sin nombre',
        email: p.email ?? '',
      }))

    return { data }
  } catch (err) {
    console.error('[listAvailableEmployees]', err)
    return { error: err instanceof Error ? err.message : 'Error al cargar empleados' }
  }
}

/** Devuelve los user_id asignados a una tienda en `user_stores`. */
export async function listStoreEmployees(
  storeId: string,
): Promise<{ data?: string[]; error?: string }> {
  try {
    const supabase = await createServerSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { error: 'No autenticado' }

    const hasPerm = await checkUserPermission(user.id, 'config.manage_stores')
    if (!hasPerm) return { error: 'Sin permisos' }
    if (!storeId) return { data: [] }

    const admin = createAdminClient()
    const { data, error } = await admin
      .from('user_stores')
      .select('user_id')
      .eq('store_id', storeId)
    if (error) return { error: error.message }

    return { data: (data ?? []).map((r: { user_id: string }) => r.user_id) }
  } catch (err) {
    console.error('[listStoreEmployees]', err)
    return { error: err instanceof Error ? err.message : 'Error al cargar asignaciones' }
  }
}

/**
 * Reemplaza la lista completa de empleados asignados a una tienda.
 * Inserta los nuevos y elimina los que ya no estén en la lista.
 */
export async function setStoreEmployees(
  storeId: string,
  userIds: string[],
): Promise<{ success?: boolean; error?: string }> {
  try {
    const supabase = await createServerSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { error: 'No autenticado' }

    const hasPerm = await checkUserPermission(user.id, 'config.manage_stores')
    if (!hasPerm) return { error: 'Sin permisos para gestionar tiendas' }
    if (!storeId) return { error: 'Tienda no válida' }

    const admin = createAdminClient()

    const { data: existing, error: fetchError } = await admin
      .from('user_stores')
      .select('user_id')
      .eq('store_id', storeId)
    if (fetchError) return { error: fetchError.message }

    const existingSet = new Set((existing ?? []).map((r: { user_id: string }) => r.user_id))
    const desiredSet = new Set(userIds)

    const toDelete = [...existingSet].filter((id) => !desiredSet.has(id))
    const toInsert = [...desiredSet].filter((id) => !existingSet.has(id))

    if (toDelete.length > 0) {
      const { error: delError } = await admin
        .from('user_stores')
        .delete()
        .eq('store_id', storeId)
        .in('user_id', toDelete)
      if (delError) return { error: delError.message }
    }

    if (toInsert.length > 0) {
      const rows = toInsert.map((uid) => ({
        user_id: uid,
        store_id: storeId,
        assigned_by: user.id,
      }))
      const { error: insError } = await admin.from('user_stores').insert(rows)
      if (insError) return { error: insError.message }
    }

    await admin.rpc('log_audit', {
      p_user_id: user.id,
      p_action: 'update',
      p_module: 'config',
      p_entity_type: 'store_employees',
      p_entity_id: storeId,
      p_description: `Actualizados empleados de tienda (añadidos: ${toInsert.length}, eliminados: ${toDelete.length})`,
      p_new_data: { user_ids: userIds },
    })

    revalidatePath('/admin/configuracion')
    return { success: true }
  } catch (err) {
    console.error('[setStoreEmployees]', err)
    return { error: err instanceof Error ? err.message : 'Error al guardar asignaciones' }
  }
}
