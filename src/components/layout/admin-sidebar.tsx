'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { usePermissions } from '@/hooks/use-permissions'
import { useAuth } from '@/components/providers/auth-provider'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  LayoutDashboard, Users, Scissors, Truck, UserCheck,
  CreditCard, BookOpen, Calendar, Settings, Shirt, Database,
  Store, ShoppingBag, BarChart3, Mail, ScrollText, CircleDollarSign, Receipt, ClipboardList,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useState, useEffect, useRef } from 'react'
import { getOverduePaymentsCount } from '@/actions/payments'
import { getOverdueSupplierInvoicesCount } from '@/actions/supplier-invoices'

const COBROS_LAST_VISIT_KEY = 'cobros_last_visit'

interface NavItem {
  label: string
  href: string
  icon: React.ElementType
  /** Si se especifica, el item solo aparece si el usuario tiene este permiso */
  permission?: string
  badge?: number
  /** Si true, no se muestra para roles vendedor_basico / vendedor_avanzado */
  hideForVendedor?: boolean
  children?: { label: string; href: string; permission?: string; hideForVendedor?: boolean; icon?: React.ElementType }[]
}

const navItems: NavItem[] = [
  { label: 'Dashboard',    href: '/admin/dashboard',    icon: LayoutDashboard },
  { label: 'Clientes',     href: '/admin/clientes',     icon: Users,        permission: 'clients.view' },
  {
    label: 'Pedidos', href: '/admin/pedidos', icon: Scissors, permission: 'orders.view',
    children: [
      { label: 'Todos los pedidos', href: '/admin/pedidos' },
      { label: 'Nuevo pedido',      href: '/admin/pedidos/nuevo', permission: 'orders.create' },
    ],
  },
  { label: 'TPV / Caja',   href: '/pos/caja',           icon: CreditCard,   permission: 'pos.access' },
  { label: 'Tickets',      href: '/admin/tickets',      icon: Receipt,       permission: 'pos.access' },
  {
    label: 'Productos y Stock', href: '/admin/stock',    icon: Shirt,        permission: 'products.view',
    children: [
      { label: 'Productos',    href: '/admin/stock' },
      { label: 'Códigos de barras', href: '/admin/stock/codigos-barras', permission: 'barcodes.manage' },
      { label: 'Almacenes',    href: '/admin/stock?tab=almacenes', hideForVendedor: true },
      { label: 'Tejidos',      href: '/admin/stock?tab=tejidos', hideForVendedor: true },
      { label: 'Movimientos',  href: '/admin/stock?tab=movimientos', hideForVendedor: true },
      { label: 'Albaranes',    href: '/admin/almacen/albaranes', icon: ClipboardList },
    ],
  },
  { label: 'Proveedores',  href: '/admin/proveedores',  icon: Truck,        permission: 'suppliers.view' },
  { label: 'Oficiales',    href: '/admin/oficiales',    icon: UserCheck,    permission: 'officials.view' },
  { label: 'Calendario',   href: '/admin/calendario',   icon: Calendar,     permission: 'calendar.view' },
  { label: 'Contabilidad', href: '/admin/contabilidad', icon: BookOpen, permission: 'accounting.view',
    children: [
      { label: 'Facturas / Presupuestos / Movimientos', href: '/admin/contabilidad' },
      { label: 'Facturas proveedores', href: '/admin/contabilidad/facturas-proveedores', permission: 'supplier_invoices.manage' },
    ],
  },
  { label: 'Cobros pendientes',       href: '/admin/cobros',       icon: CircleDollarSign, permission: 'orders.view' },
  { label: 'Informes',     href: '/admin/reporting',    icon: BarChart3,    permission: 'reports.view' },
  {
    label: 'Tiendas',   href: '/admin/tiendas',        icon: Store,
    children: [
      { label: 'Resumen por tienda', href: '/admin/tiendas' },
      { label: 'Stocks y ventas',    href: '/admin/tiendas?tab=ventas' },
    ],
  },
  {
    label: 'Tienda Online', href: '/admin/tienda-online', icon: ShoppingBag, permission: 'shop.view',
    children: [
      { label: 'Dashboard',        href: '/admin/tienda-online' },
      { label: 'Pedidos online',   href: '/admin/tienda-online?tab=pedidos' },
      { label: 'CMS / Contenido',  href: '/admin/cms',                       permission: 'cms.view' },
    ],
  },
  { label: 'Emails',       href: '/admin/emails',       icon: Mail,         permission: 'emails.view' },
  {
    label: 'Configuración', href: '/admin/configuracion', icon: Settings,   permission: 'config.view',
    children: [
      { label: 'General',           href: '/admin/configuracion' },
      { label: 'Usuarios',          href: '/admin/configuracion?tab=users',   permission: 'config.users' },
      { label: 'Tiendas',           href: '/admin/configuracion?tab=stores',  permission: 'config.edit' },
      { label: 'Impresora',         href: '/admin/configuracion/impresora' },
    ],
  },
  { label: 'Migración',    href: '/admin/migracion',    icon: Database,     permission: 'migration.access' },
  { label: 'Seguimiento',   href: '/admin/auditoria',    icon: ScrollText,   permission: 'audit.view' },
]

