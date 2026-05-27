import { createServerSupabaseClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { SastreLayoutWithSidebar } from '@/app/(sastre)/components/sastre-layout-with-sidebar'
import { OfficialDetailView } from '@/components/officials/official-detail-view'

export const metadata = { title: 'Detalle de oficial · Sastre' }

export default async function SastreOficialDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
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

  const { id } = await params

  return (
    <SastreLayoutWithSidebar sastreName={sastreName} isSastrePlus={isSastrePlus}>
      <div className="px-6 py-6">
        <OfficialDetailView officialId={id} basePath="/sastre" />
      </div>
    </SastreLayoutWithSidebar>
  )
}
