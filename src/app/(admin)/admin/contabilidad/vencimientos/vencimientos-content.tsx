'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import {
  CalendarClock, Search, Loader2, RefreshCw, AlertCircle, Clock,
  CreditCard, FileText, ArrowLeft,
} from 'lucide-react'
import { formatCurrency, formatDate, cn } from '@/lib/utils'
import { toast } from 'sonner'
import {
  listSupplierVencimientos,
  getSupplierVencimientosKpis,
  type SupplierVencimientoRow,
  type SupplierVencimientosKpis,
} from '@/actions/supplier-invoice-payments'
import {
  SupplierPaymentDialog,
  type SupplierPaymentDialogInvoice,
} from '@/components/payments/supplier-payment-dialog'

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

const STATUS_OPTIONS = [
  { value: 'all', label: 'Pendientes y parciales' },
  { value: 'vencida', label: 'Solo vencidas' },
  { value: 'pendiente', label: 'Pendientes (sin pagos)' },
  { value: 'parcial', label: 'Parciales' },
  { value: 'pagada', label: 'Pagadas' },
]

const STATUS_BADGE: Record<string, { label: string; className: string }> = {
  pendiente: { label: 'Pendiente', className: 'bg-yellow-100 text-yellow-800' },
  vencida: { label: 'Vencida', className: 'bg-red-100 text-red-800' },
  parcial: { label: 'Parcial', className: 'bg-blue-100 text-blue-800' },
  pagada: { label: 'Pagada', className: 'bg-green-100 text-green-800' },
}

