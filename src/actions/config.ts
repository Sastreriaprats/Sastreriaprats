'use server'

import { createAdminClient } from '@/lib/supabase/admin'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { checkUserPermission } from '@/actions/auth'
import { serializeForServerAction } from '@/lib/server/serialize'

// ==========================================
// STORES
// ==========================================

/** Lista de tiendas activas para hooks/UI. Columnas necesarias para listados y formularios. */
export async function getStoresList(): Promise<{
  data?: Array<{
    id: string
    code: string
    name: string
    display_name: string | null
    store_type: string
    address: string | null
    city: string | null
    postal_code: string | null
    province: string | null
    country: string | null
    phone: string | null
    email: string | null
    default_cash_fund: number | null
    order_prefix: string | null
    slug: string | null
    opening_hours: Record<string, unknown> | null
    fiscal_name: string | null
    fiscal_nif: string | null
    fiscal_address: string | null
    latitude: number | null
    longitude: number | null
    google_maps_url: string | null
  }>
  error?: string
}> {
  try {
    const admin = createAdminClient()
    const { data, error } = await admin
      .from('stores')
      .select('id, code, name, display_name, store_type, address, city, postal_code, province, country, phone, email, default_cash_fund, order_prefix, slug, opening_hours, fiscal_name, fiscal_nif, fiscal_address, latitude, longitude, google_maps_url')
      .eq('is_active', true)
      .order('name')
    if (error) return { error: error.message }
    return { data: data ?? [] }
  } catch (err) {
    console.error('[getStoresList]', err)
    return { error: err instanceof Error ? err.message : 'Error al cargar tiendas' }
  }
}

export async function createStoreAction(data: {
  code: string
  name: string
  display_name?: string
  store_type: string
  address?: string
  city?: string
  postal_code?: string
  province?: string
  country?: string
  phone?: string
  email?: string
  opening_hours?: Record<string, any>
  latitude?: number
  longitude?: number
  google_maps_url?: string
  fiscal_name?: string
  fiscal_nif?: string
  fiscal_address?: string
  default_cash_fund?: number
  order_prefix?: string
  slug?: string
}) {
  try {
    const supabase = await createServerSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { error: 'No autenticado' }
    const hasPerm = await checkUserPermission(user.id, 'config.manage_stores')
    if (!hasPerm) return { error: 'Sin permisos para gestionar tiendas' }

    const admin = createAdminClient()
    const { data: store, error } = await admin
      .from('stores')
      .insert({
        ...data,
        code: data.code.toUpperCase(),
        order_prefix: data.order_prefix || data.code.toUpperCase(),
        slug: data.slug || data.name.toLowerCase().replace(/\s+/g, '-'),
      })
      .select()
      .single()

    if (error) return { error: error.message }

    if (store) {
      await admin.from('warehouses').insert({
        code: `${store.code}-ALM`,
        name: `Almacén ${store.name}`,
        store_id: store.id,
        is_main: true,
      })
    }

    await admin.rpc('log_audit', {
      p_user_id: user.id,
      p_action: 'create',
      p_module: 'config',
      p_entity_type: 'store',
      p_entity_id: store?.id,
      p_entity_display: `Tienda: ${data.name}`,
      p_description: `Creada tienda ${data.name} (${data.code})`,
    })

    revalidatePath('/admin/configuracion')
    return { success: true, store: store ? serializeForServerAction(store) : undefined }
  } catch (err) {
    console.error('[createStoreAction]', err)
    return { error: err instanceof Error ? err.message : 'Error al crear tienda' }
  }
}

export async function updateStoreAction(
  storeId: string,
  data: Record<string, any>,
) {
  try {
    const supabase = await createServerSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { error: 'No autenticado' }
    const hasPerm = await checkUserPermission(user.id, 'config.manage_stores')
    if (!hasPerm) return { error: 'Sin permisos para gestionar tiendas' }

    const admin = createAdminClient()
    const { error } = await admin.from('stores').update(data).eq('id', storeId)
    if (error) return { error: error.message }

    await admin.rpc('log_audit', {
      p_user_id: user.id,
      p_action: 'update',
      p_module: 'config',
      p_entity_type: 'store',
      p_entity_id: storeId,
      p_description: 'Tienda actualizada',
      p_new_data: data,
    })

    revalidatePath('/admin/configuracion')
    return { success: true }
  } catch (err) {
    console.error('[updateStoreAction]', err)
    return { error: err instanceof Error ? err.message : 'Error al actualizar tienda' }
  }
}

