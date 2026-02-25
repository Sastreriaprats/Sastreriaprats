'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import {
  TrendingUp, TrendingDown, DollarSign, Scissors, Users,
  AlertTriangle, Calendar, Truck, RefreshCw, ArrowRight, ServerCrash,
} from 'lucide-react'
import { useAuth } from '@/components/providers/auth-provider'
import { getDashboardStats, getSalesChartData, getRecentActivity } from '@/actions/dashboard'
import { formatCurrency, formatDateTime } from '@/lib/utils'

const actionLabelsEsPast: Record<string, string> = {
  create: 'Creado', read: 'Consultado', update: 'Actualizado', delete: 'Eliminado',
  state_change: 'Cambio de estado', export: 'Exportado', import: 'Importado',
  payment: 'Pagado', refund: 'Reembolsado', login: 'Inicio de sesión', logout: 'Cierre de sesión',
}

const actionLabelsEsInfinitive: Record<string, string> = {
  create: 'crear', read: 'consultar', update: 'actualizar', delete: 'eliminar',
  state_change: 'cambio de estado', export: 'exportar', import: 'importar',
  payment: 'pago', refund: 'reembolso', login: 'inicio de sesión', logout: 'cierre de sesión',
}

const entityLabelsEs: Record<string, string> = {
  tailoring_order: 'pedido', order: 'pedido', appointment: 'cita', product: 'producto',
  product_variant: 'variante', stock: 'stock', client: 'cliente', calendar: 'calendario',
  invoice: 'factura', store: 'tienda', warehouse: 'almacén', user: 'usuario',
  role: 'rol', garment_type: 'tipo de prenda',
}

const descriptionOverridesEs: Record<string, string> = {
  logout: 'Cierre de sesión', login: 'Inicio de sesión', 'login desde web': 'Inicio de sesión desde web',
}

function getActivityDisplay(a: { action: string; module: string; entity_display: string | null; description: string | null }) {
  const label = actionLabelsEsPast[a.action] || a.action
  const actionInf = actionLabelsEsInfinitive[a.action] || a.action
  if (a.entity_display) return { label, text: a.entity_display }
  const descRaw = (a.description || '').trim().toLowerCase()
  const override = descriptionOverridesEs[descRaw]
  if (override) return { label, text: override }
  const desc = descRaw.replace(/_/g, ' ')
  const entityKey = Object.keys(entityLabelsEs).find(k => desc.includes(k))
  const entityEs = entityKey ? entityLabelsEs[entityKey] : (a.module || '').toLowerCase()
  const text = entityEs ? `${actionInf} ${entityEs}` : (a.description ? `${actionInf}: ${a.description}` : actionInf)
  return { label, text }
}

// ── Skeletons ──────────────────────────────────────────────────────────────

function StatCardsSkeleton() {
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
      {Array.from({ length: 4 }).map((_, i) => (
        <Card key={i}>
          <CardContent className="pt-4 pb-3 space-y-2">
            <Skeleton className="h-3 w-24" />
            <Skeleton className="h-8 w-20" />
            <Skeleton className="h-3 w-32" />
          </CardContent>
        </Card>
      ))}
    </div>
  )
}

