'use server'

import { createServerSupabaseClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import type { UserWithRoles } from '@/lib/types/auth'

// ==========================================
// HELPER: consulta directa de permiso (sin RPC)
// ==========================================
export async function checkUserPermission(userId: string, permissionCode: string): Promise<boolean> {
  const admin = createAdminClient()
  const { data: userRoles } = await admin
    .from('user_roles')
    .select('role_id')
    .eq('user_id', userId)

  if (!userRoles || userRoles.length === 0) return false
  const roleIds = userRoles.map(ur => ur.role_id)

  const { data: perms } = await admin
    .from('role_permissions')
    .select('permissions!inner(code)')
    .in('role_id', roleIds)
    .eq('permissions.code', permissionCode)
    .limit(1)

  return (perms?.length ?? 0) > 0
}

/** Comprueba si el usuario tiene al menos uno de los permisos indicados. */
export async function checkUserAnyPermission(userId: string, permissionCodes: string[]): Promise<boolean> {
  if (permissionCodes.length === 0) return false
  for (const code of permissionCodes) {
    if (await checkUserPermission(userId, code)) return true
  }
  return false
}

// ==========================================
// SCHEMAS DE VALIDACIÓN
// ==========================================

const loginSchema = z.object({
  email: z.string().email('Email inválido'),
  password: z.string().min(6, 'Mínimo 6 caracteres'),
})

const registerSchema = z.object({
  email: z.string().email('Email inválido'),
  password: z.string().min(8, 'Mínimo 8 caracteres'),
  fullName: z.string().min(2, 'Nombre requerido'),
  firstName: z.string().min(1, 'Nombre requerido'),
  lastName: z.string().min(1, 'Apellido requerido'),
  phone: z.string().optional(),
})

const pinLoginSchema = z.object({
  pin: z.string().length(4, 'PIN debe ser de 4 dígitos'),
  storeId: z.string().uuid('Tienda inválida'),
})

const createUserSchema = z.object({
  email: z.string().email('Email inválido'),
  password: z.string().min(8, 'Mínimo 8 caracteres'),
  fullName: z.string().min(2, 'Nombre requerido'),
  firstName: z.string().optional(),
  lastName: z.string().optional(),
  phone: z.string().optional(),
  roleIds: z.array(z.string().uuid()).min(1, 'Al menos un rol requerido'),
  storeIds: z.array(z.string().uuid()).min(1, 'Al menos una tienda requerida'),
  primaryStoreId: z.string().uuid('Tienda principal requerida'),
  pin: z.string().length(4).optional(),
})

// ==========================================
// LOGIN (email + contraseña)
// ==========================================

export async function loginAction(formData: FormData) {
  const supabase = await createServerSupabaseClient()

  const parsed = loginSchema.safeParse({
    email: formData.get('email'),
    password: formData.get('password'),
  })

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Datos inválidos' }
  }

  const { email, password } = parsed.data

  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  })

  if (error) {
    return { error: 'Credenciales incorrectas' }
  }

  const adminClient = createAdminClient()
  await adminClient
    .from('profiles')
    .update({ last_login_at: new Date().toISOString() })
    .eq('id', data.user.id)

  await adminClient.rpc('log_audit', {
    p_user_id: data.user.id,
    p_action: 'login',
    p_module: 'auth',
    p_description: 'Login desde web',
  })

  const redirectTo = (formData.get('redirectTo') as string) || '/admin/dashboard'
  redirect(redirectTo)
}

// ==========================================
// LOGOUT
// ==========================================

export async function logoutAction() {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (user) {
    const adminClient = createAdminClient()
    await adminClient.rpc('log_audit', {
      p_user_id: user.id,
      p_action: 'logout',
      p_module: 'auth',
      p_description: 'Logout',
    })
  }

  await supabase.auth.signOut()
  redirect('/auth/login')
}

/** Cierre de sesión desde el área de cliente: redirige a la home. */
export async function logoutClientAction() {
  const supabase = await createServerSupabaseClient()
  await supabase.auth.signOut()
  redirect('/')
}

