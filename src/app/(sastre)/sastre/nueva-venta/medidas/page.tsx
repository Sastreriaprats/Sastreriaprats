import { createServerSupabaseClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getClient } from '@/actions/clients'
import { SastreLayoutWithSidebar } from '@/app/(sastre)/components/sastre-layout-with-sidebar'
import { NewVentaMedidasClient } from './new-venta-medidas-client'

export const metadata = { title: 'Nueva venta — Medidas · Sastre' }
export const dynamic = 'force-dynamic'

export default async function NewVentaMedidasPage({
  searchParams,
}: {
  searchParams: Promise<{ clientId?: string; tipo?: string }>
}) {
  const params = await searchParams
  const clientId = params.clientId ?? ''
  const tipo = params.tipo ?? ''

  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const admin = createAdminClient()
  const [profileRes, clientRes] = await Promise.all([
    admin.from('profiles').select('full_name, first_name, last_name').eq('id', user.id).single(),
    clientId ? getClient(clientId) : Promise.resolve(null),
  ])

  const profile = profileRes?.data
  const sastreName = profile?.full_name || profile?.first_name || profile?.last_name || 'Sastre'

  let clientName = 'Cliente'
  if (clientRes?.success && clientRes.data) {
    const c = clientRes.data as Record<string, unknown>
    clientName = String(c.full_name || `${c.first_name || ''} ${c.last_name || ''}`).trim() || 'Cliente'
  }

  return (
    <SastreLayoutWithSidebar sastreName={sastreName}>
      <NewVentaMedidasClient clientId={clientId} tipo={tipo} clientName={clientName} sastreName={sastreName} />
    </SastreLayoutWithSidebar>
  )
}
