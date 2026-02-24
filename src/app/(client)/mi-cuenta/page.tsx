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

  const { data: recentOnline } = await admin
    .from('online_orders')
    .select('id, order_number, status, total, created_at')
    .eq('client_id', client?.id)
    .order('created_at', { ascending: false })
    .limit(3)

  const { data: recentTailoring } = await admin
    .from('tailoring_orders')
    .select('id, order_number, status, total, order_date, estimated_delivery_date')
    .eq('client_id', client?.id)
    .order('created_at', { ascending: false })
    .limit(3)

  return (
    <ClientDashboard
      client={client}
      recentOnline={recentOnline || []}
      recentTailoring={recentTailoring || []}
    />
  )
}
