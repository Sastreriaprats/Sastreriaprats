'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import { Plus, Search, ChevronLeft, ChevronRight, ArrowUpDown } from 'lucide-react'
import { Skeleton } from '@/components/ui/skeleton'
import { useList } from '@/hooks/use-list'
import { listOrders } from '@/actions/orders'
import { formatCurrency, formatDate, getOrderStatusLabel } from '@/lib/utils'
import { SastreHeader } from '../../components/sastre-header'

// ── Badge en tabla ────────────────────────────────────────────────────────────
const BADGE_CLASSES: Record<string, string> = {
  created:               'bg-gray-500/20 text-gray-300 border-gray-500/30',
  in_production:         'bg-blue-500/20 text-blue-300 border-blue-500/30',
  pending_first_fitting: 'bg-amber-500/20 text-amber-300 border-amber-500/30',
  fitting:               'bg-purple-500/20 text-purple-300 border-purple-500/30',
  adjustments:           'bg-orange-500/20 text-orange-300 border-orange-500/30',
  finished:              'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
  delivered:             'bg-green-500/20 text-green-300 border-green-500/30',
  incident:              'bg-red-500/20 text-red-300 border-red-500/30',
  cancelled:             'bg-red-700/30 text-red-400 border-red-700/40',
  fabric_ordered:        'bg-blue-500/20 text-blue-300 border-blue-500/30',
  fabric_received:       'bg-blue-600/20 text-blue-200 border-blue-600/30',
  factory_ordered:       'bg-indigo-500/20 text-indigo-300 border-indigo-500/30',
  in_workshop:           'bg-yellow-500/20 text-yellow-300 border-yellow-500/30',
  note_sent_factory:     'bg-orange-500/20 text-orange-300 border-orange-500/30',
}

function getBadgeClass(status: string): string {
  return BADGE_CLASSES[status] ?? 'bg-gray-500/20 text-gray-300 border-gray-500/30'
}

export function SastrePedidosContent({ sastreName }: { sastreName: string }) {
  const router = useRouter()
  const [localSearch, setLocalSearch] = useState('')

  const {
    data: orders,
    total,
    totalPages,
    page,
    setPage,
    sortBy,
    toggleSort,
    isLoading,
  } = useList(listOrders, {
    pageSize: 25,
    defaultSort: 'created_at',
    defaultOrder: 'desc',
    defaultFilters: {},
  })

  // Filtrado client-side: número, nombre de cliente y estado (label legible)
  const q = localSearch.trim().toLowerCase()
  const visibleOrders = q
    ? (orders as any[]).filter((o) => {
        const num = String(o.order_number ?? '').toLowerCase()
        const name = String(o.clients?.full_name ?? '').toLowerCase()
        const estado = getOrderStatusLabel(o.status ?? '').toLowerCase()
        return num.includes(q) || name.includes(q) || estado.includes(q)
      })
    : orders

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
        <div className="max-w-6xl mx-auto space-y-4">

          {/* ── Cabecera ── */}
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
                  placeholder="Buscar por número, cliente o estado..."
                  value={localSearch}
                  onChange={(e) => setLocalSearch(e.target.value)}
                  className="pl-8 w-72 h-9 bg-white/10 border-[#c9a96e]/30 text-white placeholder:text-white/40"
                />
              </div>
              <Button
                size="sm"
                className="bg-[#c9a96e]/15 border border-[#c9a96e]/30 text-[#c9a96e] font-medium hover:bg-[#c9a96e]/25 hover:text-[#c9a96e] transition-all"
                onClick={() => router.push('/sastre/pedidos/nuevo')}
              >
                <Plus className="h-4 w-4 mr-1" /> Nuevo producto
              </Button>
            </div>
          </div>

          {/* ── Tabla ── */}
          <div className="rounded-xl border border-[#c9a96e]/20 bg-white/5 overflow-hidden">
            {isLoading ? (
              <div className="p-8">
                <Skeleton className="h-64 w-full bg-white/10" />
              </div>
            ) : (visibleOrders as any[]).length === 0 ? (
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
                    <TableHead className="w-16" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(visibleOrders as any[]).map((o) => (
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
                      <TableCell>
                        <span className={(o.total_pending ?? 0) > 0 ? 'text-amber-400 font-medium' : 'text-green-400'}>
                          {formatCurrency(o.total_pending ?? 0)}
                        </span>
                      </TableCell>
                      <TableCell>
                        <span className={`text-xs font-semibold px-3 py-1 rounded-full border ${getBadgeClass(o.status)}`}>
                          {getOrderStatusLabel(o.status)}
                        </span>
                      </TableCell>
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-[#c9a96e] hover:bg-[#c9a96e]/10"
                          onClick={(e) => { e.stopPropagation(); router.push(`/sastre/pedidos/${o.id}`) }}
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

          {/* ── Paginación ── */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between">
              <p className="text-sm text-white/50">
                Página {page} de {totalPages}
              </p>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  className="bg-white/[0.06] border border-white/15 text-white/70 font-medium hover:bg-white/10 hover:text-white transition-all"
                  disabled={page <= 1}
                  onClick={() => setPage((p: number) => p - 1)}
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <Button
                  size="sm"
                  className="bg-white/[0.06] border border-white/15 text-white/70 font-medium hover:bg-white/10 hover:text-white transition-all"
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
