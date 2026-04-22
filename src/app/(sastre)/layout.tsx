import { redirect } from 'next/navigation'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { Toaster } from '@/components/ui/sonner'
import { SastreSessionGate } from '@/app/(sastre)/components/sastre-session-gate'
import { StoreGate } from '@/components/store-gate'

export const dynamic = 'force-dynamic'

const SASTRE_ROLES = ['sastre_plus']

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

  const admin = createAdminClient()
  const { data: rolesRes } = await admin
    .from('user_roles')
    .select('roles(name)')
    .eq('user_id', user.id)

  const roleNames = (rolesRes ?? []).flatMap((ur: { roles?: { name: string } | { name: string }[] | null }) => {
    if (!ur.roles) return []
    if (Array.isArray(ur.roles)) return ur.roles.map(r => r.name)
    return [ur.roles.name]
  })

  if (!roleNames.some((n: string) => SASTRE_ROLES.includes(n))) {
    redirect('/auth/login')
  }

  return (
    <div className="min-h-screen bg-[#1a2744] text-white font-sans antialiased">
      <StoreGate theme="dark">
        <SastreSessionGate>
          {children}
        </SastreSessionGate>
      </StoreGate>
      <Toaster richColors position="top-center" />
    </div>
  )
}
