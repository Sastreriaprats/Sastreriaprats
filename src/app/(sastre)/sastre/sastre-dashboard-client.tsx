'use client'

import Link from 'next/link'
import { Users, Ruler, Package, ShoppingCart, ListOrdered, CircleDollarSign, Plus } from 'lucide-react'
import { SastreLayoutWithSidebar } from '@/app/(sastre)/components/sastre-layout-with-sidebar'

export function SastreDashboardClient({ sastreName, isSastrePlus = false }: { sastreName: string; isSastrePlus?: boolean }) {
  return (
    <SastreLayoutWithSidebar sastreName={sastreName} isSastrePlus={isSastrePlus}>
    <div className="flex-1 flex flex-col min-w-0 overflow-x-hidden">
        <div className="flex-1 flex flex-col items-center justify-center w-full">
          <section className="pt-12 pb-8 px-6 w-full max-w-3xl mx-auto text-center">
            <p className="text-[#c9a96e]/60 text-3xl tracking-widest font-light">Bienvenido a</p>
            <img
              src="/logo-prats.png"
              alt="Prats"
              width={600}
              height={192}
              className="mx-auto mt-4 object-contain"
              style={{
                height: 192,
                width: 'auto',
                maxWidth: 660,
                filter: 'brightness(0) invert(1)',
              }}
            />
            <div
              className="w-28 h-px mx-auto mt-6 bg-gradient-to-r from-transparent via-[#c9a96e] to-transparent"
              aria-hidden
            />
          </section>

          <main className="px-6 sm:px-10 pb-24 w-full flex justify-center">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 max-w-4xl w-full mx-auto">
            <Link
              href="/sastre/nueva-venta"
              className="min-h-[14rem] flex flex-col items-center justify-center rounded-xl border-2 border-[#c9a96e]/40 bg-gradient-to-br from-[#1a2744] to-[#0d1629] shadow-lg hover:border-[#c9a96e]/70 hover:shadow-[0_8px_30px_rgba(201,169,110,0.2)] transition-all duration-300 touch-manipulation py-8"
            >
              <div className="w-14 h-14 rounded-full border-2 border-[#c9a96e]/50 flex items-center justify-center bg-[#c9a96e]/10">
                <Plus className="h-7 w-7 text-[#c9a96e]" />
              </div>
              <span className="font-serif text-xl text-[#c9a96e] mt-4">Nueva venta</span>
              <span className="text-sm text-white/60 mt-1">Cliente → Producto → Ficha</span>
            </Link>
            <Link
              href="/sastre/clientes"
              className="min-h-[14rem] flex flex-col items-center justify-center rounded-xl border border-[#c9a96e]/20 bg-gradient-to-br from-[#1a2744] to-[#0d1629] shadow-lg hover:border-[#c9a96e]/60 hover:shadow-[0_8px_30px_rgba(201,169,110,0.15)] transition-all duration-300 touch-manipulation py-8"
            >
              <div className="w-14 h-14 rounded-full border border-[#c9a96e]/40 flex items-center justify-center">
                <Users className="h-6 w-6 text-[#c9a96e]" />
              </div>
              <span className="font-serif text-xl text-white mt-4">Clientes</span>
            </Link>
          <Link
            href="/sastre/clientes"
            className="min-h-[14rem] flex flex-col items-center justify-center rounded-xl border border-[#c9a96e]/20 bg-gradient-to-br from-[#1a2744] to-[#0d1629] shadow-lg hover:border-[#c9a96e]/60 hover:shadow-[0_8px_30px_rgba(201,169,110,0.15)] transition-all duration-300 touch-manipulation py-8"
          >
            <div className="w-14 h-14 rounded-full border border-[#c9a96e]/40 flex items-center justify-center">
              <Ruler className="h-6 w-6 text-[#c9a96e]" />
            </div>
            <span className="font-serif text-xl text-white mt-4">Tomar medidas</span>
          </Link>
          <Link
            href="/sastre/stock"
            className="min-h-[14rem] flex flex-col items-center justify-center rounded-xl border border-[#c9a96e]/20 bg-gradient-to-br from-[#1a2744] to-[#0d1629] shadow-lg hover:border-[#c9a96e]/60 hover:shadow-[0_8px_30px_rgba(201,169,110,0.15)] transition-all duration-300 touch-manipulation py-8"
          >
            <div className="w-14 h-14 rounded-full border border-[#c9a96e]/40 flex items-center justify-center">
              <Package className="h-6 w-6 text-[#c9a96e]" />
            </div>
            <span className="font-serif text-xl text-white mt-4">Stock</span>
          </Link>
          <Link
            href="/sastre/pedidos/nuevo"
            className="min-h-[14rem] flex flex-col items-center justify-center rounded-xl border border-[#c9a96e]/20 bg-gradient-to-br from-[#1a2744] to-[#0d1629] shadow-lg hover:border-[#c9a96e]/60 hover:shadow-[0_8px_30px_rgba(201,169,110,0.15)] transition-all duration-300 touch-manipulation py-8"
          >
            <div className="w-14 h-14 rounded-full border border-[#c9a96e]/40 flex items-center justify-center">
              <Plus className="h-7 w-7 text-[#c9a96e]" />
            </div>
            <span className="font-serif text-xl text-white mt-4">Nuevo producto</span>
          </Link>
          {isSastrePlus && (
            <>
              <Link
                href="/sastre/pedidos"
                className="min-h-[14rem] flex flex-col items-center justify-center rounded-xl border border-[#c9a96e]/20 bg-gradient-to-br from-[#1a2744] to-[#0d1629] shadow-lg hover:border-[#c9a96e]/60 hover:shadow-[0_8px_30px_rgba(201,169,110,0.15)] transition-all duration-300 touch-manipulation py-8"
              >
                <div className="w-14 h-14 rounded-full border border-[#c9a96e]/40 flex items-center justify-center">
                  <ListOrdered className="h-6 w-6 text-[#c9a96e]" />
                </div>
                <span className="font-serif text-xl text-white mt-4">Pedidos</span>
              </Link>
              <Link
                href="/pos/caja"
                className="min-h-[14rem] flex flex-col items-center justify-center rounded-xl border border-[#c9a96e]/20 bg-gradient-to-br from-[#1a2744] to-[#0d1629] shadow-lg hover:border-[#c9a96e]/60 hover:shadow-[0_8px_30px_rgba(201,169,110,0.15)] transition-all duration-300 touch-manipulation py-8"
              >
                <div className="w-14 h-14 rounded-full border border-[#c9a96e]/40 flex items-center justify-center">
                  <ShoppingCart className="h-6 w-6 text-[#c9a96e]" />
                </div>
                <span className="font-serif text-xl text-white mt-4">Caja TPV</span>
              </Link>
              <Link
                href="/sastre/cobros"
                className="min-h-[14rem] flex flex-col items-center justify-center rounded-xl border border-[#c9a96e]/20 bg-gradient-to-br from-[#1a2744] to-[#0d1629] shadow-lg hover:border-[#c9a96e]/60 hover:shadow-[0_8px_30px_rgba(201,169,110,0.15)] transition-all duration-300 touch-manipulation py-8"
              >
                <div className="w-14 h-14 rounded-full border border-[#c9a96e]/40 flex items-center justify-center">
                  <CircleDollarSign className="h-6 w-6 text-[#c9a96e]" />
                </div>
                <span className="font-serif text-xl text-white mt-4">Cobros</span>
              </Link>
            </>
          )}
        </div>
        </main>
        </div>

        <footer className="py-6 text-center shrink-0">
          <p className="text-xs text-white/20 tracking-widest">
            SASTRERÍA PRATS · PANEL DE GESTIÓN · 2026
          </p>
        </footer>
      </div>
    </SastreLayoutWithSidebar>
  )
}
