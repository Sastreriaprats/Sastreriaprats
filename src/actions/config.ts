'use server'

import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'
import { requirePermission } from '@/actions/auth'

// ==========================================
// STORES
// ==========================================

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
  const user = await requirePermission('config.manage_stores')
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
  return { success: true, store }
}

export async function updateStoreAction(
  storeId: string,
  data: Record<string, any>,
) {
  const user = await requirePermission('config.manage_stores')
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
  const user = await requirePermission('config.manage_stores')
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
}

export async function updateWarehouseAction(
  warehouseId: string,
  data: Record<string, any>,
) {
  await requirePermission('config.manage_stores')
  const admin = createAdminClient()

  const { error } = await admin
    .from('warehouses')
    .update(data)
    .eq('id', warehouseId)
  if (error) return { error: error.message }

  revalidatePath('/admin/configuracion')
  return { success: true }
}

// ==========================================
// ROLES & PERMISSIONS
// ==========================================

export async function createRoleAction(data: {
  name: string
  display_name: string
  description?: string
  hierarchy_level?: number
  color?: string
  icon?: string
}) {
  const user = await requirePermission('config.manage_roles')
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
  return { success: true, role }
}

export async function updateRolePermissionsAction(
  roleId: string,
  permissionIds: string[],
) {
  const user = await requirePermission('config.manage_roles')
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
}

// ==========================================
// SYSTEM CONFIG
// ==========================================

export async function updateSystemConfigAction(key: string, value: any) {
  const user = await requirePermission('config.view')
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
}

export async function bulkUpdateSystemConfigAction(
  updates: { key: string; value: any }[],
): Promise<{ success?: boolean; error?: string }> {
  try {
    const user = await requirePermission('config.view')
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
  const user = await requirePermission('config.manage_garment_types')
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
  return { success: true, garment }
}

export async function updateGarmentTypeAction(
  id: string,
  data: Record<string, any>,
) {
  await requirePermission('config.manage_garment_types')
  const admin = createAdminClient()

  const { error } = await admin.from('garment_types').update(data).eq('id', id)
  if (error) return { error: error.message }

  revalidatePath('/admin/configuracion')
  return { success: true }
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
  await requirePermission('config.manage_measurement_fields')
  const admin = createAdminClient()

  const { error } = await admin.from('measurement_fields').insert(data)
  if (error) return { error: error.message }

  revalidatePath('/admin/configuracion')
  return { success: true }
}

export async function updateMeasurementFieldAction(
  id: string,
  data: Record<string, any>,
) {
  await requirePermission('config.manage_measurement_fields')
  const admin = createAdminClient()

  const { error } = await admin
    .from('measurement_fields')
    .update(data)
    .eq('id', id)
  if (error) return { error: error.message }

  revalidatePath('/admin/configuracion')
  return { success: true }
}

export async function deleteMeasurementFieldAction(id: string) {
  await requirePermission('config.manage_measurement_fields')
  const admin = createAdminClient()

  const { error } = await admin
    .from('measurement_fields')
    .update({ is_active: false })
    .eq('id', id)
  if (error) return { error: error.message }

  revalidatePath('/admin/configuracion')
  return { success: true }
}
