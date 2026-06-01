'use client'

import { useState, useEffect, useMemo } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Sheet, SheetContent, SheetClose, SheetTrigger } from '@/components/ui/sheet'
import {
  Bell, Menu, LogOut, User, ChevronRight, ChevronDown, PanelLeftClose, PanelLeft, Settings, Download,
} from 'lucide-react'
import { usePwaInstall } from '@/components/pwa/install-provider'
import { useAuth } from '@/components/providers/auth-provider'
import { logoutAction } from '@/actions/auth'
import { getDashboardAlerts } from '@/actions/dashboard'
import { getOverduePaymentsCount } from '@/actions/payments'
import { NotificationsPanel } from './notifications-panel'
import { usePermissions } from '@/hooks/use-permissions'
import { cn } from '@/lib/utils'
import { ADMIN_NAV_ITEMS } from './admin-nav-items'

const COBROS_LAST_VISIT_KEY = 'cobros_last_visit'

const breadcrumbLabels: Record<string, string> = {
  admin: '', dashboard: 'Dashboard', clientes: 'Clientes', pedidos: 'Pedidos',
  stock: 'Stock', proveedores: 'Proveedores', contabilidad: 'Contabilidad',
  calendario: 'Calendario', configuracion: 'Configuración', perfil: 'Mi perfil',
  nuevo: 'Nuevo', devoluciones: 'Devoluciones', auditoria: 'Seguimiento', cobros: 'Cobros pendientes',
}

function MobileSidebar() {
  const pathname = usePathname()
  const { can } = usePermissions()
  const { hasRole } = useAuth()
  const isVendedor = hasRole('vendedor_avanzado') || hasRole('vendedor_basico')

  // Filtrado por permisos al nivel raíz. Mismo criterio que el sidebar desktop.
  const visibleItems = ADMIN_NAV_ITEMS.filter(
    (item) => !item.permission || can(item.permission)
  )

  // Si la ruta actual cae bajo un sub-item, expandir su padre al abrir el Sheet.
  // El componente se desmonta al cerrar el Sheet (Radix no usa forceMount), así
  // que este estado se reinicializa cada vez que el usuario reabre el menú.
  const initialExpanded =
    visibleItems.find((item) =>
      item.children?.some((c) => pathname === c.href.split('?')[0])
    )?.href ?? null
  const [expandedKey, setExpandedKey] = useState<string | null>(initialExpanded)
  const [overdueCount, setOverdueCount] = useState(0)

  useEffect(() => {
    let cancelled = false
    const since =
      typeof localStorage !== 'undefined'
        ? localStorage.getItem(COBROS_LAST_VISIT_KEY) ?? undefined
        : undefined
    getOverduePaymentsCount({ since })
      .then((r) => {
        if (cancelled) return
        if (r?.success && typeof r.data === 'number') setOverdueCount(r.data)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [])

  const toggle = (key: string) =>
    setExpandedKey((prev) => (prev === key ? null : key))

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-3 px-4 h-16 border-b bg-prats-navy">
        <Image
          src="/logo-prats.png"
          alt="Prats"
          width={72}
          height={36}
          style={{ objectFit: 'contain', height: 36, width: 'auto', filter: 'invert(1) brightness(2)' }}
          priority
        />
        <p className="text-[10px] text-white/50 tracking-[0.2em] uppercase">Panel de gestión</p>
      </div>
      <ScrollArea className="flex-1">
        <nav className="p-2 space-y-0.5">
          {visibleItems.map((item) => {
            const Icon = item.icon
            const isCobros = item.href === '/admin/cobros'
            const badgeCount = isCobros ? overdueCount : item.badge ?? 0
            const hrefWithBadge =
              isCobros && badgeCount > 0 ? '/admin/cobros?vencidos=1' : item.href
            const active = pathname.startsWith(item.href.split('?')[0])

            const visibleChildren = item.children
              ? item.children.filter((c) => {
                  if (c.hideForVendedor && isVendedor) return false
                  return !c.permission || can(c.permission)
                })
              : []
            const hasChildren = visibleChildren.length > 0

            const rowClass = cn(
              'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors w-full text-left',
              active ? 'bg-prats-navy text-white' : 'text-muted-foreground hover:bg-muted'
            )

            if (!hasChildren) {
              return (
                <SheetClose key={item.href} asChild>
                  <Link href={hrefWithBadge} className={rowClass}>
                    <Icon className="h-4 w-4 flex-shrink-0" />
                    <span className="flex-1 truncate">{item.label}</span>
                    {badgeCount > 0 && (
                      <Badge variant="destructive" className="h-5 min-w-[20px] px-1 text-[10px]">
                        {badgeCount}
                      </Badge>
                    )}
                  </Link>
                </SheetClose>
              )
            }

            const isExpanded = expandedKey === item.href
            return (
              <div key={item.href}>
                <button
                  type="button"
                  onClick={() => toggle(item.href)}
                  className={rowClass}
                  aria-expanded={isExpanded}
                >
                  <Icon className="h-4 w-4 flex-shrink-0" />
                  <span className="flex-1 truncate">{item.label}</span>
                  <ChevronDown
                    className={cn(
                      'h-4 w-4 flex-shrink-0 transition-transform duration-200',
                      isExpanded && 'rotate-180'
                    )}
                  />
                </button>
                {isExpanded && (
                  <div className="ml-7 mt-0.5 space-y-0.5 border-l pl-3">
                    {visibleChildren.map((child) => {
                      const ChildIcon = child.icon
                      const childActive = pathname === child.href.split('?')[0]
                      return (
                        <SheetClose key={child.href} asChild>
                          <Link
                            href={child.href}
                            className={cn(
                              'flex items-center gap-2 text-xs py-1.5 px-2 rounded transition-colors',
                              childActive
                                ? 'text-prats-navy font-medium'
                                : 'text-muted-foreground hover:text-foreground'
                            )}
                          >
                            {ChildIcon ? <ChildIcon className="h-3 w-3" /> : null}
                            {child.label}
                          </Link>
                        </SheetClose>
                      )
                    })}
                  </div>
                )}
              </div>
            )
          })}
        </nav>
      </ScrollArea>
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
  const [mounted, setMounted] = useState(false)
  const supabase = useMemo(() => createClient(), [])
  const { canInstall, triggerInstall } = usePwaInstall()

  useEffect(() => {
    setMounted(true)
  }, [])

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

  if (!mounted) {
    return (
      <header className="flex items-center justify-between h-16 px-4 border-b bg-white flex-shrink-0">
        <div className="flex items-center gap-3">
          <div className="h-8 w-8 hidden lg:block" />
          <div className="h-8 w-8 lg:hidden rounded-md bg-muted" />
          <nav className="hidden md:flex items-center gap-1 text-sm text-muted-foreground">
            <span>…</span>
          </nav>
        </div>
        <div className="flex items-center gap-2">
          <div className="h-10 w-10 rounded-md bg-muted" />
          <div className="h-8 w-8 rounded-full bg-muted" />
        </div>
      </header>
    )
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
                <button type="button" onClick={() => router.back()} className="text-muted-foreground hover:text-foreground transition-colors">
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
            {canInstall && (
              <DropdownMenuItem onClick={() => { triggerInstall() }}>
                <Download className="mr-2 h-4 w-4" /> Instalar app
              </DropdownMenuItem>
            )}
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={handleLogout} className="text-destructive"><LogOut className="mr-2 h-4 w-4" /> Cerrar sesión</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <NotificationsPanel open={showNotifications} onOpenChange={setShowNotifications} />
    </header>
  )
}
