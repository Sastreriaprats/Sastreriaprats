'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import {
  CircleDollarSign, Search, Loader2, Scissors, ShoppingBag,
  RefreshCw, AlertCircle, Clock,
} from 'lucide-react'
import { formatCurrency, formatDate } from '@/lib/utils'
import { toast } from 'sonner'
import { getPendingPayments, type PendingPaymentRow } from '@/actions/payments'
import { PaymentHistory } from '@/components/payments/payment-history'

// ─── KPI Card ────────────────────────────────────────────────────────────────

function KpiCard({ label, value, sub, icon: Icon, color = 'text-foreground' }: {
  label: string; value: string; sub?: string; icon: React.ElementType; color?: string
}) {
  return (
    <Card>
      <CardContent className="pt-5 pb-4">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs text-muted-foreground uppercase tracking-wide">{label}</p>
            <p className={`text-2xl font-bold mt-1 ${color}`}>{value}</p>
            {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
          </div>
          <div className="p-2.5 rounded-lg bg-muted">
            <Icon className="h-5 w-5 text-muted-foreground" />
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

// ─── Main ─────────────────────────────────────────────────────────────────────

type FilterType = 'all' | 'orders' | 'sales'

export function CobrosContent() {
  const router = useRouter()

  const [rows, setRows] = useState<PendingPaymentRow[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [filterType, setFilterType] = useState<FilterType>('all')
  const [search, setSearch] = useState('')
  const [selectedRow, setSelectedRow] = useState<PendingPaymentRow | null>(null)
  const [dialogOpen, setDialogOpen] = useState(false)

  const load = useCallback(async () => {
    setIsLoading(true)
    try {
      const result = await getPendingPayments({ type: filterType, search: search || undefined })
      if (result.success) {
        setRows(result.data)
      } else {
        toast.error(result.error ?? 'Error al cargar cobros')
      }
    } catch (e) {
      console.error('[CobrosContent] load:', e)
      toast.error('Error inesperado al cargar')
    } finally {
      setIsLoading(false)
    }
  }, [filterType, search])

  useEffect(() => {
    const t = setTimeout(load, 300)
    return () => clearTimeout(t)
  }, [load])

  // ─── KPIs ───────────────────────────────────────────────────────────────────
  const orderRows = rows.filter((r) => r.entity_type === 'tailoring_order')
  const saleRows = rows.filter((r) => r.entity_type === 'sale')

  const totalPendingOrders = orderRows.reduce((s, r) => s + r.total_pending, 0)
  const totalPendingSales = saleRows.reduce((s, r) => s + r.total_pending, 0)
  const uniqueClients = new Set(rows.map((r) => r.client_id).filter(Boolean)).size

  // ─── Helpers ────────────────────────────────────────────────────────────────
  function navigateToEntity(row: PendingPaymentRow) {
    if (row.entity_type === 'tailoring_order') {
      router.push(`/admin/pedidos/${row.id}?tab=payments`)
    } else {
      router.push(`/admin/ventas/${row.id}`)
    }
  }

  function openPaymentDialog(row: PendingPaymentRow, e: React.MouseEvent) {
    e.stopPropagation()
    setSelectedRow(row)
    setDialogOpen(true)
  }

  function getDaysColor(days: number) {
    if (days > 60) return 'text-red-600 font-semibold'
    if (days > 30) return 'text-amber-600'
    return 'text-muted-foreground'
  }

  return (
    <div className="p-6 space-y-6">
      {/* Cabecera */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <CircleDollarSign className="h-6 w-6 text-amber-500" />
            Cobros Pendientes
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Pedidos y ventas con saldo pendiente de cobro
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={load} disabled={isLoading}>
          <RefreshCw className={`h-4 w-4 mr-1.5 ${isLoading ? 'animate-spin' : ''}`} />
          Actualizar
        </Button>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <KpiCard
          label="Pendiente pedidos"
          value={formatCurrency(totalPendingOrders)}
          sub={`${orderRows.length} pedido${orderRows.length !== 1 ? 's' : ''}`}
          icon={Scissors}
          color="text-amber-600"
        />
        <KpiCard
          label="Pendiente ventas"
          value={formatCurrency(totalPendingSales)}
          sub={`${saleRows.length} venta${saleRows.length !== 1 ? 's' : ''}`}
          icon={ShoppingBag}
          color="text-amber-600"
        />
        <KpiCard
          label="Clientes con deuda"
          value={String(uniqueClients)}
          sub="clientes distintos"
          icon={AlertCircle}
        />
      </div>

      {/* Filtros */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
          <Input
            className="pl-9"
            placeholder="Buscar por referencia o cliente…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <Select value={filterType} onValueChange={(v) => setFilterType(v as FilterType)}>
          <SelectTrigger className="w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos</SelectItem>
            <SelectItem value="orders">Solo pedidos</SelectItem>
            <SelectItem value="sales">Solo ventas</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Tabla */}
      {isLoading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="h-7 w-7 animate-spin text-muted-foreground" />
        </div>
      ) : rows.length === 0 ? (
        <div className="text-center py-16 border rounded-lg">
          <CircleDollarSign className="mx-auto h-12 w-12 mb-4 opacity-20" />
          <p className="text-muted-foreground">No hay cobros pendientes</p>
        </div>
      ) : (
        <div className="rounded-lg border overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/50">
                <TableHead className="text-xs">Tipo</TableHead>
                <TableHead className="text-xs">Referencia</TableHead>
                <TableHead className="text-xs">Cliente</TableHead>
                <TableHead className="text-xs text-right">Total</TableHead>
                <TableHead className="text-xs text-right">Pagado</TableHead>
                <TableHead className="text-xs text-right">Pendiente</TableHead>
                <TableHead className="text-xs">Último pago</TableHead>
                <TableHead className="text-xs">
                  <span className="flex items-center gap-1"><Clock className="h-3 w-3" />Días</span>
                </TableHead>
                <TableHead className="w-28" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow
                  key={`${row.entity_type}-${row.id}`}
                  className="cursor-pointer hover:bg-muted/40 transition-colors"
                  onClick={() => navigateToEntity(row)}
                >
                  <TableCell>
                    {row.entity_type === 'tailoring_order' ? (
                      <Badge variant="outline" className="gap-1 text-xs">
                        <Scissors className="h-3 w-3" />Pedido
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="gap-1 text-xs">
                        <ShoppingBag className="h-3 w-3" />Venta
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell className="font-mono text-sm">{row.reference}</TableCell>
                  <TableCell className="text-sm max-w-[150px] truncate">{row.client_name}</TableCell>
                  <TableCell className="text-right tabular-nums text-sm">
                    {formatCurrency(row.total)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums text-sm text-green-600">
                    {formatCurrency(row.total_paid)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums font-semibold text-sm text-amber-600">
                    {formatCurrency(row.total_pending)}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {row.last_payment_date ? formatDate(row.last_payment_date) : '—'}
                  </TableCell>
                  <TableCell className={`text-sm tabular-nums ${getDaysColor(row.days_since_creation)}`}>
                    {row.days_since_creation}d
                  </TableCell>
                  <TableCell onClick={(e) => e.stopPropagation()}>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 text-xs"
                      onClick={(e) => openPaymentDialog(row, e)}
                    >
                      <CircleDollarSign className="h-3.5 w-3.5 mr-1" />
                      Cobrar
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Dialog: registrar pago inline */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CircleDollarSign className="h-5 w-5 text-amber-500" />
              {selectedRow?.entity_type === 'tailoring_order' ? 'Pedido' : 'Venta'}{' '}
              {selectedRow?.reference}
              <span className="text-sm font-normal text-muted-foreground ml-1">
                — {selectedRow?.client_name}
              </span>
            </DialogTitle>
          </DialogHeader>
          {selectedRow && (
            <PaymentHistory
              entityType={selectedRow.entity_type}
              entityId={selectedRow.id}
              total={selectedRow.total}
              onPaymentAdded={() => {
                load()
              }}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
