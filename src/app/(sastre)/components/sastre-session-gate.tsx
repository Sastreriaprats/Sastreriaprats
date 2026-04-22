'use client'

import { useEffect, useState, useRef } from 'react'
import { Loader2, MapPin } from 'lucide-react'
import { toast } from 'sonner'
import { useAuth } from '@/components/providers/auth-provider'
import { useRequireStore } from '@/hooks/use-require-store'
import { checkCashSessionOpen, openCashSession } from '@/actions/pos'
import { CashCounter } from '@/components/cash/cash-counter'

interface SastreSessionGateProps {
  children: React.ReactNode
}

type Step = 'loading' | 'open_cash' | 'ready'

/**
 * Una vez que StoreGate ha confirmado la tienda, verificamos si hay caja
 * abierta para operar. Si no → muestra pantalla de apertura. El usuario
 * puede continuar sin caja (solo consulta).
 */
export function SastreSessionGate({ children }: SastreSessionGateProps) {
  const { activeStoreId } = useAuth()
  const { storeName, clearConfirmation } = useRequireStore()
  const [step, setStep] = useState<Step>('loading')
  const [openingAmount, setOpeningAmount] = useState('0')
  const [cashBreakdown, setCashBreakdown] = useState<Record<string, number>>({})
  const [opening, setOpening] = useState(false)
  const checkedRef = useRef<string | null>(null)

  useEffect(() => {
    if (!activeStoreId) return
    if (checkedRef.current === activeStoreId) return
    checkedRef.current = activeStoreId

    setStep('loading')
    checkCashSessionOpen({ storeId: activeStoreId })
      .then((r) => setStep(r.success && r.data.open ? 'ready' : 'open_cash'))
      .catch(() => setStep('open_cash'))
  }, [activeStoreId])

  async function handleOpenCash() {
    if (!activeStoreId) return
    setOpening(true)
    try {
      const result = await openCashSession({
        store_id: activeStoreId,
        opening_amount: parseFloat(openingAmount) || 0,
        opening_breakdown: cashBreakdown,
      })
      if (result.success) {
        toast.success('Caja abierta correctamente')
        setStep('ready')
      } else {
        toast.error(result.error ?? 'Error al abrir la caja')
      }
    } catch {
      toast.error('Error inesperado al abrir la caja')
    } finally {
      setOpening(false)
    }
  }

  const bgStyle = { background: 'radial-gradient(ellipse at top, #1a2744 0%, #0a1020 70%)' }

  if (step === 'loading') {
    return (
      <div style={bgStyle} className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-white/40" />
      </div>
    )
  }

  if (step === 'open_cash') {
    return (
      <div style={bgStyle} className="min-h-screen flex flex-col items-center justify-center p-6">
        <div className="max-w-2xl w-full space-y-6">
          <div className="text-center">
            <h1 className="text-2xl font-serif text-white">Caja cerrada</h1>
            {storeName && (
              <div className="flex items-center justify-center gap-1.5 mt-1 text-white/40 text-sm">
                <MapPin className="h-3.5 w-3.5" />
                {storeName}
              </div>
            )}
            <p className="text-white/50 mt-3">Abre la caja para poder registrar cobros</p>
            <p className="text-amber-400/80 text-sm mt-1">Sin caja abierta podrás consultar pedidos, pero no registrar pagos</p>
          </div>

          <div className="space-y-4">
            <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
              <CashCounter
                value={cashBreakdown}
                onChange={(breakdown, total) => {
                  setCashBreakdown(breakdown)
                  setOpeningAmount(String(total))
                }}
                label="Efectivo inicial en caja"
                variant="dark"
              />
            </div>
            <button
              onClick={handleOpenCash}
              disabled={opening}
              className="w-full h-12 rounded-xl bg-[#c9a96e] text-[#0a1020] font-semibold hover:bg-[#c9a96e]/90 shadow-lg shadow-[#c9a96e]/20 transition-all disabled:opacity-50"
            >
              {opening ? 'Abriendo...' : 'Abrir caja'}
            </button>
            <button
              onClick={() => setStep('ready')}
              className="w-full h-12 rounded-xl bg-white/[0.05] border border-white/15 text-white/70 font-medium hover:bg-white/10 transition-all"
            >
              Continuar sin abrir caja
            </button>
            <p className="text-white/30 text-xs text-center">Si continúas sin abrir caja, no podrás registrar cobros</p>
          </div>

          <button
            onClick={() => { clearConfirmation(); checkedRef.current = null }}
            className="text-white/40 text-sm hover:text-white/60 transition-colors mx-auto block"
          >
            ← Cambiar tienda
          </button>
        </div>
      </div>
    )
  }

  // ready
  return <>{children}</>
}
