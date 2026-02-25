import { redirect } from 'next/navigation'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { ClientDashboard } from './client-dashboard'

export default async function ClientAccountPage() {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const admin = createAdminClient()
  const { data: client } = await admin
    .from('clients')
    .select('*')
    .eq('profile_id', user.id)
    .single()

  if (!client) {
    redirect('/auth/login?mode=client&redirectTo=/mi-cuenta')
  }

  const clientId = client.id

  const { data: recentOnline } = await admin
    .from('online_orders')
    .select('id, order_number, status, total, created_at, online_order_lines ( product_name, quantity )')
    .eq('client_id', clientId)
    .in('status', ['paid', 'processing', 'shipped', 'delivered'])
    .order('created_at', { ascending: false })
    .limit(3)

  const { count: onlineCount } = await admin
    .from('online_orders')
    .select('id', { count: 'exact', head: true })
    .eq('client_id', clientId)
    .in('status', ['paid', 'processing', 'shipped', 'delivered'])

  const { count: tailoringCount } = await admin
    .from('tailoring_orders')
    .select('id', { count: 'exact', head: true })
    .eq('client_id', clientId)
    .neq('status', 'cancelled')

  const { data: recentTailoring } = await admin
    .from('tailoring_orders')
    .select(`
      id, order_number, status, total, order_date, estimated_delivery_date,
      tailoring_order_lines ( garment_types ( name ), fabric_description, fabrics ( name, fabric_code ) )
    `)
    .eq('client_id', clientId)
    .neq('status', 'cancelled')
    .order('created_at', { ascending: false })
    .limit(3)

  return (
    <ClientDashboard
      client={client}
      recentOnline={recentOnline || []}
      recentTailoring={recentTailoring || []}
      onlineOrderCount={onlineCount ?? 0}
      tailoringOrderCount={tailoringCount ?? 0}
    />
  )
}