// ==========================================
// REGISTRO (clientes web)
// ==========================================

export async function registerClientAction(formData: FormData) {
  const supabase = await createServerSupabaseClient()

  const parsed = registerSchema.safeParse({
    email: formData.get('email'),
    password: formData.get('password'),
    fullName: formData.get('fullName'),
    firstName: formData.get('firstName'),
    lastName: formData.get('lastName'),
    phone: formData.get('phone'),
  })

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Datos inválidos' }
  }

  const { email, password, fullName, firstName, lastName, phone } = parsed.data

  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: {
        full_name: fullName,
        first_name: firstName,
        last_name: lastName,
      },
    },
  })

  if (error) {
    if (error.message.includes('already registered') || error.message.includes('already exists')) {
      return { error: 'Este email ya está registrado. Prueba a iniciar sesión o usa “¿Olvidaste la contraseña?”.' }
    }
    return { error: error.message || 'Error al crear la cuenta' }
  }

  if (data.user) {
    const adminClient = createAdminClient()

    try {
      // Solo para clientes web: marcar email como confirmado para que puedan entrar y reservar sin confirmar por correo
      const { error: confirmErr } = await adminClient.auth.admin.updateUserById(data.user.id, { email_confirm: true })
      if (confirmErr) {
        console.error('[registerClient] email_confirm:', confirmErr)
        // No bloqueamos el registro; el usuario ya existe, solo no podrá entrar hasta confirmar
      }

      const { data: clientRole } = await adminClient
        .from('roles')
        .select('id')
        .eq('name', 'client')
        .single()

      if (clientRole) {
        const { error: roleErr } = await adminClient.from('user_roles').insert({
          user_id: data.user.id,
          role_id: clientRole.id,
        })
        if (roleErr) {
          console.error('[registerClient] user_roles insert:', roleErr)
        }
      }

      const { error: clientErr } = await adminClient.from('clients').insert({
        profile_id: data.user.id,
        first_name: firstName,
        last_name: lastName,
        email,
        phone: phone || null,
        source: 'web',
      })

      if (clientErr) {
        if (clientErr.code === '23505') {
          return { error: 'Este email ya está asociado a un cliente. Prueba a iniciar sesión.' }
        }
        if (clientErr.code === '23503') {
          return { error: 'No se pudo crear el perfil. Contacta con info@sastreriaprats.com' }
        }
        console.error('[registerClient] clients insert:', clientErr)
        return { error: 'Error al crear el perfil de cliente. Inténtalo de nuevo o contacta con nosotros.' }
      }
    } catch (err) {
      console.error('[registerClient]', err)
      return { error: 'Error inesperado al completar el registro. Inténtalo de nuevo.' }
    }
  }

  return { success: true }
}

// ==========================================
// PIN LOGIN (TPV — stub hasta tener verify_pin en DB)
// ==========================================

export async function pinLoginAction(formData: FormData) {
  const parsed = pinLoginSchema.safeParse({
    pin: formData.get('pin'),
    storeId: formData.get('storeId'),
  })

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Datos inválidos' }
  }

  return { error: 'Acceso por PIN no disponible. Use email y contraseña.' }
}

// ==========================================
// CREAR USUARIO (admin panel)
// ==========================================

