'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'
import {
  LayoutDashboard,
  Users,
  Scissors,
  Package,
  Truck,
  UserCheck,
  Calculator,
  CalendarDays,
  BarChart3,
  Mail,
  Globe,
  Settings,
  ShoppingCart,
  LogOut,
  Database,
} from 'lucide-react'
import { ScrollArea } from '@/components/ui/scroll-area'
import { logoutAction } from '@/actions/auth'

const navigation = [
  { name: 'Dashboard', href: '/admin/dashboard', icon: LayoutDashboard },
  { name: 'Clientes', href: '/admin/clientes', icon: Users, permission: 'clients.view' },
  { name: 'Pedidos Sastrería', href: '/admin/pedidos', icon: Scissors, permission: 'orders.view' },
  { name: 'TPV / Caja', href: '/pos/caja', icon: ShoppingCart, permission: 'pos.access' },
  { name: 'Productos y Stock', href: '/admin/stock', icon: Package, permission: 'products.view' },
  { name: 'Proveedores', href: '/admin/proveedores', icon: Truck, permission: 'suppliers.view' },
  { name: 'Oficiales', href: '/admin/oficiales', icon: UserCheck, permission: 'officials.view' },
  { name: 'Contabilidad', href: '/admin/contabilidad', icon: Calculator, permission: 'accounting.view' },
  { name: 'Calendario', href: '/admin/calendario', icon: CalendarDays, permission: 'calendar.view' },
  { name: 'Reporting', href: '/admin/reporting', icon: BarChart3, permission: 'reports.view' },
  { name: 'Emails', href: '/admin/emails', icon: Mail, permission: 'emails.view' },
  { name: 'Web / CMS', href: '/admin/cms', icon: Globe, permission: 'cms.view' },
  { name: 'Configuración', href: '/admin/configuracion', icon: Settings, permission: 'config.view' },
  { name: 'Migración', href: '/admin/migracion', icon: Database, permission: 'migration.access' },
]

interface AdminSidebarProps {
  userPermissions?: string[]
}

export function AdminSidebar({ userPermissions = [] }: AdminSidebarProps) {
  const pathname = usePathname()
  const permissions = new Set(userPermissions)
  const visibleNavigation = navigation.filter((item) => item.permission === undefined || permissions.has(item.permission))

  return (
    <aside className="hidden w-64 border-r bg-prats-navy-dark lg:flex lg:flex-col">
      <div className="flex h-16 items-center justify-center border-b border-prats-navy-light px-6">
        <Link href="/admin/dashboard" className="flex items-center gap-2">
          <span className="text-xl font-display font-bold tracking-wider text-white">
            PRATS
          </span>
        </Link>
      </div>

      <ScrollArea className="flex-1 py-4">
        <nav className="space-y-1 px-3">
          {visibleNavigation.map((item) => {
            const isActive = pathname.startsWith(item.href)
            return (
              <Link
                key={item.name}
                href={item.href}
                className={cn(
                  'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors',
                  isActive
                    ? 'bg-prats-navy-light text-white'
                    : 'text-gray-400 hover:bg-prats-navy-light/50 hover:text-white'
                )}
              >
                <item.icon className="h-5 w-5 shrink-0" />
                {item.name}
              </Link>
            )
          })}
        </nav>
      </ScrollArea>

      <div className="border-t border-prats-navy-light p-3">
        <form action={logoutAction}>
          <button
            type="submit"
            className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-gray-400 transition-colors hover:bg-prats-navy-light/50 hover:text-white"
          >
            <LogOut className="h-5 w-5" />
            Cerrar sesión
          </button>
        </form>
      </div>
    </aside>
  )
}
