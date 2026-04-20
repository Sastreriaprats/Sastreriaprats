'use client'

import { useState, useEffect, useRef } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { useAuth } from '@/components/providers/auth-provider'
import { getCurrentSession } from '@/actions/pos'
import { Loader2 } from 'lucide-react'
import { POS_CHOOSE_STORE_FIRST } from './pos-caja-config'
import { PosChooseStore } from './pos-choose-store'
import { PosOpenCash } from './pos-open-cash'
import { PosSaleScreen } from './pos-sale-screen'
import { PosCloseCash } from './pos-close-cash'

const POS_LAST_Caja_STORE_KEY = 'prats_pos_caja_last_store'

type PosView = 'loading' | 'choose_store' | 'open_cash' | 'sale' | 'close_cash'

export function PosMainContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { activeStoreId, setActiveStoreId } = useAuth()
  const [view, setView] = useState<PosView>(() => {
    if (!POS_CHOOSE_STORE_FIRST) return 'loading'
    if (typeof window === 'undefined') return 'choose_store'
    const stored = window.sessionStorage.getItem(POS_LAST_Caja_STORE_KEY)
    const fromAuth = typeof localStorage !== 'undefined' ? localStorage.getItem('prats_active_store') : null
    return (stored || fromAuth) ? 'loading' : 'choose_store'
  })
  const [session, setSession] = useState<any>(null)
  /** Cuando se elige tienda y hay que abrir caja, guardamos el id para usarlo en open_cash por si activeStoreId no ha actualizado aún. */
  const [storeIdForOpenCash, setStoreIdForOpenCash] = useState<string | null>(null)
  const restoredFromBackRef = useRef(false)

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

  // Al volver atrás a /pos/caja (ej. desde Resumen), restaurar la caja de la última tienda si tiene sesión abierta
  useEffect(() => {
    if (!POS_CHOOSE_STORE_FIRST || restoredFromBackRef.current) return
    if (view !== 'choose_store' && view !== 'loading') return
    const storeId = activeStoreId || (typeof window !== 'undefined' ? window.sessionStorage.getItem(POS_LAST_Caja_STORE_KEY) : null)
    if (!storeId) {
      if (view === 'loading') setView('choose_store')
      return
    }
    restoredFromBackRef.current = true
    getCurrentSession(storeId)
      .then((result) => {
        if (result.success && result.data) {
          setActiveStoreId(storeId)
          setSession(result.data)
          setView('sale')
        } else {
          setView('choose_store')
        }
      })
      .catch(() => setView('choose_store'))
  }, [POS_CHOOSE_STORE_FIRST, view, activeStoreId, setActiveStoreId])

  const handleCashOpened = (newSession: any) => {
    setSession(newSession)
    setStoreIdForOpenCash(null)
    setView('sale')
    if (typeof window !== 'undefined' && newSession?.store_id) {
      window.sessionStorage.setItem(POS_LAST_Caja_STORE_KEY, newSession.store_id)
    }
  }

  const handleStoreSelected = (_storeId: string, existingSession: any) => {
    setSession(existingSession)
    setView('sale')
    if (typeof window !== 'undefined') {
      window.sessionStorage.setItem(POS_LAST_Caja_STORE_KEY, _storeId)
    }
  }

  const handleOpenCashForStore = (storeId: string) => {
    setStoreIdForOpenCash(storeId)
    setView('open_cash')
  }

  const handleSwitchStore = async (storeId: string) => {
    if (!storeId || storeId === activeStoreId) return
    setActiveStoreId(storeId)
    setView('loading')
    try {
      const result = await getCurrentSession(storeId)
      if (result.success && result.data) {
        setSession(result.data)
        setView('sale')
        if (typeof window !== 'undefined') {
          window.sessionStorage.setItem(POS_LAST_Caja_STORE_KEY, storeId)
        }
      } else {
        setSession(null)
        setStoreIdForOpenCash(storeId)
        setView('open_cash')
      }
    } catch (err) {
      console.error('[pos-main] handleSwitchStore:', err)
      setSession(null)
      setStoreIdForOpenCash(storeId)
      setView('open_cash')
    }
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
    return <PosSaleScreen session={session} onCloseCash={handleCloseCash} initialCobro={initialCobro} onSwitchStore={handleSwitchStore} />
  }

  return null
}
