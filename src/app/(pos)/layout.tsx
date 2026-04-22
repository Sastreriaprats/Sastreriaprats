import { redirect } from 'next/navigation'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { getServerProfile } from '@/actions/auth'
import { AuthProvider } from '@/components/providers/auth-provider'
import { StoreGate } from '@/components/store-gate'

export default async function PosLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login?mode=pos')

  const profile = await getServerProfile(user.id)
  if (!profile) redirect('/auth/login?mode=pos')

  const posRoles = ['administrador', 'sastre_plus', 'vendedor_avanzado', 'vendedor_basico',
    'super_admin', 'admin', 'tailor', 'salesperson']
  const hasPosAccess = profile.roles.some((r: any) => posRoles.includes(r.roleName))
  if (!hasPosAccess) redirect('/admin/dashboard?error=no_pos_access')

  return (
    <AuthProvider>
      <StoreGate theme="dark">
        <div className="h-screen w-screen flex flex-col bg-gray-50">
          <div className="flex-1 min-h-0 overflow-auto">
            {children}
          </div>
        </div>
      </StoreGate>
    </AuthProvider>
  )
}
