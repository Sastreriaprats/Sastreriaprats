'use client'

import Link from 'next/link'
import Image from 'next/image'
import { usePathname } from 'next/navigation'
import { useAuth } from '@/components/providers/auth-provider'
import { ScrollArea } from '@/components/ui/scroll-area'
import { LayoutDashboard, Users, Package, CircleDollarSign, ShoppingCart } from 'lucide-react'
import { cn } from '@/lib/utils'

const navItems = [
  { label: 'Dashboard', href: '/vendedor', icon: LayoutDashboard },
  { label: 'Clientes', href: '/vendedor/clientes', icon: Users },
  { label: 'Productos y Stock', href: '/vendedor/stock', icon: Package },
  { label: 'Cobros pendientes', href: '/vendedor/cobros', icon: CircleDollarSign },
  { label: 'Caja TPV', href: '/vendedor/caja', icon: ShoppingCart },
]

export function VendedorSidebar({ collapsed = false }: { collapsed?: boolean }) {
  const pathname = usePathname()
  const { profile } = useAuth()

  const isActive = (href: string) => {
    if (href === '/vendedor') return pathname === href || pathname === '/vendedor'
    return pathname.startsWith(href)
  }

  return (
    <aside className={cn(
      'flex flex-col border-r bg-white h-full transition-all duration-200',
      collapsed ? 'w-16' : 'w-60'
    )}>
      <div className={cn(
        'flex items-center border-b flex-shrink-0 bg-[#1a2744]',
        collapsed ? 'justify-center px-2 h-16' : 'gap-3 px-4 h-20'
      )}>
        {collapsed ? (
          <div className="h-8 w-8 rounded-lg bg-white/10 flex items-center justify-center flex-shrink-0">
            <Image src="/logo-prats.png" alt="Prats" width={28} height={20} style={{ objectFit: 'contain', filter: 'invert(1) brightness(2)' }} priority />
          </div>
        ) : (
          <div className="flex flex-col items-start min-w-0">
            <Image src="/logo-prats.png" alt="Prats" width={88} height={44} style={{ objectFit: 'contain', filter: 'invert(1) brightness(2)' }} priority />
            <p className="text-[10px] text-white/50 tracking-[0.2em] uppercase mt-1">Panel vendedor</p>
          </div>
        )}
      </div>

      <ScrollArea className="flex-1 py-2">
        <nav className="space-y-0.5 px-2">
          {navItems.map((item) => {
            const active = isActive(item.href)
            const Icon = item.icon
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  'flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors',
                  active ? 'bg-[#1a2744] text-white' : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                  collapsed && 'justify-center px-0'
                )}
                title={collapsed ? item.label : undefined}
              >
                <Icon className="h-4 w-4 flex-shrink-0" />
                {!collapsed && <span className="flex-1 truncate">{item.label}</span>}
              </Link>
            )
          })}
        </nav>
      </ScrollArea>

      <div className="border-t p-3 flex-shrink-0">
        {collapsed ? (
          <div className="flex justify-center">
            <div className="h-8 w-8 rounded-full bg-[#1a2744] text-white text-xs flex items-center justify-center font-medium">
              {profile?.fullName?.charAt(0) || '?'}
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-3 px-2 py-1.5 rounded-lg">
            <div className="h-8 w-8 rounded-full bg-[#1a2744] text-white text-xs flex items-center justify-center font-medium flex-shrink-0">
              {profile?.fullName?.split(' ').map(n => n[0]).join('').slice(0, 2) || '?'}
            </div>
            <div className="min-w-0">
              <p className="text-sm font-medium truncate">{profile?.fullName}</p>
              <p className="text-[10px] text-muted-foreground truncate">{profile?.email}</p>
            </div>
          </div>
        )}
      </div>
    </aside>
  )
}