// ==========================================
// WAREHOUSES
// ==========================================

export async function createWarehouseAction(data: {
  code: string
  name: string
  store_id?: string
  is_main?: boolean
  accepts_online_stock?: boolean
}) {
  try {
    const supabase = await createServerSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { error: 'No autenticado' }
    const hasPerm = await checkUserPermission(user.id, 'config.manage_stores')
    if (!hasPerm) return { error: 'Sin permisos para gestionar tiendas' }

    const admin = createAdminClient()
    const { data: warehouse, error } = await admin
      .from('warehouses')
      .insert(data)
      .select()
      .single()
    if (error) return { error: error.message }

    await admin.rpc('log_audit', {
      p_user_id: user.id,
      p_action: 'create',
      p_module: 'config',
      p_entity_type: 'warehouse',
      p_entity_id: warehouse?.id,
      p_description: `Creado almacén ${data.name}`,
    })

    revalidatePath('/admin/configuracion')
    return { success: true }
  } catch (err) {
    console.error('[createWarehouseAction]', err)
    return { error: err instanceof Error ? err.message : 'Error al crear almacén' }
  }
}

export async function updateWarehouseAction(
  warehouseId: string,
  data: Record<string, any>,
) {
  try {
    const supabase = await createServerSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { error: 'No autenticado' }
    const hasPerm = await checkUserPermission(user.id, 'config.manage_stores')
    if (!hasPerm) return { error: 'Sin permisos para gestionar tiendas' }

    const admin = createAdminClient()
    const { error } = await admin
      .from('warehouses')
      .update(data)
      .eq('id', warehouseId)
    if (error) return { error: error.message }

    revalidatePath('/admin/configuracion')
    return { success: true }
  } catch (err) {
    console.error('[updateWarehouseAction]', err)
    return { error: err instanceof Error ? err.message : 'Error al actualizar almacén' }
  }
}

// ==========================================
// ROLES & PERMISSIONS
// ==========================================

export type RolesAndPermissionsData = {
  roles: Array<{
    id: string
    name: string
    display_name: string | null
    description: string | null
    role_type: string
    hierarchy_level: number
    is_active: boolean
    color: string | null
    permissionCount?: number
  }>
  permissions: Array<{
    id: string
    code: string
    module: string
    action: string
    display_name: string
    description: string | null
    category: string
    sort_order: number
    is_sensitive: boolean
  }>
}

/** Roles y permisos para hooks/UI (roles-section, users-section). No usa redirect para evitar "unexpected response" cuando se llama desde el cliente. */
export async function getRolesAndPermissionsAction(): Promise<{ data?: RolesAndPermissionsData; error?: string }> {
  try {
    const supabase = await createServerSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { error: 'No autenticado' }
    const hasPermission = await checkUserPermission(user.id, 'config.view')
    if (!hasPermission) return { error: 'Sin permisos para ver configuración' }

    const admin = createAdminClient()
    const [rolesRes, permsRes, rpRes] = await Promise.all([
      admin.from('roles').select('id, name, display_name, description, role_type, hierarchy_level, is_active, color').order('hierarchy_level'),
      admin.from('permissions').select('id, code, module, action, display_name, description, category, sort_order, is_sensitive').order('category, sort_order'),
      admin.from('role_permissions').select('role_id'),
    ])
    if (rolesRes.error) return { error: rolesRes.error.message }
    if (permsRes.error) return { error: permsRes.error.message }
    const countMap: Record<string, number> = {}
    ;(rpRes.data ?? []).forEach((rp: { role_id: string }) => {
      countMap[rp.role_id] = (countMap[rp.role_id] || 0) + 1
    })
    const roles: RolesAndPermissionsData['roles'] = (rolesRes.data ?? []).map((r: Record<string, unknown>) => ({
      ...r,
      permissionCount: countMap[String(r.id)] || 0,
    })) as RolesAndPermissionsData['roles']
    return {
      data: {
        roles,
        permissions: (permsRes.data ?? []) as RolesAndPermissionsData['permissions'],
      },
    }
  } catch (err) {
    console.error('[getRolesAndPermissionsAction]', err)
    return { error: err instanceof Error ? err.message : 'Error al cargar roles y permisos' }
  }
}

