'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Loader2, Wallet } from 'lucide-react'
import { useAuth } from '@/components/providers/auth-provider'
import { useAction } from '@/hooks/use-action'
import { openCashSession } from '@/actions/pos'

export function PosOpenCash({ storeId, onOpened }: { storeId: string | undefined; onOpened: (session: any) => void }) {
  const { profile } = useAuth()
  const [openingAmount, setOpeningAmount] = useState('300')

  const { execute, isLoading } = useAction(openCashSession, {
    successMessage: 'Caja abierta',
    onSuccess: onOpened,
  })

  const loadingStore = !storeId
  const amounts = [100, 200, 300, 500]

  return (
    <div className="min-h-full flex items-center justify-center p-6 bg-gradient-to-br from-slate-200/60 via-slate-100 to-slate-300/50">
      <div className="w-full max-w-lg">
        <div className="rounded-3xl border border-slate-200 bg-white shadow-2xl shadow-slate-300/50 overflow-hidden ring-1 ring-slate-200/50">
          {/* Cabecera */}
          <div className="bg-gradient-to-r from-[#1B2A4A] via-[#243b5e] to-[#2a3f6b] px-8 pt-10 pb-8 text-center">
            <div className="inline-flex h-20 w-20 items-center justify-center rounded-2xl bg-white/20 backdrop-blur-sm mb-6 ring-1 ring-white/20">
              <Wallet className="h-10 w-10 text-white" strokeWidth={1.5} />
            </div>
            <h1 className="text-2xl font-semibold tracking-tight text-white drop-shadow-sm">
              Abrir caja
            </h1>
            <p className="mt-2 text-sm text-white/90">
              {loadingStore ? 'Cargando tienda...' : <>Hola, <span className="font-medium text-white">{profile?.fullName}</span>. Indica el fondo inicial.</>}
            </p>
          </div>

          <div className="p-8 space-y-8 bg-white">
            <div className="space-y-3">
              <Label className="text-slate-700 font-medium">Fondo inicial (€)</Label>
              <Input
                type="number"
                step="0.01"
                min="0"
                value={openingAmount}
                onChange={(e) => setOpeningAmount(e.target.value)}
                className="h-16 text-center text-3xl font-semibold font-mono tracking-wide border-2 border-slate-200 focus:ring-2 focus:ring-[#1B2A4A]/25 focus:border-[#1B2A4A] rounded-xl bg-slate-50/50"
                autoFocus
                disabled={loadingStore}
              />
            </div>

            <div>
              <p className="text-xs text-slate-500 font-semibold uppercase tracking-wider mb-3">Cantidades rápidas</p>
              <div className="grid grid-cols-4 gap-3">
                {amounts.map((amount) => (
                  <button
                    key={amount}
                    type="button"
                    onClick={() => setOpeningAmount(amount.toString())}
                    disabled={loadingStore}
                    className={`h-12 rounded-xl border-2 text-sm font-semibold transition-all duration-200 ${
                      openingAmount === amount.toString()
                        ? 'border-[#1B2A4A] bg-[#1B2A4A] text-white shadow-md shadow-[#1B2A4A]/30'
                        : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50 shadow-sm'
                    }`}
                  >
                    {amount} €
                  </button>
                ))}
              </div>
            </div>

            <Button
              onClick={() => storeId && execute({ store_id: storeId, opening_amount: parseFloat(openingAmount) || 0 })}
              disabled={isLoading || loadingStore}
              className="w-full h-14 text-base font-semibold rounded-xl bg-[#1B2A4A] hover:bg-[#253a5c] shadow-lg shadow-[#1B2A4A]/25 transition-all duration-200"
            >
              {isLoading ? (
                <Loader2 className="mr-2 h-5 w-5 animate-spin" />
              ) : (
                <Wallet className="mr-2 h-5 w-5" />
              )}
              Abrir caja
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
