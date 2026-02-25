'use server'

import { createAdminClient } from '@/lib/supabase/admin'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { logAudit } from '@/lib/audit'
import { checkUserPermission } from '@/actions/auth'
import { serializeForServerAction } from '@/lib/server/serialize'

export interface UserRow {
  id: string
  email: string
  full_name: string | null
  first_name: string | null
  last_name: string | null
  is_active: boolean
  status: string
  last_login_at: string | null
  created_at: string
  roles: { id: string; name: string; display_name: string | null; color: string | null }[]
}

export async function listAdminUsers(): Promise<{ data?: UserRow[]; error?: string }> {
  try {
    const supabase = await createServerSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { error: 'No autenticado' }

    const admin = createAdminClient()
    const hasPerm = await checkUserPermission(user.id, 'config.users')
    if (!hasPerm) return { error: 'Sin permisos' }

    const { data, error } = await admin
    .from('v_users_with_roles')
    .select('*')
    .order('created_at', { ascending: false })

  /** Excluir usuarios que solo son de tipo cliente (acceso web); esta lista es solo para usuarios de la empresa. */
  function isClientUser(roles: { name?: string; role_name?: string }[]): boolean {
    if (!roles?.length) return false
    return roles.some((r: { name?: string; role_name?: string }) =>
      (r.role_name ?? r.name ?? '').toLowerCase() === 'client'
    )
  }

  function normalizeRoles(raw: unknown): UserRow['roles'] {
    const list = Array.isArray(raw) ? raw : []
    return list.map((r: Record<string, unknown>) => ({
      id: String(r.role_id ?? r.id ?? ''),
      name: String(r.role_name ?? r.name ?? ''),
      display_name: (r.display_name as string | null) ?? null,
      color: (r.color as string | null) ?? null,
    })).filter(r => r.id)
  }

  if (error) {
    const { data: profiles } = await admin
      .from('profiles')
      .select('id, email, full_name, first_name, last_name, is_active, status, last_login_at, created_at')
      .order('created_at', { ascending: false })

    const result: UserRow[] = []
    for (const p of profiles || []) {
      const { data: rolesData } = await admin
        .from('user_roles')
        .select('roles(id, name, display_name, color)')
        .eq('user_id', p.id)

      const roles = (rolesData || []).map((ur: { roles?: { id: string; name: string; display_name: string | null; color: string | null } | { id: string; name: string; display_name: string | null; color: string | null }[] | null }) => {
        const r = Array.isArray(ur.roles) ? ur.roles[0] : ur.roles
        return { id: r?.id ?? '', name: r?.name ?? '', display_name: r?.display_name ?? null, color: r?.color ?? null }
      }).filter(r => r.id)

      if (isClientUser(roles)) continue
      result.push({ ...p, roles })
    }
    return { data: serializeForServerAction(result) }
  }

  const rows = (data || []) as { id: string; email: string; full_name: string | null; first_name?: string | null; last_name?: string | null; is_active: boolean; status: string; last_login_at: string | null; created_at: string; roles: unknown }[]
  const normalized: UserRow[] = rows
    .map(row => ({ ...row, roles: normalizeRoles(row.roles) }))
    .filter(row => !isClientUser(row.roles)) as UserRow[]
  return { data: serializeForServerAction(normalized) }
  } catch (err) {
    console.error('[listAdminUsers]', err)
    return { error: err instanceof Error ? err.message : 'Error al listar usuarios' }
  }
}

export interface CreateUserInput {
  email: string
  firstName: string
  lastName: string
  roleId: string
  storeId: string
}

