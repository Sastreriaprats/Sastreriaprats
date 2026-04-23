'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Card, CardContent } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { Skeleton } from '@/components/ui/skeleton'
import { Users, Package, CircleDollarSign, ShoppingCart, Tag, Calendar, Target, TrendingUp, CalendarDays } from 'lucide-react'
import { useAuth } from '@/components/providers/auth-provider'
import { usePermissions } from '@/hooks/use-permissions'
import { useRequireStore } from '@/hooks/use-require-store'
import { getVendorDashboardStats, type VendorDashboardStats } from '@/actions/vendor-dashboard-stats'
import { formatCurrency } from '@/lib/utils'

const quickLinks = [
  { label: 'Clientes', href: '/vendedor/clientes', icon: Users, description: 'Ver y gestionar clientes' },
  { label: 'Productos y Stock', href: '/vendedor/stock', icon: Package, description: 'Consultar productos y existencias' },
  { label: 'Cobros', href: '/vendedor/cobros', icon: CircleDollarSign, description: 'Cobros pendientes' },
  { label: 'Caja TPV', href: '/vendedor/caja', icon: ShoppingCart, description: 'Abrir caja / TPV' },
  { label: 'Calendario', href: '/admin/calendario', icon: Calendar, description: 'Citas y agenda', permission: 'calendar.view' as const },
  { label: 'Etiquetas y Códigos', href: '/admin/stock/codigos-barras', icon: Tag, description: 'Códigos de barras e imprimir etiquetas', permission: 'barcodes.manage' as const },
]

const MONTH_NAMES = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
]

export function VendedorDashboardContent() {
  const router = useRouter()
  const { profile } = useAuth()
  const { can } = usePermissions()
  const { storeId } = useRequireStore()

  const [stats, setStats] = useState<VendorDashboardStats | null>(null)
  const [loadingStats, setLoadingStats] = useState(true)

  useEffect(() => {
    let cancelled = false
    setLoadingStats(true)
    getVendorDashboardStats(storeId).then((res) => {
      if (cancelled) return
      if (res.data) setStats(res.data)
      setLoadingStats(false)
    })
    return () => { cancelled = true }
  }, [storeId])

  const visibleLinks = quickLinks.filter((item) => !('permission' in item) || can((item as { permission?: string }).permission!))

  const now = new Date()
  const currentMonthLabel = MONTH_NAMES[now.getMonth()]
  const currentYear = now.getFullYear()

  const goal = stats?.storeGoal
  const progress = goal && goal.target > 0 ? Math.min(100, (goal.actual / goal.target) * 100) : 0

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">
          Buenos días, {profile?.fullName?.split(' ')[0] ?? ''}
        </h1>
        <p className="text-muted-foreground">
          {new Date().toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center gap-3 mb-3">
              <div className="h-10 w-10 rounded-full bg-[#1a2744]/10 flex items-center justify-center">
                <Target className="h-5 w-5 text-[#1a2744]" />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-medium truncate">
                  Objetivo {goal ? goal.storeName : 'tienda'}
                </p>
                <p className="text-xs text-muted-foreground capitalize">{currentMonthLabel} {currentYear}</p>
              </div>
            </div>
            {loadingStats ? (
              <Skeleton className="h-8 w-full" />
            ) : goal && goal.target > 0 ? (
              <>
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-lg font-bold">{formatCurrency(goal.actual)}</span>
                  <span className="text-xs text-muted-foreground">de {formatCurrency(goal.target)}</span>
                </div>
                <Progress value={progress} className="mt-2" />
                <p className="text-xs text-muted-foreground mt-1">{progress.toFixed(0)}% del objetivo</p>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">
                {goal ? 'Sin objetivo definido este mes' : 'Selecciona una tienda'}
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center gap-3 mb-3">
              <div className="h-10 w-10 rounded-full bg-[#1a2744]/10 flex items-center justify-center">
                <TrendingUp className="h-5 w-5 text-[#1a2744]" />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-medium">Mis ventas del mes</p>
                <p className="text-xs text-muted-foreground capitalize">{currentMonthLabel} {currentYear} · sin IVA</p>
              </div>
            </div>
            {loadingStats ? (
              <Skeleton className="h-8 w-32" />
            ) : (
              <p className="text-2xl font-bold">{formatCurrency(stats?.employeeMonthSales ?? 0)}</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center gap-3 mb-3">
              <div className="h-10 w-10 rounded-full bg-[#1a2744]/10 flex items-center justify-center">
                <CalendarDays className="h-5 w-5 text-[#1a2744]" />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-medium">Mis ventas del año</p>
                <p className="text-xs text-muted-foreground">{currentYear} · sin IVA</p>
              </div>
            </div>
            {loadingStats ? (
              <Skeleton className="h-8 w-32" />
            ) : (
              <p className="text-2xl font-bold">{formatCurrency(stats?.employeeYearSales ?? 0)}</p>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {visibleLinks.map((item) => {
          const Icon = item.icon
          return (
            <Card
              key={item.href}
              className="cursor-pointer hover:shadow-md transition-shadow"
              onClick={() => router.push(item.href)}
            >
              <CardContent className="pt-4 pb-3 flex items-center gap-3">
                <div className="h-10 w-10 rounded-full bg-[#1a2744]/10 flex items-center justify-center">
                  <Icon className="h-5 w-5 text-[#1a2744]" />
                </div>
                <div>
                  <p className="text-sm font-medium">{item.label}</p>
                  <p className="text-xs text-muted-foreground">{item.description}</p>
                </div>
              </CardContent>
            </Card>
          )
        })}
      </div>
    </div>
  )
}
