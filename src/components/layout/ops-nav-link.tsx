'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Wallet } from 'lucide-react'
import { cn } from '@/lib/utils'
import { getMyAccess } from '@/actions/ops'

// Enlace que SOLO se renderiza si el usuario tiene alguna capa. Para el resto
// no devuelve nada (invisible; ni un rastro en el menú).
export function OpsNavLink({ collapsed }: { collapsed: boolean }) {
  const pathname = usePathname()
  const [show, setShow] = useState(false)

  useEffect(() => {
    let active = true
    getMyAccess()
      .then((a) => { if (active) setShow((a.scopes?.length ?? 0) > 0) })
      .catch(() => {})
    return () => { active = false }
  }, [])

  if (!show) return null
  const active = pathname.startsWith('/panel')

  return (
    <Link
      href="/panel"
      className={cn(
        'flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors',
        active ? 'bg-prats-navy text-white' : 'text-muted-foreground hover:bg-muted hover:text-foreground',
        collapsed && 'justify-center px-0',
      )}
      title={collapsed ? 'Tesorería' : undefined}
    >
      <Wallet className="h-4 w-4 flex-shrink-0" />
      {!collapsed && <span className="flex-1 truncate">Tesorería</span>}
    </Link>
  )
}
