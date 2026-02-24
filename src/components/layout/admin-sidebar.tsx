'use client'

import Link from 'next/link'
import Image from 'next/image'
import { usePathname } from 'next/navigation'
import { usePermissions } from '@/hooks/use-permissions'
import { useAuth } from '@/components/providers/auth-provider'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  LayoutDashboard, Users, Scissors, Truck, UserCheck,
  CreditCard, BookOpen, Calendar, Settings, Shirt, Database,
  Store, ShoppingBag, BarChart3, Mail, ScrollText,
} from 'lucide-react'
import { cn } from '@/lib/utils'

interface NavItem {
  label: string
  href: string
  icon: React.ElementType
  /** Si se especifica, el item solo aparece si el usuario tiene este permiso */
  permission?: string
  badge?: number
  children?: { label: string; href: string; permission?: string }[]
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
  {
    label: 'Productos y Stock', href: '/admin/stock',    icon: Shirt,        permission: 'products.view',
    children: [
      { label: 'Productos',    href: '/admin/stock' },
      { label: 'Almacenes',    href: '/admin/stock?tab=almacenes' },
      { label: 'Tejidos',      href: '/admin/stock?tab=tejidos' },
      { label: 'Movimientos',  href: '/admin/stock?tab=movimientos' },
    ],
  },
  { label: 'Proveedores',  href: '/admin/proveedores',  icon: Truck,        permission: 'suppliers.view' },
  { label: 'Oficiales',    href: '/admin/oficiales',    icon: UserCheck,    permission: 'officials.view' },
  { label: 'Calendario',   href: '/admin/calendario',   icon: Calendar,     permission: 'calendar.view' },
  { label: 'Contabilidad', href: '/admin/contabilidad', icon: BookOpen,     permission: 'accounting.view' },
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
  { label: 'Auditoría',    href: '/admin/auditoria',    icon: ScrollText,   permission: 'audit.view' },
]

export function AdminSidebar({ collapsed = false }: { collapsed?: boolean }) {
  const pathname = usePathname()
  const { can } = usePermissions()
  const { profile, isLoading } = useAuth()

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
            <Image src="/logo-prats.png" alt="Prats" width={28} height={20} style={{ objectFit: 'contain', filter: 'invert(1) brightness(2)', height: 20, width: 'auto' }} priority />
          </div>
        ) : (
          <div className="flex flex-col items-start min-w-0">
            <Image src="/logo-prats.png" alt="Prats" width={88} height={44} style={{ objectFit: 'contain', filter: 'invert(1) brightness(2)', height: 44, width: 'auto' }} priority />
            <p className="text-[10px] text-white/50 tracking-[0.2em] uppercase mt-1">Panel de gestión</p>
          </div>
        )}
      </div>

      <ScrollArea className="flex-1 py-2">
        <nav className="space-y-0.5 px-2">
          {visibleItems.map((item) => {
            const active = isActive(item.href)
            const Icon = item.icon
            return (
              <div key={item.href}>
                <Link
                  href={item.href}
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
                      {item.badge != null && item.badge > 0 && (
                        <Badge variant="destructive" className="h-5 min-w-[20px] px-1 text-[10px]">{item.badge}</Badge>
                      )}
                    </>
                  )}
                </Link>
                {!collapsed && active && item.children && (
                  <div className="ml-7 mt-0.5 space-y-0.5 border-l pl-3">
                    {item.children
                      .filter(c => !c.permission || can(c.permission))
                      .map((child) => (
                        <Link
                          key={child.href}
                          href={child.href}
                          className={cn(
                            'block text-xs py-1.5 px-2 rounded transition-colors',
                            pathname === child.href.split('?')[0]
                              ? 'text-prats-navy font-medium'
                              : 'text-muted-foreground hover:text-foreground'
                          )}
                        >
                          {child.label}
                        </Link>
                      ))
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