export async function createUserAction(data: z.infer<typeof createUserSchema>) {
  const supabase = await createServerSupabaseClient()
  const { data: { user: currentUser } } = await supabase.auth.getUser()

  if (!currentUser) {
    return { error: 'No autenticado' }
  }

  const adminClient = createAdminClient()
  const hasPerm = await checkUserPermission(currentUser.id, 'config.users')

  if (!hasPerm) {
    return { error: 'Sin permisos para crear usuarios' }
  }

  const parsed = createUserSchema.safeParse(data)
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Datos inválidos' }
  }

  const {
    email,
    password,
    fullName,
    firstName,
    lastName,
    phone,
    roleIds,
    storeIds,
    primaryStoreId,
    pin,
  } = parsed.data

  const { data: newUser, error: createError } = await adminClient.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: {
      full_name: fullName,
      first_name: firstName ?? fullName.split(' ')[0],
      last_name: lastName ?? fullName.split(' ').slice(1).join(' '),
    },
  })

  if (createError) {
    return { error: `Error al crear usuario: ${createError.message}` }
  }

  if (!newUser.user) {
    return { error: 'Error inesperado al crear usuario' }
  }

  const newUserId = newUser.user.id

  const pinHash = pin ? await hashPin(pin) : null
  await adminClient
    .from('profiles')
    .update({
      phone: phone || null,
      first_name: firstName ?? fullName.split(' ')[0],
      last_name: lastName ?? fullName.split(' ').slice(1).join(' '),
      pin_hash: pinHash,
    })
    .eq('id', newUserId)

  for (const roleId of roleIds) {
    await adminClient.from('user_roles').insert({
      user_id: newUserId,
      role_id: roleId,
      assigned_by: currentUser.id,
    })
  }

  for (const storeId of storeIds) {
    await adminClient.from('user_stores').insert({
      user_id: newUserId,
      store_id: storeId,
      is_primary: storeId === primaryStoreId,
      assigned_by: currentUser.id,
    })
  }

  await adminClient.rpc('log_audit', {
    p_user_id: currentUser.id,
    p_action: 'create',
    p_module: 'config',
    p_entity_type: 'user',
    p_entity_id: newUserId,
    p_entity_display: `Usuario: ${fullName}`,
    p_description: `Creado usuario ${fullName} (${email})`,
  })

  revalidatePath('/admin/configuracion')
  return { success: true, userId: newUserId }
}

// ==========================================
// DESACTIVAR / ACTIVAR USUARIO
// ==========================================

export async function toggleUserActiveAction(userId: string, isActive: boolean) {
  const supabase = await createServerSupabaseClient()
  const { data: { user: currentUser } } = await supabase.auth.getUser()

  if (!currentUser) return { error: 'No autenticado' }

  const adminClient = createAdminClient()
  const hasPerm = await checkUserPermission(currentUser.id, 'config.users')

  if (!hasPerm) return { error: 'Sin permisos' }

  if (userId === currentUser.id) {
    return { error: 'No puedes desactivarte a ti mismo' }
  }

  await adminClient
    .from('profiles')
    .update({
      is_active: isActive,
      status: isActive ? 'active' : 'inactive',
      deactivated_at: isActive ? null : new Date().toISOString(),
    })
    .eq('id', userId)

  if (!isActive) {
    await adminClient.auth.admin.updateUserById(userId, { ban_duration: '876000h' })
  } else {
    await adminClient.auth.admin.updateUserById(userId, { ban_duration: 'none' })
  }

  await adminClient.rpc('log_audit', {
    p_user_id: currentUser.id,
    p_action: 'update',
    p_module: 'config',
    p_entity_type: 'user',
    p_entity_id: userId,
    p_description: isActive ? 'Usuario reactivado' : 'Usuario desactivado',
  })

  revalidatePath('/admin/configuracion')
  return { success: true }
}

// ==========================================
// HELPER: Hash PIN (simple; en producción usar bcrypt)
// ==========================================

async function hashPin(pin: string): Promise<string> {
  const salt = process.env.SUPABASE_SERVICE_ROLE_KEY?.slice(0, 16) ?? 'prats-pin-salt'
  const encoder = new TextEncoder()
  const data = encoder.encode(pin + salt)
  const hashBuffer = await crypto.subtle.digest('SHA-256', data)
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('')
}

// ==========================================
// SERVER-SIDE PERMISSION CHECK HELPER
// ==========================================

