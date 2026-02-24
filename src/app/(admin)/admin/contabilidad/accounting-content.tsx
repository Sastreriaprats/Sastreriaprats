'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
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
} from 'lucide-react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts'
import { formatCurrency, formatDate } from '@/lib/utils'
import { toast } from 'sonner'
import {
  getAccountingSummary, getInvoices, getEstimates,
  getJournalEntries, getVatQuarterly, getClientsForInvoice,
  getManualTransactions, createManualTransaction, deleteManualTransaction,
  createInvoiceAction, updateInvoiceAction, issueInvoiceAction,
  createEstimateAction,
  getInvoiceLinesAction, updateJournalEntryDescriptionAction,
  generateInvoicePdfAction, generateEstimatePdfAction,
  type InvoiceRow, type EstimateRow, type JournalEntryRow, type VatQuarterRow,
  type ManualTransaction, type AccountingSummary,
} from '@/actions/accounting'
import { createInvoiceJournalEntry } from '@/actions/accounting-triggers'
import { Pencil, Calendar } from 'lucide-react'

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
        </TabsList>
        <div className="mt-6">
          <TabsContent value="resumen">      <SummaryTab /></TabsContent>
          <TabsContent value="facturas">     <InvoicesTab /></TabsContent>
          <TabsContent value="presupuestos"> <EstimatesTab /></TabsContent>
          <TabsContent value="movimientos">  <MovimientosTab /></TabsContent>
          <TabsContent value="asientos">     <JournalTab /></TabsContent>
          <TabsContent value="iva">          <VatTab /></TabsContent>
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
    getAccountingSummary({ year }).then(r => {
      setData(r.success && 'data' in r ? r.data : null)
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
          getAccountingSummary({ year }).then(r => { setData(r.success && 'data' in r ? r.data : null); setLoading(false) })
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
              <Input type="date" className="w-36 h-9" value={customDateFrom} onChange={e => setCustomDateFrom(e.target.value)} />
            </div>
            <div className="flex items-center gap-1">
              <Label className="text-xs text-muted-foreground whitespace-nowrap">Hasta</Label>
              <Input type="date" className="w-36 h-9" value={customDateTo} onChange={e => setCustomDateTo(e.target.value)} />
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
                  <Input type="date" value={form.invoice_date} onChange={e => setForm(f => ({ ...f, invoice_date: e.target.value }))} className="h-9" />
                </div>
                <div className="space-y-1">
                  <Label>Fecha vencimiento</Label>
                  <div className="flex flex-wrap gap-2 items-center">
                    <Input type="date" value={form.due_date} onChange={e => setForm(f => ({ ...f, due_date: e.target.value }))} className="h-9 w-full sm:w-40" />
                    <span className="text-xs text-muted-foreground">Rápido:</span>
                    <Button type="button" size="sm" variant="outline" className="h-8 text-xs" onClick={() => setForm(f => ({ ...f, due_date: new Date().toISOString().slice(0, 10) }))}>Hoy</Button>
                    <Button type="button" size="sm" variant="outline" className="h-8 text-xs" onClick={() => setForm(f => ({ ...f, due_date: addDays(f.invoice_date, 15) }))}>+15 días</Button>
                    <Button type="button" size="sm" variant="outline" className="h-8 text-xs" onClick={() => setForm(f => ({ ...f, due_date: addDays(f.invoice_date, 30) }))}>+30 días</Button>
                  </div>
                </div>
                <div className="space-y-1">
                  <Label>IRPF %</Label>
                  <Input type="number" min={0} max={25} value={form.irpf_rate} onChange={e => setForm(f => ({ ...f, irpf_rate: Number(e.target.value) }))} />
                </div>
              </div>

              {/* Lines */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <Label className="text-sm font-semibold">Líneas</Label>
                  <Button size="sm" variant="outline" onClick={addLine}><Plus className="h-3.5 w-3.5 mr-1" /> Añadir línea</Button>
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
                  {form.irpf_rate > 0 && <div className="flex justify-between text-red-600"><span>IRPF ({form.irpf_rate}%)</span><span>-{formatCurrency(irpfAmount)}</span></div>}
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
    </div>
  )
}

function InvoiceTableRow({ inv, onRefresh }: { inv: InvoiceRow; onRefresh: () => void }) {
  const supabase = createClient()
  const [loadingPdf, setLoadingPdf] = useState(false)
  const [editOpen, setEditOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const s = INVOICE_STATUS[inv.status] ?? INVOICE_STATUS.draft

  // ── Estado del formulario de edición ──
  const [form, setForm] = useState({ client_id: '', client_name: inv.client_name, client_nif: '', invoice_date: inv.invoice_date, due_date: '', notes: '', irpf_rate: 0, tax_rate: 21 })
  const [lines, setLines] = useState<InvoiceLine[]>([])

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
    createInvoiceJournalEntry(inv.id).catch(e => console.error('Journal entry error:', e))
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
      a.download = `factura-${inv.invoice_number}.pdf`; a.click(); URL.revokeObjectURL(a.href)
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
                  <Input type="date" value={form.invoice_date} onChange={e => setForm(f => ({ ...f, invoice_date: e.target.value }))} className="h-9" />
                </div>
                <div className="space-y-1">
                  <Label>Fecha vencimiento</Label>
                  <div className="flex flex-wrap gap-2 items-center">
                    <Input type="date" value={form.due_date} onChange={e => setForm(f => ({ ...f, due_date: e.target.value }))} className="h-9 w-full sm:w-40" />
                    <span className="text-xs text-muted-foreground">Rápido:</span>
                    <Button type="button" size="sm" variant="outline" className="h-8 text-xs" onClick={() => setForm(f => ({ ...f, due_date: new Date().toISOString().slice(0, 10) }))}>Hoy</Button>
                    <Button type="button" size="sm" variant="outline" className="h-8 text-xs" onClick={() => setForm(f => ({ ...f, due_date: addDays(f.invoice_date, 15) }))}>+15 días</Button>
                    <Button type="button" size="sm" variant="outline" className="h-8 text-xs" onClick={() => setForm(f => ({ ...f, due_date: addDays(f.invoice_date, 30) }))}>+30 días</Button>
                  </div>
                </div>
                <div className="space-y-1">
                  <Label>IRPF %</Label>
                  <Input type="number" min={0} max={25} value={form.irpf_rate} onChange={e => setForm(f => ({ ...f, irpf_rate: Number(e.target.value) }))} />
                </div>
              </div>
              <div>
                <div className="flex items-center justify-between mb-2">
                  <Label className="font-semibold text-sm">Líneas</Label>
                  <Button size="sm" variant="outline" onClick={addLine}><Plus className="h-3.5 w-3.5 mr-1" /> Añadir</Button>
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
                  {form.irpf_rate > 0 && <div className="flex justify-between text-red-600"><span>IRPF ({form.irpf_rate}%)</span><span>-{formatCurrency(irpfAmount)}</span></div>}
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
    </>
  )
}

// ─── Tab: Presupuestos ───────────────────────────────────────────────────────

type EstimateLine = { description: string; quantity: number; unit_price: number; tax_rate: number }

function EstimateTableRow ({
  est,
  onRefresh,
  onConvertToInvoice,
}: {
  est: EstimateRow
  onRefresh: () => void
  onConvertToInvoice: (e: EstimateRow) => void
}) {
  const [loadingPdf, setLoadingPdf] = useState(false)
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

  return (
    <TableRow>
      <TableCell className="font-mono font-medium">{est.estimate_number}</TableCell>
      <TableCell>{est.client_name}</TableCell>
      <TableCell className="text-muted-foreground">{formatDate(est.estimate_date)}</TableCell>
      <TableCell className="text-muted-foreground">{est.valid_until ? formatDate(est.valid_until) : '-'}</TableCell>
      <TableCell className="text-right font-semibold">{formatCurrency(est.total)}</TableCell>
      <TableCell><span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${s.className}`}>{s.label}</span></TableCell>
      <TableCell>
        <div className="flex gap-1 items-center">
          <Button size="icon" variant="ghost" className="h-7 w-7" onClick={openPdf} disabled={loadingPdf} title="Ver PDF">
            {loadingPdf ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Eye className="h-3.5 w-3.5" />}
          </Button>
          {est.status === 'accepted' && !est.invoice_id && (
            <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => onConvertToInvoice(est)}>
              <FileText className="h-3.5 w-3.5 mr-1" /> Facturar
            </Button>
          )}
        </div>
      </TableCell>
    </TableRow>
  )
}

function EstimatesTab() {
  const [rows, setRows] = useState<EstimateRow[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('all')
  const [dialogOpen, setDialogOpen] = useState(false)
  const [clients, setClients] = useState<{ id: string; full_name: string }[]>([])
  const [saving, setSaving] = useState(false)

  const [form, setForm] = useState({
    client_id: '', client_name: '', client_nif: '',
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

  const subtotal = lines.reduce((s, l) => s + l.quantity * l.unit_price, 0)
  const taxAmount = lines.reduce((s, l) => s + l.quantity * l.unit_price * (l.tax_rate / 100), 0)
  const irpfAmount = subtotal * (form.irpf_rate / 100)
  const total = subtotal + taxAmount - irpfAmount

  const handleSave = async () => {
    if (!form.client_name) { toast.error('Indica el cliente'); return }
    if (lines.some(l => !l.description)) { toast.error('Todas las líneas necesitan descripción'); return }
    setSaving(true)
    try {
      const result = await createEstimateAction({
        client_id: form.client_id || null,
        client_name: form.client_name,
        client_nif: form.client_nif || null,
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
      setForm({ client_id: '', client_name: '', client_nif: '', estimate_date: new Date().toISOString().split('T')[0], valid_until: '', notes: '', irpf_rate: 0, tax_rate: 21 })
      load()
    } catch (error) {
      console.error('Error creating estimate:', error)
      toast.error(error instanceof Error ? error.message : 'Error desconocido al crear el presupuesto')
    } finally {
      setSaving(false)
    }
  }

  const convertToInvoice = async (est: EstimateRow) => {
    const supabase = createClient()
    const year = new Date().getFullYear()
    const { count } = await supabase.from('invoices').select('*', { count: 'exact', head: true }).like('invoice_number', `F${year}-%`)
    const seq = String((count ?? 0) + 1).padStart(4, '0')
    const invoice_number = `F${year}-${seq}`

    const { data: lines } = await supabase.from('estimate_lines').select('*').eq('estimate_id', est.id)

    const { data: inv, error } = await supabase.from('invoices').insert({
      invoice_number, invoice_series: 'F', invoice_type: 'issued',
      client_name: est.client_name,
      company_name: 'Sastrería Prats', company_nif: 'B12345678', company_address: 'Madrid, España',
      invoice_date: new Date().toISOString().split('T')[0],
      subtotal: est.total / 1.21, tax_rate: 21, tax_amount: est.total - est.total / 1.21,
      irpf_rate: 0, irpf_amount: 0,
      total: est.total, status: 'draft',
    }).select('id').single()

    if (error || !inv) { toast.error('Error al convertir'); return }

    if (lines?.length) {
      await supabase.from('invoice_lines').insert(
        lines.map((l: Record<string, unknown>, i: number) => ({
          invoice_id: inv.id,
          description: String(l.description),
          quantity: Number(l.quantity),
          unit_price: Number(l.unit_price),
          tax_rate: Number(l.tax_rate ?? 21),
          line_total: Number(l.total),
          sort_order: i,
        }))
      )
    }

    await supabase.from('estimates').update({ status: 'invoiced', invoice_id: inv.id, invoiced_at: new Date().toISOString() }).eq('id', est.id)

    createInvoiceJournalEntry(inv.id).catch(() => {})

    toast.success(`Factura ${invoice_number} creada desde presupuesto`)
    load()
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
                <EstimateTableRow key={est.id} est={est} onRefresh={load} onConvertToInvoice={convertToInvoice} />
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
                    setForm(f => ({ ...f, client_id: id, client_name: c?.full_name ?? '' }))
                  }}>
                    <SelectTrigger><SelectValue placeholder="Seleccionar cliente" /></SelectTrigger>
                    <SelectContent>{clients.map(c => <SelectItem key={c.id} value={c.id}>{c.full_name}</SelectItem>)}</SelectContent>
                  </Select>
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
                  <Input type="date" value={form.estimate_date} onChange={e => setForm(f => ({ ...f, estimate_date: e.target.value }))} className="h-9" />
                </div>
                <div className="space-y-1">
                  <Label>Válido hasta</Label>
                  <div className="flex flex-wrap gap-2 items-center">
                    <Input type="date" value={form.valid_until} onChange={e => setForm(f => ({ ...f, valid_until: e.target.value }))} className="h-9 w-full sm:w-40" />
                    <span className="text-xs text-muted-foreground">Rápido:</span>
                    <Button type="button" size="sm" variant="outline" className="h-8 text-xs" onClick={() => setForm(f => ({ ...f, valid_until: new Date().toISOString().slice(0, 10) }))}>Hoy</Button>
                    <Button type="button" size="sm" variant="outline" className="h-8 text-xs" onClick={() => setForm(f => ({ ...f, valid_until: addDays(f.estimate_date, 15) }))}>+15 días</Button>
                    <Button type="button" size="sm" variant="outline" className="h-8 text-xs" onClick={() => setForm(f => ({ ...f, valid_until: addDays(f.estimate_date, 30) }))}>+30 días</Button>
                  </div>
                </div>
                <div className="space-y-1">
                  <Label>IRPF %</Label>
                  <Input type="number" min={0} max={25} value={form.irpf_rate} onChange={e => setForm(f => ({ ...f, irpf_rate: Number(e.target.value) }))} />
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-2">
                  <Label className="text-sm font-semibold">Líneas</Label>
                  <Button size="sm" variant="outline" onClick={addLine}><Plus className="h-3.5 w-3.5 mr-1" /> Añadir línea</Button>
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
                  {form.irpf_rate > 0 && <div className="flex justify-between text-red-600"><span>IRPF ({form.irpf_rate}%)</span><span>-{formatCurrency(irpfAmount)}</span></div>}
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
    getVatQuarterly({ year }).then(r => {
      if (r.success) { setQuarters(r.data.quarters); setTotRep(r.data.totalRepercutido); setTotSop(r.data.totalSoportado) }
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
  const [rows, setRows] = useState<ManualTransaction[]>([])
  const [loading, setLoading] = useState(true)
  const [filterType, setFilterType] = useState<'all' | 'income' | 'expense'>('all')
  const [filterYear, setFilterYear] = useState(new Date().getFullYear())
  const [filterMonth, setFilterMonth] = useState(0)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({
    type: 'expense' as 'income' | 'expense',
    date: new Date().toISOString().split('T')[0],
    description: '',
    category: 'Otros gastos',
    amount: '' as string | number,
    tax_rate: 21,
    notes: '',
    generateJournalEntry: false,
  })

  const years = Array.from({ length: 5 }, (_, i) => new Date().getFullYear() - i)

  const load = useCallback(async () => {
    setLoading(true)
    const r = await getManualTransactions({
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
    const r = await createManualTransaction({
      type: form.type,
      date: form.date,
      description: form.description.trim(),
      category: form.category,
      amount,
      tax_rate: form.tax_rate,
      notes: form.notes.trim() || undefined,
      generateJournalEntry: form.generateJournalEntry,
    })
    if (r.success) {
      toast.success('Movimiento guardado')
      setDialogOpen(false)
      setForm({
        type: 'expense', date: new Date().toISOString().split('T')[0],
        description: '', category: 'Otros gastos', amount: '', tax_rate: 21,
        notes: '', generateJournalEntry: false,
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

  const totalIngresos = rows.filter(r => r.type === 'income').reduce((s, r) => s + r.total, 0)
  const totalGastos   = rows.filter(r => r.type === 'expense').reduce((s, r) => s + r.total, 0)
  const resultado     = totalIngresos - totalGastos

  return (
    <div className="space-y-4">
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
                  <TableHead>Descripción</TableHead>
                  <TableHead>Categoría</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead className="text-right">Base</TableHead>
                  <TableHead className="text-right">IVA</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead className="w-20">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center py-12 text-muted-foreground">
                      Sin movimientos para el periodo seleccionado
                    </TableCell>
                  </TableRow>
                ) : rows.map(r => (
                  <TableRow key={r.id}>
                    <TableCell className="text-muted-foreground whitespace-nowrap">{formatDate(r.date)}</TableCell>
                    <TableCell className="font-medium max-w-[200px] truncate">{r.description}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{r.category}</TableCell>
                    <TableCell>
                      <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                        r.type === 'income' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                      }`}>
                        {r.type === 'income' ? 'Ingreso' : 'Gasto'}
                      </span>
                    </TableCell>
                    <TableCell className="text-right">{formatCurrency(r.amount)}</TableCell>
                    <TableCell className="text-right text-muted-foreground">
                      {r.tax_rate > 0 ? `${formatCurrency(r.tax_amount)} (${r.tax_rate}%)` : '-'}
                    </TableCell>
                    <TableCell className={`text-right font-semibold ${r.type === 'income' ? 'text-green-700' : 'text-red-700'}`}>
                      {formatCurrency(r.total)}
                    </TableCell>
                    <TableCell>
                      <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => handleDelete(r.id)}>
                        <Trash2 className="h-3.5 w-3.5 text-red-500" />
                      </Button>
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
                <Input type="date" value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} />
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
