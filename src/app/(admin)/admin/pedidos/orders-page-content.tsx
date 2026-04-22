'use client'

import { useState, useEffect, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Plus, Search, MoreHorizontal, Eye, Trash2, ChevronLeft, ChevronRight,
  LayoutList, Kanban, ArrowUpDown, AlertTriangle, SlidersHorizontal, X,
} from 'lucide-react'
import { Skeleton } from '@/components/ui/skeleton'
import { useList } from '@/hooks/use-list'
import { usePermissions } from '@/hooks/use-permissions'
import { listOrders, deleteOrder } from '@/actions/orders'
import { listReservations } from '@/actions/reservations'
import { formatCurrency, formatDate, getOrderStatusColor, getOrderStatusLabel } from '@/lib/utils'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'
import { OrdersPipeline } from './orders-pipeline'
import { ReservationsTab } from '@/app/(admin)/admin/stock/tabs/reservations-tab'

const orderStatuses = [
  'created', 'fabric_ordered', 'fabric_received', 'factory_ordered',
  'in_production', 'fitting', 'adjustments', 'finished', 'delivered', 'incident', 'cancelled',
]

const supplierOrderStatusLabels: Record<string, string> = {
  draft: 'Borrador', sent: 'Enviado', confirmed: 'Confirmado',
  partially_received: 'Parcial', received: 'Recibido', incident: 'Incidencia', cancelled: 'Cancelado',
}

type TabValue = 'tailoring' | 'supplier' | 'reservations'

interface Props {
  initialView: string
  initialStatus?: string
  initialType?: string
  initialTab: TabValue
}

