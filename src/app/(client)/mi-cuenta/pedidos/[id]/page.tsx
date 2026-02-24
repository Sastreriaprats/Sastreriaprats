import { notFound } from 'next/navigation'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { OrderDetailContent } from './order-detail-content'

export default async function OrderDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ type?: string }>
}) {
  const { id } = await params
  const { type } = await searchParams

  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return notFound()

  const admin = createAdminClient()
  const { data: client } = await admin
    .from('clients')
    .select('id')
    .eq('profile_id', user.id)
    .single()
  if (!client) return notFound()

  let order: Record<string, unknown> | null = null
  let lines: Record<string, unknown>[] = []
  let history: Record<string, unknown>[] = []

  if (type === 'tailoring') {
    const { data } = await admin
      .from('tailoring_orders')
      .select(`
        *,
        tailoring_order_lines(*, garment_types(name)),
        tailoring_order_state_history(*, profiles!tailoring_order_state_history_changed_by_fkey(full_name)),
        tailoring_fittings(*)
      `)
      .eq('id', id)
      .eq('client_id', client.id)
      .single()

    if (data) {
      order = { ...(data as Record<string, unknown>), type: 'tailoring' }
      lines = (data.tailoring_order_lines || []) as Record<string, unknown>[]
      history = (data.tailoring_order_state_history || []) as Record<string, unknown>[]
    }
  } else {
    const { data } = await admin
      .from('online_orders')
      .select('*, online_order_lines(*)')
      .eq('id', id)
      .eq('client_id', client.id)
      .single()

    if (data) {
      order = { ...(data as Record<string, unknown>), type: 'online' }
      lines = (data.online_order_lines || []) as Record<string, unknown>[]
    }
  }

  if (!order) return notFound()

  return <OrderDetailContent order={order} lines={lines} history={history} />
}