export async function requirePermission(permissionCode: string) {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect('/auth/login')
  }

  // Consulta directa con admin client (salta RLS, sin depender de RPC)
  const admin = createAdminClient()
  const { data: match } = await admin
    .from('user_roles')
    .select('role_id, roles!inner(role_permissions!inner(permissions!inner(code)))')
    .eq('user_id', user.id)
    .limit(100)

  // Extraer todos los códigos de permiso del usuario
  const codes = new Set<string>()
  for (const ur of match ?? []) {
    const roles = ur.roles as unknown as { role_permissions: { permissions: { code: string } }[] }
    if (roles?.role_permissions) {
      for (const rp of roles.role_permissions) {
        if (rp.permissions?.code) codes.add(rp.permissions.code)
      }
    }
  }

  if (!codes.has(permissionCode)) {
    redirect('/admin/sin-permisos')
  }

  return user
}

// ==========================================
// COMPROBAR SI USUARIO ES STAFF (admin/panel)
// ==========================================

const STAFF_ROLES = ['administrador', 'sastre', 'sastre_plus', 'vendedor_basico', 'vendedor_avanzado',
  // legacy (por si hay usuarios migrados)
  'super_admin', 'admin', 'accountant', 'tailor', 'salesperson', 'web_manager']

export async function isStaffUser(): Promise<boolean> {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return false
  const profile = await getServerProfile(user.id)
  if (!profile) return false
  return profile.roles.some((r) => STAFF_ROLES.includes(r.roleName))
}

// ==========================================
// OBTENER PERFIL EN SERVIDOR
// ==========================================

export async function getServerProfile(userId: string): Promise<UserWithRoles | null> {
  const adminClient = createAdminClient()

  const { data: profile, error: profileError } = await adminClient
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .single()

  if (profileError || !profile) return null

  const { data: rolesData } = await adminClient
    .from('user_roles')
    .select('roles(id, name, display_name, color, icon)')
    .eq('user_id', userId)

  const rolesRaw = (rolesData ?? []) as { roles?: { id: string; name: string; display_name: string | null; color: string | null; icon: string | null } | { id: string; name: string; display_name: string | null; color: string | null; icon: string | null }[] | null }[]
  const roles = rolesRaw.map((ur) => {
    const r = Array.isArray(ur.roles) ? ur.roles[0] : ur.roles
    return {
      roleId: r?.id ?? '',
      roleName: r?.name ?? '',
      displayName: r?.display_name ?? null,
      color: r?.color ?? null,
      icon: r?.icon ?? null,
    }
  })

  const roleIds = roles.map(r => r.roleId).filter(Boolean)
  const { data: rpData } = await adminClient
    .from('role_permissions')
    .select('permissions(code)')
    .in('role_id', roleIds.length > 0 ? roleIds : ['__none__'])

  const permissionCodes = [...new Set(
    (rpData ?? []).flatMap((rp: { permissions?: { code: string } | { code: string }[] | null }) => {
      if (!rp.permissions) return []
      if (Array.isArray(rp.permissions)) return rp.permissions.map(p => p.code)
      return [(rp.permissions as { code: string }).code]
    })
  )]

  const { data: storesData } = await adminClient
    .from('user_stores')
    .select('stores(name)')
    .eq('user_id', userId)

  const storesRaw = (storesData ?? []) as { stores?: { name: string } | { name: string }[] | null }[]
  const stores = storesRaw.map((us) => {
    const s = Array.isArray(us.stores) ? us.stores[0] : us.stores
    return s?.name ?? ''
  })

  return {
    id: profile.id,
    email: profile.email,
    fullName: profile.full_name ?? '',
    firstName: profile.first_name ?? null,
    lastName: profile.last_name ?? null,
    avatarUrl: profile.avatar_url ?? null,
    phone: profile.phone ?? null,
    preferredLocale: profile.preferred_locale ?? null,
    darkMode: profile.dark_mode ?? null,
    isActive: profile.is_active ?? true,
    status: profile.status ?? 'active',
    lastLoginAt: profile.last_login_at ?? null,
    createdAt: profile.created_at,
    updatedAt: profile.updated_at,
    roles,
    stores,
    permissions: permissionCodes,
  }
}
