'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { LogOut, Calendar } from 'lucide-react'

type Props = {
  sastreName: string
  isSastrePlus?: boolean
  children: React.ReactNode
}

export function SastreLayoutWithSidebar({ sastreName, isSastrePlus = false, children }: Props) {
  const pathname = usePathname()
  const router = useRouter()

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
        <Link href="/sastre" className="p-3 flex flex-col gap-2">
          <img
            src="/logo-prats.png"
            alt="Prats"
            width={120}
            height={48}
            className="object-contain w-full min-h-[3rem] max-h-[4rem]"
            style={{ filter: 'brightness(0) invert(1)', objectFit: 'contain' }}
          />
          <div className="h-px w-full bg-[#c9a96e]/30" aria-hidden />
          <span className="tracking-[0.15em] text-[11px] text-white/80 font-light leading-tight">
            SASTRERÍA MADRID · EST. 1985
          </span>
        </Link>
        <nav className="p-2 flex flex-col gap-0.5">
          <Link
            href="/sastre/calendario"
            className={`flex flex-col items-center gap-1.5 px-2 py-3 rounded-md text-sm transition-colors ${
              pathname === '/sastre/calendario'
                ? 'bg-[#c9a96e]/20 text-[#c9a96e]'
                : 'text-white/70 hover:text-white hover:bg-white/5'
            }`}
          >
            <Calendar className="h-8 w-8 shrink-0" />
            <span>Calendario</span>
          </Link>
        </nav>
        <div className="flex-1" />
        <div className="p-3 border-t border-[#c9a96e]/20 flex flex-col gap-2">
          <span className="text-white font-light text-xs truncate" title={sastreName}>{sastreName}</span>
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
      {children}
    </div>
  )
}
