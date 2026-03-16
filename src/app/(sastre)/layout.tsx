import { redirect } from 'next/navigation'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { Toaster } from '@/components/ui/sonner'
import { SastreSessionGate } from '@/app/(sastre)/components/sastre-session-gate'

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
  const [rolesRes, storesRes] = await Promise.all([
    admin.from('user_roles').select('roles(name)').eq('user_id', user.id),
    admin.from('stores').select('id, name').eq('is_active', true).neq('store_type', 'online').order('name'),
  ])

  const roleNames = (rolesRes.data ?? []).flatMap((ur: { roles?: { name: string } | { name: string }[] | null }) => {
    if (!ur.roles) return []
    if (Array.isArray(ur.roles)) return ur.roles.map(r => r.name)
    return [ur.roles.name]
  })

  if (!roleNames.some((n: string) => SASTRE_ROLES.includes(n))) {
    redirect('/auth/login')
  }

  const stores = (storesRes.data ?? []).map((s: { id: string; name: string }) => ({
    storeId: s.id,
    storeName: s.name ?? s.id,
  }))

  return (
    <div className="min-h-screen bg-[#1a2744] text-white font-sans antialiased">
      <SastreSessionGate stores={stores}>
        {children}
      </SastreSessionGate>
      <Toaster richColors position="top-center" />
    </div>
  )
}