export async function createAdminUser(input: CreateUserInput): Promise<{ data?: { userId: string; tempPassword: string }; error?: string }> {
  try {
    const supabase = await createServerSupabaseClient()
    const { data: { user: currentUser } } = await supabase.auth.getUser()
    if (!currentUser) return { error: 'No autenticado' }

    const admin = createAdminClient()
    const hasPerm = await checkUserPermission(currentUser.id, 'config.users')
    if (!hasPerm) return { error: 'Sin permisos' }

  const rand = Math.floor(1000 + Math.random() * 9000)
  const tempPassword = `Prats2026!${rand}`

  const { data: authUser, error: authErr } = await admin.auth.admin.createUser({
    email: input.email,
    password: tempPassword,
    email_confirm: true,
    user_metadata: {
      full_name: `${input.firstName} ${input.lastName}`.trim(),
      first_name: input.firstName,
      last_name: input.lastName,
    },
  })

  if (authErr || !authUser?.user) {
    if (authErr?.message?.includes('already registered')) return { error: 'El email ya está registrado' }
    return { error: authErr?.message ?? 'Error creando usuario' }
  }

  const userId = authUser.user.id

  await admin.from('user_roles').insert({ user_id: userId, role_id: input.roleId })
  await admin.from('user_stores').insert({ user_id: userId, store_id: input.storeId, is_primary: true })

  const { data: role } = await admin.from('roles').select('name').eq('id', input.roleId).single()

  await logAudit({
    userId: currentUser.id,
    userName: currentUser.email ?? 'Admin',
    action: 'create',
    entityType: 'user',
    entityId: userId,
    entityLabel: `${input.firstName} ${input.lastName} <${input.email}>`,
    changes: { role: { old: null, new: role?.name ?? input.roleId } },
  })

    revalidatePath('/admin/configuracion')
    return { data: { userId, tempPassword } }
  } catch (err) {
    console.error('[createAdminUser]', err)
    return { error: err instanceof Error ? err.message : 'Error al crear usuario' }
  }
}

export interface UpdateUserInput {
  userId: string
  firstName?: string
  lastName?: string
  roleId?: string
  storeId?: string
  isActive?: boolean
  resetPassword?: boolean
}

export async function updateAdminUser(input: UpdateUserInput): Promise<{ data?: { tempPassword?: string }; error?: string }> {
  try {
    const supabase = await createServerSupabaseClient()
    const { data: { user: currentUser } } = await supabase.auth.getUser()
    if (!currentUser) return { error: 'No autenticado' }

    const admin = createAdminClient()
    const hasPerm = await checkUserPermission(currentUser.id, 'config.users')
    if (!hasPerm) return { error: 'Sin permisos' }

  const changes: Record<string, { old: unknown; new: unknown }> = {}

  if (input.firstName !== undefined || input.lastName !== undefined) {
    const { data: profile } = await admin.from('profiles').select('first_name, last_name').eq('id', input.userId).single()
    const newFirst = input.firstName ?? profile?.first_name
    const newLast  = input.lastName  ?? profile?.last_name
    await admin.from('profiles').update({
      first_name: newFirst,
      last_name:  newLast,
      full_name:  `${newFirst} ${newLast}`.trim(),
    }).eq('id', input.userId)
    if (input.firstName) changes.first_name = { old: profile?.first_name, new: newFirst }
    if (input.lastName)  changes.last_name  = { old: profile?.last_name,  new: newLast }
  }

  if (input.isActive !== undefined) {
    if (input.userId === currentUser.id) return { error: 'No puedes desactivarte a ti mismo' }
    await admin.from('profiles').update({
      is_active: input.isActive,
      status: input.isActive ? 'active' : 'inactive',
    }).eq('id', input.userId)
    await admin.auth.admin.updateUserById(input.userId, {
      ban_duration: input.isActive ? 'none' : '876000h',
    })
    changes.is_active = { old: !input.isActive, new: input.isActive }
  }

  if (input.roleId) {
    await admin.from('user_roles').delete().eq('user_id', input.userId)
    await admin.from('user_roles').insert({ user_id: input.userId, role_id: input.roleId })
    const { data: role } = await admin.from('roles').select('name').eq('id', input.roleId).single()
    changes.role = { old: '?', new: role?.name ?? input.roleId }
  }

  if (input.storeId) {
    await admin.from('user_stores').delete().eq('user_id', input.userId)
    await admin.from('user_stores').insert({ user_id: input.userId, store_id: input.storeId, is_primary: true })
  }

  let tempPassword: string | undefined
  if (input.resetPassword) {
    const rand = Math.floor(1000 + Math.random() * 9000)
    tempPassword = `Prats2026!${rand}`
    await admin.auth.admin.updateUserById(input.userId, { password: tempPassword })
    changes.password = { old: '***', new: '(reseteado)' }
  }

  await logAudit({
    userId: currentUser.id,
    userName: currentUser.email ?? 'Admin',
    action: 'update',
    entityType: 'user',
    entityId: input.userId,
    entityLabel: `Usuario ${input.userId}`,
    changes,
  })

    revalidatePath('/admin/configuracion')
    return { data: { tempPassword } }
  } catch (err) {
    console.error('[updateAdminUser]', err)
    return { error: err instanceof Error ? err.message : 'Error al actualizar usuario' }
  }
}

