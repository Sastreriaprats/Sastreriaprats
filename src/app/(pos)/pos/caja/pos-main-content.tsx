'use client'

import { useState, useEffect } from 'react'
import { useAuth } from '@/components/providers/auth-provider'
import { getCurrentSession } from '@/actions/pos'
import { Loader2 } from 'lucide-react'
import { PosOpenCash } from './pos-open-cash'
import { PosSaleScreen } from './pos-sale-screen'
import { PosCloseCash } from './pos-close-cash'

type PosView = 'loading' | 'open_cash' | 'sale' | 'close_cash'

export function PosMainContent() {
  const { activeStoreId } = useAuth()
  const [view, setView] = useState<PosView>('loading')
  const [session, setSession] = useState<any>(null)

  useEffect(() => {
    if (!activeStoreId) return
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
    setView('sale')
  }

  const handleCloseCash = () => setView('close_cash')

  const handleCashClosed = () => {
    setSession(null)
    setView('open_cash')
  }

  if (view === 'loading') {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-prats-navy" />
      </div>
    )
  }

  if (view === 'open_cash') {
    return <PosOpenCash storeId={activeStoreId!} onOpened={handleCashOpened} />
  }

  if (view === 'close_cash' && session) {
    return <PosCloseCash session={session} onClosed={handleCashClosed} onCancel={() => setView('sale')} />
  }

  if (view === 'sale' && session) {
    return <PosSaleScreen session={session} onCloseCash={handleCloseCash} />
  }

  return null
}
