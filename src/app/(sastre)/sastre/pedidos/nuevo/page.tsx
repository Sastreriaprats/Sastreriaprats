import Link from 'next/link'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requirePermission } from '@/actions/auth'
import { Shirt, Factory } from 'lucide-react'
import { SastreHeader } from '@/app/(sastre)/components/sastre-header'

export const metadata = { title: 'Nuevo producto · Sastre' }

export default async function SastreNuevoProductoPage() {
  await requirePermission('orders.create')
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
    <div className="min-h-screen flex flex-col" style={{ background: 'radial-gradient(ellipse at top, #1a2744 0%, #0a1020 70%)' }}>
      <SastreHeader sastreName={sastreName} sectionTitle="Nuevo producto" backHref="/sastre/pedidos" />
      <main className="flex-1 p-6 flex flex-col items-center justify-center">
        <div className="max-w-2xl w-full mx-auto text-center space-y-8">
          <div>
            <h1 className="text-2xl font-serif text-white">¿Industrial, artesanal o camisería?</h1>
            <p className="text-white/60 mt-1">Elige el tipo de pedido para continuar</p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
            <Link
              href="/sastre/pedidos/nuevo/crear?orderType=industrial"
              className="min-h-[12rem] flex flex-col items-center justify-center rounded-xl border border-[#c9a96e]/30 bg-white/5 hover:bg-white/10 hover:border-[#c9a96e]/50 transition-all duration-300 py-8"
            >
              <div className="w-14 h-14 rounded-full border border-[#c9a96e]/40 flex items-center justify-center">
                <Factory className="h-7 w-7 text-[#c9a96e]" />
              </div>
              <span className="font-serif text-xl text-white mt-4">Industrial</span>
              <span className="text-sm text-white/50 mt-1">Envío a fábrica con tela y medidas</span>
            </Link>
            <Link
              href="/sastre/pedidos/nuevo/crear?orderType=artesanal"
              className="min-h-[12rem] flex flex-col items-center justify-center rounded-xl border border-[#c9a96e]/30 bg-white/5 hover:bg-white/10 hover:border-[#c9a96e]/50 transition-all duration-300 py-8"
            >
              <div className="w-14 h-14 rounded-full border border-[#c9a96e]/40 flex items-center justify-center">
                <Shirt className="h-7 w-7 text-[#c9a96e]" />
              </div>
              <span className="font-serif text-xl text-white mt-4">Artesanal</span>
              <span className="text-sm text-white/50 mt-1">Confección en sastrería o con oficial</span>
            </Link>
            <Link
              href="/sastre/pedidos/nuevo/crear?orderType=camiseria"
              className="min-h-[12rem] flex flex-col items-center justify-center rounded-xl border border-[#c9a96e]/30 bg-white/5 hover:bg-white/10 hover:border-[#c9a96e]/50 transition-all duration-300 py-8"
            >
              <div className="w-14 h-14 rounded-full border border-[#c9a96e]/40 flex items-center justify-center">
                <Shirt className="h-7 w-7 text-[#c9a96e]" />
              </div>
              <span className="font-serif text-xl text-white mt-4">Camisería</span>
              <span className="text-sm text-white/50 mt-1">Camisas a medida con ficha de medidas</span>
            </Link>
          </div>
        </div>
      </main>
    </div>
  )
}
