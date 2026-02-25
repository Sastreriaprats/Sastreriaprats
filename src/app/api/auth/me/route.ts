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

    const { data: clientRow } = await admin
      .from('clients')
      .select(`
        id,
        first_name, last_name, email, phone,
        address, city, postal_code, province, country,
        shipping_address, shipping_city, shipping_postal_code, shipping_province, shipping_country
      `)
      .eq('profile_id', user.id)
      .maybeSingle()

    const clientProfile = clientRow ? {
      id: clientRow.id,
      first_name: clientRow.first_name,
      last_name: clientRow.last_name,
      email: clientRow.email ?? user.email,
      phone: clientRow.phone,
      address: clientRow.address,
      city: clientRow.city,
      postal_code: clientRow.postal_code,
      province: clientRow.province,
      country: clientRow.country ?? 'ES',
      shipping_address: clientRow.shipping_address,
      shipping_city: clientRow.shipping_city,
      shipping_postal_code: clientRow.shipping_postal_code,
      shipping_province: clientRow.shipping_province,
      shipping_country: clientRow.shipping_country,
    } : null

    return NextResponse.json({
      isStaff,
      isAuthenticated: true,
      roles: roleNames,
      clientId: clientRow?.id ?? null,
      clientProfile,
    })
  } catch (e) {
    console.error('[api/auth/me]', e)
    return NextResponse.json({ isStaff: false, isAuthenticated: false })
  }
}
