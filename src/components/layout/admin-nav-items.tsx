/**
 * Fuente única de verdad para los items del menú lateral del admin.
 *
 * Importado por `admin-sidebar.tsx` (sidebar fijo desktop ≥1024px) y por
 * `admin-header.tsx` (Sheet móvil/iPad <1024px). Antes la lista estaba
 * hardcoded en cada componente y se desincronizó con el tiempo: el móvil
 * acumuló deuda y le faltaban 10 items frente al desktop. Aquí queda una
 * sola lista que ambas vistas consumen.
 */
import {
  LayoutDashboard, Users, Scissors, Truck, UserCheck,
  CreditCard, BookOpen, Calendar, Settings, Shirt, Database,
  Store, ShoppingBag, BarChart3, Mail, ScrollText, CircleDollarSign, Receipt, ClipboardList, Tag, FolderTree, CalendarRange, Undo2, Ruler,
} from 'lucide-react'

export interface AdminNavChild {
  label: string
  href: string
  permission?: string
  hideForVendedor?: boolean
  icon?: React.ElementType
}

export interface AdminNavItem {
  label: string
  href: string
  icon: React.ElementType
  /** Si se especifica, el item solo aparece si el usuario tiene este permiso */
  permission?: string
  badge?: number
  /** Si true, no se muestra para roles vendedor_basico / vendedor_avanzado */
  hideForVendedor?: boolean
  children?: AdminNavChild[]
}

export const ADMIN_NAV_ITEMS: AdminNavItem[] = [
  { label: 'Dashboard',    href: '/admin/dashboard',    icon: LayoutDashboard },
  { label: 'Clientes',     href: '/admin/clientes',     icon: Users,        permission: 'clients.view' },
  {
    label: 'Pedidos y Reservas', href: '/admin/pedidos', icon: Scissors, permission: 'orders.view',
    children: [
      { label: 'Todos los pedidos', href: '/admin/pedidos' },
      { label: 'Nuevo pedido',      href: '/admin/pedidos/nuevo', permission: 'orders.create' },
    ],
  },
  { label: 'Arreglos',     href: '/admin/arreglos',     icon: Ruler,        permission: 'clients.view' },
  { label: 'TPV / Caja',   href: '/pos/caja',           icon: CreditCard,   permission: 'pos.access' },
  {
    label: 'Tickets',      href: '/admin/tickets',      icon: Receipt,       permission: 'pos.access',
    children: [
      { label: 'Todos los tickets', href: '/admin/tickets' },
      { label: 'Vales',             href: '/admin/tickets/vales' },
    ],
  },
  { label: 'Devoluciones', href: '/admin/devoluciones', icon: Undo2, permission: 'returns.view' },
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
  { label: 'Facturas',     href: '/admin/facturas',     icon: Receipt,      permission: 'accounting.manage_invoices' },
  { label: 'Contabilidad', href: '/admin/contabilidad', icon: BookOpen, permission: 'accounting.view',
    children: [
      { label: 'Facturas / Presupuestos / Movimientos', href: '/admin/contabilidad' },
      { label: 'Facturas proveedores', href: '/admin/contabilidad/facturas-proveedores', permission: 'supplier_invoices.manage' },
      { label: 'Vencimientos', href: '/admin/contabilidad/vencimientos', permission: 'supplier_invoices.manage' },
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
  { label: 'Descuentos',   href: '/admin/descuentos',   icon: Tag,          permission: 'shop.view' },
  { label: 'Emails',       href: '/admin/emails',       icon: Mail,         permission: 'emails.view' },
  {
    label: 'Configuración', href: '/admin/configuracion', icon: Settings,   permission: 'config.view',
    children: [
      { label: 'General',           href: '/admin/configuracion' },
      { label: 'Usuarios',          href: '/admin/configuracion?tab=users',   permission: 'config.users' },
      { label: 'Tiendas',           href: '/admin/configuracion?tab=stores',  permission: 'config.edit' },
      { label: 'Categorías',        href: '/admin/configuracion/categorias',  permission: 'products.view', icon: FolderTree },
      { label: 'Temporadas',        href: '/admin/configuracion/temporadas',  permission: 'products.view', icon: CalendarRange },
      { label: 'Impresora',         href: '/admin/configuracion/impresora' },
      { label: 'Migración',         href: '/admin/migracion',                 permission: 'config.view',   icon: Database },
    ],
  },
  { label: 'Seguimiento',   href: '/admin/auditoria',    icon: ScrollText,   permission: 'audit.view' },
]