function ChartSkeleton() {
  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <Card className="lg:col-span-2">
        <CardHeader className="pb-2">
          <Skeleton className="h-5 w-32" />
          <Skeleton className="h-3 w-48" />
        </CardHeader>
        <CardContent>
          <div className="flex gap-2 h-[220px] items-end">
            <div className="flex flex-col justify-between h-full pr-2 border-r border-muted-foreground/20 shrink-0 py-0.5">
              {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-2 w-12" />)}
            </div>
            <div className="flex-1 flex items-end gap-[3px] h-[176px]">
              {[80, 120, 55, 140, 95, 65, 110, 130, 45, 100, 75, 135, 80, 120, 55, 140, 95, 65, 110, 130].map((h, i) => (
                <Skeleton
                  key={i}
                  className="flex-1 rounded-t"
                  style={{ height: `${h}px` }}
                />
              ))}
            </div>
          </div>
        </CardContent>
      </Card>
      <div className="space-y-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <Card key={i}>
            <CardHeader className="pb-2"><Skeleton className="h-4 w-24" /></CardHeader>
            <CardContent><Skeleton className="h-8 w-28" /></CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
}

function ActivitySkeleton() {
  return (
    <Card>
      <CardHeader className="pb-2">
        <Skeleton className="h-5 w-40" />
        <Skeleton className="h-3 w-64 mt-1" />
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="flex items-center gap-3">
              <Skeleton className="h-6 w-[4.5rem] rounded-full shrink-0" />
              <Skeleton className="h-4 flex-1" />
              <Skeleton className="h-3 w-20 shrink-0" />
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}

// ── Main component ─────────────────────────────────────────────────────────

export function DashboardContent() {
  const router = useRouter()
  const { profile } = useAuth()

  const [stats, setStats] = useState<any>(null)
  const [chartData, setChartData] = useState<{ date: string; label: string; total: number }[]>([])
  const [chartFullMonth, setChartFullMonth] = useState(false)
  const [activity, setActivity] = useState<any[]>([])

  const [statsLoading, setStatsLoading] = useState(true)
  const [chartLoading, setChartLoading] = useState(true)
  const [activityLoading, setActivityLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)

  const loadStats = useCallback(() => {
    setStatsLoading(true)
    setLoadError(null)
    getDashboardStats(undefined)
      .then(res => {
        if (res.success) setStats(res.data)
        else setLoadError(res.error ?? 'Error al cargar estadísticas')
      })
      .catch(e => setLoadError(e?.message ?? 'Error inesperado'))
      .finally(() => setStatsLoading(false))
  }, [])

  const loadChart = useCallback(() => {
    setChartLoading(true)
    getSalesChartData()
      .then(res => { if (res.success) setChartData(res.data) })
      .catch(() => {})
      .finally(() => setChartLoading(false))
  }, [])

  const loadActivity = useCallback(() => {
    setActivityLoading(true)
    getRecentActivity()
      .then(res => { if (res.success) setActivity(res.data) })
      .catch(() => {})
      .finally(() => setActivityLoading(false))
  }, [])

  const loadData = useCallback(() => {
    loadStats()
    loadChart()
    loadActivity()
  }, [loadStats, loadChart, loadActivity])

  useEffect(() => { loadData() }, [loadData])

  // Error de stats sin datos: pantalla de error
  if (!statsLoading && loadError && !stats) {
    return (
      <div className="flex h-[60vh] flex-col items-center justify-center gap-4 text-center px-4">
        <ServerCrash className="h-12 w-12 text-destructive/60" />
        <div>
          <p className="font-semibold text-lg text-destructive">No se pudo cargar el dashboard</p>
          <p className="text-sm text-muted-foreground mt-1 max-w-md">{loadError}</p>
          <p className="text-xs text-muted-foreground mt-2">Es posible que falte aplicar alguna migración de base de datos (p.ej. 003c_pos_cash).</p>
        </div>
        <Button variant="outline" onClick={loadData} className="gap-2 mt-2">
          <RefreshCw className="h-4 w-4" /> Reintentar
        </Button>
      </div>
    )
  }

  // Cálculos de gráfico
  const displayData = chartFullMonth ? chartData : chartData.slice(-15)
  const hasAnySales = chartData.some(d => d.total > 0)
  const totalMonth = chartData.reduce((s, d) => s + d.total, 0)
  const maxChartValue = hasAnySales ? Math.max(...displayData.map(d => d.total), 1) : 1
  const yTicks = hasAnySales
    ? [0, maxChartValue * 0.25, maxChartValue * 0.5, maxChartValue * 0.75, maxChartValue]
        .filter((_, i, a) => i === 0 || a[i]!.toFixed(2) !== a[i - 1]!.toFixed(2))
    : [0]
  const showLabelEvery = displayData.length > 20 ? 3 : displayData.length > 15 ? 2 : 1

  return (
    <div className="space-y-6">
      {/* Cabecera siempre visible */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            Buenos días, {profile?.fullName?.split(' ')[0] ?? ''}
          </h1>
          <p className="text-muted-foreground">
            {new Date().toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
          </p>
        </div>
        <Button variant="outline" size="sm" className="gap-2" onClick={loadData}>
          <RefreshCw className="h-4 w-4" /> Actualizar
        </Button>
      </div>

      {/* Banner de alertas rápidas (solo si stats cargado) */}
      {stats && (stats.ordersOverdue > 0 || stats.overduePayments > 0 || stats.lowStockCount > 0) && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 flex items-center gap-4">
          <AlertTriangle className="h-5 w-5 text-amber-600 flex-shrink-0" />
          <div className="flex flex-wrap gap-3 text-sm">
            {stats.ordersOverdue > 0 && (
              <span className="text-amber-800 cursor-pointer hover:underline"
                onClick={() => router.push('/admin/pedidos?status=overdue')}>
                {stats.ordersOverdue} pedido{stats.ordersOverdue > 1 ? 's' : ''} con retraso
              </span>
            )}
            {stats.overduePayments > 0 && (
              <span className="text-amber-800 cursor-pointer hover:underline"
                onClick={() => router.push('/admin/proveedores')}>
                {stats.overduePayments} pago{stats.overduePayments > 1 ? 's' : ''} a proveedor vencido{stats.overduePayments > 1 ? 's' : ''}
              </span>
            )}
            {stats.lowStockCount > 0 && (
              <span className="text-amber-800 cursor-pointer hover:underline"
                onClick={() => router.push('/admin/stock')}>
                {stats.lowStockCount} producto{stats.lowStockCount > 1 ? 's' : ''} con stock bajo
              </span>
            )}
          </div>
        </div>
      )}

      {/* Pruebas / entregas del día (solo si stats cargado) */}
      {stats && (stats.fittingsToday > 0 || stats.deliveriesToday > 0) && (
        <div className="flex gap-3">
          {stats.fittingsToday > 0 && (
            <Card className="flex-1 cursor-pointer hover:shadow-md" onClick={() => router.push('/admin/calendario')}>
              <CardContent className="pt-4 pb-3 flex items-center gap-3">
                <div className="h-10 w-10 rounded-full bg-purple-100 flex items-center justify-center">
                  <Calendar className="h-5 w-5 text-purple-600" />
                </div>
                <div>
                  <p className="text-sm font-medium">{stats.fittingsToday} prueba{stats.fittingsToday > 1 ? 's' : ''} hoy</p>
                  <p className="text-xs text-muted-foreground">Ver calendario</p>
                </div>
              </CardContent>
            </Card>
          )}
          {stats.deliveriesToday > 0 && (
            <Card className="flex-1 cursor-pointer hover:shadow-md" onClick={() => router.push('/admin/pedidos?status=finished')}>
              <CardContent className="pt-4 pb-3 flex items-center gap-3">
                <div className="h-10 w-10 rounded-full bg-green-100 flex items-center justify-center">
                  <Truck className="h-5 w-5 text-green-600" />
                </div>
                <div>
                  <p className="text-sm font-medium">{stats.deliveriesToday} entrega{stats.deliveriesToday > 1 ? 's' : ''} prevista{stats.deliveriesToday > 1 ? 's' : ''}</p>
                  <p className="text-xs text-muted-foreground">Ver pedidos</p>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* Tarjetas de KPIs — skeleton propio */}
      {statsLoading ? <StatCardsSkeleton /> : stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card className="cursor-pointer hover:shadow-md" onClick={() => router.push('/pos/resumen')}>
            <CardContent className="pt-4 pb-3">
              <div className="flex items-center justify-between">
                <p className="text-xs text-muted-foreground">Ventas hoy</p>
                <DollarSign className="h-4 w-4 text-muted-foreground" />
              </div>
              <p className="text-2xl font-bold">{formatCurrency(stats.salesToday)}</p>
              {stats.cashSessionOpen && <p className="text-xs text-green-600">Caja abierta: {formatCurrency(stats.cashSessionTotal)}</p>}
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 pb-3">
              <div className="flex items-center justify-between">
                <p className="text-xs text-muted-foreground">Ventas mes</p>
                {stats.monthGrowth >= 0
                  ? <TrendingUp className="h-4 w-4 text-green-600" />
                  : <TrendingDown className="h-4 w-4 text-red-600" />}
              </div>
              <p className="text-2xl font-bold">{formatCurrency(stats.salesThisMonth)}</p>
              <p className={`text-xs ${stats.monthGrowth >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                {stats.monthGrowth >= 0 ? '+' : ''}{stats.monthGrowth.toFixed(1)}% vs mes anterior
              </p>
            </CardContent>
          </Card>
          <Card className="cursor-pointer hover:shadow-md" onClick={() => router.push('/admin/pedidos')}>
            <CardContent className="pt-4 pb-3">
              <div className="flex items-center justify-between">
                <p className="text-xs text-muted-foreground">Pedidos activos</p>
                <Scissors className="h-4 w-4 text-muted-foreground" />
              </div>
              <p className="text-2xl font-bold">{stats.activeOrders}</p>
              <p className="text-xs text-muted-foreground">{stats.ordersInProduction} en producción · {stats.ordersPendingDelivery} listos</p>
            </CardContent>
          </Card>
          <Card className="cursor-pointer hover:shadow-md" onClick={() => router.push('/admin/clientes')}>
            <CardContent className="pt-4 pb-3">
              <div className="flex items-center justify-between">
                <p className="text-xs text-muted-foreground">Clientes</p>
                <Users className="h-4 w-4 text-muted-foreground" />
              </div>
              <p className="text-2xl font-bold">{stats.clientsTotal}</p>
              <p className="text-xs text-green-600">+{stats.clientsNewThisMonth} nuevos este mes</p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Panel de alertas detallado */}
      {stats && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-500" /> Alertas
            </CardTitle>
            <p className="text-xs text-muted-foreground">Pedidos, pagos y stock que requieren atención</p>
          </CardHeader>
          <CardContent>
            {stats.ordersOverdue === 0 && stats.overduePayments === 0 && stats.lowStockCount === 0 ? (
              <p className="text-sm text-muted-foreground py-2">Ninguna alerta pendiente</p>
            ) : (
              <ul className="space-y-2">
                {stats.ordersOverdue > 0 && (
                  <li>
                    <button type="button" onClick={() => router.push('/admin/pedidos?status=overdue')}
                      className="text-sm text-amber-700 hover:underline flex items-center gap-2 w-full text-left">
                      <span className="font-medium">{stats.ordersOverdue} pedido{stats.ordersOverdue > 1 ? 's' : ''} con retraso</span>
                      <ArrowRight className="h-3 w-3 shrink-0" />
                    </button>
                  </li>
                )}
                {stats.overduePayments > 0 && (
                  <li>
                    <button type="button" onClick={() => router.push('/admin/proveedores')}
                      className="text-sm text-amber-700 hover:underline flex items-center gap-2 w-full text-left">
                      <span className="font-medium">{stats.overduePayments} pago{stats.overduePayments > 1 ? 's' : ''} a proveedor vencido{stats.overduePayments > 1 ? 's' : ''}</span>
                      <ArrowRight className="h-3 w-3 shrink-0" />
                    </button>
                  </li>
                )}
                {stats.lowStockCount > 0 && (
                  <li>
                    <button type="button" onClick={() => router.push('/admin/stock')}
                      className="text-sm text-amber-700 hover:underline flex items-center gap-2 w-full text-left">
                      <span className="font-medium">{stats.lowStockCount} producto{stats.lowStockCount > 1 ? 's' : ''} con stock bajo</span>
                      <ArrowRight className="h-3 w-3 shrink-0" />
                    </button>
                  </li>
                )}
              </ul>
            )}
          </CardContent>
        </Card>
      )}

      {/* Gráfico + mini stats — skeleton propio */}
      {chartLoading ? <ChartSkeleton /> : (
        <div className="grid gap-6 lg:grid-cols-3">
          <Card
            className="lg:col-span-2 cursor-pointer hover:shadow-md transition-shadow"
            onClick={() => setChartFullMonth(v => !v)}
          >
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">Ventas del mes</CardTitle>
                {hasAnySales && <span className="text-sm font-medium text-prats-navy">{formatCurrency(totalMonth)} total</span>}
              </div>
              {!chartFullMonth && chartData.length > 15 && (
                <p className="text-xs text-muted-foreground">Últimos 15 días · Haz clic para ver todo el mes</p>
              )}
              {chartFullMonth && chartData.length > 15 && (
                <p className="text-xs text-muted-foreground">Todo el mes · Haz clic para ver últimos 15 días</p>
              )}
            </CardHeader>
            <CardContent>
              <div className="flex gap-2 h-[220px]">
                <div className="flex flex-col justify-between py-0.5 pr-2 border-r border-muted-foreground/20 shrink-0">
                  {yTicks.slice().reverse().map((v, i) => (
                    <span key={i} className="text-[10px] text-muted-foreground tabular-nums">{formatCurrency(v)}</span>
                  ))}
                </div>
                <div className="flex-1 min-w-0 flex flex-col min-h-0">
                  <div className="flex items-end gap-[3px] h-[176px] shrink-0 pb-1">
                    {displayData.map((d, i) => (
                      <div key={i} className="flex-1 min-w-0 flex flex-col items-center justify-end group relative h-full">
                        <div
                          className="w-full bg-prats-navy/85 rounded-t hover:bg-prats-navy transition-all min-h-[2px] max-h-[172px]"
                          style={{ height: `${Math.max((d.total / maxChartValue) * 172, d.total > 0 ? 6 : 0)}px` }}
                        />
                        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 hidden group-hover:block bg-foreground text-background text-xs px-2 py-1 rounded whitespace-nowrap z-10 shadow-md">
                          {d.label}: {formatCurrency(d.total)}
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="flex gap-[3px] shrink-0 h-6 mt-3 items-center">
                    {displayData.map((d, i) => (
                      <div key={i} className="flex-1 min-w-0 flex justify-center overflow-hidden">
                        {i % showLabelEvery === 0 ? (
                          <span className="text-[9px] text-muted-foreground truncate" title={d.label}>{d.label}</span>
                        ) : null}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          <div className="space-y-4">
            {stats && (
              <>
                <Card>
                  <CardHeader className="pb-2"><CardTitle className="text-sm">Ticket medio</CardTitle></CardHeader>
                  <CardContent><p className="text-2xl font-bold">{formatCurrency(stats.avgTicket)}</p></CardContent>
                </Card>
                <Card>
                  <CardHeader className="pb-2"><CardTitle className="text-sm">Deuda proveedores</CardTitle></CardHeader>
                  <CardContent>
                    <p className={`text-2xl font-bold ${stats.supplierDebtTotal > 0 ? 'text-red-600' : ''}`}>{formatCurrency(stats.supplierDebtTotal)}</p>
                    {stats.overduePayments > 0 && <p className="text-xs text-red-600">{stats.overduePayments} pagos vencidos</p>}
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="pb-2"><CardTitle className="text-sm">Stock</CardTitle></CardHeader>
                  <CardContent>
                    {stats.lowStockCount > 0 ? (
                      <p className="text-amber-600 flex items-center gap-1"><AlertTriangle className="h-4 w-4" /> {stats.lowStockCount} productos bajo mínimo</p>
                    ) : (
                      <p className="text-green-600 text-sm">Todo el stock OK ✓</p>
                    )}
                  </CardContent>
                </Card>
              </>
            )}
          </div>
        </div>
      )}

      {/* Actividad — skeleton propio */}
      {activityLoading ? <ActivitySkeleton /> : (
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-base">Actividad por usuario</CardTitle>
                <p className="text-xs text-muted-foreground mt-0.5">Acciones realizadas en el panel por cada usuario. Visible para administradores.</p>
              </div>
              <Button variant="ghost" size="sm" className="gap-1 text-xs shrink-0" onClick={() => router.push('/admin/auditoria')}>
                Ver todo <ArrowRight className="h-3 w-3" />
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-3 min-w-0">
              {activity.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">Sin actividad reciente</p>
              ) : activity.map((a: any) => {
                const { label, text } = getActivityDisplay(a)
                const userName = a.user_full_name ?? 'Usuario'
                return (
                  <div key={a.id} className="flex items-center gap-3 text-sm min-w-0">
                    <div className="shrink-0 flex flex-col items-center gap-0.5 min-w-[4.5rem]">
                      <Badge variant="outline" className="text-xs w-full justify-center">{label}</Badge>
                      <p className="text-[11px] text-muted-foreground text-center truncate w-full max-w-[6rem]" title={userName}>{userName}</p>
                    </div>
                    <div className="min-w-0 flex-1 flex items-center justify-between gap-2">
                      <p className="truncate min-w-0" title={text}>{text}</p>
                      <span className="text-xs text-muted-foreground whitespace-nowrap shrink-0">{formatDateTime(a.created_at)}</span>
                    </div>
                  </div>
                )
              })}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
