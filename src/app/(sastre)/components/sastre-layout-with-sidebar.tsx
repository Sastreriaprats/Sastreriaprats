'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import {
  LogOut,
  Calendar,
  Users,
  Ruler,
  Package,
  Shirt,
  ListOrdered,
  ShoppingCart,
  CircleDollarSign,
  MapPin,
} from 'lucide-react'
import { useActiveStore } from '@/hooks/use-store'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

type Props = {
  sastreName: string
  isSastrePlus?: boolean
  children: React.ReactNode
}

const navClass = (active: boolean) =>
  `flex flex-col items-center gap-1 px-1.5 py-2 rounded-md text-xs transition-colors touch-manipulation min-h-[44px] justify-center ${
    active ? 'bg-[#c9a96e]/20 text-[#c9a96e]' : 'text-white/70 hover:text-white hover:bg-white/5'
  }`

export function SastreLayoutWithSidebar({ sastreName, isSastrePlus = false, children }: Props) {
  const pathname = usePathname()
  const router = useRouter()
  const { activeStoreId, switchStore } = useActiveStore()
  const [allStores, setAllStores] = useState<{ id: string; name: string }[]>([])

  useEffect(() => {
    createClient()
      .from('stores')
      .select('id, name')
      .eq('is_active', true)
      .neq('store_type', 'online')
      .order('name')
      .then(({ data }) => {
        if (data) setAllStores(data)
      })
  }, [])

  useEffect(() => {
    if (!activeStoreId && allStores.length > 0) switchStore(allStores[0].id)
  }, [activeStoreId, allStores, switchStore])

  const handleLogout = async () => {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/auth/login')
    router.refresh()
  }

  return (
    <div className="min-h-screen flex" style={{ background: 'radial-gradient(ellipse at top, #1a2744 0%, #0a1020 70%)' }}>
      <aside
        className="w-28 shrink-0 flex flex-col border-r border-[#c9a96e]/20"
        style={{ backgroundColor: '#0d1629' }}
      >
        <Link href="/sastre/nueva-venta" className="p-2 flex flex-col gap-1">
          <img
            src="/logo-prats.png"
            alt="Prats"
            width={96}
            height={36}
            className="object-contain w-full h-9"
            style={{ filter: 'brightness(0) invert(1)', objectFit: 'contain' }}
          />
          <div className="h-px w-full bg-[#c9a96e]/30" aria-hidden />
          <span className="tracking-[0.12em] text-[10px] text-white/80 font-light leading-tight">
            SASTRERÍA MADRID · EST. 1985
          </span>
        </Link>
        <nav className="p-1.5 flex flex-col gap-0.5">
          <Link
            href="/sastre/nueva-venta"
            className={navClass(pathname === '/sastre/nueva-venta' || pathname.startsWith('/sastre/nueva-venta/'))}
          >
            <Shirt className="h-5 w-5 shrink-0" />
            <span className="text-center leading-tight">Nueva venta</span>
          </Link>
          <Link href="/sastre/calendario" className={navClass(pathname === '/sastre/calendario')}>
            <Calendar className="h-5 w-5 shrink-0" />
            <span className="text-center leading-tight">Calendario</span>
          </Link>
          <Link href="/sastre/clientes" className={navClass(pathname === '/sastre/clientes' || pathname.startsWith('/sastre/clientes/'))}>
            <Users className="h-5 w-5 shrink-0" />
            <span className="text-center leading-tight">Clientes</span>
          </Link>
          <Link href="/sastre/clientes" className={navClass(false)} title="Tomar medidas (desde cliente)">
            <Ruler className="h-5 w-5 shrink-0" />
            <span className="text-center leading-tight">Tomar medidas</span>
          </Link>
          <Link href="/sastre/stock" className={navClass(pathname === '/sastre/stock' || pathname.startsWith('/sastre/stock'))}>
            <Package className="h-5 w-5 shrink-0" />
            <span className="text-center leading-tight">Stock</span>
          </Link>
          <Link href="/sastre/pedidos" className={navClass(pathname === '/sastre/pedidos' || pathname.startsWith('/sastre/pedidos'))}>
            <ListOrdered className="h-5 w-5 shrink-0" />
            <span className="text-center leading-tight">Pedidos</span>
          </Link>
          {isSastrePlus && (
            <>
              <Link href="/pos/caja" className={navClass(pathname === '/pos/caja')}>
                <ShoppingCart className="h-5 w-5 shrink-0" />
                <span className="text-center leading-tight">Caja TPV</span>
              </Link>
              <Link href="/sastre/cobros" className={navClass(pathname === '/sastre/cobros')}>
                <CircleDollarSign className="h-5 w-5 shrink-0" />
                <span className="text-center leading-tight">Cobros</span>
              </Link>
            </>
          )}
        </nav>
        <div className="flex-1" />
        <div className="p-2 border-t border-[#c9a96e]/20 flex flex-col gap-1.5">
          {allStores.length > 0 && (
            <Select value={activeStoreId ?? ''} onValueChange={switchStore}>
              <SelectTrigger className="h-7 w-full text-xs bg-transparent border-[rgba(201,169,110,0.3)] text-white/80 [&>svg:last-child]:hidden">
                <span className="flex items-center gap-1 truncate">
                  <MapPin className="h-3 w-3 shrink-0" />
                  <SelectValue placeholder="Tienda" />
                </span>
              </SelectTrigger>
              <SelectContent className="bg-[#1a2744] border-[rgba(201,169,110,0.3)] text-white">
                {allStores.map((s) => (
                  <SelectItem key={s.id} value={s.id} className="text-white text-xs focus:bg-white/10 focus:text-white">
                    {s.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          <span className="text-white font-light text-[11px] truncate" title={sastreName}>{sastreName}</span>
          <button
            type="button"
            onClick={handleLogout}
            className="flex items-center gap-1.5 text-[#c9a96e]/70 hover:text-[#c9a96e] transition-colors text-xs w-full"
            aria-label="Cerrar sesión"
          >
            <LogOut className="h-3.5 w-3.5 shrink-0" />
            <span>Salir</span>
          </button>
        </div>
      </aside>
      <div className="flex-1 min-h-0 flex flex-col min-w-0">
        {children}
      </div>
    </div>
  )
}
