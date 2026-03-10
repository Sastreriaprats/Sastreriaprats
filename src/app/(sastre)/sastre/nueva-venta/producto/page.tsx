import { createServerSupabaseClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { SastreLayoutWithSidebar } from '@/app/(sastre)/components/sastre-layout-with-sidebar'
import { NewVentaProductoClient } from './new-venta-producto-client'

export const metadata = { title: 'Nueva venta — Producto · Sastre' }
export const dynamic = 'force-dynamic'

export default async function NewVentaProductoPage({
  searchParams,
}: {
  searchParams: Promise<{ clientId?: string; orderType?: string }>
}) {
  const { clientId, orderType } = await searchParams
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
      <NewVentaProductoClient clientId={clientId ?? ''} orderType={orderType ?? ''} />
    </SastreLayoutWithSidebar>
  )
}