export function OrdersPageContent({ initialView, initialStatus, initialType, initialTab }: Props) {
  const router = useRouter()
  const { can } = usePermissions()

  const [tab, setTab] = useState<TabValue>(initialTab)
  const [view, setView] = useState<'table' | 'pipeline'>(initialView as any)
  const [statusFilter, setStatusFilter] = useState(initialStatus || 'all')
  // Subtipo dentro del tab Sastrería: all | artesanal | industrial
  const [subTypeFilter, setSubTypeFilter] = useState<'all' | 'artesanal' | 'industrial'>(
    initialType === 'artesanal' || initialType === 'industrial' ? initialType : 'all',
  )

  const [supplierOrders, setSupplierOrders] = useState<any[]>([])
  const [loadingSupplier, setLoadingSupplier] = useState(false)

  // Contadores para badges de los tabs
  const [supplierActiveCount, setSupplierActiveCount] = useState<number | null>(null)
  const [reservationsActiveCount, setReservationsActiveCount] = useState<number | null>(null)

  // Cambiar tab y sincronizar con URL
  const changeTab = (next: TabValue) => {
    setTab(next)
    const params = new URLSearchParams()
    if (next !== 'tailoring') params.set('tab', next)
    const qs = params.toString()
    router.replace(`/admin/pedidos${qs ? `?${qs}` : ''}`, { scroll: false })
  }

  // Cargar supplier orders cuando se abre ese tab
  useEffect(() => {
    if (tab !== 'supplier') return
    const supabase = createClient()
    setLoadingSupplier(true)
    supabase
      .from('supplier_orders')
      .select(`id, order_number, status, total, order_date,
        estimated_delivery_date, tailoring_order_id,
        suppliers(name),
        stores:destination_store_id(name),
        tailoring_orders:tailoring_order_id(order_number)`)
      .order('created_at', { ascending: false })
      .then(({ data, error }) => {
        setLoadingSupplier(false)
        setSupplierOrders(error ? [] : (data ?? []))
      })
  }, [tab])

  // Contadores al montar (una sola vez)
  useEffect(() => {
    const supabase = createClient()
    supabase
      .from('supplier_orders')
      .select('id', { count: 'exact', head: true })
      .not('status', 'in', '(received,cancelled)')
      .then(({ count }) => setSupplierActiveCount(count ?? 0))

    Promise.all([
      listReservations({ status: 'active', page: 0, pageSize: 1 }),
      listReservations({ status: 'pending_stock', page: 0, pageSize: 1 }),
    ]).then(([a, b]) => {
      const t1 = a.success ? a.data.total : 0
      const t2 = b.success ? b.data.total : 0
      setReservationsActiveCount(t1 + t2)
    })
  }, [])

  const {
    data: orders, total, totalPages, page, setPage,
    search, setSearch, sortBy, toggleSort,
    setFilters, isLoading, refresh, pageSize,
    statusCounts: statusCountsFromApi, totalAll,
  } = useList(listOrders, {
    pageSize: 25,
    defaultSort: 'created_at',
    defaultOrder: 'desc',
    defaultFilters: initialStatus === 'overdue'
      ? { status: 'overdue', ...(subTypeFilter !== 'all' ? { order_type: subTypeFilter } : {}) }
      : (subTypeFilter !== 'all' ? { order_type: subTypeFilter } : {}),
  })

  // Contador de pedidos de sastrería activos (excluye delivered y cancelled)
  const tailoringActiveCount = useMemo(() => {
    if (!statusCountsFromApi) return null
    const allCount = totalAll ?? 0
    const delivered = statusCountsFromApi['delivered'] ?? 0
    const cancelled = statusCountsFromApi['cancelled'] ?? 0
    return Math.max(0, allCount - delivered - cancelled)
  }, [statusCountsFromApi, totalAll])

  const applyStatus = (v: string) => {
    setStatusFilter(v)
    setFilters(prev => ({ ...prev, ...(v !== 'all' ? { status: v } : { status: undefined }) }))
    if (v === 'overdue') {
      router.replace('/admin/pedidos?status=overdue', { scroll: false })
    } else {
      router.replace('/admin/pedidos', { scroll: false })
    }
  }

  const applySubType = (v: 'all' | 'artesanal' | 'industrial') => {
    setSubTypeFilter(v)
    setFilters(prev => ({ ...prev, order_type: v !== 'all' ? v : undefined }))
  }

  const hasActiveFilters = statusFilter !== 'all' || subTypeFilter !== 'all'
  const clearAllFilters = () => {
    setStatusFilter('all')
    setSubTypeFilter('all')
    setFilters({})
    router.replace('/admin/pedidos', { scroll: false })
  }

  const SortHeader = ({ field, children }: { field: string; children: React.ReactNode }) => (
    <TableHead className="cursor-pointer select-none" onClick={() => toggleSort(field)}>
      <div className="flex items-center gap-1">{children}
        <ArrowUpDown className={`h-3 w-3 ${sortBy === field ? 'text-foreground' : 'text-muted-foreground/50'}`} />
      </div>
    </TableHead>
  )

  const statusCounts = statusCountsFromApi ?? {}

  // Pedidos a proveedor filtrados por búsqueda (client-side)
  const filteredSupplierOrders = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return supplierOrders
    return supplierOrders.filter((so: any) =>
      so.order_number?.toLowerCase().includes(q) ||
      so.suppliers?.name?.toLowerCase().includes(q) ||
      so.tailoring_orders?.order_number?.toLowerCase().includes(q),
    )
  }, [supplierOrders, search])

  const tabBadge = (n: number | null, isActive: boolean) => {
    if (n === null) {
      return <span className={`ml-2 h-4 w-6 rounded animate-pulse inline-block ${isActive ? 'bg-white/30' : 'bg-gray-400/30'}`} />
    }
    if (n <= 0) return null
    return (
      <span
        className={`ml-2 inline-flex items-center justify-center h-5 min-w-[1.25rem] px-1.5 rounded-full text-[11px] font-semibold ${
          isActive ? 'bg-white text-prats-navy' : 'bg-gray-300 text-gray-700'
        }`}
      >
        {n}
      </span>
    )
  }

  const tabTriggerClass =
    'rounded-lg px-6 py-2.5 text-base font-medium bg-gray-100 text-gray-700 hover:bg-gray-200 ' +
    'data-[state=active]:bg-prats-navy data-[state=active]:text-white data-[state=active]:shadow-md ' +
    'transition-colors'

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Pedidos y Reservas</h1>
          <p className="text-muted-foreground">
            {tab === 'tailoring' && (isLoading ? 'Cargando...' : `Pedidos de sastrería · ${total}`)}
            {tab === 'supplier' && (loadingSupplier ? 'Cargando...' : `Pedidos a proveedor · ${supplierOrders.length}`)}
            {tab === 'reservations' && 'Reservas de producto'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {tab === 'tailoring' && (
            <div className="flex rounded-lg border p-0.5">
              <Button variant={view === 'table' ? 'default' : 'ghost'} size="sm" className="h-7 px-2" onClick={() => setView('table')}>
                <LayoutList className="h-4 w-4" />
              </Button>
              <Button variant={view === 'pipeline' ? 'default' : 'ghost'} size="sm" className="h-7 px-2" onClick={() => setView('pipeline')}>
                <Kanban className="h-4 w-4" />
              </Button>
            </div>
          )}
          {tab === 'tailoring' && can('orders.create') && (
            <Button onClick={() => router.push('/admin/pedidos/nuevo')} className="gap-2 bg-prats-navy hover:bg-prats-navy-light">
              <Plus className="h-4 w-4" /> Nuevo pedido
            </Button>
          )}
        </div>
      </div>

      <Tabs value={tab} onValueChange={(v) => changeTab(v as TabValue)} className="mb-6">
        <TabsList className="h-auto bg-transparent p-0 gap-2 flex flex-wrap justify-start">
          <TabsTrigger value="tailoring" className={tabTriggerClass}>
            Sastrería {tabBadge(tailoringActiveCount, tab === 'tailoring')}
          </TabsTrigger>
          <TabsTrigger value="supplier" className={tabTriggerClass}>
            A proveedor {tabBadge(supplierActiveCount, tab === 'supplier')}
          </TabsTrigger>
          <TabsTrigger value="reservations" className={tabTriggerClass}>
            Reservas {tabBadge(reservationsActiveCount, tab === 'reservations')}
          </TabsTrigger>
        </TabsList>

        {/* TAB: Sastrería */}
        <TabsContent value="tailoring" className="space-y-6 mt-6">
          <div className="rounded-lg border bg-muted/30 p-3 space-y-3">
            <div className="flex items-center gap-2">
              <SlidersHorizontal className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-medium text-muted-foreground">Filtros</span>
              {hasActiveFilters && (
                <Button size="sm" variant="ghost" className="h-6 px-2 text-xs text-muted-foreground hover:text-foreground ml-auto" onClick={clearAllFilters}>
                  <X className="h-3 w-3 mr-1" /> Limpiar todo
                </Button>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <div className="relative min-w-[200px] flex-1">
                <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Buscar por nº pedido..."
                  className="pl-8 h-8 text-sm"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
            </div>

            {/* Subtipo (Artesanal / Industrial) como pills */}
            <div className="flex flex-wrap gap-2">
              <span className="text-xs text-muted-foreground self-center mr-1">Subtipo:</span>
              <Badge
                variant={subTypeFilter === 'all' ? 'default' : 'outline'}
                className="cursor-pointer"
                onClick={() => applySubType('all')}
              >
                Todos
              </Badge>
              <Badge
                variant={subTypeFilter === 'artesanal' ? 'default' : 'outline'}
                className="cursor-pointer"
                onClick={() => applySubType('artesanal')}
              >
                Artesanal
              </Badge>
              <Badge
                variant={subTypeFilter === 'industrial' ? 'default' : 'outline'}
                className="cursor-pointer"
                onClick={() => applySubType('industrial')}
              >
                Industrial
              </Badge>
            </div>

            {/* Pills de estado */}
            <div className="flex flex-wrap gap-2">
              <Badge variant={statusFilter === 'all' ? 'default' : 'outline'} className="cursor-pointer" onClick={() => applyStatus('all')}>
                Todos ({isLoading ? '…' : (totalAll ?? total)})
              </Badge>
              <Badge
                variant={statusFilter === 'overdue' ? 'default' : 'outline'}
                className={`cursor-pointer ${statusFilter === 'overdue' ? 'bg-red-100 text-red-800 border-red-200' : ''}`}
                onClick={() => applyStatus('overdue')}
              >
                <AlertTriangle className="h-3 w-3 mr-1 inline" />
                Con retraso {(statusCounts['overdue'] ?? 0) > 0 ? `(${statusCounts['overdue']})` : ''}
              </Badge>
              {orderStatuses.filter(s => s !== 'cancelled').map(s => (
                <Badge
                  key={s}
                  variant={statusFilter === s ? 'default' : 'outline'}
                  className={`cursor-pointer ${statusFilter === s ? getOrderStatusColor(s) : ''}`}
                  onClick={() => applyStatus(s)}
                >
                  {getOrderStatusLabel(s)} {(statusCounts[s] ?? 0) > 0 ? `(${statusCounts[s]})` : ''}
                </Badge>
              ))}
            </div>

            {hasActiveFilters && (
              <div className="flex flex-wrap gap-1.5">
                {statusFilter !== 'all' && (
                  <Badge variant="secondary" className="text-xs gap-1 pr-1">
                    {statusFilter === 'overdue' ? (
                      <>Con retraso <button type="button" onClick={() => applyStatus('all')} className="ml-0.5 hover:text-foreground"><X className="h-3 w-3" /></button></>
                    ) : (
                      <>{getOrderStatusLabel(statusFilter)} <button type="button" onClick={() => applyStatus('all')} className="ml-0.5 hover:text-foreground"><X className="h-3 w-3" /></button></>
                    )}
                  </Badge>
                )}
                {subTypeFilter !== 'all' && (
                  <Badge variant="secondary" className="text-xs gap-1 pr-1">
                    {subTypeFilter === 'artesanal' ? 'Artesanal' : 'Industrial'}
                    <button type="button" onClick={() => applySubType('all')} className="ml-0.5 hover:text-foreground"><X className="h-3 w-3" /></button>
                  </Badge>
                )}
              </div>
            )}
          </div>

          {view === 'pipeline' ? (
            <OrdersPipeline orders={orders} isLoading={isLoading} onRefresh={refresh} />
          ) : (
            <>
              <div className="rounded-lg border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <SortHeader field="order_number">Nº Pedido</SortHeader>
                      <TableHead>Cliente</TableHead>
                      <TableHead>Tipo</TableHead>
                      <TableHead>Estado</TableHead>
                      <SortHeader field="created_at">Fecha</SortHeader>
                      <SortHeader field="estimated_delivery_date">Entrega est.</SortHeader>
                      <TableHead>Total</TableHead>
                      <TableHead>Pagado</TableHead>
                      <TableHead>Pendiente</TableHead>
                      <TableHead>Tienda</TableHead>
                      <TableHead className="w-10"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {isLoading ? (
                      Array.from({ length: 8 }).map((_, i) => (
                        <TableRow key={i}>
                          <TableCell><Skeleton className="h-4 w-20" /></TableCell>
                          <TableCell><div className="space-y-1"><Skeleton className="h-4 w-28" /><Skeleton className="h-3 w-20" /></div></TableCell>
                          <TableCell><Skeleton className="h-5 w-18 rounded-full" /></TableCell>
                          <TableCell><Skeleton className="h-5 w-22 rounded-full" /></TableCell>
                          <TableCell><Skeleton className="h-4 w-20" /></TableCell>
                          <TableCell><Skeleton className="h-4 w-20" /></TableCell>
                          <TableCell><Skeleton className="h-4 w-16" /></TableCell>
                          <TableCell><Skeleton className="h-4 w-16" /></TableCell>
                          <TableCell><Skeleton className="h-4 w-16" /></TableCell>
                          <TableCell><Skeleton className="h-4 w-16" /></TableCell>
                          <TableCell><Skeleton className="h-7 w-7 rounded" /></TableCell>
                        </TableRow>
                      ))
                    ) : orders.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={11} className="h-40 text-center text-muted-foreground">
                          {hasActiveFilters ? 'No hay pedidos con los filtros aplicados.' : 'No hay pedidos'}
                        </TableCell>
                      </TableRow>
                    ) : orders.map((order: any) => {
                      const isOverdue = order.estimated_delivery_date && new Date(order.estimated_delivery_date) < new Date() && !['delivered', 'cancelled'].includes(order.status)
                      return (
                        <TableRow key={order.id} className="cursor-pointer hover:bg-muted/50"
                          onClick={() => router.push(`/admin/pedidos/${order.id}`)}>
                          <TableCell className="font-mono font-medium">
                            <div className="flex items-center gap-1">
                              {order.order_number}
                              {isOverdue && <AlertTriangle className="h-3 w-3 text-red-500" />}
                            </div>
                          </TableCell>
                          <TableCell>
                            <div>
                              <p className="font-medium text-sm">{order.clients?.full_name}</p>
                              <p className="text-xs text-muted-foreground">{order.clients?.phone}</p>
                            </div>
                          </TableCell>
                          <TableCell><Badge variant="outline" className="text-xs">{order.order_type === 'artesanal' ? 'Artesanal' : 'Industrial'}</Badge></TableCell>
                          <TableCell><Badge className={`text-xs ${getOrderStatusColor(order.status)}`}>{getOrderStatusLabel(order.status)}</Badge></TableCell>
                          <TableCell className="text-sm">{formatDate(order.created_at)}</TableCell>
                          <TableCell className={`text-sm ${isOverdue ? 'text-red-600 font-medium' : ''}`}>{formatDate(order.estimated_delivery_date)}</TableCell>
                          <TableCell className="font-medium">{formatCurrency(order.total)}</TableCell>
                          <TableCell>{formatCurrency(order.total_paid)}</TableCell>
                          <TableCell>
                            <span className={order.total_pending > 0 ? 'text-amber-600 font-medium' : 'text-green-600'}>
                              {formatCurrency(order.total_pending)}
                            </span>
                          </TableCell>
                          <TableCell className="text-sm">{order.stores?.name}</TableCell>
                          <TableCell onClick={(e) => e.stopPropagation()}>
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="icon" className="h-8 w-8"><MoreHorizontal className="h-4 w-4" /></Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                <DropdownMenuItem onClick={() => router.push(`/admin/pedidos/${order.id}`)}>
                                  <Eye className="mr-2 h-4 w-4" /> Ver ficha
                                </DropdownMenuItem>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem
                                  className="text-red-600 focus:text-red-600"
                                  onClick={async () => {
                                    if (!confirm(`¿Eliminar pedido ${order.order_number}? Esta acción no se puede deshacer.`)) return
                                    const res = await deleteOrder(order.id)
                                    if (res.success) {
                                      toast.success('Pedido eliminado')
                                      refresh()
                                    } else {
                                      toast.error(res.error ?? 'Error al eliminar')
                                    }
                                  }}
                                >
                                  <Trash2 className="mr-2 h-4 w-4" /> Eliminar
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </TableCell>
                        </TableRow>
                      )
                    })}
                  </TableBody>
                </Table>
              </div>

              {totalPages > 1 && (
                <div className="flex items-center justify-between">
                  <p className="text-sm text-muted-foreground">
                    {(page - 1) * pageSize + 1}-{Math.min(page * pageSize, total)} de {total}
                  </p>
                  <div className="flex items-center gap-2">
                    <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)}><ChevronLeft className="h-4 w-4" /></Button>
                    <span className="text-sm">{page} / {totalPages}</span>
                    <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage(page + 1)}><ChevronRight className="h-4 w-4" /></Button>
                  </div>
                </div>
              )}
            </>
          )}
        </TabsContent>

        {/* TAB: A proveedor */}
        <TabsContent value="supplier" className="space-y-6 mt-6">
          <div className="rounded-lg border bg-muted/30 p-3">
            <div className="relative max-w-sm">
              <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Buscar por nº pedido, proveedor..."
                className="pl-8 h-8 text-sm"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
          </div>

          <div className="rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nº Pedido</TableHead>
                  <TableHead>Proveedor</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead>Fecha</TableHead>
                  <TableHead>Entrega est.</TableHead>
                  <TableHead>Total</TableHead>
                  <TableHead>Pedido sastrería</TableHead>
                  <TableHead>Tienda</TableHead>
                  <TableHead className="w-10"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loadingSupplier ? (
                  Array.from({ length: 8 }).map((_, i) => (
                    <TableRow key={i}>
                      <TableCell><Skeleton className="h-4 w-20" /></TableCell>
                      <TableCell><Skeleton className="h-4 w-28" /></TableCell>
                      <TableCell><Skeleton className="h-5 w-20 rounded-full" /></TableCell>
                      <TableCell><Skeleton className="h-4 w-20" /></TableCell>
                      <TableCell><Skeleton className="h-4 w-20" /></TableCell>
                      <TableCell><Skeleton className="h-4 w-16" /></TableCell>
                      <TableCell><Skeleton className="h-4 w-20" /></TableCell>
                      <TableCell><Skeleton className="h-4 w-16" /></TableCell>
                      <TableCell><Skeleton className="h-7 w-7 rounded" /></TableCell>
                    </TableRow>
                  ))
                ) : filteredSupplierOrders.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={9} className="h-40 text-center text-muted-foreground">
                      {search.trim() ? 'Sin resultados' : 'No hay pedidos a proveedor'}
                    </TableCell>
                  </TableRow>
                ) : filteredSupplierOrders.map((so: any) => (
                  <TableRow
                    key={so.id}
                    className="cursor-pointer hover:bg-muted/50"
                    onClick={() => router.push(`/admin/proveedores?pedido=${so.id}`)}
                  >
                    <TableCell className="font-mono font-medium">{so.order_number}</TableCell>
                    <TableCell className="text-sm">{so.suppliers?.name ?? '—'}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className="text-xs">
                        {supplierOrderStatusLabels[so.status] ?? so.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm">{formatDate(so.order_date)}</TableCell>
                    <TableCell className="text-sm">{formatDate(so.estimated_delivery_date)}</TableCell>
                    <TableCell className="font-medium">{formatCurrency(so.total)}</TableCell>
                    <TableCell className="text-sm font-mono">
                      {so.tailoring_orders?.order_number ?? '—'}
                    </TableCell>
                    <TableCell className="text-sm">{(so.stores && so.stores.name) ?? '—'}</TableCell>
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8"><MoreHorizontal className="h-4 w-4" /></Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => router.push(`/admin/proveedores?pedido=${so.id}`)}>
                            <Eye className="mr-2 h-4 w-4" /> Ver ficha
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        {/* TAB: Reservas */}
        <TabsContent value="reservations" className="mt-6">
          <ReservationsTab />
        </TabsContent>
      </Tabs>
    </div>
  )
}
