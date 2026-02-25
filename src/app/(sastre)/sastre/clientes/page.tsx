import { createServerSupabaseClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { ClientesPageContent } from './clientes-page-content'

export default async function SastreClientesPage() {
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
  return <ClientesPageContent sastreName={sastreName} />
}
