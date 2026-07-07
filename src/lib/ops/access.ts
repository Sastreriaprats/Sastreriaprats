import 'server-only'
import { cache } from 'react'
import { notFound } from 'next/navigation'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getScopesForUser, type Scope } from './db'

// Resolución de acceso a las vistas internas. Gestiona = tener scope 'B'.
// Fail-closed: cualquier error -> sin acceso.

export type ViewerAccess = { userId: string | null; scopes: Scope[]; canManage: boolean }

export const getViewerAccess = cache(async (): Promise<ViewerAccess> => {
  try {
    const supabase = await createServerSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { userId: null, scopes: [], canManage: false }
    const scopes = await getScopesForUser(user.id)
    return { userId: user.id, scopes, canManage: scopes.includes('B') }
  } catch {
    return { userId: null, scopes: [], canManage: false }
  }
})

const STAFF_ROLES = [
  'administrador', 'sastre_plus', 'vendedor_avanzado', 'vendedor_basico',
  'super_admin', 'admin', 'accountant', 'tailor', 'salesperson', 'web_manager', 'manager',
]

/**
 * ¿El viewer tiene además algún rol de staff del ERP? Para usuarios solo-Tesorería
 * (asesor externo) se oculta cualquier salida hacia el admin.
 */
export const viewerIsStaff = cache(async (): Promise<boolean> => {
  try {
    const a = await getViewerAccess()
    if (!a.userId) return false
    const admin = createAdminClient()
    const { data } = await admin
      .from('user_roles')
      .select('roles(name)')
      .eq('user_id', a.userId)
    const names = (data ?? []).flatMap((ur: { roles?: { name: string } | { name: string }[] | null }) => {
      if (!ur.roles) return []
      return Array.isArray(ur.roles) ? ur.roles.map(r => r.name) : [ur.roles.name]
    })
    return names.some(n => STAFF_ROLES.includes(n))
  } catch {
    return false
  }
})

export async function hasScope(scope: Scope): Promise<boolean> {
  const a = await getViewerAccess()
  return a.scopes.includes(scope)
}

/**
 * Para páginas y layouts (RSC): si el viewer no tiene la capa, 404 real
 * (invisibilidad total, NO 403). Devuelve el acceso si lo tiene.
 */
export async function requireScopeOr404(scope: Scope): Promise<ViewerAccess> {
  const a = await getViewerAccess()
  if (!a.scopes.includes(scope)) notFound()
  return a
}

/**
 * Para server actions: lanza un error genérico (sin delatar la existencia del
 * módulo) si no tiene la capa. El llamador traduce a un fallo neutro.
 */
export async function assertScope(scope: Scope): Promise<ViewerAccess> {
  const a = await getViewerAccess()
  if (!a.scopes.includes(scope)) throw new Error('not_found')
  return a
}

export async function assertCanManage(): Promise<ViewerAccess> {
  const a = await getViewerAccess()
  if (!a.canManage) throw new Error('not_found')
  return a
}

/** Para páginas: 404 si no puede gestionar accesos. */
export async function requireManageOr404(): Promise<ViewerAccess> {
  const a = await getViewerAccess()
  if (!a.canManage) notFound()
  return a
}
