'use server'

import { createAdminClient } from '@/lib/supabase/admin'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { logAudit } from '@/lib/audit'
import { checkUserPermission } from '@/actions/auth'

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
    return { data: result }
  }

  const rows = (data || []) as { id: string; email: string; full_name: string | null; first_name?: string | null; last_name?: string | null; is_active: boolean; status: string; last_login_at: string | null; created_at: string; roles: unknown }[]
  const normalized: UserRow[] = rows
    .map(row => ({ ...row, roles: normalizeRoles(row.roles) }))
    .filter(row => !isClientUser(row.roles)) as UserRow[]
  return { data: normalized }
}

export interface CreateUserInput {
  email: string
  firstName: string
  lastName: string
  roleId: string
  storeId: string
}

export async function createAdminUser(input: CreateUserInput): Promise<{ data?: { userId: string; tempPassword: string }; error?: string }> {
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
}

export async function listRoles(): Promise<{ data?: { id: string; name: string; display_name: string | null; color: string | null }[]; error?: string }> {
  const admin = createAdminClient()
  const { data, error } = await admin
    .from('roles')
    .select('id, name, display_name, color')
    .not('name', 'eq', 'client')
    .order('name')
  if (error) return { error: error.message }
  return { data: data ?? [] }
}

export async function listStores(): Promise<{ data?: { id: string; name: string }[]; error?: string }> {
  const admin = createAdminClient()
  const { data, error } = await admin.from('stores').select('id, name').eq('is_active', true).order('name')
  if (error) return { error: error.message }
  return { data: data ?? [] }
}

export async function getAuditLogs(filters: {
  page?: number
  userId?: string
  entityType?: string
  action?: string
  dateFrom?: string
  dateTo?: string
} = {}): Promise<{ data?: { id: string; user_name: string; action: string; entity_type: string; entity_id: string | null; entity_label: string | null; changes: Record<string, unknown> | null; created_at: string }[]; count?: number; error?: string }> {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'No autenticado' }

  const admin = createAdminClient()
  const hasPerm = await checkUserPermission(user.id, 'audit.view')
  if (!hasPerm) return { error: 'Sin permisos' }

  const page  = filters.page ?? 1
  const limit = 50
  const from  = (page - 1) * limit

  let q = admin
    .from('audit_log')
    .select('id, user_name, action, entity_type, entity_id, entity_label, changes, created_at', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(from, from + limit - 1)

  if (filters.userId)     q = q.eq('user_id', filters.userId)
  if (filters.entityType) q = q.eq('entity_type', filters.entityType)
  if (filters.action)     q = q.eq('action', filters.action)
  if (filters.dateFrom)   q = q.gte('created_at', filters.dateFrom)
  if (filters.dateTo)     q = q.lte('created_at', filters.dateTo)

  const { data, count, error } = await q
  if (error) return { error: error.message }
  return { data: (data ?? []) as { id: string; user_name: string; action: string; entity_type: string; entity_id: string | null; entity_label: string | null; changes: Record<string, unknown> | null; created_at: string }[], count: count ?? 0 }
}
