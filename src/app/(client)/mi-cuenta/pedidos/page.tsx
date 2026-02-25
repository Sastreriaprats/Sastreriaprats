import { redirect } from 'next/navigation'
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

  if (!client) {
    redirect('/auth/login?mode=client&redirectTo=/mi-cuenta/pedidos')
  }

  const clientId = client.id

  const { data: onlineOrders } = await admin
    .from('online_orders')
    .select('id, order_number, status, total, shipping_cost, created_at, paid_at, shipped_at, shipping_tracking_number, online_order_lines ( product_name, quantity )')
    .eq('client_id', clientId)
    .in('status', ['paid', 'processing', 'shipped', 'delivered'])
    .order('created_at', { ascending: false })

  const { data: tailoringOrders } = await admin
    .from('tailoring_orders')
    .select(`
      id, order_number, status, total, order_type, estimated_delivery_date, order_date, created_at,
      tailoring_order_lines (
        garment_types ( name ),
        fabric_description,
        fabrics ( name, fabric_code )
      )
    `)
    .eq('client_id', clientId)
    .neq('status', 'cancelled')
    .order('created_at', { ascending: false })

  return (
    <OrdersListContent
      onlineOrders={onlineOrders || []}
      tailoringOrders={tailoringOrders || []}
    />
  )
}
