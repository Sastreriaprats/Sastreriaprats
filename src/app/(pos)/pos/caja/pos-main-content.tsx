'use client'

import { useState, useEffect } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { useAuth } from '@/components/providers/auth-provider'
import { getCurrentSession } from '@/actions/pos'
import { Loader2 } from 'lucide-react'
import { POS_CHOOSE_STORE_FIRST } from './pos-caja-config'
import { PosChooseStore } from './pos-choose-store'
import { PosOpenCash } from './pos-open-cash'
import { PosSaleScreen } from './pos-sale-screen'
import { PosCloseCash } from './pos-close-cash'

type PosView = 'loading' | 'choose_store' | 'open_cash' | 'sale' | 'close_cash'

export function PosMainContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { activeStoreId } = useAuth()
  const [view, setView] = useState<PosView>(POS_CHOOSE_STORE_FIRST ? 'choose_store' : 'loading')
  const [session, setSession] = useState<any>(null)
  /** Cuando se elige tienda y hay que abrir caja, guardamos el id para usarlo en open_cash por si activeStoreId no ha actualizado aún. */
  const [storeIdForOpenCash, setStoreIdForOpenCash] = useState<string | null>(null)

  const initialCobro = (() => {
    const cobro = searchParams.get('cobro')
    const id = searchParams.get('id')
    const pending = searchParams.get('pending')
    const clientId = searchParams.get('clientId')
    const ref = searchParams.get('ref')
    const clientName = searchParams.get('clientName')
    if (!cobro || !id || (cobro !== 'order' && cobro !== 'sale')) return null
    const amount = parseFloat(pending || '0')
    if (!Number.isFinite(amount) || amount <= 0) return null
    return {
      entity_type: cobro === 'order' ? ('tailoring_order' as const) : ('sale' as const),
      entity_id: id,
      amount,
      client_id: clientId || '',
      client_name: clientName ? decodeURIComponent(clientName) : '',
      reference: ref ? decodeURIComponent(ref) : id.slice(0, 8),
    }
  })()

  useEffect(() => {
    if (POS_CHOOSE_STORE_FIRST) {
      // Con "elegir tienda primero" no dependemos de activeStoreId al entrar; el usuario elige en choose_store.
      return
    }
    if (!activeStoreId) {
      const t = setTimeout(() => setView('open_cash'), 1500)
      return () => clearTimeout(t)
    }
    getCurrentSession(activeStoreId)
      .then((result) => {
        if (result.success && result.data) {
          setSession(result.data)
          setView('sale')
        } else {
          setView('open_cash')
        }
      })
      .catch((err) => {
        console.error('[pos-main] getCurrentSession:', err)
        setView('open_cash')
      })
  }, [activeStoreId])

  const handleCashOpened = (newSession: any) => {
    setSession(newSession)
    setStoreIdForOpenCash(null)
    setView('sale')
  }

  const handleStoreSelected = (_storeId: string, existingSession: any) => {
    setSession(existingSession)
    setView('sale')
  }

  const handleOpenCashForStore = (storeId: string) => {
    setStoreIdForOpenCash(storeId)
    setView('open_cash')
  }

  const handleCloseCash = () => setView('close_cash')

  const handleCashClosed = () => {
    setSession(null)
    router.push('/admin/perfil')
  }

  if (view === 'loading') {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-prats-navy" />
      </div>
    )
  }

  if (POS_CHOOSE_STORE_FIRST && view === 'choose_store') {
    return (
      <PosChooseStore
        onStoreSelected={handleStoreSelected}
        onOpenCash={handleOpenCashForStore}
      />
    )
  }

  if (view === 'open_cash') {
    return (
      <PosOpenCash
        storeId={storeIdForOpenCash ?? activeStoreId ?? undefined}
        onOpened={handleCashOpened}
      />
    )
  }

  if (view === 'close_cash' && session) {
    return <PosCloseCash session={session} onClosed={handleCashClosed} onCancel={() => setView('sale')} />
  }

  if (view === 'sale' && session) {
    return <PosSaleScreen session={session} onCloseCash={handleCloseCash} initialCobro={initialCobro} />
  }

  return null
}
