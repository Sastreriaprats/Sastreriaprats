import { Metadata } from 'next'
import { requirePermission } from '@/actions/auth'
import { AlbaranDetailContent } from './albaran-detail-content'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: 'Detalle Albarán' }

export default async function AlbaranDetailPage({ params }: { params: Promise<{ id: string }> }) {
  await requirePermission('products.view')
  const { id } = await params
  return <AlbaranDetailContent id={id} />
}
