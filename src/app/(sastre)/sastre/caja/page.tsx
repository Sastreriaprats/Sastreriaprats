import { createServerSupabaseClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { SastreLayoutWithSidebar } from '@/app/(sastre)/components/sastre-layout-with-sidebar'
import { SastreHeader } from '../../components/sastre-header'

export default async function SastreCajaPage() {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const admin = createAdminClient()
  const [profileRes, rolesRes] = await Promise.all([
    admin.from('profiles').select('full_name, first_name, last_name').eq('id', user.id).single(),
    admin.from('user_roles').select('roles(name)').eq('user_id', user.id),
  ])
  const profile = profileRes?.data
  const sastreName = profile?.full_name || profile?.first_name || profile?.last_name || 'Sastre'
  const roleNames: string[] = (rolesRes?.data ?? []).flatMap((ur: { roles?: { name: string } | { name: string }[] | null }) => {
    if (!ur?.roles) return []
    return Array.isArray(ur.roles) ? ur.roles.map((r: { name: string }) => r.name) : [ur.roles.name]
  })
  const isSastrePlus = roleNames.includes('sastre_plus')

  return (
    <SastreLayoutWithSidebar sastreName={sastreName} isSastrePlus={isSastrePlus}>
      <div className="flex-1 flex flex-col min-h-screen">
        <SastreHeader sastreName={sastreName} title="Caja" backHref="/sastre/nueva-venta" />
        <main className="flex-1 flex items-center justify-center p-6">
          <div className="rounded-2xl border border-[#c9a96e]/40 bg-white/5 p-12 max-w-md text-center">
            <p className="font-serif text-2xl text-[#c9a96e] mb-2">Caja</p>
            <p className="text-white/70">Módulo de caja próximamente.</p>
          </div>
        </main>
      </div>
    </SastreLayoutWithSidebar>
  )
}