export async function createRoleAction(data: {
  name: string
  display_name: string
  description?: string
  hierarchy_level?: number
  color?: string
  icon?: string
}) {
  try {
    const supabase = await createServerSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { error: 'No autenticado' }
    const hasPerm = await checkUserPermission(user.id, 'config.manage_roles')
    if (!hasPerm) return { error: 'Sin permisos para gestionar roles' }

    const admin = createAdminClient()
    const { data: role, error } = await admin
      .from('roles')
      .insert({ ...data, role_type: 'custom' })
      .select()
      .single()

    if (error) return { error: error.message }

    await admin.rpc('log_audit', {
      p_user_id: user.id,
      p_action: 'create',
      p_module: 'config',
      p_entity_type: 'role',
      p_entity_id: role?.id,
      p_description: `Creado rol personalizado: ${data.display_name}`,
    })

    revalidatePath('/admin/configuracion')
    return { success: true, role: role ? serializeForServerAction(role) : undefined }
  } catch (err) {
    console.error('[createRoleAction]', err)
    return { error: err instanceof Error ? err.message : 'Error al crear rol' }
  }
}

export async function updateRolePermissionsAction(
  roleId: string,
  permissionIds: string[],
) {
  try {
    const supabase = await createServerSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { error: 'No autenticado' }
    const hasPerm = await checkUserPermission(user.id, 'config.manage_roles')
    if (!hasPerm) return { error: 'Sin permisos para gestionar roles' }

    const admin = createAdminClient()
    await admin.from('role_permissions').delete().eq('role_id', roleId)

    if (permissionIds.length > 0) {
      const inserts = permissionIds.map((pid) => ({
        role_id: roleId,
        permission_id: pid,
        granted_by: user.id,
      }))
      const { error } = await admin.from('role_permissions').insert(inserts)
      if (error) return { error: error.message }
    }

    await admin.rpc('log_audit', {
      p_user_id: user.id,
      p_action: 'update',
      p_module: 'config',
      p_entity_type: 'role',
      p_entity_id: roleId,
      p_description: `Actualizados ${permissionIds.length} permisos del rol`,
    })

    revalidatePath('/admin/configuracion')
    return { success: true }
  } catch (err) {
    console.error('[updateRolePermissionsAction]', err)
    return { error: err instanceof Error ? err.message : 'Error al actualizar permisos del rol' }
  }
}

// ==========================================
// SYSTEM CONFIG
// ==========================================

export async function updateSystemConfigAction(key: string, value: any) {
  try {
    const supabase = await createServerSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { error: 'No autenticado' }
    const hasPerm = await checkUserPermission(user.id, 'config.view')
    if (!hasPerm) return { error: 'Sin permisos para ver configuración' }

    const admin = createAdminClient()
    const { error } = await admin
      .from('system_config')
      .update({ value: JSON.stringify(value), updated_by: user.id })
      .eq('key', key)

    if (error) return { error: error.message }

    await admin.rpc('log_audit', {
      p_user_id: user.id,
      p_action: 'update',
      p_module: 'config',
      p_entity_type: 'system_config',
      p_description: `Actualizado parámetro: ${key}`,
      p_new_data: { key, value },
    })

    revalidatePath('/admin/configuracion')
    return { success: true }
  } catch (err) {
    console.error('[updateSystemConfigAction]', err)
    return { error: err instanceof Error ? err.message : 'Error al actualizar parámetro' }
  }
}

export async function bulkUpdateSystemConfigAction(
  updates: { key: string; value: any }[],
): Promise<{ success?: boolean; error?: string }> {
  try {
    const supabase = await createServerSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { error: 'No autenticado' }
    const hasPerm = await checkUserPermission(user.id, 'config.view')
    if (!hasPerm) return { error: 'Sin permisos para ver configuración' }

    const admin = createAdminClient()

    for (const { key, value } of updates) {
      const { error } = await admin
        .from('system_config')
        .update({ value: JSON.stringify(value), updated_by: user.id })
        .eq('key', key)
      if (error) return { error: error.message }
    }

    await admin.rpc('log_audit', {
      p_user_id: user.id,
      p_action: 'update',
      p_module: 'config',
      p_description: `Actualizados ${updates.length} parámetros del sistema`,
    })

    revalidatePath('/admin/configuracion')
    return { success: true }
  } catch (e: any) {
    return { error: e.message ?? 'Error inesperado' }
  }
}

