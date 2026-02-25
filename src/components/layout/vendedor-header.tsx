'use client'

import { usePathname, useRouter } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet'
import { Menu, LogOut, ChevronRight, PanelLeftClose, PanelLeft } from 'lucide-react'
import { useAuth } from '@/components/providers/auth-provider'
import { logoutAction } from '@/actions/auth'
import { cn } from '@/lib/utils'
import { LayoutDashboard, Users, Package, CircleDollarSign, ShoppingCart } from 'lucide-react'

const breadcrumbLabels: Record<string, string> = {
  vendedor: '', clientes: 'Clientes', stock: 'Productos y Stock', cobros: 'Cobros pendientes', caja: 'Caja TPV',
}

const mobileNavItems = [
  { label: 'Dashboard', href: '/vendedor', icon: LayoutDashboard },
  { label: 'Clientes', href: '/vendedor/clientes', icon: Users },
  { label: 'Productos y Stock', href: '/vendedor/stock', icon: Package },
  { label: 'Cobros pendientes', href: '/vendedor/cobros', icon: CircleDollarSign },
  { label: 'Caja TPV', href: '/vendedor/caja', icon: ShoppingCart },
]

function MobileSidebar() {
  const pathname = usePathname()
  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-3 px-4 h-16 border-b bg-[#1a2744]">
        <Image src="/logo-prats.png" alt="Prats" width={72} height={36} style={{ objectFit: 'contain', height: 36, width: 'auto', filter: 'invert(1) brightness(2)' }} priority />
        <p className="text-[10px] text-white/50 tracking-[0.2em] uppercase">Panel vendedor</p>
      </div>
      <nav className="flex-1 p-2 space-y-0.5">
        {mobileNavItems.map(item => {
          const Icon = item.icon
          const active = pathname === item.href || (item.href !== '/vendedor' && pathname.startsWith(item.href))
          return (
            <Link key={item.href} href={item.href}
              className={cn(
                'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors',
                active ? 'bg-[#1a2744] text-white' : 'text-muted-foreground hover:bg-muted'
              )}>
              <Icon className="h-4 w-4" />{item.label}
            </Link>
          )
        })}
      </nav>
    </div>
  )
}

export function VendedorHeader({
  collapsed,
  onToggleCollapse,
}: {
  collapsed: boolean
  onToggleCollapse: () => void
}) {
  const pathname = usePathname()
  const router = useRouter()
  const { profile } = useAuth()

  const pathParts = pathname.split('/').filter(Boolean)
  const breadcrumbs = pathParts.map((part, idx) => {
    const href = '/' + pathParts.slice(0, idx + 1).join('/')
    const label = breadcrumbLabels[part] ?? (part.length === 36 ? '#' + part.slice(0, 8) : part)
    return { label, href }
  }).filter(b => b.label)

  const handleLogout = async () => {
    await logoutAction()
    router.push('/auth/login')
  }

  return (
    <header className="flex items-center justify-between h-16 px-4 border-b bg-white flex-shrink-0">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" className="h-8 w-8 hidden lg:flex" onClick={onToggleCollapse}>
          {collapsed ? <PanelLeft className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
        </Button>
        <Sheet>
          <SheetTrigger asChild>
            <Button variant="ghost" size="icon" className="h-8 w-8 lg:hidden"><Menu className="h-5 w-5" /></Button>
          </SheetTrigger>
          <SheetContent side="left" className="p-0 w-60">
            <MobileSidebar />
          </SheetContent>
        </Sheet>
        <nav className="hidden md:flex items-center gap-1 text-sm">
          {breadcrumbs.map((bc, idx) => (
            <div key={bc.href} className="flex items-center gap-1">
              {idx > 0 && <ChevronRight className="h-3 w-3 text-muted-foreground" />}
              {idx === breadcrumbs.length - 1 ? (
                <span className="font-medium">{bc.label}</span>
              ) : (
                <button type="button" onClick={() => router.push(bc.href)} className="text-muted-foreground hover:text-foreground transition-colors">
                  {bc.label}
                </button>
              )}
            </div>
          ))}
        </nav>
      </div>

      <div className="flex items-center gap-2">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="h-8 w-8 rounded-full bg-[#1a2744] text-white text-xs font-medium">
              {profile?.fullName?.charAt(0) ?? '?'}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            <div className="px-2 py-1.5">
              <p className="text-sm font-medium">{profile?.fullName}</p>
              <p className="text-xs text-muted-foreground">{profile?.email}</p>
            </div>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={handleLogout} className="text-destructive"><LogOut className="mr-2 h-4 w-4" /> Cerrar sesión</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  )
}
