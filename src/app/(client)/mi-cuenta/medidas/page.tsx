import { createServerSupabaseClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { MeasurementsContent } from './measurements-content'

export default async function MeasurementsPage() {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const admin = createAdminClient()
  const { data: client } = await admin
    .from('clients')
    .select('id')
    .eq('profile_id', user.id)
    .single()

  const { data: measurements } = await admin
    .from('client_measurements')
    .select('*, garment_types(name, code), profiles!client_measurements_taken_by_fkey(full_name)')
    .eq('client_id', client?.id)
    .eq('is_current', true)
    .order('taken_at', { ascending: false })

  return <MeasurementsContent measurements={measurements || []} />
}
