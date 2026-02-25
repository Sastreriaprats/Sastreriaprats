import { redirect } from 'next/navigation'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { Toaster } from '@/components/ui/sonner'

export const dynamic = 'force-dynamic'

const SASTRE_ROLES = ['sastre', 'sastre_plus']

async function getUserRoles(userId: string): Promise<string[]> {
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
}

export default async function SastreLayout({
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
  if (!roleNames.some((n: string) => SASTRE_ROLES.includes(n))) {
    redirect('/auth/login')
  }

  return (
    <div className="min-h-screen bg-[#1a2744] text-white font-sans antialiased">
      {children}
      <Toaster richColors position="top-center" />
    </div>
  )
}
