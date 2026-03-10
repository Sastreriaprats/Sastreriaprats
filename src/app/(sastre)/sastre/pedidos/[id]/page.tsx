import { notFound } from 'next/navigation'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getOrder } from '@/actions/orders'
import { SastreLayoutWithSidebar } from '@/app/(sastre)/components/sastre-layout-with-sidebar'
import { SastreHeader } from '../../../components/sastre-header'
import { SastrePedidoDetailContent } from './sastre-pedido-detail-content'

export default async function SastrePedidoDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
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

  const result = await getOrder(id)
  if (!result.success || !result.data) notFound()
  const order = result.data

  return (
    <SastreLayoutWithSidebar sastreName={sastreName} isSastrePlus={isSastrePlus}>
      <div className="flex-1 flex flex-col min-h-screen">
        <SastreHeader
          sastreName={sastreName}
          sectionTitle={`Pedido ${order.order_number}`}
          backHref="/sastre/pedidos"
        />
        <main className="flex-1 p-6">
          <SastrePedidoDetailContent order={order} />
        </main>
      </div>
    </SastreLayoutWithSidebar>
  )
}
