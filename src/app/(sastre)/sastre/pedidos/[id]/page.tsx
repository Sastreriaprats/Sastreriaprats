import { notFound } from 'next/navigation'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getOrder } from '@/actions/orders'
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
  const { data: profile } = await admin
    .from('profiles')
    .select('full_name, first_name, last_name')
    .eq('id', user.id)
    .single()
  const sastreName = profile?.full_name || profile?.first_name || profile?.last_name || 'Sastre'

  const result = await getOrder(id)
  if (!result.success || !result.data) notFound()
  const order = result.data

  return (
    <div className="min-h-screen flex flex-col">
      <SastreHeader
        sastreName={sastreName}
        sectionTitle={`Pedido ${order.order_number}`}
        backHref="/sastre/pedidos"
      />
      <main className="flex-1 p-6">
        <SastrePedidoDetailContent order={order} />
      </main>
    </div>
  )
}
