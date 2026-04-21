import { redirect } from 'next/navigation'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

// Roles que tienen acceso al panel de administración
const STAFF_ROLES = [
  // Roles v2 (nuevos)
  'administrador', 'sastre_plus', 'vendedor_avanzado', 'vendedor_basico',
  // Roles legacy (por compatibilidad)
  'super_admin', 'admin', 'accountant', 'tailor', 'salesperson', 'web_manager', 'manager',
]
const SASTRE_ROLES = ['sastre_plus']
const VENDEDOR_ROLES = ['vendedor_avanzado', 'vendedor_basico']

export default async function AuthRedirectPage({
  searchParams,
}: {
  searchParams: Promise<{ to?: string }>
}) {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  const params = await searchParams
  const to = params.to || '/'

  if (!user) {
    redirect('/auth/login')
  }

  // Consulta simple y directa: obtener los nombres de roles del usuario
  const admin = createAdminClient()
  const { data: userRoles } = await admin
    .from('user_roles')
    .select('roles(name)')
    .eq('user_id', user.id)

  const roleNames = (userRoles ?? []).flatMap((ur: { roles?: { name: string } | { name: string }[] | null }) => {
    if (!ur.roles) return []
    if (Array.isArray(ur.roles)) return ur.roles.map(r => r.name)
    return [ur.roles.name]
  })

  const isStaff = roleNames.some(name => STAFF_ROLES.includes(name))
  const isSastre = roleNames.some(name => SASTRE_ROLES.includes(name))
  const isVendedor = roleNames.some(name => VENDEDOR_ROLES.includes(name))

  const staffHome = isSastre ? '/sastre' : isVendedor ? '/vendedor' : '/admin/dashboard'

  // Si es staff y va a /mi-cuenta, redirigir al panel correspondiente
  if (isStaff && (to === '/mi-cuenta' || to.startsWith('/mi-cuenta'))) {
    redirect(staffHome)
  }

  // Si es staff sin destino específico, ir a su panel
  if (isStaff && to === '/') {
    redirect(staffHome)
  }

  redirect(to)
}
