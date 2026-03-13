import { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { requirePermission } from '@/actions/auth'
import { getSupplierOrderDetail } from '@/actions/suppliers'
import { createAdminClient } from '@/lib/supabase/admin'
import { PedidoDetailContent } from './pedido-detail-content'

export const metadata: Metadata = { title: 'Detalle de pedido a proveedor' }

export default async function PedidoDetailPage(props: {
  params: Promise<{ id: string; pedidoId: string }>
}) {
  await requirePermission('suppliers.view')
  const params = await props.params

  const result = await getSupplierOrderDetail({ orderId: params.pedidoId })
  if (!result.success || !result.data) notFound()

  const order = result.data
  // Verify the order belongs to this supplier
  if (order.supplier_id !== params.id) notFound()

  const admin = createAdminClient()
  const { data: supplier } = await admin
    .from('suppliers')
    .select('id, name')
    .eq('id', params.id)
    .single()

  if (!supplier) notFound()

  return <PedidoDetailContent order={order} supplier={supplier} />
}
