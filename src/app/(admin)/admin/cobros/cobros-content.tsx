'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import {
  CircleDollarSign, Search, Loader2, Scissors, ShoppingBag,
  RefreshCw, AlertCircle, Clock,
} from 'lucide-react'
import { formatCurrency, formatDate, cn } from '@/lib/utils'
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
type SortOrder = 'recent_first' | 'oldest_first'

export function CobrosContent({ basePath = '/admin' }: { basePath?: string }) {
  const router = useRouter()
  const searchParams = useSearchParams()

  const [rows, setRows] = useState<PendingPaymentRow[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [filterType, setFilterType] = useState<FilterType>('all')
  const [sortOrder, setSortOrder] = useState<SortOrder>('recent_first')
  const [search, setSearch] = useState('')
  const [onlyOverdue, setOnlyOverdue] = useState(() => searchParams.get('vencidos') === '1')
  const [selectedRow, setSelectedRow] = useState<PendingPaymentRow | null>(null)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [cobroToCajaRow, setCobroToCajaRow] = useState<PendingPaymentRow | null>(null)
  const [cobroToCajaAmount, setCobroToCajaAmount] = useState('')
  const [cobroToCajaOpen, setCobroToCajaOpen] = useState(false)

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

  const today = new Date().toISOString().split('T')[0]
  const filteredRows = onlyOverdue
    ? rows.filter((r) => r.next_payment_date != null && r.next_payment_date <= today)
    : rows
  const displayedRows = sortOrder === 'oldest_first'
    ? [...filteredRows].reverse()
    : filteredRows

  const isRowOverdue = (r: PendingPaymentRow) =>
    r.next_payment_date != null && r.next_payment_date <= today

  // ─── KPIs (sobre los datos filtrados mostrados) ───────────────────────────────
  const orderRows = displayedRows.filter((r) => r.entity_type === 'tailoring_order')
  const saleRows = displayedRows.filter((r) => r.entity_type === 'sale')

  const totalPendingOrders = orderRows.reduce((s, r) => s + r.total_pending, 0)
  const totalPendingSales = saleRows.reduce((s, r) => s + r.total_pending, 0)
  const uniqueClients = new Set(displayedRows.map((r) => r.client_id).filter(Boolean)).size

  // ─── Helpers ────────────────────────────────────────────────────────────────
  function navigateToEntity(row: PendingPaymentRow) {
    if (row.entity_type === 'tailoring_order') {
      router.push(basePath === '/sastre' ? `/sastre/pedidos/${row.id}` : `/admin/pedidos/${row.id}?tab=payments`)
    } else {
      router.push(`/admin/ventas/${row.id}`)
    }
  }

  function openPaymentDialog(row: PendingPaymentRow, e: React.MouseEvent) {
    e.stopPropagation()
    setSelectedRow(row)
    setDialogOpen(true)
  }

  function openCobroToCajaDialog(row: PendingPaymentRow, e: React.MouseEvent) {
    e.stopPropagation()
    setCobroToCajaRow(row)
    setCobroToCajaAmount(String(row.total_pending))
    setCobroToCajaOpen(true)
  }

  function goToCajaWithCobro() {
    if (!cobroToCajaRow) return
    const amount = parseFloat(cobroToCajaAmount.replace(',', '.'))
    if (!Number.isFinite(amount) || amount <= 0) {
      toast.error('Indica un importe válido')
      return
    }
    if (amount > cobroToCajaRow.total_pending) {
      toast.error(`El importe no puede ser mayor al pendiente (${formatCurrency(cobroToCajaRow.total_pending)})`)
      return
    }
    const type = cobroToCajaRow.entity_type === 'tailoring_order' ? 'order' : 'sale'
    const params = new URLSearchParams({
      cobro: type,
      id: cobroToCajaRow.id,
      pending: String(amount),
      clientId: cobroToCajaRow.client_id || '',
      ref: cobroToCajaRow.reference,
      clientName: cobroToCajaRow.client_name || '',
    })
    setCobroToCajaOpen(false)
    setCobroToCajaRow(null)
    router.push(`/pos/caja?${params.toString()}`)
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
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[200px] max-w-sm">
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
          <Select value={sortOrder} onValueChange={(v) => setSortOrder(v as SortOrder)}>
            <SelectTrigger className="w-48">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="recent_first">Más reciente primero</SelectItem>
              <SelectItem value="oldest_first">Más antiguo primero</SelectItem>
            </SelectContent>
          </Select>
          <label className="flex items-center gap-2 cursor-pointer text-sm whitespace-nowrap">
            <input
              type="checkbox"
              checked={onlyOverdue}
              onChange={(e) => setOnlyOverdue(e.target.checked)}
              className="h-4 w-4 rounded border border-primary accent-primary"
            />
            <span>Solo con próximo cobro vencido</span>
          </label>
        </div>
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
      ) : displayedRows.length === 0 ? (
        <div className="text-center py-16 border rounded-lg bg-muted/30">
          <AlertCircle className="mx-auto h-12 w-12 mb-4 text-amber-500" />
          <p className="text-muted-foreground">Ningún cobro coincide con los filtros</p>
          <p className="text-sm text-muted-foreground mt-1">Prueba a quitar &quot;Solo con próximo cobro vencido&quot;</p>
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
                  <span className="flex items-center gap-1"><Clock className="h-3 w-3" />Próx. cobro</span>
                </TableHead>
                <TableHead className="text-xs">
                  <span className="flex items-center gap-1"><Clock className="h-3 w-3" />Días</span>
                </TableHead>
                <TableHead className="w-28" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {displayedRows.map((row) => {
                const overdue = isRowOverdue(row)
                return (
                <TableRow
                  key={`${row.entity_type}-${row.id}`}
                  className={cn(
                    'cursor-pointer hover:bg-muted/40 transition-colors',
                    overdue && 'bg-red-50/80 border-l-4 border-l-red-400'
                  )}
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
                  <TableCell className="text-xs">
                    {row.next_payment_date ? (
                      <span className={overdue ? 'text-red-600 font-semibold' : 'text-muted-foreground'}>
                        {formatDate(row.next_payment_date)}
                        {overdue && (
                          <Badge variant="destructive" className="ml-1.5 text-[10px] h-5">Vencido</Badge>
                        )}
                      </span>
                    ) : (
                      '—'
                    )}
                  </TableCell>
                  <TableCell className={`text-sm tabular-nums ${getDaysColor(row.days_since_creation)}`}>
                    {row.days_since_creation}d
                  </TableCell>
                  <TableCell className="w-32 shrink-0" onClick={(e) => e.stopPropagation()}>
                    {basePath === '/sastre' ? (
                      <Button
                        variant="default"
                        size="sm"
                        className="h-8 text-xs gap-1.5 bg-amber-600 hover:bg-amber-700"
                        onClick={(e) => openCobroToCajaDialog(row, e)}
                      >
                        <CircleDollarSign className="h-3.5 w-3.5" />
                        Cobrar
                      </Button>
                    ) : (
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-8 text-xs gap-1.5"
                        onClick={(e) => openPaymentDialog(row, e)}
                      >
                        <CircleDollarSign className="h-3.5 w-3.5" />
                        Cobrar
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              )
              })}
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

      {/* Dialog sastre: indicar importe a cobrar antes de ir a caja */}
      <Dialog open={cobroToCajaOpen} onOpenChange={(open) => { setCobroToCajaOpen(open); if (!open) setCobroToCajaRow(null) }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CircleDollarSign className="h-5 w-5 text-amber-500" />
              Cobrar en caja
            </DialogTitle>
          </DialogHeader>
          {cobroToCajaRow && (
            <div className="space-y-4 py-2">
              <p className="text-sm text-muted-foreground">
                {cobroToCajaRow.entity_type === 'tailoring_order' ? 'Pedido' : 'Venta'}{' '}
                <span className="font-mono font-medium text-foreground">{cobroToCajaRow.reference}</span>
                {' — '}{cobroToCajaRow.client_name}
              </p>
              <p className="text-sm">
                Pendiente de cobro: <span className="font-semibold text-amber-600">{formatCurrency(cobroToCajaRow.total_pending)}</span>
              </p>
              <div className="space-y-2">
                <label className="text-sm font-medium">Importe a cobrar ahora (€)</label>
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  max={cobroToCajaRow.total_pending}
                  value={cobroToCajaAmount}
                  onChange={(e) => setCobroToCajaAmount(e.target.value)}
                  placeholder="0,00"
                  className="text-lg font-mono"
                />
                <p className="text-xs text-muted-foreground">
                  Puedes cobrar todo o solo una parte. Máximo {formatCurrency(cobroToCajaRow.total_pending)}.
                </p>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setCobroToCajaOpen(false)}>Cancelar</Button>
            <Button className="bg-amber-600 hover:bg-amber-700" onClick={goToCajaWithCobro}>
              Ir a caja TPV
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
