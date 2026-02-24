import { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { requirePermission } from '@/actions/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { SupplierDetailContent } from './supplier-detail-content'

export const metadata: Metadata = { title: 'Ficha de proveedor' }

export default async function SupplierDetailPage(props: { params: Promise<{ id: string }> }) {
  await requirePermission('suppliers.view')
  const params = await props.params
  const admin = createAdminClient()

  const { data: supplier } = await admin
    .from('suppliers')
    .select(`
      *,
      supplier_contacts (*),
      fabrics ( id, fabric_code, name, composition, color_name, price_per_meter, stock_meters, status ),
      supplier_orders ( id, order_number, status, total, created_at, estimated_delivery_date ),
      supplier_due_dates ( id, due_date, amount, is_paid, alert_sent, paid_at )
    `)
    .eq('id', params.id)
    .single()

  if (!supplier) notFound()
  return <SupplierDetailContent supplier={supplier} />
}
