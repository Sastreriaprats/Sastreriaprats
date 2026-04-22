'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { ArrowLeft, LogOut, MapPin } from 'lucide-react'
import { toast } from 'sonner'
import { useActiveStore } from '@/hooks/use-store'
import { useRequireStore } from '@/hooks/use-require-store'
import { checkCashSessionOpen } from '@/actions/pos'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

type Props = {
  sastreName: string
  /** Sección activa: "Clientes", "Medidas", "Medidas · Nombre cliente" */
  sectionTitle?: string
  /** @deprecated Usar sectionTitle */
  title?: string
  /** Si se pasa, se muestra botón volver a la izquierda */
  backHref?: string
}

export function SastreHeader({ sastreName, sectionTitle, title, backHref }: Props) {
  const activeSection = sectionTitle ?? title
  const router = useRouter()
  const { activeStoreId } = useActiveStore()
  const { availableStores, selectStore } = useRequireStore()
  // Mantenemos un fetch independiente sólo para el caso en que availableStores
  // aún no esté poblado (primera render del header tras confirmar); así el
  // Select no queda en blanco un instante. Se usa sólo como fallback visual.
  const [allStores, setAllStores] = useState<{ storeId: string; storeName: string }[]>([])

  useEffect(() => {
    if (availableStores.length > 0) {
      setAllStores(availableStores.map((s) => ({ storeId: s.storeId, storeName: s.storeName })))
      return
    }
    const supabase = createClient()
    supabase
      .from('stores')
      .select('id, name')
      .eq('is_active', true)
      .neq('store_type', 'online')
      .order('name')
      .then(({ data }) => {
        if (data) setAllStores(data.map((s) => ({ storeId: s.id, storeName: s.name })))
      })
  }, [availableStores])

  const handleSwitchStore = async (newStoreId: string) => {
    if (!newStoreId || newStoreId === activeStoreId) return
    // No permitir cambiar mientras haya caja abierta en la tienda actual
    if (activeStoreId) {
      const r = await checkCashSessionOpen({ storeId: activeStoreId })
      if (r.success && r.data.open) {
        const currentName = allStores.find((s) => s.storeId === activeStoreId)?.storeName ?? 'la tienda actual'
        toast.error(`Debes cerrar la caja de ${currentName} antes de cambiar de tienda`)
        return
      }
    }
    // selectStore actualiza activeStoreId y persiste la confirmación
    selectStore(newStoreId)
  }

  const handleLogout = async () => {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/auth/login')
    router.refresh()
  }

  return (
    <header
      className="min-h-[72px] flex items-center justify-between px-10 shrink-0"
      style={{ backgroundColor: '#0d1629', borderBottom: '1px solid rgba(201,169,110,0.2)' }}
    >
      <div className="flex items-center gap-4 min-w-0 flex-1">
        {backHref ? (
          <button
            type="button"
            onClick={() => router.back()}
            className="flex items-center justify-center w-12 h-12 rounded-xl bg-white/[0.06] border border-white/15 text-white/70 hover:bg-white/10 hover:text-white transition-all shrink-0 touch-manipulation"
            aria-label="Volver"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
        ) : null}
        <Link href="/sastre" className="flex items-center gap-6 min-w-0">
          <img
            src="/logo-prats.png"
            alt="Prats"
            width={140}
            height={45}
            className="object-contain shrink-0"
            style={{
              height: 45,
              width: 'auto',
              display: 'block',
              filter: 'brightness(0) invert(1)',
            }}
          />
          <div className="h-8 w-px bg-[#c9a96e]/30 shrink-0 hidden sm:block" aria-hidden />
          <span className="tracking-[0.3em] text-sm text-white/80 font-light whitespace-nowrap hidden sm:inline">
            SASTRERÍA MADRID · EST. 1985
            {activeSection ? ` — ${activeSection}` : ''}
          </span>
        </Link>
      </div>
      <div className="flex items-center gap-5 shrink-0">
        <span className="text-white font-serif font-light text-lg truncate max-w-[140px] sm:max-w-none">{sastreName}</span>
        {allStores.length > 0 && (
          <>
            <span className="h-5 w-px bg-white/20" aria-hidden />
            <Select value={activeStoreId ?? ''} onValueChange={handleSwitchStore}>
              <SelectTrigger
                className="h-8 min-w-0 w-auto max-w-[160px] sm:max-w-[200px] border-[rgba(201,169,110,0.3)] bg-transparent text-white text-sm font-normal hover:bg-[#1a2744] focus:ring-[rgba(201,169,110,0.3)] [&>svg:last-child]:hidden"
                style={{ backgroundColor: 'transparent' }}
              >
                <span className="flex items-center gap-1.5 truncate">
                  <MapPin className="h-3.5 w-3.5 shrink-0 opacity-80" />
                  <SelectValue placeholder="Tienda" />
                </span>
              </SelectTrigger>
              <SelectContent className="border-[rgba(201,169,110,0.3)] bg-[#1a2744] text-white">
                {allStores.map((s) => (
                  <SelectItem key={s.storeId} value={s.storeId} className="text-white focus:bg-white/10 focus:text-white">
                    {s.storeName}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </>
        )}
        <span className="h-5 w-px bg-white/20" aria-hidden />
        <button
          type="button"
          onClick={handleLogout}
          className="flex items-center gap-2 text-white/80 hover:text-white transition-colors text-base"
          aria-label="Cerrar sesión"
        >
          <LogOut className="h-5 w-5" />
          <span className="text-sm">Salir</span>
        </button>
      </div>
    </header>
  )
}
