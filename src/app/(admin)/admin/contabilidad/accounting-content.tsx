'use client'

import { useState, useEffect, useCallback, useMemo, Fragment } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { DatePickerPopover } from '@/components/ui/date-picker-popover'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Switch } from '@/components/ui/switch'
import {
  TrendingUp, TrendingDown, Euro, Calculator, BookOpen, FileText,
  Loader2, Plus, Search, ChevronDown, ChevronRight, Eye,
  Send, CheckCircle, FileOutput, Trash2, RefreshCw, ArrowUpCircle, Download,
  Receipt, ExternalLink, Package, ClipboardList, Pencil, Calendar, XCircle, Store,
} from 'lucide-react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts'
import { formatCurrency, formatDate } from '@/lib/utils'
import { toast } from 'sonner'
import {
  getAccountingSummary, getInvoices, getEstimates,
  getJournalEntries, getVatQuarterly, getClientsForInvoice,
  getManualTransactions, createManualTransaction, deleteManualTransaction, updateManualTransaction,
  getAccountingMovements,
  getProductsForInvoice, listTailoringOrdersForInvoice, getTailoringOrderLinesForInvoice,
  createInvoiceAction, updateInvoiceAction, issueInvoiceAction,
  createEstimateAction, updateEstimateAction, sendEstimateAction, acceptEstimateAction, rejectEstimateAction, convertEstimateToInvoiceAction,
  getInvoiceLinesAction, updateJournalEntryDescriptionAction,
  generateInvoicePdfAction, generateEstimatePdfAction,
  type InvoiceRow, type EstimateRow, type JournalEntryRow, type VatQuarterRow,
  type ManualTransaction, type AccountingMovementRow, type AccountingSummary,
} from '@/actions/accounting'

// ─── Helpers ───────────────────────────────────────────────────────────────

type DateRangePreset = 'all' | 'this_month' | 'last_7' | 'last_30' | 'this_quarter' | 'this_year' | 'custom'

function getDateRangeForPreset(preset: DateRangePreset): { from: string; to: string } {
  const today = new Date()
  const y = today.getFullYear()
  const m = today.getMonth()
  const pad = (n: number) => String(n).padStart(2, '0')
  if (preset === 'all') return { from: '', to: '' }
  if (preset === 'last_7') {
    const d = new Date(today); d.setDate(d.getDate() - 6)
    return { from: d.toISOString().slice(0, 10), to: today.toISOString().slice(0, 10) }
  }
  if (preset === 'last_30') {
    const d = new Date(today); d.setDate(d.getDate() - 29)
    return { from: d.toISOString().slice(0, 10), to: today.toISOString().slice(0, 10) }
  }
  if (preset === 'this_month') {
    const first = new Date(y, m, 1)
    const last = new Date(y, m + 1, 0)
    return { from: first.toISOString().slice(0, 10), to: last.toISOString().slice(0, 10) }
  }
  if (preset === 'this_quarter') {
    const q = Math.floor(m / 3) + 1
    const first = new Date(y, (q - 1) * 3, 1)
    const last = new Date(y, q * 3, 0)
    return { from: first.toISOString().slice(0, 10), to: last.toISOString().slice(0, 10) }
  }
  if (preset === 'this_year') {
    return { from: `${y}-01-01`, to: `${y}-12-31` }
  }
  return { from: '', to: '' }
}

function getPresetLabel(preset: DateRangePreset, from: string, to: string): string {
  if (preset === 'all') return 'Todos los periodos'
  if (preset === 'custom' && from && to) return `${formatDate(from)} – ${formatDate(to)}`
  if (preset === 'custom') return 'Elegir fechas'
  const { from: f, to: t } = getDateRangeForPreset(preset)
  if (!f || !t) return 'Todos los periodos'
  return `${formatDate(f)} – ${formatDate(t)}`
}

function addDays(isoDate: string, days: number): string {
  const d = new Date(isoDate); d.setDate(d.getDate() + days)
  return d.toISOString().slice(0, 10)
}

// ─── Helpers (continued) ───────────────────────────────────────────────────

const INVOICE_STATUS: Record<string, { label: string; className: string }> = {
  draft:            { label: 'Borrador',  className: 'bg-gray-100 text-gray-700' },
  issued:           { label: 'Enviada',   className: 'bg-blue-100 text-blue-700' },
  paid:             { label: 'Pagada',    className: 'bg-green-100 text-green-700' },
  partially_paid:   { label: 'Parcial',   className: 'bg-yellow-100 text-yellow-700' },
  overdue:          { label: 'Vencida',   className: 'bg-red-100 text-red-700' },
  cancelled:        { label: 'Cancelada', className: 'bg-gray-200 text-gray-500' },
  rectified:        { label: 'Rectif.',   className: 'bg-purple-100 text-purple-700' },
}

const ESTIMATE_STATUS: Record<string, { label: string; className: string }> = {
  draft:     { label: 'Borrador',   className: 'bg-gray-100 text-gray-700' },
  sent:      { label: 'Enviado',    className: 'bg-blue-100 text-blue-700' },
  accepted:  { label: 'Aceptado',   className: 'bg-green-100 text-green-700' },
  rejected:  { label: 'Rechazado',  className: 'bg-red-100 text-red-700' },
  expired:   { label: 'Expirado',   className: 'bg-orange-100 text-orange-700' },
  invoiced:  { label: 'Facturado',  className: 'bg-purple-100 text-purple-700' },
}

const ENTRY_TYPES: Record<string, string> = {
  manual: 'Manual', sale: 'Venta', purchase: 'Compra',
  payment_received: 'Cobro', payment_sent: 'Pago',
  cash_close: 'Cierre caja', adjustment: 'Ajuste',
}

const MONTHS = [
  'Enero','Febrero','Marzo','Abril','Mayo','Junio',
  'Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre',
]

// ─── Main Component ─────────────────────────────────────────────────────────

export function AccountingContent() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Contabilidad</h1>
        <p className="text-muted-foreground">Facturas · Presupuestos · Movimientos · Asientos · IVA</p>
      </div>
      <Tabs defaultValue="resumen">
        <TabsList className="flex-wrap h-auto">
          <TabsTrigger value="resumen"       className="gap-1.5"><TrendingUp    className="h-4 w-4" /> Resumen</TabsTrigger>
          <TabsTrigger value="facturas"      className="gap-1.5"><FileText      className="h-4 w-4" /> Facturas</TabsTrigger>
          <TabsTrigger value="presupuestos"  className="gap-1.5"><FileOutput    className="h-4 w-4" /> Presupuestos</TabsTrigger>
          <TabsTrigger value="movimientos"   className="gap-1.5"><ArrowUpCircle className="h-4 w-4" /> Movimientos</TabsTrigger>
          <TabsTrigger value="asientos"      className="gap-1.5"><BookOpen      className="h-4 w-4" /> Asientos</TabsTrigger>
          <TabsTrigger value="iva"           className="gap-1.5"><Calculator    className="h-4 w-4" /> IVA Trimestral</TabsTrigger>
          <TabsTrigger value="caja"         className="gap-1.5"><Store          className="h-4 w-4" /> Resúmenes de Caja</TabsTrigger>
        </TabsList>
        <div className="mt-6">
          <TabsContent value="resumen">      <SummaryTab /></TabsContent>
          <TabsContent value="facturas">     <InvoicesTab /></TabsContent>
          <TabsContent value="presupuestos"> <EstimatesTab /></TabsContent>
          <TabsContent value="movimientos">  <MovimientosTab /></TabsContent>
          <TabsContent value="asientos">     <JournalTab /></TabsContent>
          <TabsContent value="iva">          <VatTab /></TabsContent>
          <TabsContent value="caja">         <CajaSessionsTab /></TabsContent>
        </div>
      </Tabs>
    </div>
  )
}

// ─── Tab: Resumen ────────────────────────────────────────────────────────────

