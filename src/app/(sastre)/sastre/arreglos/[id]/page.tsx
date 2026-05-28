import { notFound } from 'next/navigation'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getAlteration } from '@/actions/alterations'
import { SastreLayoutWithSidebar } from '@/app/(sastre)/components/sastre-layout-with-sidebar'
import { SastreHeader } from '../../../components/sastre-header'
import { AlterationDetailContent } from '@/app/(admin)/admin/arreglos/[id]/alteration-detail-content'

export const metadata = { title: 'Detalle de arreglo · Sastre' }

export default async function SastreAlterationDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
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

  const res = await getAlteration({ id })
  if (!res.success || !res.data) notFound()
  const alteration = res.data

  return (
    <SastreLayoutWithSidebar sastreName={sastreName} isSastrePlus={isSastrePlus}>
      <div
        className="flex-1 flex flex-col min-h-screen"
        style={{ background: 'radial-gradient(ellipse at top, #1a2744 0%, #0a1020 70%)' }}
      >
        <SastreHeader
          sastreName={sastreName}
          sectionTitle={alteration.alteration_number}
          backHref={alteration.client_id ? `/sastre/clientes/${alteration.client_id}?tab=arreglos` : '/sastre/arreglos'}
        />
        <main className="flex-1 p-6">
          <AlterationDetailContent alteration={alteration} basePath="/sastre" />
        </main>

        <footer className="py-6 text-center shrink-0">
          <p className="text-xs text-white/20 tracking-widest">
            SASTRERÍA PRATS · PANEL DE GESTIÓN · 2026
          </p>
        </footer>
      </div>
    </SastreLayoutWithSidebar>
  )
}
