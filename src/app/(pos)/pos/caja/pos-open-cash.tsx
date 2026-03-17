'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Loader2, Wallet } from 'lucide-react'
import { useAuth } from '@/components/providers/auth-provider'
import { useAction } from '@/hooks/use-action'
import { openCashSession } from '@/actions/pos'
import { CashCounter } from '@/components/cash/cash-counter'

export function PosOpenCash({ storeId, onOpened }: { storeId: string | undefined; onOpened: (session: any) => void }) {
  const { profile } = useAuth()
  const [cashBreakdown, setCashBreakdown] = useState<Record<string, number>>({})
  const [openingTotal, setOpeningTotal] = useState(0)

  const { execute, isLoading } = useAction(openCashSession, {
    successMessage: 'Caja abierta',
    onSuccess: onOpened,
  })

  const loadingStore = !storeId

  return (
    <div className="min-h-full flex items-center justify-center p-6 bg-gradient-to-br from-slate-200/60 via-slate-100 to-slate-300/50">
      <div className="w-full max-w-2xl">
        <div className="rounded-3xl border border-slate-200 bg-white shadow-2xl shadow-slate-300/50 overflow-hidden ring-1 ring-slate-200/50">
          {/* Cabecera */}
          <div className="bg-gradient-to-r from-[#1B2A4A] via-[#243b5e] to-[#2a3f6b] px-8 pt-8 pb-7 text-center">
            <div className="inline-flex h-16 w-16 items-center justify-center rounded-2xl bg-white/20 backdrop-blur-sm mb-4 ring-1 ring-white/20">
              <Wallet className="h-8 w-8 text-white" strokeWidth={1.5} />
            </div>
            <h1 className="text-2xl font-semibold tracking-tight text-white drop-shadow-sm">
              Abrir caja
            </h1>
            <p className="mt-1.5 text-sm text-white/90">
              {loadingStore
                ? 'Cargando tienda...'
                : <>Hola, <span className="font-medium text-white">{profile?.fullName}</span>. Cuenta el efectivo inicial.</>
              }
            </p>
          </div>

          <div className="p-8 space-y-6 bg-white">
            <CashCounter
              value={cashBreakdown}
              onChange={(breakdown, total) => {
                setCashBreakdown(breakdown)
                setOpeningTotal(total)
              }}
              label="Fondo inicial en caja"
              variant="light"
            />

            <Button
              onClick={() => storeId && execute({ store_id: storeId, opening_amount: openingTotal, opening_breakdown: cashBreakdown })}
              disabled={isLoading || loadingStore}
              className="w-full h-14 text-base font-semibold rounded-xl bg-[#1B2A4A] hover:bg-[#253a5c] shadow-lg shadow-[#1B2A4A]/25 transition-all duration-200"
            >
              {isLoading ? (
                <Loader2 className="mr-2 h-5 w-5 animate-spin" />
              ) : (
                <Wallet className="mr-2 h-5 w-5" />
              )}
              Abrir caja {openingTotal > 0 && `— ${openingTotal.toFixed(2)} €`}
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
