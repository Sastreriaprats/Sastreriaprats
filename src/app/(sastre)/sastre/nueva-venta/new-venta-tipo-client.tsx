'use client'

import Link from 'next/link'
import { Shirt, Factory } from 'lucide-react'
import { NuevaVentaSteps } from './nueva-venta-steps'

const CARDS = [
  {
    tipo: 'artesanal' as const,
    label: 'Artesanal',
    description: 'Trajes y prendas a medida confeccionadas de forma artesanal.',
    icon: Shirt,
    href: '/sastre/nueva-venta/cliente?tipo=artesanal',
  },
  {
    tipo: 'industrial' as const,
    label: 'Industrial',
    description: 'Prendas confeccionadas con proceso industrial.',
    icon: Factory,
    href: '/sastre/nueva-venta/cliente?tipo=industrial',
  },
  {
    tipo: 'camiseria' as const,
    label: 'Camisería',
    description: 'Camisas y camisería a medida.',
    icon: Shirt,
    href: '/sastre/nueva-venta/cliente?tipo=camiseria',
  },
]

export function NewVentaTipoClient() {
  return (
    <div className="flex-1 flex flex-col min-w-0 overflow-x-hidden">
      <div className="p-6 max-w-3xl mx-auto w-full space-y-6">
        <NuevaVentaSteps currentStep={1} />
        <h1 className="text-2xl font-serif text-white text-center">Nueva venta</h1>
        <p className="text-white/60 text-center">Elige el tipo de pedido</p>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
          {CARDS.map(({ tipo, label, description, icon: Icon, href }) => (
            <Link
              key={tipo}
              href={href}
              className="min-h-[14rem] flex flex-col rounded-xl border-2 border-[#c9a96e]/30 bg-[#1a2744] hover:bg-[#1e2d4a] hover:border-[#c9a96e]/50 transition-all duration-300 p-6 touch-manipulation"
            >
              <div className="w-14 h-14 rounded-full border border-[#c9a96e]/40 flex items-center justify-center shrink-0">
                <Icon className="h-7 w-7 text-[#c9a96e]" />
              </div>
              <span className="font-serif text-lg text-white mt-4 block">{label}</span>
              <p className="text-white/60 text-sm mt-2 flex-1">{description}</p>
            </Link>
          ))}
        </div>
      </div>
    </div>
  )
}
