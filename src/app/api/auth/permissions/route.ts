import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function GET() {
  try {
    const supabase = await createServerSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ permissions: [] })

    const admin = createAdminClient()

    // Roles del usuario
    const { data: userRoles } = await admin
      .from('user_roles')
      .select('roles(id, name, display_name, color, icon)')
      .eq('user_id', user.id)

    const roles = (userRoles ?? []).map((ur: { roles?: unknown }) => {
      const r = ur.roles as { id: string; name: string; display_name: string | null; color: string | null; icon: string | null } | null
      return r ? { roleId: r.id, roleName: r.name, displayName: r.display_name, color: r.color, icon: r.icon } : null
    }).filter(Boolean)

    // Permisos: consulta directa
    const { data: rpData } = await admin
      .from('role_permissions')
      .select('permissions(code)')
      .in('role_id', (roles as { roleId: string }[]).map(r => r.roleId))

    const permissions = [...new Set(
      (rpData ?? []).flatMap((rp: { permissions?: { code: string } | { code: string }[] | null }) => {
        if (!rp.permissions) return []
        if (Array.isArray(rp.permissions)) return rp.permissions.map(p => p.code)
        return [rp.permissions.code]
      })
    )]

    // Tiendas
    const { data: storesData } = await admin
      .from('user_stores')
      .select('store_id, is_primary, stores(id, name, code)')
      .eq('user_id', user.id)

    const stores = (storesData ?? []).map((us: { store_id: string; is_primary: boolean; stores?: unknown }) => {
      const s = us.stores as { id: string; name: string; code: string } | null
      return { storeId: us.store_id, storeName: s?.name ?? '', storeCode: s?.code ?? '', isPrimary: us.is_primary }
    })

    return NextResponse.json({ permissions, roles, stores })
  } catch (e) {
    console.error('[api/auth/permissions]', e)
    return NextResponse.json({ permissions: [], roles: [], stores: [] })
  }
}