export function AdminSidebar({ collapsed = false }: { collapsed?: boolean }) {
  const pathname = usePathname()
  const { can, isAdmin } = usePermissions()
  const { profile, isLoading, hasRole } = useAuth()
  const isVendedor = hasRole('vendedor_avanzado')
  const [overdueCount, setOverdueCount] = useState(0)
  const [overdueSupplierInvoicesCount, setOverdueSupplierInvoicesCount] = useState(0)
  const prevPathRef = useRef<string | null>(null)

  // Carga el conteo de pagos vencidos filtrando por la última visita a /admin/cobros
  const fetchOverdueCount = useRef(async () => {
    try {
      const since = typeof localStorage !== 'undefined' ? localStorage.getItem(COBROS_LAST_VISIT_KEY) ?? undefined : undefined
      const result = await getOverduePaymentsCount({ since })
      if (result && result.success && typeof result.data === 'number') setOverdueCount(result.data)
    } catch {
      // Respuesta inesperada o error de red: no mostrar badge, sin log para no alarmar
    }
  })

  useEffect(() => {
    if (isLoading || !profile) return
    fetchOverdueCount.current()
  }, [isLoading, profile])

  // Conteo de facturas de proveedores vencidas (solo si tiene permiso)
  useEffect(() => {
    if (isLoading || !profile) return
    let cancelled = false
    getOverdueSupplierInvoicesCount()
      .then((r) => {
        if (cancelled) return
        if (r?.success && typeof r.data === 'number') setOverdueSupplierInvoicesCount(r.data)
      })
      .catch(() => {})
    return () => { cancelled = true }
  }, [isLoading, profile])

  // Detecta cuando el usuario entra en /admin/cobros para resetear el badge
  useEffect(() => {
    const isCobros = pathname === '/admin/cobros'
    const wasNotCobros = prevPathRef.current !== '/admin/cobros'

    if (isCobros && wasNotCobros) {
      // Guardar hoy como última visita y limpiar badge
      localStorage.setItem(COBROS_LAST_VISIT_KEY, new Date().toISOString().split('T')[0])
      setOverdueCount(0)
    } else if (!isCobros && prevPathRef.current === '/admin/cobros') {
      // Al salir de cobros, refrescar para mostrar nuevos vencidos desde hoy en adelante
      fetchOverdueCount.current()
    }

    // Al entrar en facturas proveedores, refrescar conteo
    if (pathname.startsWith('/admin/contabilidad/facturas-proveedores')) {
      getOverdueSupplierInvoicesCount()
        .then((r) => r?.success && typeof r.data === 'number' && setOverdueSupplierInvoicesCount(r.data))
        .catch(() => {})
    }

    prevPathRef.current = pathname
  }, [pathname])

  const isActive = (href: string) => {
    if (href === '/admin/dashboard') return pathname === href
    return pathname.startsWith(href.split('?')[0])
  }

  // Show all items while profile hasn't loaded yet to avoid flash of missing items
  const visibleItems = (isLoading || profile === null)
    ? navItems
    : navItems.filter(item => !item.permission || can(item.permission))

  return (
    <aside className={cn(
      'flex flex-col border-r bg-white h-full transition-all duration-200',
      collapsed ? 'w-16' : 'w-60'
    )}>
      <div className={cn(
        'flex items-center border-b flex-shrink-0 bg-prats-navy',
        collapsed ? 'justify-center px-2 h-16' : 'gap-3 px-4 h-20'
      )}>
        {collapsed ? (
          <div className="h-8 w-8 rounded-lg bg-white/10 flex items-center justify-center flex-shrink-0">
            <img
              src="/logo-prats.png"
              alt="Prats"
              width={28}
              height={20}
              style={{ height: '20px', width: 'auto', objectFit: 'contain', filter: 'invert(1) brightness(2)' }}
            />
          </div>
        ) : (
          <div className="flex flex-col items-start min-w-0">
            <img
              src="/logo-prats.png"
              alt="Prats"
              width={88}
              height={44}
              style={{ height: '44px', width: 'auto', objectFit: 'contain', filter: 'invert(1) brightness(2)' }}
            />
            <p className="text-[10px] text-white/50 tracking-[0.2em] uppercase mt-1">Panel de gestión</p>
          </div>
        )}
      </div>

      <ScrollArea className="flex-1 py-2">
        <nav className="space-y-0.5 px-2">
          {visibleItems.map((item) => {
            const active = isActive(item.href)
            const Icon = item.icon
            const isCobrosItem = item.href === '/admin/cobros'
            const badgeCount = isCobrosItem ? overdueCount : (item.badge ?? 0)
            const cobrosHref = isCobrosItem && badgeCount > 0 ? '/admin/cobros?vencidos=1' : item.href
            return (
              <div key={item.href}>
                <Link
                  href={cobrosHref}
                  className={cn(
                    'flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors',
                    active ? 'bg-prats-navy text-white' : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                    collapsed && 'justify-center px-0'
                  )}
                  title={collapsed ? item.label : undefined}
                >
                  <Icon className="h-4 w-4 flex-shrink-0" />
                  {!collapsed && (
                    <>
                      <span className="flex-1 truncate">{item.label}</span>
                      {badgeCount > 0 && (
                        <Badge variant="destructive" className="h-5 min-w-[20px] px-1 text-[10px]">{badgeCount}</Badge>
                      )}
                    </>
                  )}
                </Link>
                {!collapsed && active && item.children && (
                  <div className="ml-7 mt-0.5 space-y-0.5 border-l pl-3">
                    {item.children
                      .filter(c => {
                        if (c.hideForVendedor && isVendedor) return false
                        return !c.permission || can(c.permission) || (c.permission === 'barcodes.manage' && isAdmin)
                      })
                      .map((child) => {
                        const isFacturasProveedores = child.href === '/admin/contabilidad/facturas-proveedores'
                        const childBadge = isFacturasProveedores ? overdueSupplierInvoicesCount : 0
                        const ChildIcon = child.icon
                        return (
                          <Link
                            key={child.href}
                            href={child.href}
                            className={cn(
                              'flex items-center justify-between gap-2 text-xs py-1.5 px-2 rounded transition-colors',
                              pathname === child.href.split('?')[0]
                                ? 'text-prats-navy font-medium'
                                : 'text-muted-foreground hover:text-foreground'
                            )}
                          >
                            <span className="inline-flex items-center gap-1.5">
                              {ChildIcon ? <ChildIcon className="h-3 w-3" /> : null}
                              {child.label}
                            </span>
                            {childBadge > 0 && (
                              <Badge variant="destructive" className="h-4 min-w-[18px] px-1 text-[10px]">{childBadge}</Badge>
                            )}
                          </Link>
                        )
                      })
                    }
                  </div>
                )}
              </div>
            )
          })}
        </nav>
      </ScrollArea>

      <div className="border-t p-3 flex-shrink-0">
        {collapsed ? (
          <div className="flex justify-center">
            <Link href="/admin/perfil" className="h-8 w-8 rounded-full bg-prats-navy text-white text-xs flex items-center justify-center font-medium">
              {profile?.fullName?.charAt(0) || '?'}
            </Link>
          </div>
        ) : (
          <Link href="/admin/perfil" className="flex items-center gap-3 px-2 py-1.5 rounded-lg hover:bg-muted transition-colors">
            <div className="h-8 w-8 rounded-full bg-prats-navy text-white text-xs flex items-center justify-center font-medium flex-shrink-0">
              {profile?.fullName?.split(' ').map(n => n[0]).join('').slice(0, 2) || '?'}
            </div>
            <div className="min-w-0">
              <p className="text-sm font-medium truncate">{profile?.fullName}</p>
              <p className="text-[10px] text-muted-foreground truncate">{profile?.email}</p>
            </div>
          </Link>
        )}
      </div>
    </aside>
  )
}