export async function listRoles(): Promise<{ data?: { id: string; name: string; display_name: string | null; color: string | null }[]; error?: string }> {
  try {
    const admin = createAdminClient()
    const { data, error } = await admin
      .from('roles')
      .select('id, name, display_name, color')
      .not('name', 'eq', 'client')
      .order('name')
    if (error) return { error: error.message }
    return { data: serializeForServerAction(data ?? []) }
  } catch (err) {
    console.error('[listRoles]', err)
    return { error: err instanceof Error ? err.message : 'Error al listar roles' }
  }
}

export async function listStores(): Promise<{ data?: { id: string; name: string }[]; error?: string }> {
  try {
    const admin = createAdminClient()
    const { data, error } = await admin.from('stores').select('id, name').eq('is_active', true).order('name')
    if (error) return { error: error.message }
    return { data: serializeForServerAction(data ?? []) }
  } catch (err) {
    console.error('[listStores]', err)
    return { error: err instanceof Error ? err.message : 'Error al listar tiendas' }
  }
}

export async function getAuditLogs(filters: {
  page?: number
  userId?: string
  entityType?: string
  action?: string
  dateFrom?: string
  dateTo?: string
} = {}): Promise<{ data?: { id: string; user_name: string; action: string; entity_type: string; entity_id: string | null; entity_label: string | null; changes: Record<string, unknown> | null; created_at: string }[]; count?: number; error?: string }> {
  try {
    const supabase = await createServerSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { error: 'No autenticado' }

    const admin = createAdminClient()
    const hasPerm = await checkUserPermission(user.id, 'audit.view')
    if (!hasPerm) return { error: 'Sin permisos' }

    const page  = filters.page ?? 1
    const limit = 50
    const from  = (page - 1) * limit

    // Excluir login y logout del seguimiento (not in)
    let q = admin
      .from('audit_logs')
      .select('id, user_id, user_full_name, user_email, action, module, entity_type, entity_id, entity_display, description, old_data, new_data, created_at', { count: 'exact' })
      .not('action', 'in', '(login,logout)')
      .order('created_at', { ascending: false })
      .range(from, from + limit - 1)

    if (filters.userId)     q = q.eq('user_id', filters.userId)
    if (filters.entityType) q = q.eq('entity_type', filters.entityType)
    if (filters.action)     q = q.eq('action', filters.action)
    if (filters.dateFrom)   q = q.gte('created_at', filters.dateFrom)
    if (filters.dateTo)     q = q.lte('created_at', filters.dateTo)

    const { data, count, error } = await q
    if (error) return { error: error.message }

    const rows = (data ?? []) as Array<{
      id: string
      user_id: string | null
      user_full_name: string | null
      user_email: string | null
      action: string
      module: string
      entity_type: string | null
      entity_id: string | null
      entity_display: string | null
      description: string | null
      old_data: Record<string, unknown> | null
      new_data: Record<string, unknown> | null
      created_at: string
    }>

    const list = rows.map((row) => {
      let changes: Record<string, unknown> | null = null
      if (row.old_data != null || row.new_data != null) {
        const oldData = row.old_data ?? {}
        const newData = row.new_data ?? {}
        const keys = new Set([...Object.keys(oldData), ...Object.keys(newData)])
        changes = {}
        for (const k of keys) {
          (changes as Record<string, unknown>)[k] = { old: (oldData as Record<string, unknown>)[k], new: (newData as Record<string, unknown>)[k] }
        }
      }
      const entityLabel = row.entity_display ?? null
      const needsResolution = !entityLabel || /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(entityLabel).trim())
      return {
        id: row.id,
        user_name: row.user_full_name ?? row.user_email ?? 'Sistema',
        action: row.action,
        entity_type: row.entity_type ?? row.module ?? '—',
        entity_id: row.entity_id,
        entity_label: entityLabel,
        _resolve: needsResolution && row.entity_id ? { entity_type: row.entity_type ?? row.module, action: row.action, entity_id: row.entity_id } : null,
        changes,
        created_at: row.created_at,
      }
    })

    // Resolver descripciones legibles cuando entity_display es UUID o vacío
    const toResolve = list.filter((r): r is typeof r & { _resolve: { entity_type: string; action: string; entity_id: string } } => r._resolve != null)
    if (toResolve.length > 0) {
      const byKey = new Map<string, string[]>()
      for (const r of toResolve) {
        const t = r._resolve.entity_type ?? ''
        const a = r._resolve.action ?? ''
        const key = `${t}\n${a}`
        if (!byKey.has(key)) byKey.set(key, [])
        byKey.get(key)!.push(r._resolve.entity_id)
      }
      const labels = new Map<string, string>()
      for (const [key, ids] of byKey) {
        const [entityType, action] = key.split('\n')
        const uniqueIds = [...new Set(ids)]
        if (entityType === 'client') {
          const { data: clients } = await admin.from('clients').select('id, full_name, first_name, last_name').in('id', uniqueIds)
          for (const c of clients ?? []) {
            const name = (c as any).full_name || [ (c as any).first_name, (c as any).last_name ].filter(Boolean).join(' ') || 'Sin nombre'
            labels.set((c as any).id, `Cliente: ${name}`)
          }
        } else if (entityType === 'client_measurements') {
          const { data: rows } = await admin.from('client_measurements').select('id, client_id').in('id', uniqueIds)
          const clientIds = [...new Set((rows ?? []).map((r: any) => r.client_id).filter(Boolean))]
          const { data: clients } = clientIds.length > 0 ? await admin.from('clients').select('id, full_name, first_name, last_name').in('id', clientIds) : { data: [] }
          const nameByClientId = new Map<string, string>()
          for (const c of clients ?? []) {
            const name = (c as any).full_name || [ (c as any).first_name, (c as any).last_name ].filter(Boolean).join(' ') || 'Sin nombre'
            nameByClientId.set((c as any).id, name)
          }
          for (const r of rows ?? []) {
            const name = nameByClientId.get((r as any).client_id) ?? 'Cliente'
            labels.set((r as any).id, `Medidas: ${name}`)
          }
        } else if (entityType === 'tailoring_order' || (entityType === 'orders' && action !== 'payment')) {
          const { data: orders } = await admin.from('tailoring_orders').select('id, order_number').in('id', uniqueIds)
          for (const o of orders ?? []) {
            labels.set((o as any).id, `Pedido: ${(o as any).order_number}`)
          }
        } else if (entityType === 'orders' && action === 'payment') {
          const { data: pays } = await admin.from('tailoring_order_payments').select('id, tailoring_order_id').in('id', uniqueIds)
          const orderIds = [...new Set((pays ?? []).map((p: any) => p.tailoring_order_id).filter(Boolean))]
          const { data: orders } = orderIds.length > 0 ? await admin.from('tailoring_orders').select('id, order_number').in('id', orderIds) : { data: [] }
          const orderById = new Map<string, string>()
          for (const o of orders ?? []) orderById.set((o as any).id, (o as any).order_number)
          for (const p of pays ?? []) {
            const num = orderById.get((p as any).tailoring_order_id)
            if (num != null) labels.set((p as any).id, `Pago pedido: ${num}`)
          }
        } else if (entityType === 'product') {
          const { data: products } = await admin.from('products').select('id, name').in('id', uniqueIds)
          for (const p of products ?? []) {
            labels.set((p as any).id, `Producto: ${(p as any).name}`)
          }
        } else if (entityType === 'product_variant') {
          const { data: variants } = await admin.from('product_variants').select('id, product_id').in('id', uniqueIds)
          const productIds = [...new Set((variants ?? []).map((v: any) => v.product_id).filter(Boolean))]
          const { data: products } = productIds.length > 0 ? await admin.from('products').select('id, name').in('id', productIds) : { data: [] }
          const nameByProductId = new Map<string, string>()
          for (const p of products ?? []) nameByProductId.set((p as any).id, (p as any).name)
          for (const v of variants ?? []) {
            const name = nameByProductId.get((v as any).product_id) ?? 'Variante'
            labels.set((v as any).id, `Variante: ${name}`)
          }
        } else if (entityType === 'stock') {
          const { data: movements } = await admin.from('stock_movements').select('id, product_variant_id').in('id', uniqueIds)
          const variantIds = [...new Set((movements ?? []).map((m: any) => m.product_variant_id).filter(Boolean))]
          const { data: variants } = variantIds.length > 0 ? await admin.from('product_variants').select('id, product_id').in('id', variantIds) : { data: [] }
          const productIds = [...new Set((variants ?? []).map((v: any) => v.product_id).filter(Boolean))]
          const { data: products } = productIds.length > 0 ? await admin.from('products').select('id, name').in('id', productIds) : { data: [] }
          const nameByProductId = new Map<string, string>()
          for (const p of products ?? []) nameByProductId.set((p as any).id, (p as any).name)
          const nameByVariantId = new Map<string, string>()
          for (const v of variants ?? []) nameByVariantId.set((v as any).id, nameByProductId.get((v as any).product_id) ?? 'Stock')
          for (const m of movements ?? []) {
            const name = nameByVariantId.get((m as any).product_variant_id) ?? 'Stock'
            labels.set((m as any).id, `Stock: ${name}`)
          }
        } else if (entityType === 'invoice') {
          const { data: invoices } = await admin.from('invoices').select('id, invoice_number, invoice_series').in('id', uniqueIds)
          for (const inv of invoices ?? []) {
            const n = (inv as any).invoice_series && (inv as any).invoice_number ? `${(inv as any).invoice_series}-${(inv as any).invoice_number}` : (inv as any).invoice_number
            labels.set((inv as any).id, `Factura: ${n}`)
          }
        } else if (entityType === 'appointment') {
          const { data: apps } = await admin.from('appointments').select('id, client_id').in('id', uniqueIds)
          const clientIds = [...new Set((apps ?? []).map((a: any) => a.client_id).filter(Boolean))]
          const { data: clients } = clientIds.length > 0 ? await admin.from('clients').select('id, full_name, first_name, last_name').in('id', clientIds) : { data: [] }
          const nameByClientId = new Map<string, string>()
          for (const c of clients ?? []) {
            const name = (c as any).full_name || [ (c as any).first_name, (c as any).last_name ].filter(Boolean).join(' ') || 'Sin nombre'
            nameByClientId.set((c as any).id, name)
          }
          for (const a of apps ?? []) {
            const name = nameByClientId.get((a as any).client_id) ?? 'Cita'
            labels.set((a as any).id, `Cita: ${name}`)
          }
        }
      }
      for (const item of list) {
        if (item._resolve && item.entity_id) {
          const resolved = labels.get(item.entity_id)
          if (resolved) item.entity_label = resolved
        }
        delete (item as any)._resolve
      }
    }

    return { data: serializeForServerAction(list), count: count ?? 0 }
  } catch (err) {
    console.error('[getAuditLogs]', err)
    return { error: err instanceof Error ? err.message : 'Error al cargar auditoría' }
  }
}
