'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Plus, Search, ChevronLeft, ChevronRight, ArrowUpDown } from 'lucide-react'
import { Skeleton } from '@/components/ui/skeleton'
import { useList } from '@/hooks/use-list'
import { listOrders } from '@/actions/orders'
import { formatCurrency, formatDate, getOrderStatusColor, getOrderStatusLabel } from '@/lib/utils'
import { SastreHeader } from '../../components/sastre-header'

const orderStatuses = [
  'created', 'fabric_ordered', 'fabric_received', 'factory_ordered',
  'in_production', 'fitting', 'adjustments', 'finished', 'delivered', 'incident', 'cancelled',
]

export function SastrePedidosContent({ sastreName }: { sastreName: string }) {
  const router = useRouter()
  const [statusFilter, setStatusFilter] = useState('all')

  const {
    data: orders,
    total,
    totalPages,
    page,
    setPage,
    search,
    setSearch,
    sortBy,
    sortOrder,
    toggleSort,
    filters,
    setFilters,
    isLoading,
  } = useList(listOrders, {
    pageSize: 25,
    defaultSort: 'created_at',
    defaultOrder: 'desc',
    defaultFilters: {},
  })

  const applyStatus = (v: string) => {
    setStatusFilter(v)
    setFilters((prev: Record<string, unknown>) => ({ ...prev, ...(v !== 'all' ? { status: v } : { status: undefined }) }))
  }

  const SortHeader = ({ field, children }: { field: string; children: React.ReactNode }) => (
    <TableHead className="cursor-pointer select-none" onClick={() => toggleSort(field)}>
      <div className="flex items-center gap-1">
        {children}
        <ArrowUpDown className={`h-3 w-3 ${sortBy === field ? 'text-foreground' : 'text-muted-foreground/50'}`} />
      </div>
    </TableHead>
  )

  return (
    <div className="min-h-screen flex flex-col">
      <SastreHeader sastreName={sastreName} sectionTitle="Pedidos" backHref="/sastre/nueva-venta" />
      <main className="flex-1 p-6">
        <div className="max-w-6xl mx-auto space-y-6">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div>
              <h1 className="text-2xl font-bold text-white">Pedidos de Sastrería</h1>
              <p className="text-white/60 text-sm mt-0.5">
                {isLoading ? 'Cargando...' : `${total} pedidos`}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-white/40" />
                <Input
                  placeholder="Buscar por número..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-8 w-48 h-9 bg-white/10 border-[#c9a96e]/30 text-white placeholder:text-white/40"
                />
              </div>
              <Select value={statusFilter} onValueChange={applyStatus}>
                <SelectTrigger className="w-40 h-9 bg-white/10 border-[#c9a96e]/30 text-white">
                  <SelectValue placeholder="Estado" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  <SelectItem value="overdue">Vencidos</SelectItem>
                  {orderStatuses.map((s) => (
                    <SelectItem key={s} value={s}>
                      {getOrderStatusLabel(s)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                variant="outline"
                size="sm"
                className="border-[#c9a96e]/40 text-[#c9a96e] hover:bg-[#c9a96e]/10"
                onClick={() => router.push('/sastre/pedidos/nuevo')}
              >
                <Plus className="h-4 w-4 mr-1" /> Nuevo producto
              </Button>
            </div>
          </div>

          <div className="rounded-xl border border-[#c9a96e]/20 bg-white/5 overflow-hidden">
            {isLoading ? (
              <div className="p-8">
                <Skeleton className="h-64 w-full bg-white/10" />
              </div>
            ) : orders.length === 0 ? (
              <div className="p-12 text-center text-white/60">No hay pedidos</div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow className="border-[#c9a96e]/20 hover:bg-transparent">
                    <SortHeader field="order_number">Nº</SortHeader>
                    <TableHead className="text-white/70">Cliente</TableHead>
                    <SortHeader field="order_date">Fecha</SortHeader>
                    <TableHead className="text-white/70">Total</TableHead>
                    <TableHead className="text-white/70">Pendiente</TableHead>
                    <SortHeader field="status">Estado</SortHeader>
                    <TableHead className="w-20" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {orders.map((o: any) => (
                    <TableRow
                      key={o.id}
                      className="border-[#c9a96e]/10 hover:bg-white/5 cursor-pointer"
                      onClick={() => router.push(`/sastre/pedidos/${o.id}`)}
                    >
                      <TableCell className="font-medium text-white">{o.order_number}</TableCell>
                      <TableCell className="text-white/80">
                        {o.clients?.full_name ?? o.client_id ?? '—'}
                      </TableCell>
                      <TableCell className="text-white/70">{formatDate(o.order_date)}</TableCell>
                      <TableCell className="text-white">{formatCurrency(o.total)}</TableCell>
                      <TableCell className="text-amber-400">{formatCurrency(o.total_pending ?? 0)}</TableCell>
                      <TableCell>
                        <span
                          className={`text-xs px-2 py-0.5 rounded ${getOrderStatusColor(o.status)}`}
                        >
                          {getOrderStatusLabel(o.status)}
                        </span>
                      </TableCell>
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-[#c9a96e] hover:bg-[#c9a96e]/10"
                          onClick={(e) => {
                            e.stopPropagation()
                            router.push(`/sastre/pedidos/${o.id}`)
                          }}
                        >
                          Ver
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </div>

          {totalPages > 1 && (
            <div className="flex items-center justify-between">
              <p className="text-sm text-white/50">
                Página {page} de {totalPages}
              </p>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="border-[#c9a96e]/40 text-white"
                  disabled={page <= 1}
                  onClick={() => setPage((p: number) => p - 1)}
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="border-[#c9a96e]/40 text-white"
                  disabled={page >= totalPages}
                  onClick={() => setPage((p: number) => p + 1)}
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  )
}
