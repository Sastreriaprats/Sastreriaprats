'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { ArrowLeft, LogOut } from 'lucide-react'

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
          <Link
            href={backHref}
            className="flex items-center justify-center w-12 h-12 rounded-xl border border-white/50 text-white hover:bg-white/5 transition-colors shrink-0 touch-manipulation"
            aria-label="Volver"
          >
            <ArrowLeft className="h-5 w-5" />
          </Link>
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
