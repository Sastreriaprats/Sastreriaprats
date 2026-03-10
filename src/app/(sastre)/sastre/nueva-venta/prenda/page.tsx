import { createServerSupabaseClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { SastreLayoutWithSidebar } from '@/app/(sastre)/components/sastre-layout-with-sidebar'
import { NuevaVentaPrendaClient } from './nueva-venta-prenda-client'

export const metadata = { title: 'Nueva venta — Prenda · Sastre' }
export const dynamic = 'force-dynamic'

export default async function NewVentaPrendaPage({
  searchParams,
}: {
  searchParams: Promise<{ tipo?: string; clientId?: string }>
}) {
  const { tipo, clientId } = await searchParams
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

  return (
    <SastreLayoutWithSidebar sastreName={sastreName}>
      <NuevaVentaPrendaClient tipo={tipo ?? ''} clientId={clientId ?? ''} />
    </SastreLayoutWithSidebar>
  )
}
