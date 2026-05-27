import type { Metadata } from 'next'
import { requirePermission } from '@/actions/auth'
import { OfficialDetailView } from '@/components/officials/official-detail-view'

export const metadata: Metadata = { title: 'Detalle de oficial' }

export default async function OfficialDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  await requirePermission('officials.view')
  const { id } = await params
  return <OfficialDetailView officialId={id} basePath="/admin" />
}
