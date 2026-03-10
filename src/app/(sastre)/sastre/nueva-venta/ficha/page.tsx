import { createServerSupabaseClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { SastreLayoutWithSidebar } from '@/app/(sastre)/components/sastre-layout-with-sidebar'
import { NuevaVentaFichaClient } from './nueva-venta-ficha-client'

export const metadata = { title: 'Nueva venta — Ficha · Sastre' }
export const dynamic = 'force-dynamic'

export default async function NewVentaFichaPage({
  searchParams,
}: {
  searchParams: Promise<{ clientId?: string; orderType?: string; prenda?: string }>
}) {
  const params = await searchParams
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const admin = createAdminClient()
  const [profileRes, storeRes] = await Promise.all([
    admin.from('profiles').select('full_name, first_name, last_name').eq('id', user.id).single(),
    admin.from('user_stores').select('store_id').eq('user_id', user.id).order('is_primary', { ascending: false }).limit(1),
  ])

  const profile = profileRes?.data
  const sastreName = profile?.full_name || profile?.first_name || profile?.last_name || 'Sastre'
  const defaultStoreId = (storeRes?.data?.[0] as { store_id?: string } | undefined)?.store_id ?? ''

  return (
    <SastreLayoutWithSidebar sastreName={sastreName}>
      <NuevaVentaFichaClient
        clientId={params.clientId ?? ''}
        tipo={params.tipo ?? params.orderType ?? ''}
        prenda={params.prenda ?? ''}
        sastreName={sastreName}
        defaultStoreId={defaultStoreId}
      />
    </SastreLayoutWithSidebar>
  )
}
