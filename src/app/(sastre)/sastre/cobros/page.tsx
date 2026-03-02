import { createServerSupabaseClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { CobrosContent } from '@/app/(admin)/admin/cobros/cobros-content'
import { SastreHeader } from '../../components/sastre-header'

export const metadata = { title: 'Cobros Pendientes · Sastre' }

export default async function SastreCobrosPage() {
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
    <div className="min-h-screen flex flex-col">
      <SastreHeader sastreName={sastreName} sectionTitle="Cobros pendientes" backHref="/sastre" />
      <main className="flex-1 bg-gray-50">
        <CobrosContent basePath="/sastre" />
      </main>
    </div>
  )
}