function SummaryTab() {
  const [year, setYear] = useState(new Date().getFullYear())
  const [data, setData] = useState<AccountingSummary | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    getAccountingSummary({ year })
      .then(r => {
        setData(r.success && 'data' in r ? r.data : null)
        setLoading(false)
      })
      .catch(err => {
        console.error('[accounting] getAccountingSummary:', err)
        toast.error('Error al cargar resumen contable')
        setLoading(false)
      })
  }, [year])

  const years = Array.from({ length: 5 }, (_, i) => new Date().getFullYear() - i)

  if (loading) return <Spinner />

  const monthlyData = (data?.monthlyData ?? []).map((m: { month: string; income: number; expenses: number }) => ({
    ...m,
    mes: MONTHS[parseInt(m.month.slice(5, 7), 10) - 1]?.slice(0, 3) ?? m.month,
  }))

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Select value={String(year)} onValueChange={v => setYear(Number(v))}>
          <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
          <SelectContent>{years.map(y => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}</SelectContent>
        </Select>
        <Button variant="outline" size="sm" onClick={() => {
          setLoading(true)
          getAccountingSummary({ year })
            .then(r => { setData(r.success && 'data' in r ? r.data : null); setLoading(false) })
            .catch(err => { console.error('[accounting] getAccountingSummary:', err); toast.error('Error al cargar resumen'); setLoading(false) })
        }}><RefreshCw className="h-3.5 w-3.5 mr-1" /> Actualizar</Button>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard label="Ingresos (base)" value={data?.income ?? 0} positive />
        <KpiCard label="Gastos (base)"   value={data?.expenses ?? 0} positive={false} />
        <KpiCard label="Resultado neto"  value={data?.profit ?? 0}   positive={(data?.profit ?? 0) >= 0} />
        <KpiCard label="IVA a ingresar"  value={data?.vatToPay ?? 0} neutral />
      </div>

      {/* Bar chart */}
      <Card>
        <CardHeader><CardTitle className="text-base">Ingresos vs Gastos mensuales {year}</CardTitle></CardHeader>
        <CardContent>
          {monthlyData.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">Sin datos</p>
          ) : (
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={monthlyData} margin={{ top: 4, right: 16, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="mes" tick={{ fontSize: 11 }} />
                <YAxis tickFormatter={v => `${(v / 1000).toFixed(0)}k`} tick={{ fontSize: 11 }} />
                <Tooltip formatter={(v: number | undefined) => formatCurrency(v ?? 0)} />
                <Legend />
                <Bar dataKey="income"   name="Ingresos" fill="#1e3a5f" radius={[4, 4, 0, 0]} />
                <Bar dataKey="expenses" name="Gastos"   fill="#ef4444" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      {/* Latest invoices */}
      <Card>
        <CardHeader><CardTitle className="text-base">Últimas facturas emitidas</CardTitle></CardHeader>
        <CardContent className="p-0">
          {(data?.latestInvoices ?? []).length === 0 ? (
            <p className="text-center text-muted-foreground py-8">Sin facturas</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Número</TableHead>
                  <TableHead>Cliente</TableHead>
                  <TableHead>Fecha</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead>Estado</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(data?.latestInvoices ?? []).map((inv: { id: string; invoice_number: string; client_name: string; invoice_date: string; total: number; status: string }) => (
                  <TableRow key={inv.id}>
                    <TableCell className="font-mono font-medium">{inv.invoice_number}</TableCell>
                    <TableCell>{inv.client_name}</TableCell>
                    <TableCell className="text-muted-foreground">{formatDate(inv.invoice_date)}</TableCell>
                    <TableCell className="text-right font-semibold">{formatCurrency(inv.total)}</TableCell>
                    <TableCell><StatusBadge status={inv.status} map={INVOICE_STATUS} /></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

// ─── Tab: Facturas ───────────────────────────────────────────────────────────

type InvoiceLine = { description: string; quantity: number; unit_price: number; tax_rate: number }

function InvoicesTab() {
  const [rows, setRows] = useState<InvoiceRow[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('all')
  const [dateRangePreset, setDateRangePreset] = useState<DateRangePreset>('this_month')
  const [customDateFrom, setCustomDateFrom] = useState('')
  const [customDateTo, setCustomDateTo] = useState('')
  const dateFrom = dateRangePreset === 'custom' ? customDateFrom : getDateRangeForPreset(dateRangePreset).from
  const dateTo   = dateRangePreset === 'custom' ? customDateTo   : getDateRangeForPreset(dateRangePreset).to
  const [dialogOpen, setDialogOpen] = useState(false)
  const [clients, setClients] = useState<{ id: string; full_name: string }[]>([])
  const [saving, setSaving] = useState(false)

  const [productDialogOpen, setProductDialogOpen] = useState(false)
  const [productSearch, setProductSearch] = useState('')
  const [productResults, setProductResults] = useState<{ id: string; name: string; sku: string; base_price: number }[]>([])
  const [loadingProducts, setLoadingProducts] = useState(false)
  const [orderDialogOpen, setOrderDialogOpen] = useState(false)
  const [ordersList, setOrdersList] = useState<{ id: string; order_number: string; total: number; client_name: string }[]>([])
  const [loadingOrders, setLoadingOrders] = useState(false)
  const [loadingOrderLines, setLoadingOrderLines] = useState(false)

  // Form state
  const [form, setForm] = useState({
    client_id: '', client_name: '', client_nif: '',
    invoice_date: new Date().toISOString().split('T')[0],
    due_date: '', notes: '', irpf_rate: 0, tax_rate: 21,
  })
  const [lines, setLines] = useState<InvoiceLine[]>([
    { description: '', quantity: 1, unit_price: 0, tax_rate: 21 },
  ])

  const load = useCallback(async () => {
    setLoading(true)
    const r = await getInvoices({ search, status, dateFrom: dateFrom || undefined, dateTo: dateTo || undefined })
    if (r.success) setRows(r.data)
    setLoading(false)
  }, [search, status, dateFrom, dateTo])

  useEffect(() => { load() }, [load])

  const openDialog = async () => {
    const r = await getClientsForInvoice()
    if (r.success) setClients(r.data)
    setDialogOpen(true)
  }

  const addLine = () => setLines(l => [...l, { description: '', quantity: 1, unit_price: 0, tax_rate: 21 }])
  const removeLine = (i: number) => setLines(l => l.filter((_, idx) => idx !== i))
  const updateLine = (i: number, field: keyof InvoiceLine, value: string | number) =>
    setLines(l => l.map((ln, idx) => idx === i ? { ...ln, [field]: value } : ln))

  const openProductDialog = async () => {
    setProductDialogOpen(true)
    setLoadingProducts(true)
    const r = await getProductsForInvoice({ search: productSearch.trim() || undefined })
    if (r.success) setProductResults(r.data)
    setLoadingProducts(false)
  }
  const searchProducts = async () => {
    setLoadingProducts(true)
    const r = await getProductsForInvoice({ search: productSearch.trim() || undefined })
    if (r.success) setProductResults(r.data)
    setLoadingProducts(false)
  }
  const addProductAsLine = (p: { name: string; sku: string; base_price: number }) => {
    setLines(l => [...l, { description: p.name || p.sku || 'Producto', quantity: 1, unit_price: p.base_price, tax_rate: 21 }])
    setProductDialogOpen(false)
    setProductSearch('')
  }
  const openOrderDialog = async () => {
    setOrderDialogOpen(true)
    setLoadingOrders(true)
    const r = await listTailoringOrdersForInvoice({ clientId: form.client_id || undefined })
    if (r.success) setOrdersList(r.data)
    setLoadingOrders(false)
  }
  const addOrderLines = async (orderId: string) => {
    setLoadingOrderLines(true)
    const r = await getTailoringOrderLinesForInvoice(orderId)
    setLoadingOrderLines(false)
    if (!r.success || !r.data.length) {
      toast.error(!r.success && 'error' in r ? r.error : 'El pedido no tiene líneas')
      return
    }
    const newLines: InvoiceLine[] = r.data.map(l => ({
      description: l.description,
      quantity: l.quantity,
      unit_price: l.unit_price,
      tax_rate: l.tax_rate,
    }))
    setLines(prev => [...prev, ...newLines])
    toast.success(`${newLines.length} línea(s) añadida(s) desde el pedido`)
    setOrderDialogOpen(false)
  }

  const subtotal = lines.reduce((s, l) => s + l.quantity * l.unit_price, 0)
  const taxAmount = lines.reduce((s, l) => s + l.quantity * l.unit_price * (l.tax_rate / 100), 0)
  const irpfAmount = subtotal * (form.irpf_rate / 100)
  const total = subtotal + taxAmount - irpfAmount

  const handleSave = async () => {
    if (!form.client_name) { toast.error('Indica el cliente'); return }
    if (lines.some(l => !l.description)) { toast.error('Todas las líneas necesitan descripción'); return }
    setSaving(true)
    try {
      const result = await createInvoiceAction({
        client_id: form.client_id || null,
        client_name: form.client_name,
        client_nif: form.client_nif || null,
        invoice_date: form.invoice_date,
        due_date: form.due_date || null,
        subtotal,
        tax_rate: form.tax_rate,
        tax_amount: taxAmount,
        irpf_rate: form.irpf_rate,
        irpf_amount: irpfAmount,
        total,
        notes: form.notes || null,
        lines: lines.map(l => ({
          description: l.description,
          quantity: l.quantity,
          unit_price: l.unit_price,
          tax_rate: l.tax_rate,
          line_total: l.quantity * l.unit_price * (1 + l.tax_rate / 100),
        })),
      })

      if (!result.success) {
        toast.error(result.error ?? 'Error al crear la factura')
        return
      }

      // El asiento se genera al emitir la factura, NO al crearla como borrador
      toast.success(`Factura ${result.data.invoice_number} creada como borrador`)
      setDialogOpen(false)
      setLines([{ description: '', quantity: 1, unit_price: 0, tax_rate: 21 }])
      setForm({ client_id: '', client_name: '', client_nif: '', invoice_date: new Date().toISOString().split('T')[0], due_date: '', notes: '', irpf_rate: 0, tax_rate: 21 })
      load()
    } catch (error) {
      console.error('Error creating invoice:', error)
      toast.error(error instanceof Error ? error.message : 'Error desconocido al crear la factura')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-wrap gap-2">
        <div className="relative flex-1 min-w-[180px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Buscar factura o cliente…" className="pl-9" value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="w-36"><SelectValue placeholder="Estado" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos</SelectItem>
            <SelectItem value="draft">Borrador</SelectItem>
            <SelectItem value="issued">Enviada</SelectItem>
            <SelectItem value="paid">Pagada</SelectItem>
            <SelectItem value="overdue">Vencida</SelectItem>
            <SelectItem value="cancelled">Cancelada</SelectItem>
          </SelectContent>
        </Select>
        <Select
          value={dateRangePreset}
          onValueChange={(v) => {
            const p = v as DateRangePreset
            setDateRangePreset(p)
            if (p === 'custom') {
              const r = getDateRangeForPreset('this_month')
              setCustomDateFrom(r.from)
              setCustomDateTo(r.to)
            }
          }}
        >
          <SelectTrigger className="w-[220px] min-w-0">
            <Calendar className="h-4 w-4 mr-2 text-muted-foreground shrink-0" />
            <SelectValue placeholder="Rango de fechas" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos los periodos</SelectItem>
            <SelectItem value="this_month">Este mes</SelectItem>
            <SelectItem value="last_7">Últimos 7 días</SelectItem>
            <SelectItem value="last_30">Últimos 30 días</SelectItem>
            <SelectItem value="this_quarter">Este trimestre</SelectItem>
            <SelectItem value="this_year">Este año</SelectItem>
            <SelectItem value="custom">Elegir fechas (personalizado)</SelectItem>
          </SelectContent>
        </Select>
        {dateRangePreset === 'custom' && (
          <div className="flex items-center gap-1.5 flex-wrap">
            <div className="flex items-center gap-1">
              <Label className="text-xs text-muted-foreground whitespace-nowrap">Desde</Label>
              <DatePickerPopover containerClassName="w-36" value={customDateFrom} onChange={date => setCustomDateFrom(date)} />
            </div>
            <div className="flex items-center gap-1">
              <Label className="text-xs text-muted-foreground whitespace-nowrap">Hasta</Label>
              <DatePickerPopover containerClassName="w-36" value={customDateTo} onChange={date => setCustomDateTo(date)} />
            </div>
          </div>
        )}
        {dateRangePreset !== 'custom' && (
          <span className="text-sm text-muted-foreground hidden sm:inline">
            {getPresetLabel(dateRangePreset, dateFrom, dateTo)}
          </span>
        )}
        <Button onClick={openDialog}><Plus className="h-4 w-4 mr-1" /> Nueva factura</Button>
      </div>

      {loading ? <Spinner /> : (
        <div className="rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Número</TableHead>
                <TableHead>Cliente</TableHead>
                <TableHead>Fecha</TableHead>
                <TableHead className="text-right">Total</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead className="w-24">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.length === 0 ? (
                <TableRow><TableCell colSpan={6} className="text-center py-12 text-muted-foreground">Sin facturas</TableCell></TableRow>
              ) : rows.map(inv => (
                <InvoiceTableRow key={inv.id} inv={inv} onRefresh={load} />
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {/* New Invoice Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-3xl max-h-[90vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>Nueva factura</DialogTitle>
          </DialogHeader>
          <ScrollArea className="flex-1 pr-1">
            <div className="space-y-4 p-1">
              {/* Client */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label>Cliente</Label>
                  <Select value={form.client_id} onValueChange={id => {
                    const c = clients.find(x => x.id === id)
                    setForm(f => ({ ...f, client_id: id, client_name: c?.full_name ?? '' }))
                  }}>
                    <SelectTrigger><SelectValue placeholder="Seleccionar cliente" /></SelectTrigger>
                    <SelectContent>
                      {clients.map(c => <SelectItem key={c.id} value={c.id}>{c.full_name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label>Nombre factura</Label>
                  <Input value={form.client_name} onChange={e => setForm(f => ({ ...f, client_name: e.target.value }))} placeholder="Nombre en la factura" />
                </div>
                <div className="space-y-1">
                  <Label>NIF / CIF</Label>
                  <Input value={form.client_nif} onChange={e => setForm(f => ({ ...f, client_nif: e.target.value }))} />
                </div>
                <div className="space-y-1">
                  <Label>Fecha factura</Label>
                  <DatePickerPopover value={form.invoice_date} onChange={date => setForm(f => ({ ...f, invoice_date: date }))} />
                </div>
                <div className="space-y-1">
                  <Label>Fecha vencimiento</Label>
                  <div className="flex flex-wrap gap-2 items-center">
                    <DatePickerPopover containerClassName="w-full sm:w-40" value={form.due_date} onChange={date => setForm(f => ({ ...f, due_date: date }))} />
                    <span className="text-xs text-muted-foreground">Rápido:</span>
                    <Button type="button" size="sm" variant="outline" className="h-8 text-xs" onClick={() => setForm(f => ({ ...f, due_date: new Date().toISOString().slice(0, 10) }))}>Hoy</Button>
                    <Button type="button" size="sm" variant="outline" className="h-8 text-xs" onClick={() => setForm(f => ({ ...f, due_date: addDays(f.invoice_date, 15) }))}>+15 días</Button>
                    <Button type="button" size="sm" variant="outline" className="h-8 text-xs" onClick={() => setForm(f => ({ ...f, due_date: addDays(f.invoice_date, 30) }))}>+30 días</Button>
                  </div>
                </div>
              </div>

              <div>
                <div className="mb-2">
                  <Label className="text-sm font-semibold">Líneas</Label>
                  <p className="text-xs text-muted-foreground mt-0.5 mb-2">Añade líneas manualmente, escoge un producto del catálogo o carga las líneas de un pedido de sastrería.</p>
                  <div className="flex flex-wrap gap-2">
                    <Button size="sm" variant="outline" onClick={addLine}><Plus className="h-3.5 w-3.5 mr-1" /> Añadir línea (texto libre)</Button>
                    <Button size="sm" variant="default" onClick={openProductDialog}><Package className="h-3.5 w-3.5 mr-1" /> Escoger producto</Button>
                    <Button size="sm" variant="outline" onClick={openOrderDialog}><ClipboardList className="h-3.5 w-3.5 mr-1" /> Escoger pedido</Button>
                  </div>
                </div>
                <div className="space-y-2">
                  <div className="grid grid-cols-12 gap-1 text-xs font-medium text-muted-foreground px-1">
                    <span className="col-span-5">Descripción</span>
                    <span className="col-span-2 text-center">Cantidad</span>
                    <span className="col-span-2 text-center">Precio</span>
                    <span className="col-span-2 text-center">IVA %</span>
                    <span className="col-span-1"></span>
                  </div>
                  {lines.map((ln, i) => (
                    <div key={i} className="grid grid-cols-12 gap-1 items-center">
                      <Input className="col-span-5 h-8 text-sm" placeholder="Descripción" value={ln.description} onChange={e => updateLine(i, 'description', e.target.value)} />
                      <Input className="col-span-2 h-8 text-sm text-center" type="number" min={0.01} step={0.01} value={ln.quantity} onChange={e => updateLine(i, 'quantity', Number(e.target.value))} />
                      <Input className="col-span-2 h-8 text-sm text-center" type="number" min={0} step={0.01} value={ln.unit_price} onChange={e => updateLine(i, 'unit_price', Number(e.target.value))} />
                      <Input className="col-span-2 h-8 text-sm text-center" type="number" min={0} max={21} value={ln.tax_rate} onChange={e => updateLine(i, 'tax_rate', Number(e.target.value))} />
                      <Button className="col-span-1 h-8" variant="ghost" size="icon" onClick={() => removeLine(i)} disabled={lines.length === 1}>
                        <Trash2 className="h-3.5 w-3.5 text-red-500" />
                      </Button>
                    </div>
                  ))}
                </div>
              </div>

              {/* Totals */}
              <div className="flex justify-end">
                <div className="w-60 space-y-1 text-sm">
                  <div className="flex justify-between"><span className="text-muted-foreground">Subtotal</span><span>{formatCurrency(subtotal)}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">IVA</span><span>{formatCurrency(taxAmount)}</span></div>
                  <div className="flex justify-between font-bold text-base border-t pt-1"><span>Total</span><span>{formatCurrency(total)}</span></div>
                </div>
              </div>

              <div className="space-y-1">
                <Label>Notas</Label>
                <Textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} rows={2} />
              </div>
            </div>
          </ScrollArea>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null} Crear factura
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Diálogo selección producto (Nueva factura) */}
      <Dialog open={productDialogOpen} onOpenChange={setProductDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Añadir desde producto</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="flex gap-2">
              <Input placeholder="Buscar por nombre o SKU..." value={productSearch} onChange={e => setProductSearch(e.target.value)} onKeyDown={e => e.key === 'Enter' && searchProducts()} />
              <Button variant="secondary" onClick={searchProducts} disabled={loadingProducts}>{loadingProducts ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}</Button>
            </div>
            <ScrollArea className="h-64 rounded border p-2">
              {loadingProducts ? (
                <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
              ) : productResults.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">Sin resultados. Escribe para buscar.</p>
              ) : (
                <div className="space-y-1">
                  {productResults.map(p => (
                    <button key={p.id} type="button" className="w-full text-left rounded p-2 hover:bg-muted flex justify-between items-center" onClick={() => addProductAsLine(p)}>
                      <span className="font-medium truncate">{p.name || p.sku}</span>
                      <span className="text-sm text-muted-foreground shrink-0 ml-2">{formatCurrency(p.base_price)}</span>
                    </button>
                  ))}
                </div>
              )}
            </ScrollArea>
          </div>
        </DialogContent>
      </Dialog>

      {/* Diálogo selección pedido (Nueva factura) */}
      <Dialog open={orderDialogOpen} onOpenChange={setOrderDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Añadir líneas desde pedido</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">Se listan los pedidos de sastrería{form.client_id ? ' del cliente seleccionado' : ''}. Al elegir uno se añaden sus líneas a la factura.</p>
          <ScrollArea className="h-72 rounded border p-2">
            {loadingOrders ? (
              <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
            ) : ordersList.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">No hay pedidos.</p>
            ) : (
              <div className="space-y-1">
                {ordersList.map(o => (
                  <button key={o.id} type="button" className="w-full text-left rounded p-3 hover:bg-muted border flex justify-between items-center gap-2" onClick={() => addOrderLines(o.id)} disabled={loadingOrderLines}>
                    <span className="font-mono font-medium">{o.order_number}</span>
                    <span className="text-sm text-muted-foreground truncate">{o.client_name}</span>
                    <span className="font-semibold shrink-0">{formatCurrency(o.total)}</span>
                    {loadingOrderLines ? <Loader2 className="h-4 w-4 animate-spin shrink-0" /> : null}
                  </button>
                ))}
              </div>
            )}
          </ScrollArea>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function InvoiceTableRow({ inv, onRefresh }: { inv: InvoiceRow; onRefresh: () => void }) {
  const supabase = useMemo(() => createClient(), [])
  const [loadingPdf, setLoadingPdf] = useState(false)
  const [editOpen, setEditOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const s = INVOICE_STATUS[inv.status] ?? INVOICE_STATUS.draft

  // ── Estado del formulario de edición ──
  const [form, setForm] = useState({ client_id: inv.client_id ?? '', client_name: inv.client_name, client_nif: '', invoice_date: inv.invoice_date, due_date: '', notes: '', irpf_rate: 0, tax_rate: 21 })
  const [lines, setLines] = useState<InvoiceLine[]>([])

  const [productDialogOpen, setProductDialogOpen] = useState(false)
  const [productSearch, setProductSearch] = useState('')
  const [productResults, setProductResults] = useState<{ id: string; name: string; sku: string; base_price: number }[]>([])
  const [loadingProducts, setLoadingProducts] = useState(false)
  const [orderDialogOpen, setOrderDialogOpen] = useState(false)
  const [ordersList, setOrdersList] = useState<{ id: string; order_number: string; total: number; client_name: string }[]>([])
  const [loadingOrders, setLoadingOrders] = useState(false)
  const [loadingOrderLines, setLoadingOrderLines] = useState(false)

  const openEdit = async () => {
    const r = await getInvoiceLinesAction(inv.id)
    if (r.success) {
      setLines(r.data.lines.map(l => ({ description: l.description, quantity: l.quantity, unit_price: l.unit_price, tax_rate: l.tax_rate })))
    }
    setEditOpen(true)
  }

  const addLine = () => setLines(l => [...l, { description: '', quantity: 1, unit_price: 0, tax_rate: 21 }])
  const removeLine = (i: number) => setLines(l => l.filter((_, idx) => idx !== i))
  const updateLine = (i: number, field: keyof InvoiceLine, value: string | number) =>
    setLines(l => l.map((ln, idx) => idx === i ? { ...ln, [field]: value } : ln))

  const openProductDialogEdit = async () => {
    setProductDialogOpen(true)
    setLoadingProducts(true)
    const r = await getProductsForInvoice({ search: productSearch.trim() || undefined })
    if (r.success) setProductResults(r.data)
    setLoadingProducts(false)
  }
  const searchProductsEdit = async () => {
    setLoadingProducts(true)
    const r = await getProductsForInvoice({ search: productSearch.trim() || undefined })
    if (r.success) setProductResults(r.data)
    setLoadingProducts(false)
  }
  const addProductAsLineEdit = (p: { name: string; sku: string; base_price: number }) => {
    setLines(l => [...l, { description: p.name || p.sku || 'Producto', quantity: 1, unit_price: p.base_price, tax_rate: 21 }])
    setProductDialogOpen(false)
    setProductSearch('')
  }
  const openOrderDialogEdit = async () => {
    setOrderDialogOpen(true)
    setLoadingOrders(true)
    const r = await listTailoringOrdersForInvoice({ clientId: form.client_id || undefined })
    if (r.success) setOrdersList(r.data)
    setLoadingOrders(false)
  }
  const addOrderLinesEdit = async (orderId: string) => {
    setLoadingOrderLines(true)
    const r = await getTailoringOrderLinesForInvoice(orderId)
    setLoadingOrderLines(false)
    if (!r.success || !r.data.length) { toast.error(!r.success && 'error' in r ? r.error : 'El pedido no tiene líneas'); return }
    const newLines: InvoiceLine[] = r.data.map(l => ({ description: l.description, quantity: l.quantity, unit_price: l.unit_price, tax_rate: l.tax_rate }))
    setLines(prev => [...prev, ...newLines])
    toast.success(`${newLines.length} línea(s) añadida(s) desde el pedido`)
    setOrderDialogOpen(false)
  }

  const subtotal  = lines.reduce((s, l) => s + l.quantity * l.unit_price, 0)
  const taxAmount = lines.reduce((s, l) => s + l.quantity * l.unit_price * (l.tax_rate / 100), 0)
  const irpfAmount = subtotal * (form.irpf_rate / 100)
  const total = subtotal + taxAmount - irpfAmount

  const handleUpdate = async () => {
    if (!form.client_name) { toast.error('Indica el cliente'); return }
    setSaving(true)
    const r = await updateInvoiceAction({
      id: inv.id, client_id: form.client_id || null, client_name: form.client_name,
      client_nif: form.client_nif || null, invoice_date: form.invoice_date, due_date: form.due_date || null,
      subtotal, tax_rate: form.tax_rate, tax_amount: taxAmount, irpf_rate: form.irpf_rate,
      irpf_amount: irpfAmount, total, notes: form.notes || null,
      lines: lines.map(l => ({ description: l.description, quantity: l.quantity, unit_price: l.unit_price, tax_rate: l.tax_rate, line_total: l.quantity * l.unit_price * (1 + l.tax_rate / 100) })),
    })
    setSaving(false)
    if (!r.success) { toast.error(!r.success && 'error' in r ? r.error : 'Error'); return }
    toast.success('Factura actualizada')
    setEditOpen(false)
    onRefresh()
  }

  const handleIssue = async () => {
    const r = await issueInvoiceAction(inv.id)
    if (!r.success) { toast.error(!r.success && 'error' in r ? r.error : 'Error al emitir'); return }
    toast.success('Factura emitida — asiento contable creado')
    onRefresh()
  }

  const getPdfUrl = async (): Promise<string | null> => {
    setLoadingPdf(true)
    const res = await generateInvoicePdfAction(inv.id)
    setLoadingPdf(false)
    if (res?.success && res.data?.url) { onRefresh(); return res.data.url }
    toast.error(!res?.success && 'error' in res ? res.error : 'Error al generar PDF')
    return null
  }

  const openPdf = async () => { const url = await getPdfUrl(); if (url) window.open(url, '_blank', 'noopener,noreferrer') }
  const downloadPdf = async () => {
    const url = await getPdfUrl(); if (!url) return
    try {
      const r = await fetch(url); const blob = await r.blob()
      const a = document.createElement('a'); a.href = URL.createObjectURL(blob)
      a.download = inv.status === 'draft' ? `factura-borrador-${inv.id.slice(0, 8)}.pdf` : `factura-${inv.invoice_number}.pdf`; a.click(); URL.revokeObjectURL(a.href)
    } catch { window.open(url, '_blank') }
  }

  const markPaid = async () => {
    await supabase.from('invoices').update({ status: 'paid', is_fully_paid: true, amount_paid: inv.total }).eq('id', inv.id)
    toast.success('Factura marcada como pagada'); onRefresh()
  }

  return (
    <>
      <TableRow>
        <TableCell className="font-mono font-medium">{inv.invoice_number}</TableCell>
        <TableCell>{inv.client_name}</TableCell>
        <TableCell className="text-muted-foreground">{formatDate(inv.invoice_date)}</TableCell>
        <TableCell className="text-right font-semibold">{formatCurrency(inv.total)}</TableCell>
        <TableCell><span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${s.className}`}>{s.label}</span></TableCell>
        <TableCell>
          <div className="flex flex-wrap gap-1.5 items-center">
            <Button size="sm" variant="outline" className="h-8 gap-1.5 text-blue-700 border-blue-200 hover:bg-blue-50" onClick={openPdf} disabled={loadingPdf}>
              {loadingPdf ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Eye className="h-3.5 w-3.5" />}
              <span className="hidden sm:inline text-xs">Ver PDF</span>
            </Button>
            <Button size="sm" variant="outline" className="h-8 gap-1.5 text-blue-700 border-blue-200 hover:bg-blue-50" onClick={downloadPdf} disabled={loadingPdf}>
              <Download className="h-3.5 w-3.5" />
              <span className="hidden sm:inline text-xs">Descargar</span>
            </Button>
            {inv.status === 'draft' && (
              <>
                <Button size="sm" variant="outline" className="h-8 gap-1.5" onClick={openEdit}>
                  <Pencil className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline text-xs">Editar</span>
                </Button>
                <Button size="sm" variant="default" className="h-8 gap-1.5 bg-blue-700 hover:bg-blue-800" onClick={handleIssue}>
                  <Send className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline text-xs">Emitir</span>
                </Button>
              </>
            )}
            {(inv.status === 'issued' || inv.status === 'overdue') && (
              <Button size="icon" variant="ghost" className="h-8 w-8" onClick={markPaid} title="Marcar como pagada">
                <CheckCircle className="h-3.5 w-3.5 text-green-600" />
              </Button>
            )}
          </div>
        </TableCell>
      </TableRow>

      {/* Diálogo edición factura borrador */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-w-3xl max-h-[90vh] flex flex-col">
          <DialogHeader><DialogTitle>Editar factura {inv.invoice_number} (borrador)</DialogTitle></DialogHeader>
          <ScrollArea className="flex-1 pr-1">
            <div className="space-y-4 p-1">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1 col-span-2 sm:col-span-1">
                  <Label>Nombre en factura</Label>
                  <Input value={form.client_name} onChange={e => setForm(f => ({ ...f, client_name: e.target.value }))} />
                </div>
                <div className="space-y-1">
                  <Label>NIF / CIF</Label>
                  <Input value={form.client_nif} onChange={e => setForm(f => ({ ...f, client_nif: e.target.value }))} />
                </div>
                <div className="space-y-1">
                  <Label>Fecha factura</Label>
                  <DatePickerPopover value={form.invoice_date} onChange={date => setForm(f => ({ ...f, invoice_date: date }))} />
                </div>
                <div className="space-y-1">
                  <Label>Fecha vencimiento</Label>
                  <div className="flex flex-wrap gap-2 items-center">
                    <DatePickerPopover containerClassName="w-full sm:w-40" value={form.due_date} onChange={date => setForm(f => ({ ...f, due_date: date }))} />
                    <span className="text-xs text-muted-foreground">Rápido:</span>
                    <Button type="button" size="sm" variant="outline" className="h-8 text-xs" onClick={() => setForm(f => ({ ...f, due_date: new Date().toISOString().slice(0, 10) }))}>Hoy</Button>
                    <Button type="button" size="sm" variant="outline" className="h-8 text-xs" onClick={() => setForm(f => ({ ...f, due_date: addDays(f.invoice_date, 15) }))}>+15 días</Button>
                    <Button type="button" size="sm" variant="outline" className="h-8 text-xs" onClick={() => setForm(f => ({ ...f, due_date: addDays(f.invoice_date, 30) }))}>+30 días</Button>
                  </div>
                </div>
              </div>
              <div>
                <div className="mb-2">
                  <Label className="font-semibold text-sm">Líneas</Label>
                  <p className="text-xs text-muted-foreground mt-0.5 mb-2">Añade líneas manualmente, escoge un producto o carga un pedido de sastrería.</p>
                  <div className="flex flex-wrap gap-2">
                    <Button size="sm" variant="outline" onClick={addLine}><Plus className="h-3.5 w-3.5 mr-1" /> Añadir línea</Button>
                    <Button size="sm" variant="default" onClick={openProductDialogEdit}><Package className="h-3.5 w-3.5 mr-1" /> Escoger producto</Button>
                    <Button size="sm" variant="outline" onClick={openOrderDialogEdit}><ClipboardList className="h-3.5 w-3.5 mr-1" /> Escoger pedido</Button>
                  </div>
                </div>
                <div className="space-y-1">
                  <div className="grid grid-cols-12 gap-1 text-xs font-medium text-muted-foreground px-1">
                    <span className="col-span-5">Descripción</span><span className="col-span-2 text-center">Cant.</span>
                    <span className="col-span-2 text-center">Precio</span><span className="col-span-2 text-center">IVA %</span><span className="col-span-1" />
                  </div>
                  {lines.map((ln, i) => (
                    <div key={i} className="grid grid-cols-12 gap-1 items-center">
                      <Input className="col-span-5 h-8 text-sm" value={ln.description} onChange={e => updateLine(i, 'description', e.target.value)} placeholder="Descripción" />
                      <Input className="col-span-2 h-8 text-sm text-center" type="number" step={0.01} value={ln.quantity} onChange={e => updateLine(i, 'quantity', Number(e.target.value))} />
                      <Input className="col-span-2 h-8 text-sm text-center" type="number" step={0.01} value={ln.unit_price} onChange={e => updateLine(i, 'unit_price', Number(e.target.value))} />
                      <Input className="col-span-2 h-8 text-sm text-center" type="number" value={ln.tax_rate} onChange={e => updateLine(i, 'tax_rate', Number(e.target.value))} />
                      <Button className="col-span-1 h-8" variant="ghost" size="icon" onClick={() => removeLine(i)} disabled={lines.length === 1}>
                        <Trash2 className="h-3.5 w-3.5 text-red-500" />
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
              <div className="flex justify-end">
                <div className="w-56 space-y-1 text-sm">
                  <div className="flex justify-between"><span className="text-muted-foreground">Subtotal</span><span>{formatCurrency(subtotal)}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">IVA</span><span>{formatCurrency(taxAmount)}</span></div>
                  <div className="flex justify-between font-bold border-t pt-1"><span>Total</span><span>{formatCurrency(total)}</span></div>
                </div>
              </div>
              <div className="space-y-1">
                <Label>Notas</Label>
                <Textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} rows={2} />
              </div>
            </div>
          </ScrollArea>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditOpen(false)}>Cancelar</Button>
            <Button onClick={handleUpdate} disabled={saving}>
              {saving && <Loader2 className="h-4 w-4 animate-spin mr-1" />} Guardar cambios
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={productDialogOpen} onOpenChange={setProductDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Añadir desde producto</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="flex gap-2">
              <Input placeholder="Buscar por nombre o SKU..." value={productSearch} onChange={e => setProductSearch(e.target.value)} onKeyDown={e => e.key === 'Enter' && searchProductsEdit()} />
              <Button variant="secondary" onClick={searchProductsEdit} disabled={loadingProducts}>{loadingProducts ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}</Button>
            </div>
            <ScrollArea className="h-64 rounded border p-2">
              {loadingProducts ? <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div> : productResults.length === 0 ? <p className="text-sm text-muted-foreground text-center py-8">Sin resultados.</p> : (
                <div className="space-y-1">
                  {productResults.map(p => (
                    <button key={p.id} type="button" className="w-full text-left rounded p-2 hover:bg-muted flex justify-between items-center" onClick={() => addProductAsLineEdit(p)}>
                      <span className="font-medium truncate">{p.name || p.sku}</span>
                      <span className="text-sm text-muted-foreground shrink-0 ml-2">{formatCurrency(p.base_price)}</span>
                    </button>
                  ))}
                </div>
              )}
            </ScrollArea>
          </div>
        </DialogContent>
      </Dialog>
      <Dialog open={orderDialogOpen} onOpenChange={setOrderDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Añadir líneas desde pedido</DialogTitle></DialogHeader>
          <ScrollArea className="h-72 rounded border p-2">
            {loadingOrders ? <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div> : ordersList.length === 0 ? <p className="text-sm text-muted-foreground text-center py-8">No hay pedidos.</p> : (
              <div className="space-y-1">
                {ordersList.map(o => (
                  <button key={o.id} type="button" className="w-full text-left rounded p-3 hover:bg-muted border flex justify-between items-center gap-2" onClick={() => addOrderLinesEdit(o.id)} disabled={loadingOrderLines}>
                    <span className="font-mono font-medium">{o.order_number}</span>
                    <span className="text-sm text-muted-foreground truncate">{o.client_name}</span>
                    <span className="font-semibold shrink-0">{formatCurrency(o.total)}</span>
                    {loadingOrderLines ? <Loader2 className="h-4 w-4 animate-spin shrink-0" /> : null}
                  </button>
                ))}
              </div>
            )}
          </ScrollArea>
        </DialogContent>
      </Dialog>
    </>
  )
}

// ─── Tab: Presupuestos ───────────────────────────────────────────────────────

type EstimateLine = { description: string; quantity: number; unit_price: number; tax_rate: number }

function EstimateTableRow ({ est, onRefresh }: { est: EstimateRow; onRefresh: () => void }) {
  const [loadingPdf, setLoadingPdf] = useState(false)
  const [loadingInvoicePdf, setLoadingInvoicePdf] = useState(false)
  const [loadingAction, setLoadingAction] = useState(false)
  const [acceptDialogOpen, setAcceptDialogOpen] = useState(false)
  const [rejectDialogOpen, setRejectDialogOpen] = useState(false)
  const [convertDialogOpen, setConvertDialogOpen] = useState(false)
  const [sendDialogOpen, setSendDialogOpen] = useState(false)
  const [rejectReason, setRejectReason] = useState('')
  const [quickAddEmail, setQuickAddEmail] = useState('')
  const s = ESTIMATE_STATUS[est.status] ?? ESTIMATE_STATUS.draft

  const openPdf = async () => {
    setLoadingPdf(true)
    const res = await generateEstimatePdfAction(est.id)
    setLoadingPdf(false)
    if (res?.success && res.data?.url) {
      window.open(res.data.url, '_blank', 'noopener,noreferrer')
      onRefresh()
    } else {
      toast.error(!res?.success && 'error' in res ? res.error : 'Error al generar PDF')
    }
  }

  const handleSend = async (emailToUse?: string) => {
    setLoadingAction(true)
    let email = est.client_email?.trim()
    if (!email && emailToUse?.trim()) {
      const upRes = await updateEstimateAction({ estimateId: est.id, client_email: emailToUse.trim() })
      if (!upRes?.success) {
        setLoadingAction(false)
        toast.error(!upRes?.success && 'error' in upRes ? upRes.error : 'Error al guardar el email')
        return
      }
      onRefresh()
      email = emailToUse.trim()
    }
    const res = await sendEstimateAction({ estimateId: est.id })
    setLoadingAction(false)
    setSendDialogOpen(false)
    setQuickAddEmail('')
    if (res?.success) { toast.success('Presupuesto enviado al cliente'); onRefresh() }
    else toast.error(!res?.success && 'error' in res ? res.error : 'Error')
  }

  const handleAccept = async () => {
    setLoadingAction(true)
    const res = await acceptEstimateAction({ estimateId: est.id })
    setLoadingAction(false)
    setAcceptDialogOpen(false)
    if (res?.success) { toast.success('Presupuesto marcado como aceptado'); onRefresh() }
    else toast.error(!res?.success && 'error' in res ? res.error : 'Error')
  }

  const handleReject = async () => {
    setLoadingAction(true)
    const res = await rejectEstimateAction({ estimateId: est.id, reason: rejectReason.trim() || undefined })
    setLoadingAction(false)
    setRejectDialogOpen(false)
    setRejectReason('')
    if (res?.success) { toast.success('Presupuesto rechazado'); onRefresh() }
    else toast.error(!res?.success && 'error' in res ? res.error : 'Error')
  }

  const handleConvert = async () => {
    setLoadingAction(true)
    const res = await convertEstimateToInvoiceAction({ estimateId: est.id })
    setLoadingAction(false)
    setConvertDialogOpen(false)
    if (res?.success) {
      toast.success(`Factura ${res.data.invoice_number} creada`)
      onRefresh()
    } else {
      toast.error(!res?.success && 'error' in res ? res.error : 'Error')
    }
  }

  const openInvoicePdf = async () => {
    if (!est.invoice_id) return
    setLoadingInvoicePdf(true)
    const res = await generateInvoicePdfAction(est.invoice_id)
    setLoadingInvoicePdf(false)
    if (res?.success && res.data?.url) {
      window.open(res.data.url, '_blank', 'noopener,noreferrer')
    } else toast.error(!res?.success && 'error' in res ? res.error : 'Error')
  }

  return (
    <>
      <TableRow>
        <TableCell className="font-mono font-medium">{est.estimate_number}</TableCell>
        <TableCell className={!est.client_name?.trim() ? 'text-muted-foreground' : ''}>{est.client_name?.trim() || 'Sin cliente'}</TableCell>
        <TableCell className="text-muted-foreground">{formatDate(est.estimate_date)}</TableCell>
        <TableCell className="text-muted-foreground">{est.valid_until ? formatDate(est.valid_until) : '-'}</TableCell>
        <TableCell className="text-right font-semibold">{formatCurrency(est.total)}</TableCell>
        <TableCell>
          <div className="flex flex-col gap-1">
            <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium w-fit ${s.className}`}>{s.label}</span>
            {est.invoice_id && (
              <Button variant="link" className="h-auto min-h-0 p-0 text-xs text-primary hover:underline" onClick={openInvoicePdf} disabled={loadingInvoicePdf}>
                Ver factura →
              </Button>
            )}
          </div>
        </TableCell>
        <TableCell>
          <div className="flex flex-wrap gap-1 items-center min-h-[48px]">
            <Button size="icon" variant="ghost" className="h-9 w-9 shrink-0" onClick={openPdf} disabled={loadingPdf} title="Ver PDF">
              {loadingPdf ? <Loader2 className="h-4 w-4 animate-spin" /> : <Eye className="h-4 w-4" />}
            </Button>
            {est.status === 'draft' && (
              <Button size="sm" variant="outline" className="h-9 min-h-[48px] text-xs border-green-500 text-green-700 hover:bg-green-50" onClick={() => setSendDialogOpen(true)} disabled={loadingAction}>
                {loadingAction ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : <Send className="h-3.5 w-3.5 mr-1" />}
                Enviar a cliente
              </Button>
            )}
            {est.status === 'sent' && (
              <>
                <Button size="sm" variant="outline" className="h-9 min-h-[48px] text-xs border-green-500 text-green-700 hover:bg-green-50" onClick={() => setAcceptDialogOpen(true)} disabled={loadingAction}>
                  {loadingAction ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : <CheckCircle className="h-3.5 w-3.5 mr-1" />}
                  Cliente acepta
                </Button>
                <Button size="sm" variant="outline" className="h-9 min-h-[48px] text-xs border-red-500 text-red-700 hover:bg-red-50" onClick={() => setRejectDialogOpen(true)} disabled={loadingAction}>
                  {loadingAction ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : <XCircle className="h-3.5 w-3.5 mr-1" />}
                  Rechazar
                </Button>
              </>
            )}
            {est.status === 'accepted' && !est.invoice_id && (
              <Button size="sm" variant="outline" className="h-9 min-h-[48px] text-xs" onClick={() => setConvertDialogOpen(true)} disabled={loadingAction}>
                {loadingAction ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : <FileText className="h-3.5 w-3.5 mr-1" />}
                Facturar
              </Button>
            )}
            {est.status === 'invoiced' && est.invoice_id && (
              <Button size="sm" variant="outline" className="h-9 min-h-[48px] text-xs" onClick={openInvoicePdf} disabled={loadingInvoicePdf}>
                {loadingInvoicePdf ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : <ExternalLink className="h-3.5 w-3.5 mr-1" />}
                Ver factura →
              </Button>
            )}
          </div>
        </TableCell>
      </TableRow>

      <Dialog open={sendDialogOpen} onOpenChange={(open) => { setSendDialogOpen(open); if (!open) setQuickAddEmail('') }}>
        <DialogContent>
          <DialogHeader><DialogTitle>Enviar presupuesto</DialogTitle></DialogHeader>
          {est.client_email?.trim() ? (
            <p className="text-sm text-muted-foreground">
              Se enviará el presupuesto {est.estimate_number} a <strong>{est.client_email}</strong>. ¿Confirmar?
            </p>
          ) : (
            <div className="space-y-3">
              <p className="text-sm text-red-600 font-medium">
                Este presupuesto no tiene email de cliente. Edita el presupuesto para añadir el email antes de enviarlo.
              </p>
              <div className="space-y-1">
                <Label>Email del cliente</Label>
                <Input type="email" value={quickAddEmail} onChange={e => setQuickAddEmail(e.target.value)} placeholder="email@ejemplo.com" />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setSendDialogOpen(false)}>Cancelar</Button>
            {est.client_email?.trim() ? (
              <Button onClick={() => handleSend()} disabled={loadingAction}>
                {loadingAction ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null} Enviar
              </Button>
            ) : (
              <Button onClick={() => handleSend(quickAddEmail)} disabled={loadingAction || !quickAddEmail.trim()}>
                {loadingAction ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null} Guardar email y enviar
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={acceptDialogOpen} onOpenChange={setAcceptDialogOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Cliente acepta</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">
            ¿Confirmar que el cliente ha aceptado el presupuesto {est.estimate_number}? Esta acción cambiará el estado a Aceptado.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAcceptDialogOpen(false)}>Cancelar</Button>
            <Button onClick={handleAccept} disabled={loadingAction}>{loadingAction ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null} Confirmar aceptación</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={rejectDialogOpen} onOpenChange={(open) => { setRejectDialogOpen(open); if (!open) setRejectReason('') }}>
        <DialogContent>
          <DialogHeader><DialogTitle>Rechazar presupuesto</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">¿El cliente ha rechazado el presupuesto?</p>
          <div className="space-y-2">
            <Label>Motivo (opcional)</Label>
            <Input value={rejectReason} onChange={e => setRejectReason(e.target.value)} placeholder="Indica el motivo del rechazo..." />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejectDialogOpen(false)}>Cancelar</Button>
            <Button variant="destructive" onClick={handleReject} disabled={loadingAction}>{loadingAction ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null} Confirmar rechazo</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={convertDialogOpen} onOpenChange={setConvertDialogOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Convertir a factura</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">
            Se creará una factura en borrador con los datos del presupuesto {est.estimate_number}. Podrás editarla y emitirla desde la pestaña Facturas.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConvertDialogOpen(false)}>Cancelar</Button>
            <Button onClick={handleConvert} disabled={loadingAction}>{loadingAction ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null} Facturar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

function EstimatesTab() {
  const [rows, setRows] = useState<EstimateRow[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('all')
  const [dialogOpen, setDialogOpen] = useState(false)
  const [clients, setClients] = useState<{ id: string; full_name: string; email: string | null }[]>([])
  const [saving, setSaving] = useState(false)

  const [productDialogOpen, setProductDialogOpen] = useState(false)
  const [productSearch, setProductSearch] = useState('')
  const [productResults, setProductResults] = useState<{ id: string; name: string; sku: string; base_price: number }[]>([])
  const [loadingProducts, setLoadingProducts] = useState(false)
  const [orderDialogOpen, setOrderDialogOpen] = useState(false)
  const [ordersList, setOrdersList] = useState<{ id: string; order_number: string; total: number; client_name: string }[]>([])
  const [loadingOrders, setLoadingOrders] = useState(false)
  const [loadingOrderLines, setLoadingOrderLines] = useState(false)

  const [form, setForm] = useState({
    client_id: '', client_name: '', client_nif: '', client_email: '',
    estimate_date: new Date().toISOString().split('T')[0],
    valid_until: '', notes: '', irpf_rate: 0, tax_rate: 21,
  })
  const [lines, setLines] = useState<EstimateLine[]>([
    { description: '', quantity: 1, unit_price: 0, tax_rate: 21 },
  ])

  const load = useCallback(async () => {
    setLoading(true)
    const r = await getEstimates({ search, status })
    if (r.success) setRows(r.data)
    setLoading(false)
  }, [search, status])

  useEffect(() => { load() }, [load])

  const openDialog = async () => {
    const r = await getClientsForInvoice()
    if (r.success) setClients(r.data)
    setDialogOpen(true)
  }

  const addLine = () => setLines(l => [...l, { description: '', quantity: 1, unit_price: 0, tax_rate: 21 }])
  const removeLine = (i: number) => setLines(l => l.filter((_, idx) => idx !== i))
  const updateLine = (i: number, field: keyof EstimateLine, value: string | number) =>
    setLines(l => l.map((ln, idx) => idx === i ? { ...ln, [field]: value } : ln))

  const openProductDialogEst = async () => {
    setProductDialogOpen(true)
    setLoadingProducts(true)
    const r = await getProductsForInvoice({ search: productSearch.trim() || undefined })
    if (r.success) setProductResults(r.data)
    setLoadingProducts(false)
  }
  const searchProductsEst = async () => {
    setLoadingProducts(true)
    const r = await getProductsForInvoice({ search: productSearch.trim() || undefined })
    if (r.success) setProductResults(r.data)
    setLoadingProducts(false)
  }
  const addProductAsLineEst = (p: { name: string; sku: string; base_price: number }) => {
    setLines(l => [...l, { description: p.name || p.sku || 'Producto', quantity: 1, unit_price: p.base_price, tax_rate: 21 }])
    setProductDialogOpen(false)
    setProductSearch('')
  }
  const openOrderDialogEst = async () => {
    setOrderDialogOpen(true)
    setLoadingOrders(true)
    const r = await listTailoringOrdersForInvoice({ clientId: form.client_id || undefined })
    if (r.success) setOrdersList(r.data)
    setLoadingOrders(false)
  }
  const addOrderLinesEst = async (orderId: string) => {
    setLoadingOrderLines(true)
    const r = await getTailoringOrderLinesForInvoice(orderId)
    setLoadingOrderLines(false)
    if (!r.success || !r.data.length) { toast.error(!r.success && 'error' in r ? r.error : 'El pedido no tiene líneas'); return }
    const newLines: EstimateLine[] = r.data.map(l => ({ description: l.description, quantity: l.quantity, unit_price: l.unit_price, tax_rate: l.tax_rate }))
    setLines(prev => [...prev, ...newLines])
    toast.success(`${newLines.length} línea(s) añadida(s) desde el pedido`)
    setOrderDialogOpen(false)
  }

  const subtotal = lines.reduce((s, l) => s + l.quantity * l.unit_price, 0)
  const taxAmount = lines.reduce((s, l) => s + l.quantity * l.unit_price * (l.tax_rate / 100), 0)
  const irpfAmount = subtotal * (form.irpf_rate / 100)
  const total = subtotal + taxAmount - irpfAmount

  const handleSave = async () => {
    const hasValidLine = lines.some(l => (l.description?.trim() ?? '') && (l.unit_price ?? 0) > 0)
    if (!hasValidLine) { toast.error('Añade al menos una línea con descripción y precio'); return }
    setSaving(true)
    try {
      const result = await createEstimateAction({
        client_id: form.client_id || null,
        client_name: form.client_name,
        client_nif: form.client_nif || null,
        client_email: form.client_email?.trim() || null,
        estimate_date: form.estimate_date,
        valid_until: form.valid_until || null,
        subtotal,
        tax_rate: form.tax_rate,
        tax_amount: taxAmount,
        irpf_rate: form.irpf_rate,
        irpf_amount: irpfAmount,
        total,
        notes: form.notes || null,
        lines: lines.map(l => ({
          description: l.description,
          quantity: l.quantity,
          unit_price: l.unit_price,
          tax_rate: l.tax_rate,
        })),
      })

      if (!result.success) {
        toast.error(result.error ?? 'Error al crear el presupuesto')
        return
      }

      toast.success(`Presupuesto ${result.data.estimate_number} creado`)
      setDialogOpen(false)
      setLines([{ description: '', quantity: 1, unit_price: 0, tax_rate: 21 }])
      setForm({ client_id: '', client_name: '', client_nif: '', client_email: '', estimate_date: new Date().toISOString().split('T')[0], valid_until: '', notes: '', irpf_rate: 0, tax_rate: 21 })
      load()
    } catch (error) {
      console.error('Error creating estimate:', error)
      toast.error(error instanceof Error ? error.message : 'Error desconocido al crear el presupuesto')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <div className="relative flex-1 min-w-[180px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Buscar presupuesto o cliente…" className="pl-9" value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="w-36"><SelectValue placeholder="Estado" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos</SelectItem>
            <SelectItem value="draft">Borrador</SelectItem>
            <SelectItem value="sent">Enviado</SelectItem>
            <SelectItem value="accepted">Aceptado</SelectItem>
            <SelectItem value="rejected">Rechazado</SelectItem>
            <SelectItem value="invoiced">Facturado</SelectItem>
          </SelectContent>
        </Select>
        <Button onClick={openDialog}><Plus className="h-4 w-4 mr-1" /> Nuevo presupuesto</Button>
      </div>

      {loading ? <Spinner /> : (
        <div className="rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Número</TableHead>
                <TableHead>Cliente</TableHead>
                <TableHead>Fecha</TableHead>
                <TableHead>Válido hasta</TableHead>
                <TableHead className="text-right">Total</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead className="w-24">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.length === 0 ? (
                <TableRow><TableCell colSpan={7} className="text-center py-12 text-muted-foreground">Sin presupuestos</TableCell></TableRow>
              ) : rows.map(est => (
                <EstimateTableRow key={est.id} est={est} onRefresh={load} />
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {/* New Estimate Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-3xl max-h-[90vh] flex flex-col">
          <DialogHeader><DialogTitle>Nuevo presupuesto</DialogTitle></DialogHeader>
          <ScrollArea className="flex-1 pr-1">
            <div className="space-y-4 p-1">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label>Cliente</Label>
                  <Select value={form.client_id} onValueChange={id => {
                    const c = clients.find(x => x.id === id)
                    setForm(f => ({ ...f, client_id: id, client_name: c?.full_name ?? '', client_email: c?.email ?? '' }))
                  }}>
                    <SelectTrigger><SelectValue placeholder="Seleccionar cliente" /></SelectTrigger>
                    <SelectContent>{clients.map(c => <SelectItem key={c.id} value={c.id}>{c.full_name}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label>Email del cliente</Label>
                  <Input type="email" value={form.client_email} onChange={e => setForm(f => ({ ...f, client_email: e.target.value }))} placeholder="email@ejemplo.com (opcional)" />
                </div>
                <div className="space-y-1">
                  <Label>Nombre presupuesto</Label>
                  <Input value={form.client_name} onChange={e => setForm(f => ({ ...f, client_name: e.target.value }))} />
                </div>
                <div className="space-y-1">
                  <Label>NIF / CIF</Label>
                  <Input value={form.client_nif} onChange={e => setForm(f => ({ ...f, client_nif: e.target.value }))} />
                </div>
                <div className="space-y-1">
                  <Label>Fecha</Label>
                  <DatePickerPopover value={form.estimate_date} onChange={date => setForm(f => ({ ...f, estimate_date: date }))} />
                </div>
                <div className="space-y-1">
                  <Label>Válido hasta</Label>
                  <div className="flex flex-wrap gap-2 items-center">
                    <DatePickerPopover containerClassName="w-full sm:w-40" value={form.valid_until} onChange={date => setForm(f => ({ ...f, valid_until: date }))} />
                    <span className="text-xs text-muted-foreground">Rápido:</span>
                    <Button type="button" size="sm" variant="outline" className="h-8 text-xs" onClick={() => setForm(f => ({ ...f, valid_until: new Date().toISOString().slice(0, 10) }))}>Hoy</Button>
                    <Button type="button" size="sm" variant="outline" className="h-8 text-xs" onClick={() => setForm(f => ({ ...f, valid_until: addDays(f.estimate_date, 15) }))}>+15 días</Button>
                    <Button type="button" size="sm" variant="outline" className="h-8 text-xs" onClick={() => setForm(f => ({ ...f, valid_until: addDays(f.estimate_date, 30) }))}>+30 días</Button>
                  </div>
                </div>
              </div>

              <div>
                <div className="mb-2">
                  <Label className="text-sm font-semibold">Líneas</Label>
                  <p className="text-xs text-muted-foreground mt-0.5 mb-2">Añade líneas manualmente, escoge un producto del catálogo o carga las líneas de un pedido de sastrería.</p>
                  <div className="flex flex-wrap gap-2">
                    <Button size="sm" variant="outline" onClick={addLine}><Plus className="h-3.5 w-3.5 mr-1" /> Añadir línea (texto libre)</Button>
                    <Button size="sm" variant="default" onClick={openProductDialogEst}><Package className="h-3.5 w-3.5 mr-1" /> Escoger producto</Button>
                    <Button size="sm" variant="outline" onClick={openOrderDialogEst}><ClipboardList className="h-3.5 w-3.5 mr-1" /> Escoger pedido</Button>
                  </div>
                </div>
                <div className="space-y-2">
                  <div className="grid grid-cols-12 gap-1 text-xs font-medium text-muted-foreground px-1">
                    <span className="col-span-5">Descripción</span><span className="col-span-2 text-center">Cantidad</span>
                    <span className="col-span-2 text-center">Precio</span><span className="col-span-2 text-center">IVA %</span>
                    <span className="col-span-1"></span>
                  </div>
                  {lines.map((ln, i) => (
                    <div key={i} className="grid grid-cols-12 gap-1 items-center">
                      <Input className="col-span-5 h-8 text-sm" value={ln.description} onChange={e => updateLine(i, 'description', e.target.value)} placeholder="Descripción" />
                      <Input className="col-span-2 h-8 text-sm text-center" type="number" min={0.01} step={0.01} value={ln.quantity} onChange={e => updateLine(i, 'quantity', Number(e.target.value))} />
                      <Input className="col-span-2 h-8 text-sm text-center" type="number" min={0} step={0.01} value={ln.unit_price} onChange={e => updateLine(i, 'unit_price', Number(e.target.value))} />
                      <Input className="col-span-2 h-8 text-sm text-center" type="number" min={0} max={21} value={ln.tax_rate} onChange={e => updateLine(i, 'tax_rate', Number(e.target.value))} />
                      <Button className="col-span-1 h-8" variant="ghost" size="icon" onClick={() => removeLine(i)} disabled={lines.length === 1}>
                        <Trash2 className="h-3.5 w-3.5 text-red-500" />
                      </Button>
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex justify-end">
                <div className="w-60 space-y-1 text-sm">
                  <div className="flex justify-between"><span className="text-muted-foreground">Subtotal</span><span>{formatCurrency(subtotal)}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">IVA</span><span>{formatCurrency(taxAmount)}</span></div>
                  <div className="flex justify-between font-bold text-base border-t pt-1"><span>Total</span><span>{formatCurrency(total)}</span></div>
                </div>
              </div>

              <div className="space-y-1">
                <Label>Notas</Label>
                <Textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} rows={2} />
              </div>
            </div>
          </ScrollArea>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null} Crear presupuesto
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={productDialogOpen} onOpenChange={setProductDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Añadir desde producto</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="flex gap-2">
              <Input placeholder="Buscar por nombre o SKU..." value={productSearch} onChange={e => setProductSearch(e.target.value)} onKeyDown={e => e.key === 'Enter' && searchProductsEst()} />
              <Button variant="secondary" onClick={searchProductsEst} disabled={loadingProducts}>{loadingProducts ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}</Button>
            </div>
            <ScrollArea className="h-64 rounded border p-2">
              {loadingProducts ? <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div> : productResults.length === 0 ? <p className="text-sm text-muted-foreground text-center py-8">Sin resultados. Escribe para buscar.</p> : (
                <div className="space-y-1">
                  {productResults.map(p => (
                    <button key={p.id} type="button" className="w-full text-left rounded p-2 hover:bg-muted flex justify-between items-center" onClick={() => addProductAsLineEst(p)}>
                      <span className="font-medium truncate">{p.name || p.sku}</span>
                      <span className="text-sm text-muted-foreground shrink-0 ml-2">{formatCurrency(p.base_price)}</span>
                    </button>
                  ))}
                </div>
              )}
            </ScrollArea>
          </div>
        </DialogContent>
      </Dialog>
      <Dialog open={orderDialogOpen} onOpenChange={setOrderDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Añadir líneas desde pedido</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">Se listan los pedidos de sastrería{form.client_id ? ' del cliente seleccionado' : ''}. Al elegir uno se añaden sus líneas al presupuesto.</p>
          <ScrollArea className="h-72 rounded border p-2">
            {loadingOrders ? <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div> : ordersList.length === 0 ? <p className="text-sm text-muted-foreground text-center py-8">No hay pedidos.</p> : (
              <div className="space-y-1">
                {ordersList.map(o => (
                  <button key={o.id} type="button" className="w-full text-left rounded p-3 hover:bg-muted border flex justify-between items-center gap-2" onClick={() => addOrderLinesEst(o.id)} disabled={loadingOrderLines}>
                    <span className="font-mono font-medium">{o.order_number}</span>
                    <span className="text-sm text-muted-foreground truncate">{o.client_name}</span>
                    <span className="font-semibold shrink-0">{formatCurrency(o.total)}</span>
                    {loadingOrderLines ? <Loader2 className="h-4 w-4 animate-spin shrink-0" /> : null}
                  </button>
                ))}
              </div>
            )}
          </ScrollArea>
        </DialogContent>
      </Dialog>
    </div>
  )
}

// ─── Tab: Asientos ───────────────────────────────────────────────────────────

function JournalTab() {
  const [rows, setRows] = useState<JournalEntryRow[]>([])
  const [loading, setLoading] = useState(true)
  const [year, setYear] = useState(new Date().getFullYear())
  const [month, setMonth] = useState(0)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())

  const years = Array.from({ length: 5 }, (_, i) => new Date().getFullYear() - i)

  const load = useCallback(async () => {
    setLoading(true)
    const r = await getJournalEntries({ year, month: month || undefined })
    if (r.success) setRows(r.data)
    setLoading(false)
  }, [year, month])

  useEffect(() => { load() }, [load])

  const toggle = (id: string) => setExpanded(s => {
    const n = new Set(s)
    if (n.has(id)) n.delete(id); else n.add(id)
    return n
  })

  const now = new Date()
  const setThisMonth = () => { setYear(now.getFullYear()); setMonth(now.getMonth() + 1) }
  const setLastMonth = () => {
    const d = new Date(now.getFullYear(), now.getMonth() - 1, 1)
    setYear(d.getFullYear()); setMonth(d.getMonth() + 1)
  }
  const setAllMonths = () => setMonth(0)

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2 items-center">
        <span className="text-sm font-medium text-muted-foreground">Periodo:</span>
        <Select value={String(year)} onValueChange={v => setYear(Number(v))}>
          <SelectTrigger className="w-28 h-9"><SelectValue /></SelectTrigger>
          <SelectContent>{years.map(y => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}</SelectContent>
        </Select>
        <Select value={String(month)} onValueChange={v => setMonth(Number(v))}>
          <SelectTrigger className="w-40 h-9"><SelectValue placeholder="Todos los meses" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="0">Todos los meses</SelectItem>
            {MONTHS.map((m: string, i: number) => <SelectItem key={i + 1} value={String(i + 1)}>{m}</SelectItem>)}
          </SelectContent>
        </Select>
        <span className="text-xs text-muted-foreground mx-1">o</span>
        <Button type="button" size="sm" variant="outline" className="h-9" onClick={setThisMonth}>Este mes</Button>
        <Button type="button" size="sm" variant="outline" className="h-9" onClick={setLastMonth}>Mes pasado</Button>
        <Button type="button" size="sm" variant="ghost" className="h-9 text-muted-foreground" onClick={setAllMonths}>Todo el año</Button>
      </div>

      {loading ? <Spinner /> : rows.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <BookOpen className="mx-auto h-10 w-10 mb-3 opacity-30" />
          <p>Sin asientos para el periodo seleccionado.</p>
          <p className="text-xs mt-1">Los asientos se generan automáticamente con ventas y pagos.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {rows.map(e => (
            <JournalEntryRow key={e.id} entry={e} expanded={expanded.has(e.id)} onToggle={() => toggle(e.id)} onRefresh={load} />
          ))}
        </div>
      )}
    </div>
  )
}

function JournalEntryRow({ entry: e, expanded, onToggle, onRefresh }: {
  entry: JournalEntryRow; expanded: boolean; onToggle: () => void; onRefresh: () => void
}) {
  const [editing, setEditing] = useState(false)
  const [desc, setDesc] = useState(e.description)
  const [saving, setSaving] = useState(false)

  const statusCls = e.status === 'posted' ? 'bg-green-100 text-green-700' : e.status === 'cancelled' ? 'bg-red-100 text-red-700' : 'bg-gray-100 text-gray-700'
  const statusLbl = e.status === 'posted' ? 'Contabilizado' : e.status === 'cancelled' ? 'Cancelado' : 'Borrador'

  const saveDesc = async () => {
    setSaving(true)
    const r = await updateJournalEntryDescriptionAction({ id: e.id, description: desc })
    setSaving(false)
    if (!r.success) { toast.error(!r.success && 'error' in r ? r.error : 'Error'); return }
    toast.success('Descripción actualizada')
    setEditing(false)
    onRefresh()
  }

  return (
    <div className="border rounded-lg overflow-hidden">
      <div className="w-full flex items-center gap-3 px-4 py-3 hover:bg-muted/50 transition-colors">
        <button onClick={onToggle} className="flex items-center gap-3 flex-1 text-left min-w-0">
          {expanded ? <ChevronDown className="h-4 w-4 flex-shrink-0 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 flex-shrink-0 text-muted-foreground" />}
          <span className="font-mono text-sm font-medium w-16 flex-shrink-0">#{e.entry_number}</span>
          <span className="text-sm text-muted-foreground w-24 flex-shrink-0">{formatDate(e.entry_date)}</span>
          {editing ? (
            <Input
              className="h-7 text-sm flex-1"
              value={desc}
              onChange={ev => setDesc(ev.target.value)}
              onClick={ev => ev.stopPropagation()}
              autoFocus
            />
          ) : (
            <span className="flex-1 text-sm truncate">{e.description}</span>
          )}
        </button>
        <span className="text-xs text-muted-foreground w-24 hidden sm:block flex-shrink-0">{ENTRY_TYPES[e.entry_type] ?? e.entry_type}</span>
        <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium flex-shrink-0 ${statusCls}`}>{statusLbl}</span>
        <span className="text-sm font-medium w-28 text-right hidden md:block flex-shrink-0">{formatCurrency(e.total_debit)}</span>
        {editing ? (
          <div className="flex gap-1 flex-shrink-0">
            <Button size="sm" className="h-7 text-xs" onClick={saveDesc} disabled={saving}>
              {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Guardar'}
            </Button>
            <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => { setEditing(false); setDesc(e.description) }}>Cancelar</Button>
          </div>
        ) : (
          <Button size="icon" variant="ghost" className="h-7 w-7 flex-shrink-0" title="Editar descripción" onClick={() => setEditing(true)}>
            <Pencil className="h-3.5 w-3.5 text-muted-foreground" />
          </Button>
        )}
      </div>
      {expanded && e.lines && e.lines.length > 0 && (
        <div className="border-t bg-muted/30">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Cuenta</TableHead>
                <TableHead>Concepto</TableHead>
                <TableHead className="text-right">Debe</TableHead>
                <TableHead className="text-right">Haber</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {e.lines.map((ln, i) => (
                <TableRow key={i}>
                  <TableCell className="font-mono text-sm">{ln.account_code}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{ln.description ?? '-'}</TableCell>
                  <TableCell className="text-right font-medium">{ln.debit > 0 ? formatCurrency(ln.debit) : ''}</TableCell>
                  <TableCell className="text-right font-medium">{ln.credit > 0 ? formatCurrency(ln.credit) : ''}</TableCell>
                </TableRow>
              ))}
              <TableRow className="bg-muted font-bold text-sm">
                <TableCell colSpan={2}>TOTALES</TableCell>
                <TableCell className="text-right">{formatCurrency(e.total_debit)}</TableCell>
                <TableCell className="text-right">{formatCurrency(e.total_credit)}</TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  )
}

// ─── Tab: IVA Trimestral ─────────────────────────────────────────────────────

function VatTab() {
  const [year, setYear] = useState(new Date().getFullYear())
  const [quarters, setQuarters] = useState<VatQuarterRow[]>([])
  const [totRep, setTotRep] = useState(0)
  const [totSop, setTotSop] = useState(0)
  const [loading, setLoading] = useState(true)
  const years = Array.from({ length: 5 }, (_, i) => new Date().getFullYear() - i)

  useEffect(() => {
    setLoading(true)
    getVatQuarterly({ year })
      .then(r => {
        if (r.success) { setQuarters(r.data.quarters); setTotRep(r.data.totalRepercutido); setTotSop(r.data.totalSoportado) }
        setLoading(false)
      })
      .catch(err => {
        console.error('[accounting] getVatQuarterly:', err)
        setLoading(false)
      })
  }, [year])

  const baseSalesTotal  = quarters.reduce((s, q) => s + q.baseImponibleSales, 0)
  const basePurchTotal  = quarters.reduce((s, q) => s + q.baseImponiblePurchases, 0)

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Select value={String(year)} onValueChange={v => setYear(Number(v))}>
          <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
          <SelectContent>{years.map(y => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}</SelectContent>
        </Select>
        <p className="text-sm text-muted-foreground">Modelo 303 — Resumen trimestral de IVA</p>
      </div>

      {loading ? <Spinner /> : (
        <>
          {/* Summary cards */}
          <div className="grid grid-cols-3 gap-4">
            <Card><CardContent className="pt-4 pb-3">
              <p className="text-xs text-muted-foreground">IVA repercutido (ventas)</p>
              <p className="text-xl font-bold text-red-600">{formatCurrency(totRep)}</p>
            </CardContent></Card>
            <Card><CardContent className="pt-4 pb-3">
              <p className="text-xs text-muted-foreground">IVA soportado (compras)</p>
              <p className="text-xl font-bold text-green-600">{formatCurrency(totSop)}</p>
            </CardContent></Card>
            <Card><CardContent className="pt-4 pb-3">
              <p className="text-xs text-muted-foreground">Resultado a ingresar</p>
              <p className={`text-xl font-bold ${(totRep - totSop) >= 0 ? 'text-red-600' : 'text-green-600'}`}>{formatCurrency(totRep - totSop)}</p>
            </CardContent></Card>
          </div>

          <div className="rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Trimestre</TableHead>
                  <TableHead>Periodo</TableHead>
                  <TableHead className="text-right">Base ventas</TableHead>
                  <TableHead className="text-right">IVA repercutido</TableHead>
                  <TableHead className="text-right">Base compras</TableHead>
                  <TableHead className="text-right">IVA soportado</TableHead>
                  <TableHead className="text-right">Resultado</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {quarters.map(q => (
                  <TableRow key={q.quarter}>
                    <TableCell className="font-bold">{q.quarter}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{q.period}</TableCell>
                    <TableCell className="text-right">{formatCurrency(q.baseImponibleSales)}</TableCell>
                    <TableCell className="text-right">{formatCurrency(q.ivaRepercutido)}</TableCell>
                    <TableCell className="text-right">{formatCurrency(q.baseImponiblePurchases)}</TableCell>
                    <TableCell className="text-right">{formatCurrency(q.ivaSoportado)}</TableCell>
                    <TableCell className={`text-right font-bold ${q.resultado >= 0 ? 'text-red-600' : 'text-green-600'}`}>
                      {formatCurrency(q.resultado)}
                    </TableCell>
                  </TableRow>
                ))}
                <TableRow className="bg-muted/60 font-bold">
                  <TableCell colSpan={2}>TOTAL ANUAL {year}</TableCell>
                  <TableCell className="text-right">{formatCurrency(baseSalesTotal)}</TableCell>
                  <TableCell className="text-right">{formatCurrency(totRep)}</TableCell>
                  <TableCell className="text-right">{formatCurrency(basePurchTotal)}</TableCell>
                  <TableCell className="text-right">{formatCurrency(totSop)}</TableCell>
                  <TableCell className={`text-right ${(totRep - totSop) >= 0 ? 'text-red-600' : 'text-green-600'}`}>
                    {formatCurrency(totRep - totSop)}
                  </TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </div>
        </>
      )}
    </div>
  )
}

// ─── Tab: Movimientos ────────────────────────────────────────────────────────

const INCOME_CATEGORIES = ['Ventas directas', 'Otros ingresos']
const EXPENSE_CATEGORIES = ['Alquiler', 'Nóminas', 'Suministros', 'Material', 'Publicidad', 'Servicios externos', 'Otros gastos']
const ALL_CATEGORIES = [...INCOME_CATEGORIES, ...EXPENSE_CATEGORIES]
const TAX_RATES = [0, 4, 10, 21]
const MONTHS_OPT = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre']

function MovimientosTab() {
  const [rows, setRows] = useState<AccountingMovementRow[]>([])
  const [loading, setLoading] = useState(true)
  const [filterType, setFilterType] = useState<'all' | 'income' | 'expense'>('all')
  const [filterYear, setFilterYear] = useState(new Date().getFullYear())
  const [filterMonth, setFilterMonth] = useState(0)
  const [filterStore, setFilterStore] = useState<string>('')
  const [dialogOpen, setDialogOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [editRow, setEditRow] = useState<{ id: string; total: number; payment_method: string } | null>(null)
  const [editSaving, setEditSaving] = useState(false)
  const [form, setForm] = useState({
    type: 'expense' as 'income' | 'expense',
    date: new Date().toISOString().split('T')[0],
    description: '',
    category: 'Otros gastos',
    amount: '' as string | number,
    tax_rate: 21,
    payment_method: '',
    notes: '',
    generateJournalEntry: false,
  })

  const years = Array.from({ length: 5 }, (_, i) => new Date().getFullYear() - i)

  const load = useCallback(async () => {
    setLoading(true)
    const r = await getAccountingMovements({
      type: filterType === 'all' ? undefined : filterType,
      year: filterYear,
      month: filterMonth || undefined,
    })
    if (r.success) setRows(r.data)
    setLoading(false)
  }, [filterType, filterYear, filterMonth])

  useEffect(() => { load() }, [load])

  const amount = Number(form.amount) || 0
  const taxAmount = amount * (form.tax_rate / 100)
  const total = amount + taxAmount

  const handleSave = async () => {
    if (!form.description.trim()) { toast.error('La descripción es obligatoria'); return }
    if (!amount || amount <= 0) { toast.error('El importe debe ser mayor que 0'); return }
    setSaving(true)
    const paymentLabels: Record<string, string> = {
      cash: 'Efectivo', card: 'Tarjeta', bizum: 'Bizum', transfer: 'Transferencia',
    }
    const methodText = form.payment_method ? `Método: ${paymentLabels[form.payment_method] ?? form.payment_method}` : ''
    const baseNotes = form.notes.trim()
    const notesValue = baseNotes && methodText ? `${baseNotes}\n${methodText}` : baseNotes || methodText || undefined
    const r = await createManualTransaction({
      type: form.type,
      date: form.date,
      description: form.description.trim(),
      category: form.category,
      amount,
      tax_rate: form.tax_rate,
      notes: notesValue,
      generateJournalEntry: form.generateJournalEntry,
    })
    if (r.success) {
      toast.success('Movimiento guardado')
      setDialogOpen(false)
      setForm({
        type: 'expense', date: new Date().toISOString().split('T')[0],
        description: '', category: 'Otros gastos', amount: '', tax_rate: 21,
        payment_method: '', notes: '', generateJournalEntry: false,
      })
      load()
    } else {
      toast.error('Error al guardar')
    }
    setSaving(false)
  }

  const handleDelete = async (id: string) => {
    if (!confirm('¿Eliminar este movimiento?')) return
    const r = await deleteManualTransaction({ id })
    if (r.success) { toast.success('Movimiento eliminado'); load() }
    else toast.error('Error al eliminar')
  }

  const handleEditSave = async () => {
    if (!editRow) return
    if (!editRow.total || editRow.total <= 0) { toast.error('El importe debe ser mayor que 0'); return }
    setEditSaving(true)
    const r = await updateManualTransaction(editRow)
    setEditSaving(false)
    if (r.success) {
      toast.success('Movimiento actualizado')
      setEditRow(null)
      load()
    } else {
      toast.error('Error al guardar')
    }
  }

  const storeOptions = useMemo(() => {
    const names = new Set(rows.map(r => r.storeName).filter((n): n is string => Boolean(n)))
    return Array.from(names).sort()
  }, [rows])

  const filteredRows = filterStore ? rows.filter(r => r.storeName === filterStore) : rows

  const totalIngresos = filteredRows.filter(r => r.type === 'income').reduce((s, r) => s + r.total, 0)
  const totalGastos   = filteredRows.filter(r => r.type === 'expense').reduce((s, r) => s + r.total, 0)
  const resultado     = totalIngresos - totalGastos

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Se muestran todos los movimientos con impacto contable: tickets (TPV), facturas emitidas, compras a proveedores, pedidos online y movimientos manuales. Filtra por tipo, año y mes.
      </p>
      {/* Filters */}
      <div className="flex flex-wrap gap-2 items-center">
        <Select value={filterType} onValueChange={v => setFilterType(v as 'all' | 'income' | 'expense')}>
          <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos</SelectItem>
            <SelectItem value="income">Ingresos</SelectItem>
            <SelectItem value="expense">Gastos</SelectItem>
          </SelectContent>
        </Select>
        <Select value={String(filterMonth)} onValueChange={v => setFilterMonth(Number(v))}>
          <SelectTrigger className="w-40"><SelectValue placeholder="Todos los meses" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="0">Todos los meses</SelectItem>
            {MONTHS_OPT.map((m, i) => <SelectItem key={i + 1} value={String(i + 1)}>{m}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={String(filterYear)} onValueChange={v => setFilterYear(Number(v))}>
          <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
          <SelectContent>{years.map(y => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}</SelectContent>
        </Select>
        <Select value={filterStore || '__all__'} onValueChange={v => setFilterStore(v === '__all__' ? '' : v)}>
          <SelectTrigger className="w-44"><SelectValue placeholder="Tienda" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">Todas las tiendas</SelectItem>
            {storeOptions.map(name => (
              <SelectItem key={name} value={name}>{name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="flex-1" />
        <Button onClick={() => setDialogOpen(true)}><Plus className="h-4 w-4 mr-1" /> Nuevo movimiento</Button>
      </div>

      {loading ? <Spinner /> : (
        <>
          <div className="rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Fecha</TableHead>
                  <TableHead>Origen</TableHead>
                  <TableHead>Descripción</TableHead>
                  <TableHead>Categoría</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead className="text-right">Base</TableHead>
                  <TableHead className="text-right">IVA</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead className="w-24">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredRows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={9} className="text-center py-12 text-muted-foreground">
                      Sin movimientos para el periodo seleccionado
                    </TableCell>
                  </TableRow>
                ) : filteredRows.map(r => (
                  <TableRow key={r.isManual ? `manual-${r.id}` : `je-${r.id}`}>
                    <TableCell className="text-muted-foreground whitespace-nowrap">{formatDate(r.date)}</TableCell>
                    <TableCell>
                      <span className="text-xs font-medium text-muted-foreground whitespace-nowrap">{r.sourceLabel}</span>
                      {r.storeName && <div className="text-xs text-muted-foreground">{r.storeName}</div>}
                    </TableCell>
                    <TableCell className="font-medium max-w-[200px] truncate">{r.description}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{r.category ?? '—'}</TableCell>
                    <TableCell>
                      <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                        r.type === 'income' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                      }`}>
                        {r.type === 'income' ? 'Ingreso' : 'Gasto'}
                      </span>
                    </TableCell>
                    <TableCell className="text-right">
                      {r.tax_amount != null && r.tax_amount > 0 ? formatCurrency(r.amount) : (r.isManual ? formatCurrency(r.amount) : '—')}
                    </TableCell>
                    <TableCell className="text-right text-muted-foreground">
                      {r.tax_amount != null && r.tax_amount > 0 ? `${formatCurrency(r.tax_amount)}` : '—'}
                    </TableCell>
                    <TableCell className={`text-right font-semibold ${r.type === 'income' ? 'text-green-700' : 'text-red-700'}`}>
                      {formatCurrency(r.total)}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        {(r.source === 'sale' || r.source === 'invoice') && r.referenceId && (
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-7 w-7"
                            title={r.source === 'sale' ? 'Ver tickets' : 'Ver facturas'}
                            onClick={() => window.open(r.source === 'invoice' ? '/admin/contabilidad' : '/admin/tickets', '_self')}
                          >
                            <ExternalLink className="h-3.5 w-3.5" />
                          </Button>
                        )}
                        {r.isManual && (
                          <>
                            <Button
                              size="icon" variant="ghost" className="h-7 w-7"
                              title="Editar movimiento"
                              onClick={() => setEditRow({ id: r.id, total: r.total, payment_method: 'cash' })}
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                            <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => handleDelete(r.id)}>
                              <Trash2 className="h-3.5 w-3.5 text-red-500" />
                            </Button>
                          </>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {/* Totals footer */}
          <div className="grid grid-cols-3 gap-4">
            <Card>
              <CardContent className="pt-4 pb-3">
                <p className="text-xs text-muted-foreground">Total ingresos</p>
                <p className="text-xl font-bold text-green-600">{formatCurrency(totalIngresos)}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4 pb-3">
                <p className="text-xs text-muted-foreground">Total gastos</p>
                <p className="text-xl font-bold text-red-600">{formatCurrency(totalGastos)}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4 pb-3">
                <p className="text-xs text-muted-foreground">Resultado</p>
                <p className={`text-xl font-bold ${resultado >= 0 ? 'text-green-600' : 'text-red-600'}`}>{formatCurrency(resultado)}</p>
              </CardContent>
            </Card>
          </div>
        </>
      )}

      {/* Diálogo editar movimiento */}
      <Dialog open={editRow !== null} onOpenChange={(open) => { if (!open) setEditRow(null) }}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Editar movimiento</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium mb-1 block">Importe total (€)</label>
              <input
                type="number"
                min={0.01}
                step="0.01"
                className="w-full border rounded px-3 py-2 text-sm"
                value={editRow?.total ?? ''}
                onChange={(e) => setEditRow(prev => prev ? { ...prev, total: Number(e.target.value) } : null)}
              />
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">Forma de pago</label>
              <select
                className="w-full border rounded px-3 py-2 text-sm"
                value={editRow?.payment_method ?? 'cash'}
                onChange={(e) => setEditRow(prev => prev ? { ...prev, payment_method: e.target.value } : null)}
              >
                <option value="cash">Efectivo</option>
                <option value="card">Tarjeta</option>
                <option value="bizum">Bizum</option>
                <option value="transfer">Transferencia</option>
              </select>
            </div>
          </div>
          <DialogFooter className="mt-4">
            <Button variant="outline" onClick={() => setEditRow(null)} disabled={editSaving}>Cancelar</Button>
            <Button onClick={handleEditSave} disabled={editSaving}>
              {editSaving && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              Guardar cambios
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Nuevo movimiento</DialogTitle></DialogHeader>
          <div className="space-y-4">
            {/* Type selector */}
            <div className="grid grid-cols-2 gap-2">
              {(['income', 'expense'] as const).map(t => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setForm(f => ({
                    ...f, type: t,
                    category: t === 'income' ? 'Ventas directas' : 'Otros gastos',
                  }))}
                  className={`py-3 rounded-lg border-2 text-sm font-medium transition-colors ${
                    form.type === t
                      ? t === 'income' ? 'border-green-500 bg-green-50 text-green-700' : 'border-red-500 bg-red-50 text-red-700'
                      : 'border-border text-muted-foreground hover:border-muted-foreground'
                  }`}
                >
                  {t === 'income' ? '↑ Ingreso' : '↓ Gasto'}
                </button>
              ))}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Fecha *</Label>
                <DatePickerPopover value={form.date} onChange={date => setForm(f => ({ ...f, date }))} />
              </div>
              <div className="space-y-1">
                <Label>IVA %</Label>
                <Select value={String(form.tax_rate)} onValueChange={v => setForm(f => ({ ...f, tax_rate: Number(v) }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{TAX_RATES.map(r => <SelectItem key={r} value={String(r)}>{r}%</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-1">
              <Label>Descripción *</Label>
              <Input value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="Concepto del movimiento" />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Importe base (€) *</Label>
                <Input
                  type="number" min={0} step={0.01}
                  value={form.amount}
                  onChange={e => setForm(f => ({ ...f, amount: e.target.value }))}
                  placeholder="0,00"
                />
              </div>
              <div className="space-y-1">
                <Label>Total con IVA</Label>
                <div className="h-10 flex items-center px-3 rounded-md border bg-muted/50 text-sm font-semibold">
                  {formatCurrency(total)}
                </div>
              </div>
            </div>

            <div className="space-y-1">
              <Label>Categoría</Label>
              <Select value={form.category} onValueChange={v => setForm(f => ({ ...f, category: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(form.type === 'income' ? INCOME_CATEGORIES : EXPENSE_CATEGORIES).map(c => (
                    <SelectItem key={c} value={c}>{c}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <Label>Forma de pago</Label>
              <Select value={form.payment_method} onValueChange={v => setForm(f => ({ ...f, payment_method: v }))}>
                <SelectTrigger><SelectValue placeholder="Sin especificar" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="">Sin especificar</SelectItem>
                  <SelectItem value="cash">Efectivo</SelectItem>
                  <SelectItem value="card">Tarjeta</SelectItem>
                  <SelectItem value="bizum">Bizum</SelectItem>
                  <SelectItem value="transfer">Transferencia</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <Label>Notas</Label>
              <Textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} rows={2} placeholder="Observaciones opcionales" />
            </div>

            <div className="flex items-center gap-3 py-1">
              <Switch
                id="gen-journal"
                checked={form.generateJournalEntry}
                onCheckedChange={v => setForm(f => ({ ...f, generateJournalEntry: v }))}
              />
              <Label htmlFor="gen-journal" className="cursor-pointer text-sm">
                Generar asiento contable automáticamente
              </Label>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving && <Loader2 className="h-4 w-4 animate-spin mr-1" />} Guardar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

// ─── Tab: Resúmenes de Caja ─────────────────────────────────────────────────

function CajaSessionsTab() {
  const supabase = useMemo(() => createClient(), [])
  const [vista, setVista] = useState<'list' | 'detail'>('list')
  const [selectedSession, setSelectedSession] = useState<any | null>(null)
  const [sessions, setSessions] = useState<any[]>([])
  const [cobrosBySession, setCobrosBySession] = useState<Record<string, number>>({})
  const [loading, setLoading] = useState(true)
  const [expandedMonths, setExpandedMonths] = useState<Set<string>>(new Set())
  const [timelineEvents, setTimelineEvents] = useState<any[]>([])
  const [detailLoading, setDetailLoading] = useState(false)
  const [detailTotalCobrosSastreria, setDetailTotalCobrosSastreria] = useState<number>(0)

  const MONTH_NAMES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre']

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      setLoading(true)
      const { data: sessData, error } = await supabase
        .from('cash_sessions')
        .select('*, opened_by_profile:profiles!cash_sessions_opened_by_fkey(full_name), closed_by_profile:profiles!cash_sessions_closed_by_fkey(full_name), stores(name)')
        .order('opened_at', { ascending: false })
        .limit(100)
      if (cancelled) return
      if (error) {
        toast.error('Error al cargar sesiones de caja')
        setSessions([])
        setLoading(false)
        return
      }
      const list = sessData ?? []
      setSessions(list)
      if (list.length > 0) {
        const ids = list.map((s: any) => s.id).filter(Boolean)
        const { data: topSums } = await supabase
          .from('tailoring_order_payments')
          .select('cash_session_id, amount')
          .in('cash_session_id', ids)
        const bySession: Record<string, number> = {}
        for (const row of topSums ?? []) {
          const id = row.cash_session_id
          if (id) bySession[id] = (bySession[id] ?? 0) + Number(row.amount ?? 0)
        }
        const zeroSessions = list.filter((s: any) => (bySession[s.id] ?? 0) === 0)
        if (zeroSessions.length > 0) {
          const openedDates = zeroSessions.map((s: any) => s.opened_at ? s.opened_at.split('T')[0] : null).filter(Boolean)
          const closedDates = zeroSessions.map((s: any) => s.closed_at ? s.closed_at.split('T')[0] : new Date().toISOString().split('T')[0])
          const minDate = openedDates.length ? openedDates.reduce((a: string, b: string) => a < b ? a : b) : null
          const maxDate = closedDates.reduce((a: string, b: string) => a > b ? a : b)
          if (minDate) {
            const { data: fallbackRows } = await supabase
              .from('tailoring_order_payments')
              .select('payment_date, amount')
              .gte('payment_date', minDate)
              .lte('payment_date', maxDate)
            for (const s of zeroSessions) {
              const openedDate = s.opened_at ? s.opened_at.split('T')[0] : null
              const closedDate = s.closed_at ? s.closed_at.split('T')[0] : new Date().toISOString().split('T')[0]
              if (!openedDate) continue
              const sum2 = (fallbackRows ?? []).reduce((acc: number, r: any) => {
                const d = r.payment_date
                if (d >= openedDate && d <= closedDate) return acc + Number(r.amount ?? 0)
                return acc
              }, 0)
              bySession[s.id] = Math.max(bySession[s.id] ?? 0, sum2)
            }
          }
        }
        if (!cancelled) setCobrosBySession(bySession)
      }
      setLoading(false)
    }
    load()
    return () => { cancelled = true }
  }, [supabase])

  const sessionsByMonth = useMemo(() => {
    const map: Record<string, any[]> = {}
    for (const s of sessions) {
      const d = s.opened_at ? new Date(s.opened_at) : new Date()
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
      if (!map[key]) map[key] = []
      map[key].push(s)
    }
    const keys = Object.keys(map).sort().reverse()
    return { keys, map }
  }, [sessions])

  const loadDetail = useCallback(async (session: any) => {
    setSelectedSession(session)
    setVista('detail')
    setDetailLoading(true)
    const openedDate = session.opened_at ? session.opened_at.split('T')[0] : null
    const openedAtFull = session.opened_at
    const closedAtFull = session.closed_at ?? new Date().toISOString()

    let txData: any[] = []
    const { data: mtRes } = await supabase
      .from('manual_transactions')
      .select('id, type, description, category, amount, total, notes, created_at, created_by, cash_session_id')
      .eq('cash_session_id', session.id)
      .order('created_at', { ascending: true })
    if (!mtRes) {
      txData = []
    } else {
      txData = mtRes
    }

    const wdRes = await supabase
      .from('cash_withdrawals')
      .select('id, amount, reason, withdrawn_at, withdrawn_by, cash_session_id')
      .eq('cash_session_id', session.id)
      .order('withdrawn_at', { ascending: true })
    const wdData = wdRes.data ?? []

    const apertura = {
      type: 'apertura',
      ts: session.opened_at,
      data: {
        description: 'Apertura de caja',
        profiles: { full_name: session.opened_by_profile?.full_name },
        creator: { full_name: session.opened_by_profile?.full_name },
        total: session.opening_amount,
        type: 'income',
        category: 'caja',
      },
    }
    const cierre = session.closed_at ? {
      type: 'cierre',
      ts: session.closed_at,
      data: {
        description: 'Cierre de caja',
        profiles: { full_name: session.closed_by_profile?.full_name },
        creator: { full_name: session.closed_by_profile?.full_name },
      },
    } : null

    const manual = txData.map((r: any) => ({ type: 'manual', ts: r.created_at, data: r }))
    const withdrawals = wdData.map((r: any) => ({ type: 'withdrawal', ts: r.withdrawn_at, data: r }))
    const merged = [apertura, ...manual, ...withdrawals, ...(cierre ? [cierre] : [])].sort(
      (a, b) => new Date(a.ts).getTime() - new Date(b.ts).getTime()
    )
    setTimelineEvents(merged)

    const sumBySession = txData
      .filter((r: any) => r.category === 'sastreria')
      .reduce((acc: number, r: any) => acc + Number(r.total ?? 0), 0)
    if (sumBySession > 0) {
      setDetailTotalCobrosSastreria(sumBySession)
    } else if (openedDate) {
      const { data: mtSastreriaRange } = await supabase
        .from('manual_transactions')
        .select('total')
        .eq('category', 'sastreria')
        .gte('created_at', openedAtFull)
        .lte('created_at', closedAtFull)
      const fallbackSum = (mtSastreriaRange ?? []).reduce((acc: number, r: any) => acc + Number(r.total ?? 0), 0)
      setDetailTotalCobrosSastreria(fallbackSum)
    } else {
      setDetailTotalCobrosSastreria(0)
    }

    setDetailLoading(false)
  }, [supabase])

  const toggleMonth = (key: string) => {
    setExpandedMonths(prev => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  const formatDateTime = (iso: string | null) => {
    if (!iso) return '—'
    const d = new Date(iso)
    return d.toLocaleString('es-ES', { dateStyle: 'short', timeStyle: 'short' })
  }

  const formatTime = (iso: string | null) => {
    if (!iso) return '—'
    return new Date(iso).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })
  }

  if (loading) return <Spinner />

  if (vista === 'detail' && selectedSession) {
    const s = selectedSession
    const openedAt = s.opened_at ? new Date(s.opened_at) : null
    const dateLong = openedAt ? (() => { const s = openedAt.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }); return s.charAt(0).toUpperCase() + s.slice(1); })() : '—'
    const openedBy = s.opened_by_profile?.full_name ?? '—'
    const closedBy = s.closed_by_profile?.full_name ?? '—'
    const openedTime = s.opened_at ? new Date(s.opened_at).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' }) : '—'
    const closedTime = s.closed_at ? new Date(s.closed_at).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' }) : null
    const openingAmount = Number(s.opening_amount) ?? 0

    const totalCobrosSastreria = detailTotalCobrosSastreria
    const totalVentasTpv = Number(s.total_sales) ?? 0
    const totalRetiradas = Number(s.total_withdrawals) ?? 0
    const totalCashSales = Number(s.total_cash_sales) ?? 0
    const efectivoIngresosTimeline = timelineEvents
      .filter((ev: any) => ev.type === 'manual' && ev.data?.type === 'income' && (ev.data?.notes?.toLowerCase().includes('efectivo') ?? false))
      .reduce((sum: number, ev: any) => sum + Number(ev.data?.total ?? 0), 0)
    const efectivoEnCaja = openingAmount + efectivoIngresosTimeline - totalRetiradas
    const expectedCash = openingAmount + totalCashSales - totalRetiradas
    const countedCash = s.counted_cash != null ? Number(s.counted_cash) : null
    const diff = countedCash != null ? countedCash - expectedCash : null
    const totalEntradas = totalVentasTpv + totalCobrosSastreria

    const formatMethod = (notes: string | null) => {
      if (!notes) return null
      const m = notes.match(/(?:Método|método):\s*(\S+)/i) || notes.match(/(efectivo|tarjeta|bizum|transferencia|cash|card)/i)
      if (m) return m[1].toLowerCase()
      return notes.length > 40 ? notes.slice(0, 40) + '…' : notes
    }

    return (
      <div className="space-y-4">
        <Button variant="outline" size="sm" onClick={() => { setVista('list'); setSelectedSession(null); setTimelineEvents([]); setDetailTotalCobrosSastreria(0) }}>
          ← Volver al listado
        </Button>

        <Card>
          <CardContent className="pt-6 pb-6">
            <h2 className="text-lg font-semibold mb-3">Caja del {dateLong}</h2>
            <p className="text-sm text-muted-foreground flex items-center gap-2">
              <span>🔓</span> Abierta a las {openedTime} por {openedBy} · Fondo inicial: {formatCurrency(openingAmount)}
            </p>
            <p className="text-sm text-muted-foreground flex items-center gap-2 mt-1">
              <span>🔒</span>
              {s.status === 'open' ? (
                <Badge variant="secondary" className="text-xs">EN CURSO</Badge>
              ) : (
                <>Cerrada a las {closedTime ?? '—'} por {closedBy}</>
              )}
            </p>
          </CardContent>
        </Card>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Movimientos</CardTitle>
              </CardHeader>
              <CardContent>
                {detailLoading ? (
                  <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
                ) : timelineEvents.length === 0 ? (
                  <p className="text-center text-muted-foreground py-8">Sin movimientos</p>
                ) : (
                  <div className="divide-y divide-border">
                    {timelineEvents.map((ev, i) => {
                      const isManual = ev.type === 'manual'
                      const isAperturaEv = ev.type === 'apertura'
                      const isCierreEv = ev.type === 'cierre'
                      const d = ev.data
                      const ts = ev.ts
                      const who = d?.creator?.full_name ?? d?.profiles?.full_name ?? d?.created_by ?? ''
                      const desc = isAperturaEv ? 'Apertura de caja' : isCierreEv ? 'Cierre de caja' : isManual ? (d?.description ?? '—') : (d?.reason ?? 'Retirada')
                      const amount = Number(isManual ? d?.total : d?.amount) ?? (isAperturaEv ? Number(d?.total ?? 0) : 0)
                      const isIncome = isManual && d?.type === 'income'
                      const category = d?.category ?? ''
                      const isApertura = isAperturaEv || (isManual && (desc.includes('Apertura') || (category === 'caja' && !desc.includes('Cierre'))))
                      const isCierre = isCierreEv || (isManual && (desc.includes('Cierre') || (category === 'caja' && desc.includes('Cierre'))))
                      const isRetirada = ev.type === 'withdrawal' || (isManual && d?.type === 'expense')
                      const isCobroTpv = isManual && category === 'tpv'
                      const isCobroSastreria = isManual && category === 'sastreria'
                      const isCobro = isCobroTpv || isCobroSastreria

                      let icon = '•'
                      let textClass = 'text-foreground'
                      let amountClass = 'text-muted-foreground'
                      if (isApertura) {
                        icon = '🔓'
                        textClass = 'text-muted-foreground'
                        amountClass = 'text-muted-foreground'
                      } else if (isCierre) {
                        icon = '🔒'
                        textClass = 'text-muted-foreground'
                        amountClass = 'text-muted-foreground'
                      } else if (isCobroTpv) {
                        icon = '💳'
                        amountClass = 'text-green-600'
                      } else if (isCobroSastreria) {
                        icon = '🧵'
                        amountClass = 'text-green-600'
                      } else if (isRetirada) {
                        icon = '💸'
                        textClass = 'text-red-600'
                        amountClass = 'text-red-600'
                      }

                      const methodLabel = formatMethod(d?.notes)
                      return (
                        <div key={ev.type + (d?.id ?? '') + i} className="py-3 first:pt-0">
                          <div className="flex items-start gap-3">
                            <span className="text-sm text-muted-foreground w-12 shrink-0 tabular-nums">{formatTime(ts)}</span>
                            <span className="text-lg shrink-0">{icon}</span>
                            <div className="min-w-0 flex-1">
                              <p className={`text-sm font-medium ${textClass}`}>{desc}</p>
                              <p className="text-xs text-muted-foreground mt-0.5">{who}</p>
                              {isRetirada && (d?.reason || (isManual && d?.description)) && <p className="text-xs text-red-600/80 mt-0.5">{d?.reason || d?.description}</p>}
                              {isCobro && methodLabel && <p className="text-xs text-muted-foreground mt-0.5">Método: {methodLabel}</p>}
                            </div>
                            <span className={`text-sm font-medium tabular-nums shrink-0 ${amountClass}`}>
                              {isCierre ? '—' : isApertura ? (Number(s.opening_amount || 0).toFixed(2) + ' €') : (isRetirada ? '-' : isIncome ? '+' : '') + formatCurrency(amount)}
                            </span>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          <div className="lg:col-span-1">
            <div className="sticky top-4 space-y-4">
              <Card>
                <CardContent className="pt-4 pb-4">
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">Efectivo en caja</p>
                  <p className="text-2xl font-bold tabular-nums">{formatCurrency(efectivoEnCaja)}</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-4 pb-4 space-y-2">
                  <div className="flex justify-between text-sm"><span className="text-muted-foreground">Tarjeta</span><span className="tabular-nums">{formatCurrency(Number(s.total_card_sales) ?? 0)}</span></div>
                  <div className="flex justify-between text-sm"><span className="text-muted-foreground">Bizum</span><span className="tabular-nums">{formatCurrency(Number(s.total_bizum_sales) ?? 0)}</span></div>
                  <div className="flex justify-between text-sm"><span className="text-muted-foreground">Transfer.</span><span className="tabular-nums">{formatCurrency(Number(s.total_transfer_sales) ?? 0)}</span></div>
                  <div className="border-t pt-2 mt-2 flex justify-between text-sm font-medium"><span className="text-muted-foreground">Total entradas</span><span className="tabular-nums">{formatCurrency(totalEntradas)}</span></div>
                  <div className="flex justify-between text-sm"><span className="text-muted-foreground">Total retiradas</span><span className="tabular-nums text-red-600">{formatCurrency(totalRetiradas)}</span></div>
                </CardContent>
              </Card>
              {s.status === 'closed' && (
                <Card>
                  <CardContent className="pt-4 pb-4">
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-3">Cierre</p>
                    <div className="space-y-2">
                      <div className="flex justify-between text-sm"><span className="text-muted-foreground">Esperado</span><span className="tabular-nums">{formatCurrency(expectedCash)}</span></div>
                      <div className="flex justify-between text-sm"><span className="text-muted-foreground">Contado</span><span className="tabular-nums">{formatCurrency(countedCash ?? 0)}</span></div>
                      <div className="flex justify-between text-sm font-medium pt-2 border-t">
                        <span className="text-muted-foreground">Descuadre</span>
                        <span className={`tabular-nums ${diff === 0 ? 'text-green-600' : 'text-red-600'}`}>{formatCurrency(diff ?? 0)}</span>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Sesiones de caja</CardTitle>
          <p className="text-sm text-muted-foreground">Agrupadas por mes. Clic en un mes para expandir/colapsar. Clic en una fila para ver el detalle.</p>
        </CardHeader>
        <CardContent>
          {sessionsByMonth.keys.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">Sin sesiones</p>
          ) : (
            <div className="space-y-4">
              {sessionsByMonth.keys.map(monthKey => {
                const [y, m] = monthKey.split('-')
                const monthLabel = `${MONTH_NAMES[parseInt(m, 10) - 1]} ${y}`
                const list = sessionsByMonth.map[monthKey] ?? []
                const totalVentasMes = list.reduce((s, sess) => s + (Number(sess.total_sales) ?? 0), 0)
                const totalCobrosMes = list.reduce((s, sess) => s + (cobrosBySession[sess.id] ?? 0), 0)
                const isExpanded = expandedMonths.has(monthKey)
                return (
                  <div key={monthKey} className="rounded-lg border">
                    <button
                      type="button"
                      className="w-full flex items-center justify-between p-4 text-left hover:bg-muted/50 transition-colors"
                      onClick={() => toggleMonth(monthKey)}
                    >
                      <span className="font-medium">{monthLabel}</span>
                      <span className="flex items-center gap-3 text-sm text-muted-foreground">
                        <span>Ventas TPV: {formatCurrency(totalVentasMes)}</span>
                        <span>·</span>
                        <span>Sastrería: {formatCurrency(totalCobrosMes)}</span>
                        {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                      </span>
                    </button>
                    {isExpanded && (
                      <div className="border-t overflow-x-auto">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Fecha</TableHead>
                              <TableHead>Hora apertura</TableHead>
                              <TableHead>Abrió</TableHead>
                              <TableHead>Hora cierre</TableHead>
                              <TableHead>Cerró</TableHead>
                              <TableHead className="text-right">Total entrada</TableHead>
                              <TableHead>Estado</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {list.map((s: any) => {
                              const openedBy = s.opened_by_profile?.full_name ?? '—'
                              const closedBy = s.closed_by_profile?.full_name ?? '—'
                              const cobrosSastreria = cobrosBySession[s.id] ?? 0
                              const totalSales = Number(s.total_sales) ?? 0
                              const totalEntrada = totalSales + cobrosSastreria
                              const horaApertura = s.opened_at ? new Date(s.opened_at).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' }) : '—'
                              const horaCierre = s.closed_at ? new Date(s.closed_at).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' }) : '—'
                              return (
                                <TableRow
                                  key={s.id}
                                  className="cursor-pointer hover:bg-muted/50"
                                  onClick={() => loadDetail(s)}
                                >
                                  <TableCell className="text-sm text-muted-foreground">{s.opened_at ? formatDate(s.opened_at.split('T')[0]) : '—'}</TableCell>
                                  <TableCell className="text-sm tabular-nums">{horaApertura}</TableCell>
                                  <TableCell className="text-sm">{openedBy}</TableCell>
                                  <TableCell className="text-sm tabular-nums">{horaCierre}</TableCell>
                                  <TableCell className="text-sm">{closedBy}</TableCell>
                                  <TableCell className="text-right font-medium tabular-nums">{formatCurrency(totalEntrada)}</TableCell>
                                  <TableCell>
                                    <Badge variant={s.status === 'open' ? 'default' : 'secondary'} className="text-xs">
                                      {s.status === 'open' ? 'Abierta' : 'Cerrada'}
                                    </Badge>
                                  </TableCell>
                                </TableRow>
                              )
                            })}
                          </TableBody>
                        </Table>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

// ─── Shared Components ───────────────────────────────────────────────────────

function Spinner() {
  return (
    <div className="space-y-4 py-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="rounded-lg border p-4 space-y-2">
            <div className="h-3 w-20 rounded bg-muted animate-pulse" />
            <div className="h-7 w-24 rounded bg-muted animate-pulse" />
          </div>
        ))}
      </div>
      <div className="rounded-lg border divide-y">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="flex items-center gap-4 px-4 py-3">
            <div className="h-4 w-24 rounded bg-muted animate-pulse" />
            <div className="h-4 flex-1 rounded bg-muted animate-pulse" />
            <div className="h-4 w-20 rounded bg-muted animate-pulse" />
            <div className="h-4 w-20 rounded bg-muted animate-pulse" />
          </div>
        ))}
      </div>
    </div>
  )
}

function KpiCard({ label, value, positive, neutral }: { label: string; value: number; positive?: boolean; neutral?: boolean }) {
  const colorClass = neutral ? '' : positive ? 'text-green-600' : 'text-red-600'
  const Icon = neutral ? Euro : positive ? TrendingUp : TrendingDown
  return (
    <Card>
      <CardContent className="pt-4 pb-3">
        <div className="flex items-center justify-between mb-1">
          <p className="text-xs text-muted-foreground leading-tight">{label}</p>
          <Icon className={`h-4 w-4 ${neutral ? 'text-muted-foreground' : colorClass}`} />
        </div>
        <p className={`text-xl font-bold ${colorClass}`}>{formatCurrency(value)}</p>
      </CardContent>
    </Card>
  )
}

function StatusBadge({ status, map }: { status: string; map: Record<string, { label: string; className: string }> }) {
  const s = map[status] ?? { label: status, className: 'bg-gray-100 text-gray-700' }
  return <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${s.className}`}>{s.label}</span>
}
