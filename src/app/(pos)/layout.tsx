import { redirect } from 'next/navigation'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { getServerProfile } from '@/actions/auth'
import { AuthProvider } from '@/components/providers/auth-provider'
import { Toaster } from '@/components/ui/sonner'

export default async function PosLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login?mode=pos')

  const profile = await getServerProfile(user.id)
  if (!profile) redirect('/auth/login?mode=pos')

  const posRoles = ['administrador', 'sastre_plus', 'vendedor_basico', 'vendedor_avanzado',
    'super_admin', 'admin', 'tailor', 'salesperson']
  const hasPosAccess = profile.roles.some((r: any) => posRoles.includes(r.roleName))
  if (!hasPosAccess) redirect('/admin/dashboard?error=no_pos_access')

  return (
    <AuthProvider>
      <div className="h-screen w-screen overflow-hidden bg-gray-50">
        {children}
      </div>
      <Toaster richColors position="top-center" />
    </AuthProvider>
  )
}
