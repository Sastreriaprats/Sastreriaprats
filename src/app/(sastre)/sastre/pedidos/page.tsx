import { redirect } from 'next/navigation'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { SastrePedidosContent } from './sastre-pedidos-content'

export const metadata = { title: 'Pedidos · Sastre' }

export default async function SastrePedidosPage() {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const admin = createAdminClient()
  const [profileRes, rolesRes] = await Promise.all([
    admin.from('profiles').select('full_name, first_name, last_name').eq('id', user.id).single(),
    admin.from('user_roles').select('roles(name)').eq('user_id', user.id),
  ])
  const profile = profileRes?.data
  const sastreName = profile?.full_name || profile?.first_name || profile?.last_name || 'Sastre'

  const roleNames: string[] = (rolesRes?.data ?? []).flatMap((ur: { roles?: { name: string } | { name: string }[] | null }) => {
    if (!ur?.roles) return []
    return Array.isArray(ur.roles) ? ur.roles.map((r: { name: string }) => r.name) : [ur.roles.name]
  })
  const isSastrePlus = roleNames.includes('sastre_plus')

  // Solo sastre_plus puede ver la lista de pedidos; sastre normal va directo a Nuevo producto (dos cajas)
  if (!isSastrePlus) redirect('/sastre')

  return <SastrePedidosContent sastreName={sastreName} />
}
