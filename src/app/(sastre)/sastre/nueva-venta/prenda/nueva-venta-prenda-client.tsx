'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, Shirt } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { NuevaVentaSteps } from '../nueva-venta-steps'

/** Prendas para tipo artesanal/industrial según especificación. slug → { label, piezas } */
const PRENDAS_BODY = [
  { slug: 'traje_2_piezas', label: 'Traje 2 piezas', piezas: 'americana + pantalón', icon: Shirt },
  { slug: 'traje_3_piezas', label: 'Traje 3 piezas', piezas: 'americana + pantalón + chaleco', icon: Shirt },
  { slug: 'americana_sola', label: 'Americana sola', piezas: 'americana', icon: Shirt },
  { slug: 'pantalon_solo', label: 'Pantalón solo', piezas: 'pantalón', icon: Shirt },
  { slug: 'chaleco_solo', label: 'Chaleco solo', piezas: 'chaleco', icon: Shirt },
  { slug: 'teba', label: 'Teba', piezas: 'chaqueta corta sin costuras', icon: Shirt },
  { slug: 'smoking', label: 'Smoking', piezas: 'americana (smoking) + pantalón', icon: Shirt },
  { slug: 'chaque', label: 'Chaqué', piezas: 'chaqué + pantalón + chaleco', icon: Shirt },
  { slug: 'abrigo', label: 'Abrigo', piezas: 'abrigo (campos propios)', icon: Shirt },
  { slug: 'gabardina', label: 'Gabardina', piezas: 'gabardina (campos propios)', icon: Shirt },
] as const

export function NuevaVentaPrendaClient({ tipo, clientId }: { tipo: string; clientId: string }) {
  const router = useRouter()

  // Si tipo=camiseria → saltar a ficha con prenda=camisa
  useEffect(() => {
    if (tipo === 'camiseria' && clientId) {
      router.replace(`/sastre/nueva-venta/ficha?tipo=${encodeURIComponent(tipo)}&clientId=${encodeURIComponent(clientId)}&prenda=camisa`)
    }
  }, [tipo, clientId, router])

  if (!clientId || !tipo) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-6">
        <p className="text-white/70 mb-4">Falta el cliente o el tipo. Vuelve atrás.</p>
        <Button className="min-h-[48px]" variant="outline" onClick={() => router.push('/sastre/nueva-venta')}>
          Ir al inicio
        </Button>
      </div>
    )
  }

  if (tipo === 'camiseria') {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-6">
        <p className="text-white/70">Redirigiendo a ficha de camisería...</p>
      </div>
    )
  }

  const backUrl = `/sastre/nueva-venta/medidas?tipo=${encodeURIComponent(tipo)}&clientId=${encodeURIComponent(clientId)}`

  return (
    <div className="flex-1 flex flex-col min-w-0 overflow-x-hidden">
      <div className="p-6 max-w-3xl mx-auto w-full space-y-6">
        <NuevaVentaSteps currentStep={4} tipo={tipo} clientId={clientId} />

        <h1 className="text-2xl font-serif text-white">Nueva venta — Selección de prenda</h1>
        <p className="text-white/60 text-sm uppercase tracking-widest mb-6">Elige la prenda</p>

        <Button
          type="button"
          variant="outline"
          className="min-h-[48px] gap-2 !border-[#c9a96e]/50 !bg-[#1a2744] text-[#c9a96e] hover:!bg-[#1e2d4a] hover:!border-[#c9a96e]/70 mb-6"
          onClick={() => router.push(backUrl)}
        >
          <ArrowLeft className="h-5 w-5" />
          Volver
        </Button>

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {PRENDAS_BODY.map(({ slug, label, piezas, icon: Icon }) => (
            <Link
              key={slug}
              href={`/sastre/nueva-venta/ficha?tipo=${encodeURIComponent(tipo)}&clientId=${encodeURIComponent(clientId)}&prenda=${encodeURIComponent(slug)}`}
              className="w-full text-left p-5 rounded-2xl border border-[#c9a96e]/20 bg-gradient-to-br from-[#1a2744] to-[#0d1629] hover:border-[#c9a96e]/60 hover:bg-[#1a2744] transition-all touch-manipulation group"
            >
              <div className="w-10 h-10 rounded-xl bg-[#c9a96e]/10 border border-[#c9a96e]/20 flex items-center justify-center mb-3 group-hover:bg-[#c9a96e]/20 transition-colors">
                <Icon className="h-5 w-5 text-[#c9a96e]" />
              </div>
              <p className="text-white font-medium text-base">{label}</p>
              <p className="text-white/40 text-xs mt-1">{piezas}</p>
            </Link>
          ))}
        </div>
      </div>
    </div>
  )
}