// ==========================================
// GARMENT TYPES & MEASUREMENT FIELDS
// ==========================================

export async function createGarmentTypeAction(data: {
  code: string
  name: string
  category?: string
  sort_order?: number
  icon?: string
  has_sketch?: boolean
}) {
  try {
    const supabase = await createServerSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { error: 'No autenticado' }
    const hasPerm = await checkUserPermission(user.id, 'config.manage_garment_types')
    if (!hasPerm) return { error: 'Sin permisos para gestionar tipos de prenda' }

    const admin = createAdminClient()
    const { data: garment, error } = await admin
      .from('garment_types')
      .insert(data)
      .select()
      .single()
    if (error) return { error: error.message }

    await admin.rpc('log_audit', {
      p_user_id: user.id,
      p_action: 'create',
      p_module: 'config',
      p_entity_type: 'garment_type',
      p_entity_id: garment?.id,
      p_description: `Creado tipo de prenda: ${data.name}`,
    })

    revalidatePath('/admin/configuracion')
    return { success: true, garment: garment ? serializeForServerAction(garment) : undefined }
  } catch (err) {
    console.error('[createGarmentTypeAction]', err)
    return { error: err instanceof Error ? err.message : 'Error al crear tipo de prenda' }
  }
}

export async function updateGarmentTypeAction(
  id: string,
  data: Record<string, any>,
) {
  try {
    const supabase = await createServerSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { error: 'No autenticado' }
    const hasPerm = await checkUserPermission(user.id, 'config.manage_garment_types')
    if (!hasPerm) return { error: 'Sin permisos para gestionar tipos de prenda' }

    const admin = createAdminClient()
    const { error } = await admin.from('garment_types').update(data).eq('id', id)
    if (error) return { error: error.message }

    revalidatePath('/admin/configuracion')
    return { success: true }
  } catch (err) {
    console.error('[updateGarmentTypeAction]', err)
    return { error: err instanceof Error ? err.message : 'Error al actualizar tipo de prenda' }
  }
}

export async function createMeasurementFieldAction(data: {
  garment_type_id: string
  code: string
  name: string
  field_type?: string
  unit?: string
  options?: any
  min_value?: number
  max_value?: number
  applies_to?: string
  sort_order?: number
  is_required?: boolean
  help_text?: string
  field_group?: string
}) {
  try {
    const supabase = await createServerSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { error: 'No autenticado' }
    const hasPerm = await checkUserPermission(user.id, 'config.manage_measurement_fields')
    if (!hasPerm) return { error: 'Sin permisos para gestionar campos de medida' }

    const admin = createAdminClient()
    const { error } = await admin.from('measurement_fields').insert(data)
    if (error) return { error: error.message }

    revalidatePath('/admin/configuracion')
    return { success: true }
  } catch (err) {
    console.error('[createMeasurementFieldAction]', err)
    return { error: err instanceof Error ? err.message : 'Error al crear campo' }
  }
}

export async function updateMeasurementFieldAction(
  id: string,
  data: Record<string, any>,
) {
  try {
    const supabase = await createServerSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { error: 'No autenticado' }
    const hasPerm = await checkUserPermission(user.id, 'config.manage_measurement_fields')
    if (!hasPerm) return { error: 'Sin permisos para gestionar campos de medida' }

    const admin = createAdminClient()
    const { error } = await admin
      .from('measurement_fields')
      .update(data)
      .eq('id', id)
    if (error) return { error: error.message }

    revalidatePath('/admin/configuracion')
    return { success: true }
  } catch (err) {
    console.error('[updateMeasurementFieldAction]', err)
    return { error: err instanceof Error ? err.message : 'Error al actualizar campo' }
  }
}

export async function deleteMeasurementFieldAction(id: string) {
  try {
    const supabase = await createServerSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { error: 'No autenticado' }
    const hasPerm = await checkUserPermission(user.id, 'config.manage_measurement_fields')
    if (!hasPerm) return { error: 'Sin permisos para gestionar campos de medida' }

    const admin = createAdminClient()
    const { error } = await admin
      .from('measurement_fields')
      .update({ is_active: false })
      .eq('id', id)
    if (error) return { error: error.message }

    revalidatePath('/admin/configuracion')
    return { success: true }
  } catch (err) {
    console.error('[deleteMeasurementFieldAction]', err)
    return { error: err instanceof Error ? err.message : 'Error al eliminar campo' }
  }
}
