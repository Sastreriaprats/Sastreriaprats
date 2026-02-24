'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Plus, Search, MoreHorizontal, Eye, ChevronLeft, ChevronRight,
  LayoutList, Kanban, ArrowUpDown, AlertTriangle, SlidersHorizontal, X,
} from 'lucide-react'
import { Skeleton } from '@/components/ui/skeleton'
import { useList } from '@/hooks/use-list'
import { usePermissions } from '@/hooks/use-permissions'
import { listOrders } from '@/actions/orders'
import { formatCurrency, formatDate, getOrderStatusColor, getOrderStatusLabel } from '@/lib/utils'
import { OrdersPipeline } from './orders-pipeline'

const orderStatuses = [
  'created', 'fabric_ordered', 'fabric_received', 'factory_ordered',
  'in_production', 'fitting', 'adjustments', 'finished', 'delivered', 'incident', 'cancelled',
]

export function OrdersPageContent({ initialView, initialStatus }: { initialView: string; initialStatus?: string }) {
  const router = useRouter()
  const { can } = usePermissions()
  const [view, setView] = useState<'table' | 'pipeline'>(initialView as any)
  const [statusFilter, setStatusFilter] = useState(initialStatus || 'all')
  const [typeFilter, setTypeFilter] = useState('all')

  const {
    data: orders, total, totalPages, page, setPage,
    search, setSearch, sortBy, sortOrder, toggleSort,
    filters, setFilters, isLoading, refresh, pageSize,
    statusCounts: statusCountsFromApi, totalAll,
  } = useList(listOrders, {
    pageSize: 25,
    defaultSort: 'created_at',
    defaultOrder: 'desc',
    defaultFilters: initialStatus === 'overdue' ? { status: 'overdue' } : {},
  })

  const applyStatus = (v: string) => {
    setStatusFilter(v)
    setFilters(prev => ({ ...prev, ...(v !== 'all' ? { status: v } : { status: undefined }) }))
    router.replace(v === 'overdue' ? '/admin/pedidos?status=overdue' : '/admin/pedidos')
  }

  const applyType = (v: string) => {
    setTypeFilter(v)
    setFilters(prev => ({ ...prev, ...(v !== 'all' ? { order_type: v } : { order_type: undefined }) }))
  }

  const hasActiveFilters = statusFilter !== 'all' || typeFilter !== 'all'
  const clearAllFilters = () => {
    setStatusFilter('all')
    setTypeFilter('all')
    setFilters({})
    router.replace('/admin/pedidos')
  }

  const SortHeader = ({ field, children }: { field: string; children: React.ReactNode }) => (
    <TableHead className="cursor-pointer select-none" onClick={() => toggleSort(field)}>
      <div className="flex items-center gap-1">{children}
        <ArrowUpDown className={`h-3 w-3 ${sortBy === field ? 'text-foreground' : 'text-muted-foreground/50'}`} />
      </div>
    </TableHead>
  )

  const statusCounts = statusCountsFromApi ?? {}

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Pedidos de Sastrería</h1>
          <p className="text-muted-foreground">{isLoading ? 'Cargando...' : `${total} pedidos`}</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex rounded-lg border p-0.5">
            <Button variant={view === 'table' ? 'default' : 'ghost'} size="sm" className="h-7 px-2" onClick={() => setView('table')}>
              <LayoutList className="h-4 w-4" />
            </Button>
            <Button variant={view === 'pipeline' ? 'default' : 'ghost'} size="sm" className="h-7 px-2" onClick={() => setView('pipeline')}>
              <Kanban className="h-4 w-4" />
            </Button>
          </div>
          {can('orders.create') && (
            <Button onClick={() => router.push('/admin/pedidos/nuevo')} className="gap-2 bg-prats-navy hover:bg-prats-navy-light">
              <Plus className="h-4 w-4" /> Nuevo pedido
            </Button>
          )}
        </div>
      </div>

      {/* Barra de filtros (como en Stock) */}
      <div className="rounded-lg border bg-muted/30 p-3 space-y-3">
        <div className="flex items-center gap-2">
          <SlidersHorizontal className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-medium text-muted-foreground">Filtros</span>
          {hasActiveFilters && (
            <Button
              size="sm"
              variant="ghost"
              className="h-6 px-2 text-xs text-muted-foreground hover:text-foreground ml-auto"
              onClick={clearAllFilters}
            >
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
          <Select value={typeFilter} onValueChange={applyType}>
            <SelectTrigger className={`h-8 w-[140px] text-sm ${typeFilter !== 'all' ? 'border-prats-navy text-prats-navy font-medium' : ''}`}>
              <SelectValue placeholder="Tipo" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos los tipos</SelectItem>
              <SelectItem value="artesanal">Artesanal</SelectItem>
              <SelectItem value="industrial">Industrial</SelectItem>
            </SelectContent>
          </Select>
        </div>

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
            {typeFilter !== 'all' && (
              <Badge variant="secondary" className="text-xs gap-1 pr-1">
                {typeFilter === 'artesanal' ? 'Artesanal' : 'Industrial'}
                <button type="button" onClick={() => applyType('all')} className="ml-0.5 hover:text-foreground"><X className="h-3 w-3" /></button>
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
                  <SortHeader field="total">Total</SortHeader>
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
    </div>
  )
}
