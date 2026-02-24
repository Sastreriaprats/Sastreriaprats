import { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { requirePermission } from '@/actions/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { OrderDetailContent } from './order-detail-content'

export const metadata: Metadata = { title: 'Ficha de pedido' }

export default async function OrderDetailPage(props: { params: Promise<{ id: string }> }) {
  await requirePermission('orders.view')
  const params = await props.params
  const admin = createAdminClient()

  const { data: order } = await admin
    .from('tailoring_orders')
    .select(`
      *,
      clients ( id, full_name, phone, email, category, client_code ),
      stores ( id, name, code ),
      tailoring_order_lines (
        *,
        garment_types ( id, name, code ),
        fabrics ( id, fabric_code, name, composition ),
        suppliers ( id, name ),
        officials ( id, name )
      ),
      tailoring_order_state_history ( id, from_status, to_status, notes, changed_by_name, changed_at ),
      tailoring_fittings ( id, fitting_number, scheduled_date, scheduled_time, status, adjustments_needed, notes, duration_minutes )
    `)
    .eq('id', params.id)
    .single()

  if (!order) notFound()
  return <OrderDetailContent order={order} />
}
