import { createServerSupabaseClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { ClientDashboard } from './client-dashboard'
import { AccountNotLinked } from './account-not-linked'

/** Escapa los comodines de LIKE para que `ilike` compare el email literal. */
function escapeLike(v: string): string {
  return v.replace(/[\\%_]/g, (c) => `\\${c}`)
}

export default async function ClientAccountPage() {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const admin = createAdminClient()
  const { data: linked } = await admin
    .from('clients')
    .select('*')
    .eq('profile_id', user.id)
    .order('created_at', { ascending: true })
    .limit(1)
  let client = linked?.[0] ?? null

  // Cuenta sin ficha vinculada: se intenta enlazar por email, que Supabase Auth
  // ya ha verificado. Solo si hay UNA candidata libre, para no enganchar la
  // ficha equivocada cuando el mismo correo aparece duplicado.
  if (!client && user.email) {
    const { data: byEmail } = await admin
      .from('clients')
      .select('*')
      .ilike('email', escapeLike(user.email))
      .is('profile_id', null)
      .limit(2)
    const exact = (byEmail ?? []).filter(
      (c: { email?: string | null }) => (c.email ?? '').toLowerCase() === user.email!.toLowerCase()
    )
    if (exact.length === 1) {
      const { error: linkErr } = await admin
        .from('clients')
        .update({ profile_id: user.id })
        .eq('id', exact[0].id)
        .is('profile_id', null)
      if (!linkErr) client = { ...exact[0], profile_id: user.id }
    }
  }

  // Sin ficha que vincular se muestra una pagina explicativa. Antes se
  // redirigia a /auth/login, pero el middleware devuelve al cliente ya
  // autenticado a /mi-cuenta: era un bucle infinito de redirecciones.
  if (!client) {
    return <AccountNotLinked email={user.email ?? null} />
  }

  const clientId = client.id

  const { data: recentOnline } = await admin
    .from('online_orders')
    .select('id, order_number, status, total, created_at, online_order_lines ( product_name, quantity )')
    .eq('client_id', clientId)
    .in('status', ['paid', 'processing', 'shipped', 'delivered'])
    .order('created_at', { ascending: false })
    .limit(3)

  const { count: onlineCount } = await admin
    .from('online_orders')
    .select('id', { count: 'exact', head: true })
    .eq('client_id', clientId)
    .in('status', ['paid', 'processing', 'shipped', 'delivered'])

  const { count: tailoringCount } = await admin
    .from('tailoring_orders')
    .select('id', { count: 'exact', head: true })
    .eq('client_id', clientId)
    .neq('status', 'cancelled')

  const { data: recentTailoring } = await admin
    .from('tailoring_orders')
    .select(`
      id, order_number, status, total, order_date, estimated_delivery_date,
      tailoring_order_lines ( garment_types ( name ), fabric_description, fabrics ( name, fabric_code ) )
    `)
    .eq('client_id', clientId)
    .neq('status', 'cancelled')
    .order('created_at', { ascending: false })
    .limit(3)

  return (
    <ClientDashboard
      client={client}
      recentOnline={recentOnline || []}
      recentTailoring={recentTailoring || []}
      onlineOrderCount={onlineCount ?? 0}
      tailoringOrderCount={tailoringCount ?? 0}
    />
  )
}
