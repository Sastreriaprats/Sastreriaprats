import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

const STAFF_ROLES = [
  'administrador', 'sastre', 'sastre_plus', 'vendedor_basico', 'vendedor_avanzado',
  'super_admin', 'admin', 'accountant', 'tailor', 'salesperson', 'web_manager', 'manager',
]

export async function GET() {
  try {
    const supabase = await createServerSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ isStaff: false, isAuthenticated: false })
    }

    const admin = createAdminClient()
    const { data: userRoles } = await admin
      .from('user_roles')
      .select('roles(name)')
      .eq('user_id', user.id)

    const roleNames: string[] = []
    for (const ur of userRoles ?? []) {
      const r = ur.roles
      if (!r) continue
      if (Array.isArray(r)) roleNames.push(...r.map((x: { name: string }) => x.name))
      else roleNames.push((r as { name: string }).name)
    }

    const isStaff = roleNames.some(n => STAFF_ROLES.includes(n))

    return NextResponse.json({ isStaff, isAuthenticated: true, roles: roleNames })
  } catch (e) {
    console.error('[api/auth/me]', e)
    return NextResponse.json({ isStaff: false, isAuthenticated: false })
  }
}
