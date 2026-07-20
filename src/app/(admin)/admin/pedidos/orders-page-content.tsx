'use client'

import { useState, useEffect, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow, TableFooter,
} from '@/components/ui/table'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import {
  Plus, Search, MoreHorizontal, Eye, Trash2, ChevronLeft, ChevronRight,
  LayoutList, Kanban, ArrowUpDown, AlertTriangle, SlidersHorizontal, X, Loader2, Download, CircleDollarSign,
} from 'lucide-react'
import { Skeleton } from '@/components/ui/skeleton'
import { useList } from '@/hooks/use-list'
import { usePermissions } from '@/hooks/use-permissions'
import { listOrders, deleteOrder } from '@/actions/orders'
import { listReservations } from '@/actions/reservations'
import { getClientPendingDebt, type PendingPaymentRow } from '@/actions/payments'
import { formatCurrency, formatDate, getOrderStatusColor, getOrderStatusLabel, summarizeOrderGarments, normalizeSearchTerm } from '@/lib/utils'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'
import { OrdersPipeline } from './orders-pipeline'
import { ReservationsTab } from '@/app/(admin)/admin/stock/tabs/reservations-tab'
import { OnlineOrdersList } from '@/app/(admin)/admin/tienda-online/online-orders-list'
import { ALL_VISIBLE_STATUSES } from '@/lib/orders/statuses'
import { downloadExcel } from '@/lib/excel/export'

const orderStatuses = ALL_VISIBLE_STATUSES

const supplierOrderStatusLabels: Record<string, string> = {
  draft: 'Borrador', sent: 'Enviado', confirmed: 'Confirmado',
  partially_received: 'Parcial', received: 'Recibido', incident: 'Incidencia', cancelled: 'Cancelado',
  closed: 'Zanjado',
}

type TabValue = 'tailoring' | 'supplier' | 'reservations' | 'online'