export function VencimientosContent() {
  const searchParams = useSearchParams()
  const [kpis, setKpis] = useState<SupplierVencimientosKpis | null>(null)
  const [rows, setRows] = useState<SupplierVencimientoRow[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>(
    searchParams.get('vencidos') === '1' ? 'vencida' : 'all',
  )
  const [onlyOverdue, setOnlyOverdue] = useState(searchParams.get('vencidos') === '1')
  const [dialogOpen, setDialogOpen] = useState(false)
  const [selected, setSelected] = useState<SupplierPaymentDialogInvoice | null>(null)

  const loadKpis = useCallback(async () => {
    try {
      const r = await getSupplierVencimientosKpis()
      if (r.success) setKpis(r.data)
      else {
        setKpis({
          totalPendiente: 0, totalVencidas: 0, totalProximas30: 0,
          countPendientes: 0, countVencidas: 0, countProximas30: 0, countPagadasEsteMes: 0,
        })
        toast.error(r.error || 'Error al cargar KPIs')
      }
    } catch (e) {
      console.error('[Vencimientos] loadKpis:', e)
      setKpis({
        totalPendiente: 0, totalVencidas: 0, totalProximas30: 0,
        countPendientes: 0, countVencidas: 0, countProximas30: 0, countPagadasEsteMes: 0,
      })
      toast.error('Error inesperado al cargar KPIs')
    }
  }, [])

  const loadList = useCallback(async () => {
    setLoading(true)
    try {
      const r = await listSupplierVencimientos({
        search: search.trim() || undefined,
        status: statusFilter as any,
        onlyOverdue,
      })
      if (r.success) setRows(r.data)
      else toast.error(r.error || 'Error al cargar vencimientos')
    } catch (e) {
      console.error('[Vencimientos] loadList:', e)
      toast.error('Error inesperado al cargar vencimientos')
    } finally {
      setLoading(false)
    }
  }, [search, statusFilter, onlyOverdue])

  useEffect(() => { loadKpis() }, [loadKpis])

  useEffect(() => {
    const t = setTimeout(loadList, 300)
    return () => clearTimeout(t)
  }, [loadList])

  function openPaymentDialog(row: SupplierVencimientoRow) {
    setSelected({
      id: row.id,
      supplier_name: row.supplier_name,
      invoice_number: row.invoice_number,
      total_amount: row.total_amount,
      amount_paid: row.amount_paid,
      amount_pending: row.amount_pending,
      default_payment_method: row.last_payment_method ?? 'transfer',
    })
    setDialogOpen(true)
  }

  function displayStatus(row: SupplierVencimientoRow) {
    const t = new Date().toISOString().slice(0, 10)
    const isOverdue = row.due_date < t && (row.status === 'pendiente' || row.status === 'parcial')
    if (isOverdue) return STATUS_BADGE.vencida
    return STATUS_BADGE[row.status] ?? STATUS_BADGE.pendiente
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <CalendarClock className="h-6 w-6 text-amber-500" />
            Vencimientos proveedores
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Facturas de proveedor con pagos pendientes. Registra pagos parciales o totales.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" asChild>
            <Link href="/admin/contabilidad/facturas-proveedores">
              <FileText className="h-4 w-4 mr-1.5" /> Todas las facturas
            </Link>
          </Button>
          <Button variant="outline" size="sm" onClick={() => { loadList(); loadKpis() }} disabled={loading}>
            <RefreshCw className={`h-4 w-4 mr-1.5 ${loading ? 'animate-spin' : ''}`} />
            Actualizar
          </Button>
        </div>
      </div>

      {/* KPIs */}
      {kpis && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <KpiCard
            label="Total pendiente"
            value={formatCurrency(kpis.totalPendiente)}
            sub={`${kpis.countPendientes} factura${kpis.countPendientes === 1 ? '' : 's'}`}
            icon={CreditCard}
            color="text-amber-600"
          />
          <KpiCard
            label="Vencidas"
            value={formatCurrency(kpis.totalVencidas)}
            sub={`${kpis.countVencidas} factura${kpis.countVencidas === 1 ? '' : 's'}`}
            icon={AlertCircle}
            color="text-red-600"
          />
          <KpiCard
            label="Próximas 30 días"
            value={formatCurrency(kpis.totalProximas30)}
            sub={`${kpis.countProximas30} factura${kpis.countProximas30 === 1 ? '' : 's'}`}
            icon={Clock}
            color="text-amber-600"
          />
          <KpiCard
            label="Pagadas este mes"
            value={String(kpis.countPagadasEsteMes)}
            sub="facturas"
            icon={CalendarClock}
            color="text-green-600"
          />
        </div>
      )}

      {/* Filtros */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
          <Input
            className="pl-9"
            placeholder="Buscar por proveedor o nº factura…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-52">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {STATUS_OPTIONS.map((o) => (
              <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <label className="flex items-center gap-2 cursor-pointer text-sm whitespace-nowrap">
          <input
            type="checkbox"
            checked={onlyOverdue}
            onChange={(e) => setOnlyOverdue(e.target.checked)}
            className="h-4 w-4 rounded border border-primary accent-primary"
          />
          <span>Solo vencidas</span>
        </label>
      </div>

      {/* Tabla */}
      {loading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="h-7 w-7 animate-spin text-muted-foreground" />
        </div>
      ) : rows.length === 0 ? (
        <div className="text-center py-16 border rounded-lg">
          <CalendarClock className="mx-auto h-12 w-12 mb-4 opacity-20" />
          <p className="text-muted-foreground">No hay vencimientos con los filtros indicados</p>
        </div>
      ) : (
        <div className="rounded-lg border overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/50">
                <TableHead className="text-xs">Proveedor</TableHead>
                <TableHead className="text-xs">Nº factura</TableHead>
                <TableHead className="text-xs">Fecha</TableHead>
                <TableHead className="text-xs">Vencimiento</TableHead>
                <TableHead className="text-xs text-right">Total</TableHead>
                <TableHead className="text-xs text-right">Pagado</TableHead>
                <TableHead className="text-xs text-right">Pendiente</TableHead>
                <TableHead className="text-xs">Días</TableHead>
                <TableHead className="text-xs">Estado</TableHead>
                <TableHead className="w-32" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => {
                const badge = displayStatus(row)
                const overdue = row.days_overdue > 0 && row.amount_pending > 0
                return (
                  <TableRow
                    key={row.id}
                    className={cn(overdue && 'bg-red-50/80 border-l-4 border-l-red-400')}
                  >
                    <TableCell>
                      <span className="font-medium text-sm">{row.supplier_name}</span>
                      {row.supplier_cif && (
                        <span className="text-xs text-muted-foreground block">{row.supplier_cif}</span>
                      )}
                    </TableCell>
                    <TableCell className="font-mono text-xs">{row.invoice_number}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{formatDate(row.invoice_date)}</TableCell>
                    <TableCell className="text-xs">
                      <span className={overdue ? 'text-red-600 font-semibold' : 'text-muted-foreground'}>
                        {formatDate(row.due_date)}
                      </span>
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-sm font-medium">
                      {formatCurrency(row.total_amount)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-sm text-green-600">
                      {formatCurrency(row.amount_paid)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums font-semibold text-sm text-amber-600">
                      {formatCurrency(row.amount_pending)}
                    </TableCell>
                    <TableCell className="text-xs">
                      {row.days_overdue > 0 ? (
                        <Badge variant="destructive" className="text-[10px] h-5">
                          {row.days_overdue}d vencida
                        </Badge>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <span className={`inline-flex px-2 py-0.5 rounded text-xs font-medium ${badge.className}`}>
                        {badge.label}
                      </span>
                    </TableCell>
                    <TableCell className="w-32">
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-8 text-xs gap-1.5"
                        onClick={() => openPaymentDialog(row)}
                      >
                        <CreditCard className="h-3.5 w-3.5" />
                        {row.amount_pending > 0 ? 'Registrar pago' : 'Ver pagos'}
                      </Button>
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </div>
      )}

      <SupplierPaymentDialog
        open={dialogOpen}
        onOpenChange={(open) => { setDialogOpen(open); if (!open) setSelected(null) }}
        invoice={selected}
        onChanged={() => { loadList(); loadKpis() }}
      />
    </div>
  )
}
