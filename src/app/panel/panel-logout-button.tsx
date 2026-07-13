'use client'

import { useRouter } from 'next/navigation'
import { LogOut } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'

// Un usuario solo-Tesorería no tiene otra pantalla desde la que cerrar sesión.
export function PanelLogoutButton() {
  const router = useRouter()

  const handleLogout = async () => {
    const supabase = createClient()
    await supabase.auth.signOut({ scope: 'local' })
    router.push('/auth/login')
    router.refresh()
  }

  return (
    <button
      type="button"
      onClick={handleLogout}
      className="flex items-center gap-1.5 self-center rounded-md border border-white/15 px-3 py-1.5 text-sm text-white/70 transition-colors hover:border-white/30 hover:text-white"
    >
      <LogOut className="h-3.5 w-3.5" />
      Cerrar sesión
    </button>
  )
}
