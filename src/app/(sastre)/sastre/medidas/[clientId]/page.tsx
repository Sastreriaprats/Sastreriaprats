import { notFound } from 'next/navigation'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getClient } from '@/actions/clients'
import { MedidasPageContent } from './medidas-page-content'

export default async function SastreMedidasPage({
  params,
}: {
  params: Promise<{ clientId: string }>
}) {
  const { clientId } = await params
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const admin = createAdminClient()
  const { data: profile } = await admin
    .from('profiles')
    .select('full_name, first_name, last_name')
    .eq('id', user.id)
    .single()
  const sastreName = profile?.full_name || profile?.first_name || profile?.last_name || 'Sastre'

  const clientResult = await getClient(clientId)
  if (!clientResult.success || !clientResult.data) notFound()
  const client = clientResult.data as Record<string, unknown>
  const clientName = String(
    client.full_name || `${client.first_name || ''} ${client.last_name || ''}`.trim()
  ).trim() || 'Cliente'

  return (
    <MedidasPageContent
      clientId={clientId}
      clientName={clientName}
      sastreName={sastreName}
    />
  )
}
