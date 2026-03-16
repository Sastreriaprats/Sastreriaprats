import { redirect } from 'next/navigation'
import { unstable_cache } from 'next/cache'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { Toaster } from '@/components/ui/sonner'

export const dynamic = 'force-dynamic'

const VENDEDOR_ROLES = ['vendedor_avanzado']

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
    ['user-roles-vendedor', userId],
    { revalidate: 300 }
  )()
}

export default async function VendedorLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect('/auth/login')
  }

  const roleNames = await getUserRoles(user.id)

  if (!roleNames.some((n: string) => VENDEDOR_ROLES.includes(n))) {
    redirect('/auth/login')
  }

  return (
    <>
      {children}
      <Toaster richColors position="top-right" />
    </>
  )
}
