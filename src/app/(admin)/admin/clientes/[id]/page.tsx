import { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { requirePermission } from '@/actions/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { ClientDetailContent } from './client-detail-content'

export const metadata: Metadata = { title: 'Ficha de cliente' }

export default async function ClientDetailPage(props: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ tab?: string }>
}) {
  await requirePermission('clients.view')
  const params = await props.params
  const searchParams = await props.searchParams
  const admin = createAdminClient()

  const { data: client, error } = await admin
    .from('clients')
    .select('*')
    .eq('id', params.id)
    .single()

  if (error || !client) notFound()

  return <ClientDetailContent client={client} initialTab={searchParams.tab || 'resumen'} />
}
