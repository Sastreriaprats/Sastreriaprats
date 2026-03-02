import { requirePermission } from '@/actions/auth'
import { AdminOrderDetailContent } from './order-detail-content'

export default async function AdminOrderDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  await requirePermission('shop.view')
  const { id } = await params
  return <AdminOrderDetailContent key={id} />
}
