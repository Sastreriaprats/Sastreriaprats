import { createServerSupabaseClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { AccountNotLinked } from '../account-not-linked'
import { ProfileContent } from './profile-content'

export default async function ProfilePage() {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const admin = createAdminClient()
  const { data: client } = await admin
    .from('clients')
    .select('*')
    .eq('profile_id', user.id)
    .single()

  // Sin ficha vinculada el formulario salía en blanco y "Guardar cambios" fallaba
  // siempre (update-client exige client_id). Se explica la situación, igual que
  // hace /mi-cuenta; redirigir aquí reabriría el bucle login <-> /mi-cuenta.
  if (!client) {
    return <AccountNotLinked email={user.email ?? null} />
  }

  return <ProfileContent client={client} userEmail={user.email || ''} />
}
