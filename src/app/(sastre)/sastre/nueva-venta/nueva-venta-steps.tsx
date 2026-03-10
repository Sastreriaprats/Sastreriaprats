'use client'

import Link from 'next/link'
import { Check } from 'lucide-react'

const STEPS = [
  { num: 1, label: 'Tipo', path: '/sastre/nueva-venta' },
  { num: 2, label: 'Cliente', path: null },
  { num: 3, label: 'Medidas', path: null },
  { num: 4, label: 'Prenda', path: null },
  { num: 5, label: 'Ficha', path: null },
] as const

export function NuevaVentaSteps({ currentStep, tipo, clientId }: { currentStep: 1 | 2 | 3 | 4 | 5; tipo?: string; clientId?: string }) {
  const base = '/sastre/nueva-venta'
  const paths: (string | null)[] = [
    `${base}`,
    tipo ? `${base}/cliente?tipo=${encodeURIComponent(tipo)}` : null,
    tipo && clientId ? `${base}/medidas?tipo=${encodeURIComponent(tipo)}&clientId=${encodeURIComponent(clientId)}` : null,
    tipo && clientId ? `${base}/prenda?tipo=${encodeURIComponent(tipo)}&clientId=${encodeURIComponent(clientId)}` : null,
    tipo && clientId ? `${base}/ficha?tipo=${encodeURIComponent(tipo)}&clientId=${encodeURIComponent(clientId)}` : null,
  ]

  return (
    <nav aria-label="Progreso nueva venta" className="w-full border-b border-[#c9a96e]/20 pb-4 mb-6">
      <ol className="flex flex-wrap items-center justify-center gap-2 sm:gap-4">
        {STEPS.map((step, idx) => {
          const stepNum = step.num
          const isCurrent = currentStep === stepNum
          const isPast = currentStep > stepNum
          const href = paths[idx] ?? step.path
          const content = (
            <>
              <span className="flex items-center justify-center w-8 h-8 rounded-full border-2 text-sm font-medium shrink-0 transition-colors touch-manipulation min-h-[48px] sm:min-h-0 sm:h-8">
                {isPast ? <Check className="h-4 w-4" /> : stepNum}
              </span>
              <span className="hidden sm:inline text-sm font-medium">{step.label}</span>
            </>
          )
          const className = `flex items-center gap-1.5 px-2 py-2 rounded-lg min-h-[48px] sm:min-h-0 ${
            isCurrent
              ? 'border-2 border-[#c9a96e] bg-[#c9a96e]/10 text-white'
              : isPast
                ? 'border border-[#c9a96e]/30 bg-[#1a2744] text-[#c9a96e]'
                : 'border border-[#c9a96e]/20 bg-[#1a2744]/60 text-white/60'
          }`
          if (href && (isPast || isCurrent)) {
            return (
              <li key={step.num}>
                <Link href={href} className={className}>
                  {content}
                </Link>
              </li>
            )
          }
          return (
            <li key={step.num}>
              <span className={className}>{content}</span>
            </li>
          )
        })}
      </ol>
    </nav>
  )
}
