import { redirect } from 'next/navigation'
import { unstable_cache } from 'next/cache'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { AdminLayoutClient } from '@/components/layout/admin-layout-client'
import { Toaster } from '@/components/ui/sonner'

export const dynamic = 'force-dynamic'

const STAFF_ROLES = [
  'administrador', 'sastre_plus', 'vendedor_avanzado',
  'super_admin', 'admin', 'accountant', 'tailor', 'salesperson', 'web_manager', 'manager',
]

// Roles por usuario con caché por userId (5 min). La clave debe incluir userId para no mezclar roles entre usuarios.
function getUserRoles(userId: string): Promise<string[]> {
  return unstable_cache(
    async () => {
      const admin = createAdminClient()
      const { data } = await admin
        .from('user_roles')
        .select('roles(name)')
        .eq('user_id', userId)
      return (data ?? []).flatMap((ur: { roles?: { name: string } | { name: string }[] | null }) => {
        if (!ur.roles) return []
        if (Array.isArray(ur.roles)) return ur.roles.map(r => r.name)
        return [ur.roles.name]
      })
    },
    ['user-roles', userId],
    { revalidate: 300 }
  )()
}

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = await createServerSupabaseClient()

  // getUser verifica la sesión contra el servidor de Supabase (fiable, no usa caché local)
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect('/auth/login')
  }

  const roleNames = await getUserRoles(user.id)

  if (!roleNames.some((n: string) => STAFF_ROLES.includes(n))) {
    redirect('/mi-cuenta')
  }

  return (
    <>
      <AdminLayoutClient>{children}</AdminLayoutClient>
      <Toaster richColors position="top-right" />
    </>
  )
}
