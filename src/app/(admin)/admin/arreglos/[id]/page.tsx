import { notFound } from 'next/navigation'
import { getAlteration } from '@/actions/alterations'
import { AlterationDetailContent } from './alteration-detail-content'

export default async function AlterationDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const res = await getAlteration({ id })
  if (!res.success || !res.data) notFound()
  return <AlterationDetailContent alteration={res.data} />
}
