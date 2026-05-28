import { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { requirePermission } from '@/actions/auth'
import { getAlteration } from '@/actions/alterations'
import { AlterationDetailContent } from '@/app/(admin)/admin/arreglos/[id]/alteration-detail-content'

export const metadata: Metadata = { title: 'Detalle de arreglo' }

export default async function VendedorAlterationDetailPage(props: { params: Promise<{ id: string }> }) {
  await requirePermission('clients.view')
  const { id } = await props.params
  const res = await getAlteration({ id })
  if (!res.success || !res.data) notFound()
  return <AlterationDetailContent alteration={res.data} basePath="/vendedor" />
}
