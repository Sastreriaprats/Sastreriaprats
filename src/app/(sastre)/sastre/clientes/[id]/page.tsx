import { notFound } from 'next/navigation'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getClient } from '@/actions/clients'
import { SastreLayoutWithSidebar } from '@/app/(sastre)/components/sastre-layout-with-sidebar'
import { SastreHeader } from '../../../components/sastre-header'
import { SastreClienteDetailContent } from './sastre-cliente-detail-content'

export default async function SastreClientePage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
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

  const clientResult = await getClient(id)
  if (!clientResult.success || !clientResult.data) notFound()
  const client = clientResult.data as Record<string, unknown>

  // KPIs — total_spent del cliente + pendiente y conteo de pedidos
  const [ordersRes] = await Promise.all([
    admin
      .from('tailoring_orders')
      .select('total_pending')
      .eq('client_id', id),
  ])

  const orders = ordersRes.data ?? []
  const totalPending = orders.reduce((sum: number, o: any) => sum + Number(o.total_pending ?? 0), 0)
  const orderCount = orders.length
  const totalSpent = Number(client.total_spent ?? 0)

  const fullName = String(client.full_name || `${client.first_name || ''} ${client.last_name || ''}`).trim() || 'Sin nombre'

  return (
    <SastreLayoutWithSidebar sastreName={sastreName} isSastrePlus={isSastrePlus}>
      <div
        className="flex-1 flex flex-col min-h-screen"
        style={{ background: 'radial-gradient(ellipse at top, #1a2744 0%, #0a1020 70%)' }}
      >
        <SastreHeader sastreName={sastreName} sectionTitle={fullName} backHref="/sastre/clientes" />
        <main className="flex-1 p-6">
          <SastreClienteDetailContent
            client={client}
            sastreName={sastreName}
            totalSpent={totalSpent}
            totalPending={totalPending}
            orderCount={orderCount}
          />
        </main>

        <footer className="py-6 text-center shrink-0">
          <p className="text-xs text-white/20 tracking-widest">
            SASTRERÍA PRATS · PANEL DE GESTIÓN · 2026
          </p>
        </footer>
      </div>
    </SastreLayoutWithSidebar>
  )
}
