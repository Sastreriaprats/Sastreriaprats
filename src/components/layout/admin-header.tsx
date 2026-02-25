'use client'

import { useState, useEffect, useMemo } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet'
import {
  Bell, Menu, LogOut, User, ChevronRight, PanelLeftClose, PanelLeft, Settings,
  LayoutDashboard, Users, Scissors, CreditCard, Package, Truck, BookOpen, Calendar, Shirt,
} from 'lucide-react'
import { useAuth } from '@/components/providers/auth-provider'
import { logoutAction } from '@/actions/auth'
import { getDashboardAlerts } from '@/actions/dashboard'
import { NotificationsPanel } from './notifications-panel'
import { usePermissions } from '@/hooks/use-permissions'
import { cn } from '@/lib/utils'

const breadcrumbLabels: Record<string, string> = {
  admin: '', dashboard: 'Dashboard', clientes: 'Clientes', pedidos: 'Pedidos',
  stock: 'Stock', proveedores: 'Proveedores', contabilidad: 'Contabilidad',
  calendario: 'Calendario', configuracion: 'Configuración', perfil: 'Mi perfil',
  nuevo: 'Nuevo', devoluciones: 'Devoluciones', auditoria: 'Seguimiento', cobros: 'Cobros pendientes',
}

const mobileNavItems = [
  { label: 'Dashboard',    href: '/admin/dashboard',   icon: LayoutDashboard },
  { label: 'Clientes',    href: '/admin/clientes',     icon: Users,      permission: 'clients.view' },
  { label: 'Pedidos',     href: '/admin/pedidos',      icon: Scissors,   permission: 'orders.view' },
  { label: 'TPV',         href: '/pos/caja',           icon: CreditCard, permission: 'pos.access' },
  { label: 'Productos',   href: '/admin/stock',        icon: Package,    permission: 'products.view' },
  { label: 'Proveedores', href: '/admin/proveedores',  icon: Truck,      permission: 'suppliers.view' },
  { label: 'Contabilidad',href: '/admin/contabilidad', icon: BookOpen,   permission: 'accounting.view' },
  { label: 'Calendario',  href: '/admin/calendario',   icon: Calendar,   permission: 'calendar.view' },
  { label: 'Configuración',href: '/admin/configuracion',icon: Settings,  permission: 'config.view' },
]

function MobileSidebar() {
  const pathname = usePathname()
  const { can } = usePermissions()
  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-3 px-4 h-16 border-b bg-prats-navy">
        <Image src="/logo-prats.png" alt="Prats" width={72} height={36} style={{ objectFit: 'contain', height: 36, width: 'auto', filter: 'invert(1) brightness(2)' }} priority />
        <p className="text-[10px] text-white/50 tracking-[0.2em] uppercase">Panel de gestión</p>
      </div>
      <nav className="flex-1 p-2 space-y-0.5">
        {mobileNavItems.filter(item => !item.permission || can(item.permission)).map(item => {
          const Icon = item.icon
          const active = pathname.startsWith(item.href.split('?')[0])
          return (
            <Link key={item.href} href={item.href}
              className={cn(
                'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors',
                active ? 'bg-prats-navy text-white' : 'text-muted-foreground hover:bg-muted'
              )}>
              <Icon className="h-4 w-4" />{item.label}
            </Link>
          )
        })}
      </nav>
    </div>
  )
}

export function AdminHeader({
  collapsed,
  onToggleCollapse,
}: {
  collapsed: boolean
  onToggleCollapse: () => void
}) {
  const pathname = usePathname()
  const router = useRouter()
  const { profile } = useAuth()
  const [showNotifications, setShowNotifications] = useState(false)
  const [unreadCount, setUnreadCount] = useState(0)
  const [alertsCount, setAlertsCount] = useState(0)
  const supabase = useMemo(() => createClient(), [])

  useEffect(() => {
    const fetchCount = async () => {
      if (!profile?.id) return
      const [notifRes, alertsRes] = await Promise.all([
        supabase.from('notifications').select('id', { count: 'exact', head: true }).eq('user_id', profile.id).eq('is_read', false),
        getDashboardAlerts(),
      ])
      const nr = notifRes as { count?: number }
      setUnreadCount(nr?.count ?? 0)
      if (alertsRes.success && alertsRes.data) {
        const a = alertsRes.data
        setAlertsCount(a.ordersOverdue + a.overduePayments + a.lowStockCount)
      } else setAlertsCount(0)
    }
    fetchCount()
    const interval = setInterval(fetchCount, 60000)
    return () => clearInterval(interval)
  }, [supabase, profile?.id])

  const totalAlertBadge = unreadCount + alertsCount

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
        <Button variant="ghost" size="icon" className="h-10 w-10 relative" onClick={() => setShowNotifications(true)} title="Alertas y notificaciones">
          <Bell className="h-5 w-5" />
          {totalAlertBadge > 0 && (
            <span className="absolute -top-0.5 -right-0.5 h-5 min-w-[20px] rounded-full bg-red-500 text-white text-xs flex items-center justify-center px-1 font-medium">
              {totalAlertBadge > 99 ? '99+' : totalAlertBadge}
            </span>
          )}
        </Button>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="h-8 w-8 rounded-full bg-prats-navy text-white text-xs font-medium">
              {profile?.fullName?.charAt(0) ?? '?'}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            <div className="px-2 py-1.5">
              <p className="text-sm font-medium">{profile?.fullName}</p>
              <p className="text-xs text-muted-foreground">{profile?.email}</p>
            </div>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => router.push('/admin/perfil')}><User className="mr-2 h-4 w-4" /> Mi perfil</DropdownMenuItem>
            <DropdownMenuItem onClick={() => router.push('/admin/configuracion')}><Settings className="mr-2 h-4 w-4" /> Configuración</DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={handleLogout} className="text-destructive"><LogOut className="mr-2 h-4 w-4" /> Cerrar sesión</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <NotificationsPanel open={showNotifications} onOpenChange={setShowNotifications} />
    </header>
  )
}
