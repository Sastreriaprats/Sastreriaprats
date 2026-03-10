'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/components/providers/auth-provider'
import { getCurrentSession, getPhysicalStoresForCaja } from '@/actions/pos'
import { Button } from '@/components/ui/button'
import { Loader2, Store } from 'lucide-react'

interface PosChooseStoreProps {
  onStoreSelected: (storeId: string, session: any) => void
  onOpenCash: (storeId: string) => void
}

/** Lista de todas las tiendas físicas (con caja), sin depender de la asignación del usuario. */
export function PosChooseStore({ onStoreSelected, onOpenCash }: PosChooseStoreProps) {
  const router = useRouter()
  const { setActiveStoreId } = useAuth()
  const [stores, setStores] = useState<Array<{ storeId: string; storeName: string }>>([])
  const [loadingStores, setLoadingStores] = useState(true)
  const [loadingStoreId, setLoadingStoreId] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    getPhysicalStoresForCaja()
      .then((result) => {
        if (cancelled) return
        if (result?.success && result.data) setStores(result.data)
        else setStores([])
      })
      .catch(() => { if (!cancelled) setStores([]) })
      .finally(() => { if (!cancelled) setLoadingStores(false) })
    return () => { cancelled = true }
  }, [])

  const handleSelectStore = async (storeId: string) => {
    setLoadingStoreId(storeId)
    setActiveStoreId(storeId)
    try {
      const result = await getCurrentSession(storeId)
      if (result.success && result.data) {
        onStoreSelected(storeId, result.data)
      } else {
        onOpenCash(storeId)
      }
    } catch (err) {
      console.error('[pos-choose-store]', err)
      onOpenCash(storeId)
    } finally {
      setLoadingStoreId(null)
    }
  }

  if (loadingStores) {
    return (
      <div className="min-h-full flex items-center justify-center p-6 bg-gradient-to-br from-slate-200/60 via-slate-100 to-slate-300/50">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="h-10 w-10 animate-spin text-[#1B2A4A]" />
          <p className="text-slate-600 font-medium">Cargando tiendas...</p>
        </div>
      </div>
    )
  }

  if (stores.length === 0) {
    return (
      <div className="min-h-full flex items-center justify-center p-6 bg-gradient-to-br from-slate-200/60 via-slate-100 to-slate-300/50">
        <div className="text-center max-w-md">
          <p className="text-slate-600 font-medium">No hay tiendas con caja configuradas.</p>
          <p className="text-sm text-slate-500 mt-1">La tienda online no tiene caja; solo aparecen tiendas físicas activas.</p>
          <Button variant="outline" className="mt-4" onClick={() => router.back()}>
            Volver al perfil
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-full flex items-center justify-center p-6 bg-gradient-to-br from-slate-200/60 via-slate-100 to-slate-300/50">
      <div className="w-full max-w-lg">
        <div className="rounded-3xl border border-slate-200 bg-white shadow-2xl shadow-slate-300/50 overflow-hidden ring-1 ring-slate-200/50">
          <div className="bg-gradient-to-r from-[#1B2A4A] via-[#243b5e] to-[#2a3f6b] px-8 pt-10 pb-8 text-center">
            <div className="inline-flex h-20 w-20 items-center justify-center rounded-2xl bg-white/20 backdrop-blur-sm mb-6 ring-1 ring-white/20">
              <Store className="h-10 w-10 text-white" strokeWidth={1.5} />
            </div>
            <h1 className="text-xl font-semibold tracking-tight text-white drop-shadow-sm">
              ¿En qué tienda quieres trabajar la caja?
            </h1>
            <p className="mt-2 text-sm text-white/90">
              Elige la tienda para abrir caja o continuar vendiendo.
            </p>
          </div>

          <div className="p-6 space-y-3">
            {stores.map((s) => (
              <Button
                key={s.storeId}
                variant="outline"
                className="w-full h-14 justify-start gap-3 text-left px-5 rounded-xl border-2 border-slate-200 hover:border-[#1B2A4A] hover:bg-[#1B2A4A]/5"
                onClick={() => handleSelectStore(s.storeId)}
                disabled={loadingStoreId !== null}
              >
                {loadingStoreId === s.storeId ? (
                  <Loader2 className="h-5 w-5 shrink-0 animate-spin" />
                ) : (
                  <Store className="h-5 w-5 shrink-0 text-slate-500" />
                )}
                <span className="font-medium truncate">{s.storeName}</span>
              </Button>
            ))}
          </div>

          <div className="px-6 pb-6">
            <Button variant="ghost" className="w-full text-slate-500" onClick={() => router.back()}>
              Volver al perfil
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
