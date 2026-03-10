'use client'

import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { UserPlus, Users, ArrowLeft } from 'lucide-react'
import { Button } from '@/components/ui/button'

const ORDER_TYPE_LABELS: Record<string, string> = {
  artesanal: 'Artesanal',
  industrial: 'Industrial',
  camiseria: 'Camisería',
}

export function ElegirClienteClient({ orderType }: { orderType: string }) {
  const router = useRouter()

  if (!orderType) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-6">
        <p className="text-white/70 mb-4">Falta el tipo de pedido.</p>
        <Button className="min-h-[48px]" variant="outline" onClick={() => router.push('/sastre/nueva-venta')}>
          Volver
        </Button>
      </div>
    )
  }

  const tipoLabel = ORDER_TYPE_LABELS[orderType] ?? orderType

  return (
    <div className="flex-1 flex flex-col min-w-0 overflow-x-hidden">
      <div className="p-6 max-w-2xl mx-auto w-full space-y-6">
        <h1 className="text-2xl font-serif text-white text-center">Nueva venta — {tipoLabel}</h1>
        <p className="text-white/60 text-center">¿Nuevo cliente o ya existente?</p>

        <Button
          type="button"
          variant="outline"
          className="min-h-[48px] gap-2 !border-[#c9a96e]/50 !bg-[#1a2744] text-[#c9a96e] hover:!bg-[#1e2d4a] hover:!border-[#c9a96e]/70"
          onClick={() => router.push('/sastre/nueva-venta')}
        >
          <ArrowLeft className="h-5 w-5" />
          Volver
        </Button>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
          <Link
            href={`/sastre/nueva-venta/nuevo-cliente?orderType=${encodeURIComponent(orderType)}`}
            className="min-h-[14rem] flex flex-col items-center justify-center rounded-xl border border-[#c9a96e]/30 bg-[#1a2744] hover:bg-[#1e2d4a] hover:border-[#c9a96e]/50 transition-all duration-300 py-8 touch-manipulation"
          >
            <div className="w-14 h-14 rounded-full border border-[#c9a96e]/40 flex items-center justify-center">
              <UserPlus className="h-7 w-7 text-[#c9a96e]" />
            </div>
            <span className="font-serif text-lg text-white mt-4 text-center">Nuevo cliente</span>
          </Link>
          <Link
            href={`/sastre/nueva-venta/cliente?orderType=${encodeURIComponent(orderType)}`}
            className="min-h-[14rem] flex flex-col items-center justify-center rounded-xl border border-[#c9a96e]/30 bg-[#1a2744] hover:bg-[#1e2d4a] hover:border-[#c9a96e]/50 transition-all duration-300 py-8 touch-manipulation"
          >
            <div className="w-14 h-14 rounded-full border border-[#c9a96e]/40 flex items-center justify-center">
              <Users className="h-7 w-7 text-[#c9a96e]" />
            </div>
            <span className="font-serif text-lg text-white mt-4 text-center">Cliente ya existente</span>
          </Link>
        </div>
      </div>
    </div>
  )
}
