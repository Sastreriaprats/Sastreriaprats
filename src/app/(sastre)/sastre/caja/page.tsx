import { createServerSupabaseClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { SastreHeader } from '../../components/sastre-header'

export default async function SastreCajaPage() {
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
      <SastreHeader sastreName={sastreName} title="Caja" backHref="/sastre" />
      <main className="flex-1 flex items-center justify-center p-6">
        <div className="rounded-2xl border border-[#c9a96e]/40 bg-white/5 p-12 max-w-md text-center">
          <p className="font-serif text-2xl text-[#c9a96e] mb-2">Caja</p>
          <p className="text-white/70">Módulo de caja próximamente.</p>
        </div>
      </main>
    </div>
  )
}
