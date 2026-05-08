import { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { requirePermission } from '@/actions/auth'
import { getClient } from '@/actions/clients'
import { ClientDetailContent } from './client-detail-content'

export const metadata: Metadata = { title: 'Ficha de cliente' }

export default async function ClientDetailPage(props: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ tab?: string }>
}) {
  await requirePermission('clients.view')
  const params = await props.params
  const searchParams = await props.searchParams

  const res = await getClient(params.id)
  if (!res.success || !res.data) notFound()
  const client = res.data

  return <ClientDetailContent client={client} initialTab={searchParams.tab || 'resumen'} />
}
