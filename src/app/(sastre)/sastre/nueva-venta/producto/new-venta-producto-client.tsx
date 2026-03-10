'use client'

import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, Shirt } from 'lucide-react'
import { Button } from '@/components/ui/button'

/** Tipos de producto de sastrería (hombre). Se puede ampliar más adelante. */
const PRODUCTOS_SASTRERIA = [
  { code: 'traje_2_piezas', label: 'Traje 2 piezas' },
  { code: 'traje_3_piezas', label: 'Traje 3 piezas' },
  { code: 'americana', label: 'Americana' },
  { code: 'teba', label: 'Teba' },
  { code: 'abrigo', label: 'Abrigo' },
  { code: 'smoking', label: 'Smoking' },
  { code: 'chaque', label: 'Chaqué' },
  { code: 'pantalon', label: 'Pantalón' },
  { code: 'chaleco', label: 'Chaleco' },
  { code: 'camiseria', label: 'Camisería' },
]

export function NewVentaProductoClient({
  clientId,
  orderType,
}: {
  clientId: string
  orderType: string
}) {
  const router = useRouter()

  if (!clientId) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-6">
        <p className="text-white/70 mb-4">Falta el cliente. Vuelve a seleccionarlo.</p>
        <Button
          className="min-h-[48px] !border-[#c9a96e]/50 !bg-[#1a2744] text-[#c9a96e]"
          variant="outline"
          onClick={() => router.push('/sastre/nueva-venta/elegir-cliente' + (orderType ? `?orderType=${encodeURIComponent(orderType)}` : ''))}
        >
          Ir a selección de cliente
        </Button>
      </div>
    )
  }

  const backUrl = orderType
    ? `/sastre/nueva-venta/medidas?clientId=${encodeURIComponent(clientId)}&orderType=${encodeURIComponent(orderType)}`
    : '/sastre/nueva-venta/cliente'

  return (
    <div className="flex-1 flex flex-col min-w-0 overflow-x-hidden">
      <div className="p-6 max-w-3xl mx-auto w-full space-y-6">
        <h1 className="text-2xl font-serif text-white">Nueva venta — Tipo de prenda</h1>
        <p className="text-white/60">Elige la prenda que vas a confeccionar</p>

        <Button
          type="button"
          variant="outline"
          className="min-h-[48px] gap-2 !border-[#c9a96e]/50 !bg-[#1a2744] text-[#c9a96e] hover:!bg-[#1e2d4a] hover:!border-[#c9a96e]/70"
          onClick={() => router.push(backUrl)}
        >
          <ArrowLeft className="h-5 w-5" />
          Volver
        </Button>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {PRODUCTOS_SASTRERIA.map(({ code, label }) => (
            <Link
              key={code}
              href={`/sastre/nueva-venta/ficha?clientId=${encodeURIComponent(clientId)}&orderType=${encodeURIComponent(orderType || 'artesanal')}&prenda=${encodeURIComponent(code)}`}
              className="min-h-[12rem] flex flex-col items-center justify-center rounded-xl border border-[#c9a96e]/30 bg-[#1a2744] hover:bg-[#1e2d4a] hover:border-[#c9a96e]/50 transition-all duration-300 py-6 touch-manipulation"
            >
              <div className="w-12 h-12 rounded-full border border-[#c9a96e]/40 flex items-center justify-center">
                <Shirt className="h-6 w-6 text-[#c9a96e]" />
              </div>
              <span className="font-serif text-lg text-white mt-3 text-center">{label}</span>
            </Link>
          ))}
        </div>
      </div>
    </div>
  )
}