// Estados de pedido online considerados "activos" (requieren acción del admin)
const ONLINE_ACTIVE_STATUSES = ['pending_payment', 'paid', 'processing', 'shipped']

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
  // Buscador independiente para el tab "Pedidos a proveedor" (no comparte
  // estado con useList(listOrders), así no dispara queries de sastrería).
  const [supplierSearch, setSupplierSearch] = useState('')
  // Subtipo dentro del tab Sastrería: all | artesanal | industrial
  const [subTypeFilter, setSubTypeFilter] = useState<'all' | 'artesanal' | 'industrial'>(
    initialType === 'artesanal' || initialType === 'industrial' ? initialType : 'all',
  )

  const [supplierOrders, setSupplierOrders] = useState<any[]>([])
  const [loadingSupplier, setLoadingSupplier] = useState(false)
  const [orderToDelete, setOrderToDelete] = useState<{ id: string; order_number: string } | null>(null)
  // Deuda total unificada (encargos + tickets + reservas) del cliente buscado
  const [clientDebt, setClientDebt] = useState<{ clientId: string; clientName: string; rows: PendingPaymentRow[] } | null>(null)
  const [deletingOrder, setDeletingOrder] = useState(false)
  const [exporting, setExporting] = useState(false)

  // Contadores para badges de los tabs
  const [supplierActiveCount, setSupplierActiveCount] = useState<number | null>(null)
  const [reservationsActiveCount, setReservationsActiveCount] = useState<number | null>(null)
  const [onlineActiveCount, setOnlineActiveCount] = useState<number | null>(null)

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
    // Listado de pedidos a proveedor ACTIVOS (no recibidos ni cancelados),
    // alineado con el contador del badge del tab. Antes había un embed
    // `tailoring_orders:tailoring_order_id(order_number)` que PostgREST
    // rechazaba por falta de FK declarada en BBDD entre supplier_orders y
    // tailoring_orders — devolvía error y la tabla quedaba vacía aunque hubiera
    // 10 filas. Como la columna tailoring_order_id está al 100% vacía en
    // producción, quitar el embed no pierde información (los renders ya tienen
    // fallback `?? '—'`).
    supabase
      .from('supplier_orders')
      .select(`id, order_number, status, total, order_date,
        estimated_delivery_date, payment_due_date, tailoring_order_id,
        suppliers(name),
        stores:destination_store_id(name)`)
      .not('status', 'in', '(received,cancelled)')
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

    supabase
      .from('online_orders')
      .select('id', { count: 'exact', head: true })
      .in('status', ONLINE_ACTIVE_STATUSES)
      .then(({ count }) => setOnlineActiveCount(count ?? 0))
  }, [])

  // Rango de fechas (sobre order_date) para el tab Sastrería.
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')

  const {
    data: orders, total, totalPages, page, setPage,
    search, setSearch, sortBy, sortOrder, toggleSort,
    filters, setFilters, isLoading, refresh, pageSize,
    statusCounts: statusCountsFromApi, totalAll, aggregates,
  } = useList(listOrders, {
    pageSize: 25,
    defaultSort: 'order_date',
    defaultOrder: 'desc',
    defaultFilters: initialStatus === 'overdue'
      ? { status: 'overdue', ...(subTypeFilter !== 'all' ? { order_type: subTypeFilter } : {}) }
      : (subTypeFilter !== 'all' ? { order_type: subTypeFilter } : {}),
    // Página/búsqueda/filtros en la URL: al volver del detalle se restauran.
    // El rango de fechas (order_date {gte,lte}) no es serializable y queda fuera.
    syncUrl: true,
    urlFilterKeys: ['status', 'order_type'],
  })

  // Contador de pedidos de sastrería activos (excluye delivered y cancelled)
  const tailoringActiveCount = useMemo(() => {
    if (!statusCountsFromApi) return null
    const allCount = totalAll ?? 0
    const delivered = statusCountsFromApi['delivered'] ?? 0
    const cancelled = statusCountsFromApi['cancelled'] ?? 0
    return Math.max(0, allCount - delivered - cancelled)
  }, [statusCountsFromApi, totalAll])

  // Si la búsqueda deja un único cliente en el listado, se carga su deuda
  // total unificada (encargos + tickets + reservas) y se muestra en un banner:
  // así se ve todo lo que debe sin ir a la pestaña Reservas ni a Cobros.
  useEffect(() => {
    if (isLoading) return
    const ids = new Set(orders.map((o: any) => o.clients?.id).filter(Boolean))
    if (search.trim().length < 2 || ids.size !== 1) {
      setClientDebt(null)
      return
    }
    const clientId = String([...ids][0])
    let cancelled = false
    getClientPendingDebt({ client_id: clientId }).then((res) => {
      if (cancelled || !res.success) return
      const clientName = orders[0]?.clients?.full_name ?? ''
      setClientDebt({ clientId, clientName, rows: res.data })
    })
    return () => { cancelled = true }
  }, [isLoading, search, orders])

  const applyStatus = (v: string) => {
    setStatusFilter(v)
    // El hook (syncUrl) ya refleja `status` en la URL; el replace manual de antes
    // pisaba el resto de la query (page/search).
    setFilters(prev => ({ ...prev, ...(v !== 'all' ? { status: v } : { status: undefined }) }))
  }

  const applySubType = (v: 'all' | 'artesanal' | 'industrial') => {
    setSubTypeFilter(v)
    setFilters(prev => ({ ...prev, order_type: v !== 'all' ? v : undefined }))
  }

  // Aplica el rango de fechas al filtro `order_date` (objeto { gte, lte }) que
  // listOrders/queryList saben interpretar. Vacío en ambos extremos → se quita.
  const applyDateRange = (from: string, to: string) => {
    setDateFrom(from)
    setDateTo(to)
    setFilters(prev => {
      const next = { ...prev }
      if (from || to) {
        next.order_date = { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) }
      } else {
        delete next.order_date
      }
      return next
    })
  }

  const hasActiveFilters = statusFilter !== 'all' || subTypeFilter !== 'all' || !!dateFrom || !!dateTo
  const clearAllFilters = () => {
    setStatusFilter('all')
    setSubTypeFilter('all')
    setDateFrom('')
    setDateTo('')
    setFilters({})
  }

  // Exporta a Excel todos los pedidos de sastrería que cumplen los filtros
  // activos (búsqueda, subtipo, estado), no solo la página visible. Para ello
  // se vuelve a llamar a listOrders con los mismos filtros pero sin paginar.
  const handleExportExcel = async () => {
    setExporting(true)
    try {
      const res = await listOrders({ page: 1, pageSize: 100000, search, sortBy, sortOrder, filters })
      if (!res.success) {
        toast.error(res.error ?? 'No se pudieron exportar los pedidos')
        return
      }
      const list = (res.data.data ?? []) as any[]
      if (list.length === 0) {
        toast.error('No hay pedidos para exportar con los filtros aplicados')
        return
      }
      const data = list.map((o) => ({
        'Nº pedido': o.order_number ?? '',
        'Cliente': o.clients?.full_name ?? '',
        'Teléfono': o.clients?.phone ?? '',
        'Email': o.clients?.email ?? '',
        'Fecha pedido': formatDate(o.order_date || o.created_at),
        'Entrega estimada': formatDate(o.estimated_delivery_date),
        'Tipo': o.order_type === 'artesanal' ? 'Artesanal' : 'Industrial',
        'Estado': getOrderStatusLabel(o.status),
        'Encargo': summarizeOrderGarments(o.tailoring_order_lines),
        'Total': Number(o.total) || 0,
        'Pagado': Number(o.total_paid) || 0,
        'Pendiente': Number(o.total_pending) || 0,
        'Tienda': o.stores?.name ?? '',
      }))
      const today = new Date().toISOString().slice(0, 10)
      await downloadExcel(data, `pedidos-${today}`, 'Pedidos')
    } catch (err) {
      console.error('[handleExportExcel]', err)
      toast.error('Error al exportar los pedidos')
    } finally {
      setExporting(false)
    }
  }

  const SortHeader = ({ field, children }: { field: string; children: React.ReactNode }) => (
    <TableHead className="cursor-pointer select-none" onClick={() => toggleSort(field)}>
      <div className="flex items-center gap-1">{children}
        <ArrowUpDown className={`h-3 w-3 ${sortBy === field ? 'text-foreground' : 'text-muted-foreground/50'}`} />
      </div>
    </TableHead>
  )

  const statusCounts = statusCountsFromApi ?? {}

  // Pedidos a proveedor filtrados por búsqueda (client-side, multi-palabra sin acentos)
  const filteredSupplierOrders = useMemo(() => {
    const tokens = normalizeSearchTerm(supplierSearch).split(/\s+/).filter(Boolean)
    if (tokens.length === 0) return supplierOrders
    return supplierOrders.filter((so: any) => {
      const hay = normalizeSearchTerm(`${so.order_number ?? ''} ${so.suppliers?.name ?? ''} ${so.tailoring_orders?.order_number ?? ''}`)
      return tokens.every((t) => hay.includes(t))
    })
  }, [supplierOrders, supplierSearch])

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
            {tab === 'online' && 'Pedidos de la tienda online'}
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
          {tab === 'tailoring' && (
            <Button variant="outline" onClick={handleExportExcel} disabled={exporting} className="gap-2">
              {exporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
              Exportar a Excel
            </Button>
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
          <TabsTrigger value="online" className={tabTriggerClass}>
            Online {tabBadge(onlineActiveCount, tab === 'online')}
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
                  placeholder="Buscar por nº pedido o nombre de cliente..."
                  className="pl-8 h-8 text-sm"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
              <div className="flex items-center gap-1.5">
                <span className="text-xs text-muted-foreground">Desde:</span>
                <Input
                  type="date"
                  className="h-8 text-sm w-[150px]"
                  value={dateFrom}
                  max={dateTo || undefined}
                  onChange={(e) => applyDateRange(e.target.value, dateTo)}
                />
                <span className="text-xs text-muted-foreground">Hasta:</span>
                <Input
                  type="date"
                  className="h-8 text-sm w-[150px]"
                  value={dateTo}
                  min={dateFrom || undefined}
                  onChange={(e) => applyDateRange(dateFrom, e.target.value)}
                />
                {(dateFrom || dateTo) && (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-8 px-2 text-xs text-muted-foreground hover:text-foreground"
                    onClick={() => applyDateRange('', '')}
                  >
                    <X className="h-3 w-3" />
                  </Button>
                )}
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
                {(dateFrom || dateTo) && (
                  <Badge variant="secondary" className="text-xs gap-1 pr-1">
                    {dateFrom ? formatDate(dateFrom) : '…'} – {dateTo ? formatDate(dateTo) : '…'}
                    <button type="button" onClick={() => applyDateRange('', '')} className="ml-0.5 hover:text-foreground"><X className="h-3 w-3" /></button>
                  </Badge>
                )}
              </div>
            )}
          </div>

          {clientDebt && clientDebt.rows.length > 0 && (() => {
            const parts = ([
              ['tailoring_order', 'Encargos'],
              ['sale', 'Tickets'],
              ['reservation', 'Reservas'],
            ] as const).map(([type, label]) => {
              const rows = clientDebt.rows.filter((r) => r.entity_type === type)
              return { label, count: rows.length, amount: rows.reduce((s, r) => s + r.total_pending, 0) }
            }).filter((p) => p.amount > 0)
            const totalDebt = parts.reduce((s, p) => s + p.amount, 0)
            if (totalDebt <= 0) return null
            return (
              <div className="flex flex-wrap items-center gap-x-5 gap-y-1 rounded-lg border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm">
                <span className="flex items-center gap-1.5 font-medium">
                  <CircleDollarSign className="h-4 w-4 text-amber-600" />
                  {clientDebt.clientName} debe en total
                  <span className="font-bold text-amber-700">{formatCurrency(totalDebt)}</span>
                </span>
                {parts.map((p) => (
                  <span key={p.label} className="text-muted-foreground">
                    {p.label}: <span className="font-medium text-foreground">{formatCurrency(p.amount)}</span> ({p.count})
                  </span>
                ))}
                <Button
                  variant="link"
                  size="sm"
                  className="h-auto p-0 text-sm"
                  onClick={() => router.push(`/admin/clientes/${clientDebt.clientId}`)}
                >
                  Ver ficha del cliente
                </Button>
              </div>
            )
          })()}

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
                      <TableHead>Encargo</TableHead>
                      <TableHead>Tipo</TableHead>
                      <TableHead>Estado</TableHead>
                      <SortHeader field="order_date">Fecha</SortHeader>
                      <SortHeader field="estimated_delivery_date">Entrega est.</SortHeader>
                      <SortHeader field="payment_date">Fecha pago</SortHeader>
                      <SortHeader field="total">Total</SortHeader>
                      <SortHeader field="total_paid">Pagado</SortHeader>
                      <SortHeader field="total_pending">Pendiente</SortHeader>
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
                          <TableCell><Skeleton className="h-4 w-32" /></TableCell>
                          <TableCell><Skeleton className="h-5 w-18 rounded-full" /></TableCell>
                          <TableCell><Skeleton className="h-5 w-22 rounded-full" /></TableCell>
                          <TableCell><Skeleton className="h-4 w-20" /></TableCell>
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
                        <TableCell colSpan={13} className="h-40 text-center text-muted-foreground">
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
                          <TableCell className="text-sm max-w-[180px] truncate" title={summarizeOrderGarments(order.tailoring_order_lines)}>
                            {summarizeOrderGarments(order.tailoring_order_lines)}
                          </TableCell>
                          <TableCell><Badge variant="outline" className="text-xs">{order.order_type === 'artesanal' ? 'Artesanal' : 'Industrial'}</Badge></TableCell>
                          <TableCell><Badge className={`text-xs ${getOrderStatusColor(order.status)}`}>{getOrderStatusLabel(order.status)}</Badge></TableCell>
                          <TableCell className="text-sm">{formatDate(order.order_date || order.created_at)}</TableCell>
                          <TableCell className={`text-sm ${isOverdue ? 'text-red-600 font-medium' : ''}`}>{formatDate(order.estimated_delivery_date)}</TableCell>
                          <TableCell className="text-sm">{order.payment_date ? formatDate(order.payment_date) : '—'}</TableCell>
                          <TableCell className="font-medium">
                            {formatCurrency(order.total)}
                            {(() => {
                              const orderLines = order.tailoring_order_lines || []
                              const gifts = orderLines.filter((l: any) => l.is_gift === true).length
                              if (gifts === 0) return null
                              return (
                                <Badge variant="outline" className="ml-1.5 text-[10px] bg-amber-100 text-amber-800 border-amber-300">
                                  {gifts === orderLines.length ? 'Regalo' : 'Incluye regalo'}
                                </Badge>
                              )
                            })()}
                          </TableCell>
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
                                {can('orders.delete') && (
                                  <>
                                    <DropdownMenuSeparator />
                                    <DropdownMenuItem
                                      className="text-red-600 focus:text-red-600"
                                      onClick={() => setOrderToDelete({ id: order.id, order_number: order.order_number })}
                                    >
                                      <Trash2 className="mr-2 h-4 w-4" /> Eliminar
                                    </DropdownMenuItem>
                                  </>
                                )}
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </TableCell>
                        </TableRow>
                      )
                    })}
                  </TableBody>
                  {!isLoading && orders.length > 0 && aggregates && (
                    <TableFooter>
                      <TableRow>
                        <TableCell colSpan={8} className="text-right font-medium">
                          Totales{total > orders.length ? ` (${total} pedidos del filtro)` : ''}
                        </TableCell>
                        <TableCell className="font-bold tabular-nums">{formatCurrency(aggregates.total)}</TableCell>
                        <TableCell className="font-bold tabular-nums">{formatCurrency(aggregates.total_paid)}</TableCell>
                        <TableCell className="font-bold tabular-nums text-amber-600">{formatCurrency(aggregates.total_pending)}</TableCell>
                        <TableCell colSpan={2} />
                      </TableRow>
                    </TableFooter>
                  )}
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
                value={supplierSearch}
                onChange={(e) => setSupplierSearch(e.target.value)}
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
                  <TableHead>Fecha pago</TableHead>
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
                      <TableCell><Skeleton className="h-4 w-20" /></TableCell>
                      <TableCell><Skeleton className="h-4 w-16" /></TableCell>
                      <TableCell><Skeleton className="h-4 w-20" /></TableCell>
                      <TableCell><Skeleton className="h-4 w-16" /></TableCell>
                      <TableCell><Skeleton className="h-7 w-7 rounded" /></TableCell>
                    </TableRow>
                  ))
                ) : filteredSupplierOrders.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={10} className="h-40 text-center text-muted-foreground">
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
                    <TableCell className="text-sm">{so.payment_due_date ? formatDate(so.payment_due_date) : '—'}</TableCell>
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
              {!loadingSupplier && filteredSupplierOrders.length > 0 && (
                <TableFooter>
                  <TableRow>
                    <TableCell colSpan={6} className="text-right font-medium">
                      Total ({filteredSupplierOrders.length} pedidos)
                    </TableCell>
                    <TableCell className="font-bold tabular-nums">
                      {formatCurrency(filteredSupplierOrders.reduce((s: number, so: any) => s + (Number(so.total) || 0), 0))}
                    </TableCell>
                    <TableCell colSpan={3} />
                  </TableRow>
                </TableFooter>
              )}
            </Table>
          </div>
        </TabsContent>

        {/* TAB: Reservas */}
        <TabsContent value="reservations" className="mt-6">
          <ReservationsTab />
        </TabsContent>

        {/* TAB: Online */}
        <TabsContent value="online" className="mt-6">
          {tab === 'online' && <OnlineOrdersList />}
        </TabsContent>
      </Tabs>

      <AlertDialog open={!!orderToDelete} onOpenChange={(v) => { if (!v && !deletingOrder) setOrderToDelete(null) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar pedido {orderToDelete?.order_number}?</AlertDialogTitle>
            <AlertDialogDescription>
              Borra el talón completo, sus líneas, pagos asociados y vínculos a reservas.
              Esta acción no se puede deshacer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deletingOrder}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700 text-white"
              disabled={deletingOrder}
              onClick={async (e) => {
                e.preventDefault()
                if (!orderToDelete) return
                setDeletingOrder(true)
                const res = await deleteOrder(orderToDelete.id)
                setDeletingOrder(false)
                if (res.success) {
                  toast.success('Pedido eliminado')
                  setOrderToDelete(null)
                  refresh()
                } else {
                  toast.error(res.error ?? 'Error al eliminar')
                }
              }}
            >
              {deletingOrder ? <><Loader2 className="h-4 w-4 animate-spin mr-1" /> Eliminando…</> : 'Eliminar pedido'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
