import { createServerSupabaseClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { OrdersListContent } from './orders-list-content'

export default async function OrdersPage() {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const admin = createAdminClient()
  const { data: client } = await admin
    .from('clients')
    .select('id')
    .eq('profile_id', user.id)
    .single()

  const { data: onlineOrders } = await admin
    .from('online_orders')
    .select('id, order_number, status, total, shipping_cost, created_at, paid_at, shipped_at, shipping_tracking_number')
    .eq('client_id', client?.id)
    .order('created_at', { ascending: false })

  const { data: tailoringOrders } = await admin
    .from('tailoring_orders')
    .select('id, order_number, status, total, order_type, estimated_delivery_date, order_date, created_at')
    .eq('client_id', client?.id)
    .order('created_at', { ascending: false })

  return (
    <OrdersListContent
      onlineOrders={onlineOrders || []}
      tailoringOrders={tailoringOrders || []}
    />
  )
}
