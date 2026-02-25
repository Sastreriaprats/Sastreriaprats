'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Users, Ruler, CreditCard, Package, LogOut } from 'lucide-react'

export function SastreDashboardClient({ sastreName }: { sastreName: string }) {
  const router = useRouter()

  const handleLogout = async () => {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/auth/login')
    router.refresh()
  }

  return (
    <div
      className="min-h-screen flex flex-col"
      style={{ background: 'radial-gradient(ellipse at top, #1a2744 0%, #0a1020 70%)' }}
    >
      <header
        className="min-h-[72px] flex items-center justify-between px-10 shrink-0"
        style={{ backgroundColor: '#0d1629', borderBottom: '1px solid rgba(201,169,110,0.2)' }}
      >
        <Link href="/sastre" className="flex items-center gap-6 min-w-0 flex-1">
          <img
            src="/logo-prats.png"
            alt="Prats"
            width={140}
            height={45}
            className="object-contain shrink-0"
            style={{
              height: 45,
              width: 'auto',
              display: 'block',
              filter: 'brightness(0) invert(1)',
            }}
          />
          <div className="h-8 w-px bg-[#c9a96e]/30 shrink-0" aria-hidden />
          <span className="tracking-[0.3em] text-sm text-white/80 font-light whitespace-nowrap">
            SASTRERÍA MADRID · EST. 1985
          </span>
        </Link>
        <div className="flex items-center gap-5 shrink-0">
          <span className="text-white font-light text-lg">{sastreName}</span>
          <span className="h-5 w-px bg-white/20" aria-hidden />
          <button
            type="button"
            onClick={handleLogout}
            className="flex items-center gap-2 text-[#c9a96e]/70 hover:text-[#c9a96e] transition-colors text-base"
            aria-label="Cerrar sesión"
          >
            <LogOut className="h-5 w-5" />
            <span className="text-sm">Salir</span>
          </button>
        </div>
      </header>

      <div className="flex-1 flex flex-col justify-center">
        <section className="pt-[100px] pb-14 px-8 text-center">
          <p className="text-[#c9a96e]/60 text-xl tracking-widest font-light">Bienvenido,</p>
          <h1 className="text-white text-6xl font-serif font-light mt-2">{sastreName}</h1>
          <div
            className="w-28 h-px mx-auto mt-6 bg-gradient-to-r from-transparent via-[#c9a96e] to-transparent"
            aria-hidden
          />
        </section>

        <main className="px-10 pb-24">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 max-w-5xl mx-auto">
            <Link
              href="/sastre/clientes"
              className="min-h-[14rem] flex flex-col items-center justify-center rounded-xl border border-[#c9a96e]/20 bg-gradient-to-br from-[#1a2744] to-[#0d1629] shadow-lg hover:border-[#c9a96e]/60 hover:shadow-[0_8px_30px_rgba(201,169,110,0.15)] transition-all duration-300 touch-manipulation py-8"
            >
              <div className="w-14 h-14 rounded-full border border-[#c9a96e]/40 flex items-center justify-center">
                <Users className="h-6 w-6 text-[#c9a96e]" />
              </div>
              <span className="font-serif text-xl text-white mt-4">Clientes</span>
              <span className="text-sm text-white/40 mt-1">Ver y buscar clientes</span>
              <div className="w-8 h-px bg-[#c9a96e]/40 mx-auto mt-4" aria-hidden />
            </Link>
          <Link
            href="/sastre/clientes"
            className="min-h-[14rem] flex flex-col items-center justify-center rounded-xl border border-[#c9a96e]/20 bg-gradient-to-br from-[#1a2744] to-[#0d1629] shadow-lg hover:border-[#c9a96e]/60 hover:shadow-[0_8px_30px_rgba(201,169,110,0.15)] transition-all duration-300 touch-manipulation py-8"
          >
            <div className="w-14 h-14 rounded-full border border-[#c9a96e]/40 flex items-center justify-center">
              <Ruler className="h-6 w-6 text-[#c9a96e]" />
            </div>
            <span className="font-serif text-xl text-white mt-4">Tomar medidas</span>
            <span className="text-sm text-white/40 mt-1">Desde la ficha del cliente</span>
            <div className="w-8 h-px bg-[#c9a96e]/40 mx-auto mt-4" aria-hidden />
          </Link>
          <Link
            href="/sastre/stock"
            className="min-h-[14rem] flex flex-col items-center justify-center rounded-xl border border-[#c9a96e]/20 bg-gradient-to-br from-[#1a2744] to-[#0d1629] shadow-lg hover:border-[#c9a96e]/60 hover:shadow-[0_8px_30px_rgba(201,169,110,0.15)] transition-all duration-300 touch-manipulation py-8"
          >
            <div className="w-14 h-14 rounded-full border border-[#c9a96e]/40 flex items-center justify-center">
              <Package className="h-6 w-6 text-[#c9a96e]" />
            </div>
            <span className="font-serif text-xl text-white mt-4">Stock</span>
            <span className="text-sm text-white/40 mt-1">Consultar productos</span>
            <div className="w-8 h-px bg-[#c9a96e]/40 mx-auto mt-4" aria-hidden />
          </Link>
          <Link
            href="/sastre/caja"
            className="min-h-[14rem] flex flex-col items-center justify-center rounded-xl border border-[#c9a96e]/20 bg-gradient-to-br from-[#1a2744] to-[#0d1629] shadow-lg hover:border-[#c9a96e]/60 hover:shadow-[0_8px_30px_rgba(201,169,110,0.15)] transition-all duration-300 touch-manipulation py-8"
          >
            <div className="w-14 h-14 rounded-full border border-[#c9a96e]/40 flex items-center justify-center">
              <CreditCard className="h-6 w-6 text-[#c9a96e]" />
            </div>
            <span className="font-serif text-xl text-white mt-4">Caja</span>
            <span className="text-sm text-white/40 mt-1">Módulo de caja</span>
            <div className="w-8 h-px bg-[#c9a96e]/40 mx-auto mt-4" aria-hidden />
          </Link>
        </div>
        </main>
      </div>

      <footer className="py-6 text-center shrink-0">
        <p className="text-xs text-white/20 tracking-widest">
          SASTRERÍA PRATS · PANEL DE GESTIÓN · 2026
        </p>
      </footer>
    </div>
  )
}
