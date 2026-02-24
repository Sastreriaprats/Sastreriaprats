'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { LayoutDashboard, ShoppingBag, Ruler, User, Heart, LogOut, Loader2 } from 'lucide-react'
import { useState } from 'react'
import { logoutClientAction } from '@/actions/auth'
import { cn } from '@/lib/utils'

const navItems = [
  { label: 'Mi cuenta', href: '/mi-cuenta', icon: LayoutDashboard, exact: true },
  { label: 'Mis pedidos', href: '/mi-cuenta/pedidos', icon: ShoppingBag },
  { label: 'Mis medidas', href: '/mi-cuenta/medidas', icon: Ruler },
  { label: 'Favoritos', href: '/mi-cuenta/favoritos', icon: Heart },
  { label: 'Mi perfil', href: '/mi-cuenta/datos', icon: User },
]

export function ClientSidebar() {
  const pathname = usePathname()
  const [loggingOut, setLoggingOut] = useState(false)

  const handleLogout = async () => {
    setLoggingOut(true)
    try {
      await logoutClientAction()
    } finally {
      setLoggingOut(false)
    }
  }

  return (
    <nav className="space-y-1">
      {navItems.map(item => {
        const Icon = item.icon
        const isActive = item.exact
          ? pathname === item.href
          : pathname === item.href || pathname.startsWith(item.href + '/')
        return (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              'flex items-center gap-3 px-4 py-3 rounded-xl text-sm transition-colors',
              isActive
                ? 'bg-prats-navy text-white'
                : 'text-gray-500 hover:bg-gray-50 hover:text-prats-navy'
            )}
          >
            <Icon className="h-4 w-4" />{item.label}
          </Link>
        )
      })}
      <button
        type="button"
        onClick={handleLogout}
        disabled={loggingOut}
        className="flex items-center gap-3 px-4 py-3 rounded-xl text-sm text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors w-full disabled:opacity-50"
      >
        {loggingOut ? <Loader2 className="h-4 w-4 animate-spin" /> : <LogOut className="h-4 w-4" />}
        Cerrar sesión
      </button>
    </nav>
  )
}
