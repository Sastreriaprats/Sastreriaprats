'use client'

import { useState, useEffect, useCallback, useMemo, Fragment } from 'react'
import { useSearchParams, useRouter, usePathname } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { DatePickerPopover } from '@/components/ui/date-picker-popover'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Switch } from '@/components/ui/switch'
import { PaymentMethodBadge } from '@/components/ui/payment-method-badge'
import { generateCashSessionReport } from '@/lib/pdf/cash-session-report'
import {
  TrendingUp, TrendingDown, Euro, Calculator, BookOpen, FileText,
  Loader2, Plus, Search, ChevronDown, ChevronRight, Eye,
  Send, CheckCircle, FileOutput, Trash2, RefreshCw, ArrowUpCircle, Download,
  Receipt, ExternalLink, Package, ClipboardList, Pencil, Calendar, XCircle, Store,
  Check, ChevronsUpDown, Building2, User, MoreHorizontal, Ban,
  FileSpreadsheet, AlertTriangle, Lock,
} from 'lucide-react'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts'
import { formatCurrency, formatDate, cn, normalizeSearchTerm } from '@/lib/utils'
import { formatClientAddress } from '@/lib/clients/format'
import { downloadExcel, downloadExcelMulti } from '@/lib/excel/export'
import { toast } from 'sonner'
import { usePermissions } from '@/hooks/use-permissions'
import { updateWithdrawal, deleteWithdrawal, updateCashSessionClose, updateCashSessionOpening, reopenCashSession, deleteCashSession } from '@/actions/pos'
import {
  getAccountingSummary, getInvoices, getEstimates,
  getJournalEntries, getVatQuarterly, getVatQuarterlyDetail, getClientsForInvoice, getClientForInvoiceById,
  getManualTransactions, createManualTransaction, deleteManualTransaction, updateManualTransaction,
  getAccountingMovements,
  getProductsForInvoice, listTailoringOrdersForInvoice, getTailoringOrderLinesForInvoice,
  createInvoiceAction, updateInvoiceAction, getInvoiceStatusAction, issueInvoiceAction, deleteInvoiceAction, cancelInvoiceAction,
  createEstimateAction, updateEstimateAction, updateEstimateFullAction, getEstimateDetail, sendEstimateAction, acceptEstimateAction, rejectEstimateAction, convertEstimateToInvoiceAction,
  getInvoiceLinesAction, updateJournalEntryDescriptionAction,
  generateInvoicePdfAction, generateEstimatePdfAction,
  type InvoiceRow, type EstimateRow, type JournalEntryRow, type VatQuarterRow,
  type ManualTransaction, type AccountingMovementRow, type AccountingSummary,
  type ClientForInvoice,
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

// ─── Shared UI ──────────────────────────────────────────────────────────────

function ClientSearchCombobox({
  value,
  selectedClient,
  onSelect,
  placeholder = 'Buscar cliente por nombre, email o NIF…',
  disabled = false,
}: {
  value: string
  /** El cliente actualmente seleccionado (para pintar su nombre en el trigger).
   *  Lo gestiona el caller en estado local, no se busca en BBDD. */
  selectedClient: ClientForInvoice | null
  onSelect: (client: ClientForInvoice | null) => void
  placeholder?: string
  disabled?: boolean
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<ClientForInvoice[]>([])
  const [loading, setLoading] = useState(false)

  // Debounce 300ms sobre la query y consulta server-side.
  useEffect(() => {
    if (!open) return
    const q = query.trim()
    if (q.length < 2) {
      setResults([])
      return
    }
    setLoading(true)
    const handle = setTimeout(async () => {
      const r = await getClientsForInvoice({ query: q })
      if (r.success) setResults(r.data ?? [])
      setLoading(false)
    }, 300)
    return () => clearTimeout(handle)
  }, [query, open])

  // Al abrir, resetear el input y resultados previos.
  useEffect(() => {
    if (!open) {
      setQuery('')
      setResults([])
    }
  }, [open])

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          className="w-full justify-between font-normal"
        >
          <span className={cn('truncate', !selectedClient && 'text-muted-foreground')}>
            {selectedClient ? selectedClient.full_name : placeholder}
          </span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
        <Command shouldFilter={false}>
          <CommandInput
            placeholder="Escribe nombre, email o NIF…"
            value={query}
            onValueChange={setQuery}
          />
          <CommandList
            className="max-h-[300px] overflow-y-auto"
            onWheel={(e) => e.stopPropagation()}
          >
            {query.trim().length < 2 ? (
              <div className="px-3 py-6 text-center text-xs text-muted-foreground">
                Escribe al menos 2 caracteres
              </div>
            ) : loading ? (
              <div className="px-3 py-6 text-center text-xs text-muted-foreground">
                Buscando…
              </div>
            ) : results.length === 0 ? (
              <CommandEmpty>Sin resultados.</CommandEmpty>
            ) : (
              <CommandGroup>
                {results.map((c) => (
                  <CommandItem
                    key={c.id}
                    value={c.id}
                    onSelect={() => {
                      onSelect(c.id === value ? null : c)
                      setOpen(false)
                    }}
                  >
                    <Check className={cn('mr-2 h-4 w-4', value === c.id ? 'opacity-100' : 'opacity-0')} />
                    <div className="flex flex-col min-w-0">
                      <span className="truncate">{c.full_name}</span>
                      <span className="text-xs text-muted-foreground truncate">
                        {[c.email, c.nif].filter(Boolean).join(' · ') || 'Sin email ni NIF'}
                        {c.companies.length > 0 && ` · ${c.companies.length} empresa${c.companies.length === 1 ? '' : 's'}`}
                      </span>
                    </div>
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}

// ─── Main Component ─────────────────────────────────────────────────────────

const VALID_TABS = ['resumen', 'facturas', 'presupuestos', 'movimientos', 'asientos', 'iva', 'caja'] as const

export function AccountingContent() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const pathname = usePathname()

  const urlTab = searchParams.get('tab')
  const initialTab = urlTab && (VALID_TABS as readonly string[]).includes(urlTab) ? urlTab : 'resumen'
  const [tab, setTab] = useState<string>(initialTab)
  const [editId, setEditId] = useState<string | null>(searchParams.get('edit'))

  useEffect(() => {
    const t = searchParams.get('tab')
    if (t && (VALID_TABS as readonly string[]).includes(t) && t !== tab) setTab(t)
    const e = searchParams.get('edit')
    if (e !== editId) setEditId(e)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams])

  const handleEditConsumed = useCallback(() => {
    setEditId(null)
    router.replace(`${pathname}?tab=facturas`)
  }, [router, pathname])

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Contabilidad</h1>
        <p className="text-muted-foreground">Facturas · Presupuestos · Movimientos · Asientos · IVA</p>
      </div>
      <Tabs value={tab} onValueChange={setTab}>
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
          <TabsContent value="facturas">     <InvoicesTab editId={editId} onEditConsumed={handleEditConsumed} /></TabsContent>
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

type InvoiceLine = { description: string; quantity: number; unit_price: number; tax_rate: number; discount_percentage?: number }

const PAYMENT_METHOD_PRESETS = ['Efectivo', 'Tarjeta', 'Transferencia', 'Bizum', 'Cheque', 'Mixto'] as const
const PAYMENT_METHOD_OTHER = 'Otro'

export function InvoicesTab({ editId, onEditConsumed }: { editId: string | null; onEditConsumed: () => void }) {
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
  const [selectedClient, setSelectedClient] = useState<ClientForInvoice | null>(null)
  const [billTo, setBillTo] = useState<'client' | string>('client')
  const [saving, setSaving] = useState(false)

  const [productDialogOpen, setProductDialogOpen] = useState(false)
  const [productSearch, setProductSearch] = useState('')
  const [productResults, setProductResults] = useState<{ id: string; name: string; sku: string; base_price: number; price_with_tax?: number }[]>([])
  const [loadingProducts, setLoadingProducts] = useState(false)
  const [orderDialogOpen, setOrderDialogOpen] = useState(false)
  const [ordersList, setOrdersList] = useState<{ id: string; order_number: string; total: number; client_name: string }[]>([])
  const [loadingOrders, setLoadingOrders] = useState(false)
  const [loadingOrderLines, setLoadingOrderLines] = useState(false)

  // Form state
  const [form, setForm] = useState({
    client_id: '', client_name: '', client_nif: '', client_address: '',
    client_email: '', client_phone: '', payment_method: '',
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

  // Filtro client-side adicional sobre las facturas devueltas por el backend.
  // Útil para refinar la lista ya cargada sin esperar el round-trip del fetch
  // y para cubrir campos que el backend no busca (ej. notes si se añade).
  const filteredInvoices = useMemo(() => {
    const q = normalizeSearchTerm(search)
    if (!q) return rows
    return rows.filter((inv) =>
      normalizeSearchTerm(inv.invoice_number || '').includes(q) ||
      normalizeSearchTerm(inv.client_name || '').includes(q),
    )
  }, [rows, search])

  const handleExportExcel = async () => {
    if (filteredInvoices.length === 0) {
      toast.error('No hay facturas para exportar')
      return
    }
    const data = filteredInvoices.map(inv => ({
      'Nº Factura': inv.invoice_number,
      'Cliente': inv.client_name,
      'Fecha': inv.invoice_date,
      'Total': Number(inv.total) || 0,
      'Estado': INVOICE_STATUS[inv.status]?.label ?? inv.status,
      'Enviada': inv.sent_to_client ? 'Sí' : 'No',
    }))
    const range = dateFrom && dateTo ? `-${dateFrom}_a_${dateTo}` : ''
    await downloadExcel(data, `facturas${range}`, 'Facturas')
  }

  const openDialog = () => {
    setSelectedClient(null)
    setDialogOpen(true)
  }

  const addLine = () => setLines(l => [...l, { description: '', quantity: 1, unit_price: 0, tax_rate: 21, discount_percentage: 0 }])
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
    setLines(l => [...l, { description: p.name || p.sku || 'Producto', quantity: 1, unit_price: p.base_price, tax_rate: 21, discount_percentage: 0 }])
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
      discount_percentage: 0,
    }))
    setLines(prev => [...prev, ...newLines])
    toast.success(`${newLines.length} línea(s) añadida(s) desde el pedido`)
    setOrderDialogOpen(false)
  }

  const subtotal = lines.reduce((s, l) => s + l.quantity * l.unit_price * (1 - (l.discount_percentage ?? 0) / 100), 0)
  const taxAmount = lines.reduce((s, l) => s + l.quantity * l.unit_price * (1 - (l.discount_percentage ?? 0) / 100) * (l.tax_rate / 100), 0)
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
        client_address: form.client_address || null,
        client_email: form.client_email || null,
        client_phone: form.client_phone || null,
        payment_method: form.payment_method || null,
        invoice_date: form.invoice_date,
        due_date: form.due_date || null,
        subtotal,
        tax_rate: form.tax_rate,
        tax_amount: taxAmount,
        irpf_rate: form.irpf_rate,
        irpf_amount: irpfAmount,
        total,
        notes: form.notes || null,
        lines: lines.map(l => {
          const dto = l.discount_percentage ?? 0
          const lineSubtotal = l.quantity * l.unit_price * (1 - dto / 100)
          return {
            description: l.description,
            quantity: l.quantity,
            unit_price: l.unit_price,
            tax_rate: l.tax_rate,
            discount_percentage: dto,
            line_total: lineSubtotal * (1 + l.tax_rate / 100),
          }
        }),
      })

      if (!result.success) {
        toast.error(result.error ?? 'Error al crear la factura')
        return
      }

      // El asiento se genera al emitir la factura, NO al crearla como borrador
      toast.success(`Factura ${result.data.invoice_number} creada como borrador`)
      setDialogOpen(false)
      setLines([{ description: '', quantity: 1, unit_price: 0, tax_rate: 21 }])
      setForm({ client_id: '', client_name: '', client_nif: '', client_address: '', client_email: '', client_phone: '', payment_method: '', invoice_date: new Date().toISOString().split('T')[0], due_date: '', notes: '', irpf_rate: 0, tax_rate: 21 })
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
        <Button variant="outline" size="sm" onClick={handleExportExcel}>
          <Download className="h-4 w-4 mr-2" /> Descargar Excel
        </Button>
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
              {filteredInvoices.length === 0 ? (
                <TableRow><TableCell colSpan={6} className="text-center py-12 text-muted-foreground">Sin facturas</TableCell></TableRow>
              ) : filteredInvoices.map(inv => (
                <InvoiceTableRow key={inv.id} inv={inv} onRefresh={load} autoOpenEditId={editId} onEditConsumed={onEditConsumed} />
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
              {(() => {
                const hasCompanies = !!selectedClient && selectedClient.companies.length > 0
                return (
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1 col-span-2">
                  <Label>Cliente</Label>
                  <ClientSearchCombobox
                    selectedClient={selectedClient}
                    value={form.client_id}
                    onSelect={c => {
                      setSelectedClient(c)
                      if (!c) {
                        setBillTo('client')
                        setForm(f => ({ ...f, client_id: '', client_name: '', client_nif: '', client_address: '', client_email: '', client_phone: '' }))
                        return
                      }
                      // La dirección/email/teléfono siempre se snapshot-an del
                      // cliente persona, aunque se facture a una de sus
                      // empresas. El usuario puede editarlos a mano si la
                      // empresa tiene otro domicilio.
                      const clientAddress = formatClientAddress(c)
                      // Si el cliente tiene una empresa por defecto, facturar a esa empresa.
                      const defaultCompany = c.companies.find(cc => cc.is_default)
                      if (defaultCompany) {
                        setBillTo(defaultCompany.id)
                        setForm(f => ({
                          ...f,
                          client_id: c.id,
                          client_name: defaultCompany.company_name,
                          client_nif: defaultCompany.nif ?? '',
                          client_address: clientAddress,
                          client_email: c.email ?? '',
                          client_phone: c.phone ?? '',
                        }))
                      } else {
                        setBillTo('client')
                        setForm(f => ({
                          ...f,
                          client_id: c.id,
                          client_name: c.full_name,
                          client_nif: c.nif ?? '',
                          client_address: clientAddress,
                          client_email: c.email ?? '',
                          client_phone: c.phone ?? '',
                        }))
                      }
                    }}
                  />
                </div>
                {hasCompanies && selectedClient && (
                  <div className="space-y-1 col-span-2">
                    <Label>Facturar a</Label>
                    <Select
                      value={billTo}
                      onValueChange={v => {
                        setBillTo(v)
                        if (v === 'client') {
                          setForm(f => ({
                            ...f,
                            client_name: selectedClient!.full_name,
                            client_nif: selectedClient!.nif ?? '',
                          }))
                        } else {
                          const company = selectedClient!.companies.find(cc => cc.id === v)
                          if (company) {
                            setForm(f => ({
                              ...f,
                              client_name: company.company_name,
                              client_nif: company.nif ?? '',
                            }))
                          }
                        }
                      }}
                    >
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="client">
                          <span className="flex items-center gap-2"><User className="h-3.5 w-3.5" /> Particular · {selectedClient!.full_name}</span>
                        </SelectItem>
                        {selectedClient!.companies.map(cc => (
                          <SelectItem key={cc.id} value={cc.id}>
                            <span className="flex items-center gap-2"><Building2 className="h-3.5 w-3.5" /> {cc.company_name}{cc.is_default ? ' (por defecto)' : ''}</span>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
                <div className="space-y-1">
                  <Label>Nombre factura</Label>
                  <Input value={form.client_name} onChange={e => setForm(f => ({ ...f, client_name: e.target.value }))} placeholder="Nombre en la factura" />
                </div>
                <div className="space-y-1">
                  <Label>NIF / CIF</Label>
                  <Input value={form.client_nif} onChange={e => setForm(f => ({ ...f, client_nif: e.target.value }))} />
                </div>
                <div className="space-y-1">
                  <Label>Email</Label>
                  <Input
                    type="email"
                    placeholder="cliente@ejemplo.com"
                    value={form.client_email}
                    onChange={e => setForm(f => ({ ...f, client_email: e.target.value }))}
                  />
                </div>
                <div className="space-y-1">
                  <Label>Teléfono</Label>
                  <Input
                    type="tel"
                    placeholder="+34 600 000 000"
                    value={form.client_phone}
                    onChange={e => setForm(f => ({ ...f, client_phone: e.target.value }))}
                  />
                </div>
                <div className="space-y-1 col-span-2">
                  <Label>Dirección de facturación</Label>
                  <Textarea
                    rows={2}
                    placeholder="Calle, número, código postal, ciudad, país"
                    value={form.client_address}
                    onChange={e => setForm(f => ({ ...f, client_address: e.target.value }))}
                  />
                </div>
                <div className="space-y-1 col-span-2">
                  <Label>Forma de pago</Label>
                  <div className="flex flex-wrap gap-2 items-center">
                    <Select
                      value={
                        form.payment_method === ''
                          ? ''
                          : (PAYMENT_METHOD_PRESETS as readonly string[]).includes(form.payment_method)
                            ? form.payment_method
                            : PAYMENT_METHOD_OTHER
                      }
                      onValueChange={v => {
                        if (v === PAYMENT_METHOD_OTHER) {
                          setForm(f => ({ ...f, payment_method: (PAYMENT_METHOD_PRESETS as readonly string[]).includes(f.payment_method) ? '' : f.payment_method }))
                        } else {
                          setForm(f => ({ ...f, payment_method: v }))
                        }
                      }}
                    >
                      <SelectTrigger className="w-44"><SelectValue placeholder="Seleccionar…" /></SelectTrigger>
                      <SelectContent>
                        {PAYMENT_METHOD_PRESETS.map(m => (
                          <SelectItem key={m} value={m}>{m}</SelectItem>
                        ))}
                        <SelectItem value={PAYMENT_METHOD_OTHER}>{PAYMENT_METHOD_OTHER}…</SelectItem>
                      </SelectContent>
                    </Select>
                    {!(PAYMENT_METHOD_PRESETS as readonly string[]).includes(form.payment_method) && (
                      <Input
                        className="flex-1 min-w-[180px]"
                        placeholder="Forma de pago libre"
                        value={form.payment_method}
                        onChange={e => setForm(f => ({ ...f, payment_method: e.target.value }))}
                      />
                    )}
                  </div>
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
                )
              })()}

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
                      <span className="text-sm text-muted-foreground shrink-0 ml-2">{formatCurrency(p.price_with_tax)}</span>
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

function InvoiceTableRow({ inv, onRefresh, autoOpenEditId, onEditConsumed }: { inv: InvoiceRow; onRefresh: () => void; autoOpenEditId?: string | null; onEditConsumed?: () => void }) {
  const supabase = useMemo(() => createClient(), [])
  const [loadingPdf, setLoadingPdf] = useState(false)
  const [editOpen, setEditOpen] = useState(false)
  const [conceptOnly, setConceptOnly] = useState(false)
  const [saving, setSaving] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [cancelOpen, setCancelOpen] = useState(false)
  const [cancelReason, setCancelReason] = useState('')
  const [actionLoading, setActionLoading] = useState(false)
  const s = INVOICE_STATUS[inv.status] ?? INVOICE_STATUS.draft
  const canDelete = inv.status === 'draft' || (inv.status === 'cancelled' && !inv.verifactu_sent)
  const canCancel = ['issued', 'paid', 'partially_paid', 'overdue'].includes(inv.status)
  // Edición plena: estados activos + sin enviar a Hacienda. cancelled
  // y rectified quedan fuera (rastro fiscal). verifactu_sent bloquea
  // todo cambio — solo rectificativa.
  const canEditFull = !inv.verifactu_sent && ['draft', 'issued', 'paid', 'partially_paid', 'overdue'].includes(inv.status)
  const isReadonlyLock = inv.verifactu_sent

  // ── Estado del formulario de edición ──
  // Defaults precargados desde el registro real (antes pisaba due_date/notes/
  // irpf_rate/tax_rate con valores en blanco al guardar — datos perdidos).
  const [form, setForm] = useState({
    client_id: inv.client_id ?? '',
    client_name: inv.client_name,
    client_nif: inv.client_nif ?? '',
    client_address: inv.client_address ?? '',
    client_email: inv.client_email ?? '',
    client_phone: inv.client_phone ?? '',
    payment_method: inv.payment_method ?? '',
    invoice_date: inv.invoice_date,
    due_date: inv.due_date ?? '',
    notes: inv.notes ?? '',
    irpf_rate: Number(inv.irpf_rate ?? 0),
    tax_rate: Number(inv.tax_rate ?? 21),
  })
  const [lines, setLines] = useState<InvoiceLine[]>([])
  const [selectedClient, setSelectedClient] = useState<ClientForInvoice | null>(null)
  const [billTo, setBillTo] = useState<'client' | string>('client')

  const [productDialogOpen, setProductDialogOpen] = useState(false)
  const [productSearch, setProductSearch] = useState('')
  const [productResults, setProductResults] = useState<{ id: string; name: string; sku: string; base_price: number; price_with_tax?: number }[]>([])
  const [loadingProducts, setLoadingProducts] = useState(false)
  const [orderDialogOpen, setOrderDialogOpen] = useState(false)
  const [ordersList, setOrdersList] = useState<{ id: string; order_number: string; total: number; client_name: string }[]>([])
  const [loadingOrders, setLoadingOrders] = useState(false)
  const [loadingOrderLines, setLoadingOrderLines] = useState(false)

  const openEdit = async () => {
    const [r, cr] = await Promise.all([
      getInvoiceLinesAction(inv.id),
      inv.client_id ? getClientForInvoiceById(inv.client_id) : Promise.resolve({ success: true as const, data: null }),
    ])
    if (r.success) {
      setLines(r.data.lines.map(l => ({ description: l.description, quantity: l.quantity, unit_price: l.unit_price, tax_rate: l.tax_rate })))
    }
    if (cr.success && cr.data) {
      setSelectedClient(cr.data)
      // Si el client_name de la factura coincide con una empresa del cliente,
      // pre-seleccionar esa empresa en el selector "Facturar a".
      const matchingCompany = cr.data.companies.find(cc => cc.company_name === inv.client_name)
      setBillTo(matchingCompany ? matchingCompany.id : 'client')
    } else {
      setSelectedClient(null)
      setBillTo('client')
    }
    setConceptOnly(false)
    setEditOpen(true)
  }

  useEffect(() => {
    if (autoOpenEditId && autoOpenEditId === inv.id && !editOpen) {
      openEdit()
      onEditConsumed?.()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoOpenEditId, inv.id])

  const addLine = () => setLines(l => [...l, { description: '', quantity: 1, unit_price: 0, tax_rate: 21, discount_percentage: 0 }])
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
    setLines(l => [...l, { description: p.name || p.sku || 'Producto', quantity: 1, unit_price: p.base_price, tax_rate: 21, discount_percentage: 0 }])
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
    const newLines: InvoiceLine[] = r.data.map(l => ({ description: l.description, quantity: l.quantity, unit_price: l.unit_price, tax_rate: l.tax_rate, discount_percentage: 0 }))
    setLines(prev => [...prev, ...newLines])
    toast.success(`${newLines.length} línea(s) añadida(s) desde el pedido`)
    setOrderDialogOpen(false)
  }

  const subtotal  = lines.reduce((s, l) => s + l.quantity * l.unit_price * (1 - (l.discount_percentage ?? 0) / 100), 0)
  const taxAmount = lines.reduce((s, l) => s + l.quantity * l.unit_price * (1 - (l.discount_percentage ?? 0) / 100) * (l.tax_rate / 100), 0)
  const irpfAmount = subtotal * (form.irpf_rate / 100)
  const total = subtotal + taxAmount - irpfAmount

  const handleUpdate = async () => {
    if (!conceptOnly && !form.client_name) { toast.error('Indica el cliente'); return }

    // Pre-check fresco contra BBDD: el listado puede estar stale (otro
    // usuario envió a Verifactu, anuló, etc. mientras el editor estaba
    // abierto). Evita el rechazo FORBIDDEN del server y, además, dispara
    // la advertencia "sent_to_client".
    const statusRes = await getInvoiceStatusAction(inv.id)
    if (!statusRes.success) {
      toast.error('No se pudo verificar el estado actual de la factura')
      return
    }
    const fresh = statusRes.data

    if (fresh.verifactu_sent) {
      toast.error('Esta factura ya fue enviada a Hacienda. Para corregirla, emite una rectificativa.')
      setEditOpen(false)
      onRefresh()
      return
    }

    const editableStatuses = ['draft', 'issued', 'paid', 'partially_paid', 'overdue']
    if (!editableStatuses.includes(fresh.status)) {
      const label = INVOICE_STATUS[fresh.status]?.label ?? fresh.status
      toast.warning(`Esta factura ya no se puede editar (estado actual: ${label}). El listado se ha actualizado.`)
      setEditOpen(false)
      onRefresh()
      return
    }

    // Si ya se envió al cliente, advertir que el PDF cambiará.
    if (!conceptOnly && fresh.sent_to_client) {
      const ok = typeof window !== 'undefined'
        ? window.confirm(
            'Esta factura ya se envió al cliente.\n\n' +
            'Si guardas los cambios, el PDF se regenerará y deberás reenviar la versión actualizada al cliente.\n\n' +
            '¿Continuar?'
          )
        : true
      if (!ok) return
    }

    setSaving(true)
    const r = await updateInvoiceAction({
      id: inv.id, client_id: form.client_id || null, client_name: form.client_name,
      client_nif: form.client_nif || null, client_address: form.client_address || null,
      client_email: form.client_email || null, client_phone: form.client_phone || null,
      payment_method: form.payment_method || null,
      invoice_date: form.invoice_date, due_date: form.due_date || null,
      subtotal, tax_rate: form.tax_rate, tax_amount: taxAmount, irpf_rate: form.irpf_rate,
      irpf_amount: irpfAmount, total, notes: form.notes || null,
      lines: lines.map(l => {
        const dto = l.discount_percentage ?? 0
        const lineSubtotal = l.quantity * l.unit_price * (1 - dto / 100)
        return {
          description: l.description,
          quantity: l.quantity,
          unit_price: l.unit_price,
          tax_rate: l.tax_rate,
          discount_percentage: dto,
          line_total: lineSubtotal * (1 + l.tax_rate / 100),
        }
      }),
      conceptOnly,
    })
    setSaving(false)
    if (!r.success) { toast.error(!r.success && 'error' in r ? r.error : 'Error'); return }
    toast.success(conceptOnly ? 'Concepto actualizado' : 'Factura actualizada')
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

  const handleDelete = async () => {
    setActionLoading(true)
    const res = await deleteInvoiceAction(inv.id)
    setActionLoading(false)
    if (!res.success) {
      toast.error('error' in res ? res.error : 'Error al eliminar')
      return
    }
    toast.success('Factura eliminada')
    setDeleteOpen(false)
    onRefresh()
  }

  const handleCancel = async () => {
    if (!cancelReason.trim()) {
      toast.error('El motivo de anulación es obligatorio')
      return
    }
    setActionLoading(true)
    const res = await cancelInvoiceAction({ invoiceId: inv.id, reason: cancelReason.trim() })
    setActionLoading(false)
    if (!res.success) {
      toast.error('error' in res ? res.error : 'Error al anular')
      return
    }
    toast.success(`Factura ${inv.invoice_number} anulada`)
    setCancelOpen(false)
    setCancelReason('')
    onRefresh()
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
            {canEditFull && (
              <Button size="sm" variant="outline" className="h-8 gap-1.5" onClick={openEdit}>
                <Pencil className="h-3.5 w-3.5" />
                <span className="hidden sm:inline text-xs">Editar</span>
              </Button>
            )}
            {inv.status === 'draft' && (
              <Button size="sm" variant="default" className="h-8 gap-1.5 bg-blue-700 hover:bg-blue-800" onClick={handleIssue}>
                <Send className="h-3.5 w-3.5" />
                <span className="hidden sm:inline text-xs">Emitir</span>
              </Button>
            )}
            {isReadonlyLock && (
              <span className="text-xs text-amber-700 font-medium flex items-center gap-1 px-2" title="Factura enviada a Hacienda (Verifactu)">
                <Lock className="h-3 w-3" /> Hacienda
              </span>
            )}
            {(inv.status === 'issued' || inv.status === 'overdue') && (
              <Button size="icon" variant="ghost" className="h-8 w-8" onClick={markPaid} title="Marcar como pagada">
                <CheckCircle className="h-3.5 w-3.5 text-green-600" />
              </Button>
            )}
            {(canDelete || canCancel) && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button size="icon" variant="ghost" className="h-8 w-8" title="Más acciones">
                    <MoreHorizontal className="h-3.5 w-3.5" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  {canDelete && (
                    <DropdownMenuItem
                      onClick={() => setDeleteOpen(true)}
                      className="text-red-600 focus:text-red-700 focus:bg-red-50"
                    >
                      <Trash2 className="mr-2 h-4 w-4" /> Eliminar
                    </DropdownMenuItem>
                  )}
                  {canCancel && (
                    <>
                      {canDelete && <DropdownMenuSeparator />}
                      <DropdownMenuItem
                        onClick={() => { setCancelOpen(true); setCancelReason('') }}
                        className="text-amber-700 focus:text-amber-800 focus:bg-amber-50"
                      >
                        <Ban className="mr-2 h-4 w-4" /> Anular factura
                      </DropdownMenuItem>
                    </>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>
        </TableCell>
      </TableRow>

      {/* Diálogo edición factura borrador / sólo concepto */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-w-3xl max-h-[90vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>
              {conceptOnly
                ? <>Editar concepto · factura <span className="font-mono">{inv.invoice_number}</span></>
                : <>Editar factura {inv.invoice_number} (borrador)</>}
            </DialogTitle>
          </DialogHeader>
          <ScrollArea className="flex-1 pr-1">
            <div className="space-y-4 p-1">
              {!conceptOnly && inv.status !== 'draft' && (
                <div className="rounded-md border border-blue-200 bg-blue-50 p-3 text-xs text-blue-900 flex items-start gap-2">
                  <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
                  <div>
                    Esta factura ya está <strong>emitida</strong> (aún no enviada a Hacienda).
                    Si la editas, el PDF se regenerará. Una vez se envíe a Verifactu solo podrá corregirse mediante factura rectificativa.
                  </div>
                </div>
              )}
              {!conceptOnly && (() => {
                const hasCompanies = !!selectedClient && selectedClient.companies.length > 0
                return (
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1 col-span-2">
                  <Label>Cliente</Label>
                  <ClientSearchCombobox
                    selectedClient={selectedClient}
                    value={form.client_id}
                    onSelect={c => {
                      setSelectedClient(c)
                      if (!c) {
                        setBillTo('client')
                        setForm(f => ({ ...f, client_id: '', client_name: '', client_nif: '', client_address: '', client_email: '', client_phone: '' }))
                        return
                      }
                      const clientAddress = formatClientAddress(c)
                      const defaultCompany = c.companies.find(cc => cc.is_default)
                      if (defaultCompany) {
                        setBillTo(defaultCompany.id)
                        setForm(f => ({
                          ...f,
                          client_id: c.id,
                          client_name: defaultCompany.company_name,
                          client_nif: defaultCompany.nif ?? '',
                          client_address: clientAddress,
                          client_email: c.email ?? '',
                          client_phone: c.phone ?? '',
                        }))
                      } else {
                        setBillTo('client')
                        setForm(f => ({
                          ...f,
                          client_id: c.id,
                          client_name: c.full_name,
                          client_nif: c.nif ?? '',
                          client_address: clientAddress,
                          client_email: c.email ?? '',
                          client_phone: c.phone ?? '',
                        }))
                      }
                    }}
                  />
                </div>
                {hasCompanies && selectedClient && (
                  <div className="space-y-1 col-span-2">
                    <Label>Facturar a</Label>
                    <Select
                      value={billTo}
                      onValueChange={v => {
                        setBillTo(v)
                        if (v === 'client') {
                          setForm(f => ({ ...f, client_name: selectedClient!.full_name, client_nif: selectedClient!.nif ?? '' }))
                        } else {
                          const company = selectedClient!.companies.find(cc => cc.id === v)
                          if (company) {
                            setForm(f => ({ ...f, client_name: company.company_name, client_nif: company.nif ?? '' }))
                          }
                        }
                      }}
                    >
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="client">
                          <span className="flex items-center gap-2"><User className="h-3.5 w-3.5" /> Particular · {selectedClient!.full_name}</span>
                        </SelectItem>
                        {selectedClient!.companies.map(cc => (
                          <SelectItem key={cc.id} value={cc.id}>
                            <span className="flex items-center gap-2"><Building2 className="h-3.5 w-3.5" /> {cc.company_name}{cc.is_default ? ' (por defecto)' : ''}</span>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
                <div className="space-y-1 col-span-2 sm:col-span-1">
                  <Label>Nombre en factura</Label>
                  <Input value={form.client_name} onChange={e => setForm(f => ({ ...f, client_name: e.target.value }))} />
                </div>
                <div className="space-y-1">
                  <Label>NIF / CIF</Label>
                  <Input value={form.client_nif} onChange={e => setForm(f => ({ ...f, client_nif: e.target.value }))} />
                </div>
                <div className="space-y-1">
                  <Label>Email</Label>
                  <Input
                    type="email"
                    placeholder="cliente@ejemplo.com"
                    value={form.client_email}
                    onChange={e => setForm(f => ({ ...f, client_email: e.target.value }))}
                  />
                </div>
                <div className="space-y-1">
                  <Label>Teléfono</Label>
                  <Input
                    type="tel"
                    placeholder="+34 600 000 000"
                    value={form.client_phone}
                    onChange={e => setForm(f => ({ ...f, client_phone: e.target.value }))}
                  />
                </div>
                <div className="space-y-1 col-span-2">
                  <Label>Dirección de facturación</Label>
                  <Textarea
                    rows={2}
                    placeholder="Calle, número, código postal, ciudad, país"
                    value={form.client_address}
                    onChange={e => setForm(f => ({ ...f, client_address: e.target.value }))}
                  />
                </div>
                <div className="space-y-1 col-span-2">
                  <Label>Forma de pago</Label>
                  <div className="flex flex-wrap gap-2 items-center">
                    <Select
                      value={
                        form.payment_method === ''
                          ? ''
                          : (PAYMENT_METHOD_PRESETS as readonly string[]).includes(form.payment_method)
                            ? form.payment_method
                            : PAYMENT_METHOD_OTHER
                      }
                      onValueChange={v => {
                        if (v === PAYMENT_METHOD_OTHER) {
                          setForm(f => ({ ...f, payment_method: (PAYMENT_METHOD_PRESETS as readonly string[]).includes(f.payment_method) ? '' : f.payment_method }))
                        } else {
                          setForm(f => ({ ...f, payment_method: v }))
                        }
                      }}
                    >
                      <SelectTrigger className="w-44"><SelectValue placeholder="Seleccionar…" /></SelectTrigger>
                      <SelectContent>
                        {PAYMENT_METHOD_PRESETS.map(m => (
                          <SelectItem key={m} value={m}>{m}</SelectItem>
                        ))}
                        <SelectItem value={PAYMENT_METHOD_OTHER}>{PAYMENT_METHOD_OTHER}…</SelectItem>
                      </SelectContent>
                    </Select>
                    {!(PAYMENT_METHOD_PRESETS as readonly string[]).includes(form.payment_method) && (
                      <Input
                        className="flex-1 min-w-[180px]"
                        placeholder="Forma de pago libre"
                        value={form.payment_method}
                        onChange={e => setForm(f => ({ ...f, payment_method: e.target.value }))}
                      />
                    )}
                  </div>
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
                )
              })()}
              <div>
                <div className="mb-2">
                  <Label className="font-semibold text-sm">Líneas</Label>
                  <p className="text-xs text-muted-foreground mt-0.5 mb-2">
                    {conceptOnly
                      ? 'Solo se actualiza la descripción de cada línea. Cantidades, precios, IVA y totales no se modifican.'
                      : 'Añade líneas manualmente, escoge un producto o carga un pedido de sastrería.'}
                  </p>
                  {!conceptOnly && (
                  <div className="flex flex-wrap gap-2">
                    <Button size="sm" variant="outline" onClick={addLine}><Plus className="h-3.5 w-3.5 mr-1" /> Añadir línea</Button>
                    <Button size="sm" variant="default" onClick={openProductDialogEdit}><Package className="h-3.5 w-3.5 mr-1" /> Escoger producto</Button>
                    <Button size="sm" variant="outline" onClick={openOrderDialogEdit}><ClipboardList className="h-3.5 w-3.5 mr-1" /> Escoger pedido</Button>
                  </div>
                  )}
                </div>
                <div className="space-y-1">
                  <div className="grid grid-cols-12 gap-1 text-xs font-medium text-muted-foreground px-1">
                    <span className="col-span-4">Descripción</span>
                    <span className="col-span-2 text-center">Cant.</span>
                    <span className="col-span-2 text-center">Precio</span>
                    <span className="col-span-1 text-center">Dto %</span>
                    <span className="col-span-2 text-center">IVA %</span>
                    <span className="col-span-1" />
                  </div>
                  {lines.map((ln, i) => (
                    <div key={i} className="grid grid-cols-12 gap-1 items-start">
                      <Textarea
                        className="col-span-4 min-h-[32px] text-sm resize-y py-1"
                        value={ln.description}
                        onChange={e => updateLine(i, 'description', e.target.value)}
                        placeholder="Descripción"
                        rows={1}
                      />
                      {conceptOnly ? (
                        <>
                          <span className="col-span-2 text-sm text-center text-muted-foreground self-center">{ln.quantity}</span>
                          <span className="col-span-2 text-sm text-center text-muted-foreground self-center">{formatCurrency(ln.unit_price)}</span>
                          <span className="col-span-1 text-sm text-center text-muted-foreground self-center">{ln.discount_percentage ?? 0}%</span>
                          <span className="col-span-2 text-sm text-center text-muted-foreground self-center">{ln.tax_rate}%</span>
                          <span className="col-span-1" />
                        </>
                      ) : (
                        <>
                          <Input className="col-span-2 h-8 text-sm text-center" type="number" step={0.01} value={ln.quantity} onChange={e => updateLine(i, 'quantity', Number(e.target.value))} />
                          <Input className="col-span-2 h-8 text-sm text-center" type="number" step={0.01} value={ln.unit_price} onChange={e => updateLine(i, 'unit_price', Number(e.target.value))} />
                          <Input className="col-span-1 h-8 text-sm text-center" type="number" step={1} min={0} max={100} value={ln.discount_percentage ?? 0} onChange={e => updateLine(i, 'discount_percentage', Number(e.target.value))} />
                          <Input className="col-span-2 h-8 text-sm text-center" type="number" value={ln.tax_rate} onChange={e => updateLine(i, 'tax_rate', Number(e.target.value))} />
                          <Button className="col-span-1 h-8" variant="ghost" size="icon" onClick={() => removeLine(i)} disabled={lines.length === 1}>
                            <Trash2 className="h-3.5 w-3.5 text-red-500" />
                          </Button>
                        </>
                      )}
                    </div>
                  ))}
                </div>
              </div>
              {!conceptOnly && (
              <div className="flex justify-end">
                <div className="w-56 space-y-1 text-sm">
                  <div className="flex justify-between"><span className="text-muted-foreground">Subtotal</span><span>{formatCurrency(subtotal)}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">IVA</span><span>{formatCurrency(taxAmount)}</span></div>
                  <div className="flex justify-between font-bold border-t pt-1"><span>Total</span><span>{formatCurrency(total)}</span></div>
                </div>
              </div>
              )}
              {!conceptOnly && (
              <div className="space-y-1">
                <Label>Notas</Label>
                <Textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} rows={2} />
              </div>
              )}
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
                      <span className="text-sm text-muted-foreground shrink-0 ml-2">{formatCurrency(p.price_with_tax)}</span>
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

      {/* AlertDialog: eliminar factura borrador */}
      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-red-700">
              <Trash2 className="h-5 w-5" /> Eliminar factura borrador
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2">
                <p>
                  ¿Eliminar la factura{' '}
                  <span className="font-mono font-semibold">{inv.invoice_number}</span>?
                </p>
                <p className="text-xs text-muted-foreground">
                  Solo se elimina porque está en borrador. Sus líneas también se borrarán.
                  Esta acción no se puede deshacer.
                </p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={actionLoading}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => { e.preventDefault(); handleDelete() }}
              disabled={actionLoading}
              className="bg-red-600 hover:bg-red-700"
            >
              {actionLoading && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* AlertDialog: anular factura emitida */}
      <AlertDialog open={cancelOpen} onOpenChange={(open) => { setCancelOpen(open); if (!open) setCancelReason('') }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-amber-700">
              <Ban className="h-5 w-5" /> Anular factura {inv.invoice_number}
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3">
                <p>
                  La factura quedará marcada como <strong>anulada</strong>. El registro
                  fiscal se mantiene intacto. No se elimina nada — el cambio queda
                  reflejado en el historial.
                </p>
                <div className="space-y-1">
                  <Label htmlFor={`cancel-reason-${inv.id}`}>Motivo de anulación *</Label>
                  <Textarea
                    id={`cancel-reason-${inv.id}`}
                    value={cancelReason}
                    onChange={(e) => setCancelReason(e.target.value)}
                    rows={3}
                    placeholder="Ej: error en los datos del cliente, factura duplicada, devolución total…"
                  />
                  <p className="text-xs text-muted-foreground">
                    Se guarda en las notas de la factura junto con la fecha.
                  </p>
                </div>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={actionLoading}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => { e.preventDefault(); handleCancel() }}
              disabled={actionLoading || !cancelReason.trim()}
              className="bg-amber-600 hover:bg-amber-700"
            >
              {actionLoading && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              Anular factura
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}

// ─── Tab: Presupuestos ───────────────────────────────────────────────────────

type EstimateLine = { description: string; quantity: number; unit_price: number; tax_rate: number }

function EstimateTableRow ({ est, onRefresh, onEdit }: { est: EstimateRow; onRefresh: () => void; onEdit: (id: string) => void }) {
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
            {(est.status === 'draft' || est.status === 'sent') && (
              <Button size="icon" variant="ghost" className="h-9 w-9 shrink-0" onClick={() => onEdit(est.id)} title="Editar presupuesto">
                <Pencil className="h-4 w-4" />
              </Button>
            )}
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
  const [selectedClient, setSelectedClient] = useState<ClientForInvoice | null>(null)
  const [billTo, setBillTo] = useState<'client' | string>('client')
  const [saving, setSaving] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editingNumber, setEditingNumber] = useState<string>('')
  const [loadingEdit, setLoadingEdit] = useState(false)

  const [productDialogOpen, setProductDialogOpen] = useState(false)
  const [productSearch, setProductSearch] = useState('')
  const [productResults, setProductResults] = useState<{ id: string; name: string; sku: string; base_price: number; price_with_tax?: number }[]>([])
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

  const resetForm = () => {
    setEditingId(null)
    setEditingNumber('')
    setBillTo('client')
    setForm({ client_id: '', client_name: '', client_nif: '', client_email: '', estimate_date: new Date().toISOString().split('T')[0], valid_until: '', notes: '', irpf_rate: 0, tax_rate: 21 })
    setLines([{ description: '', quantity: 1, unit_price: 0, tax_rate: 21 }])
  }

  const openDialog = async () => {
    resetForm()
    setSelectedClient(null)
    setDialogOpen(true)
  }

  const openEditDialog = async (estimateId: string) => {
    setLoadingEdit(true)
    try {
      const detailRes = await getEstimateDetail({ estimateId })
      if (!detailRes.success) {
        toast.error('error' in detailRes ? detailRes.error : 'No se pudo cargar el presupuesto')
        return
      }
      const d = detailRes.data
      // Hidratar el cliente concreto si la factura ya tiene client_id.
      if (d.client_id) {
        const cr = await getClientForInvoiceById(d.client_id)
        if (cr.success) setSelectedClient(cr.data)
      } else {
        setSelectedClient(null)
      }
      setEditingId(d.id)
      setEditingNumber(d.estimate_number)
      setBillTo('client')
      setForm({
        client_id: d.client_id ?? '',
        client_name: d.client_name ?? '',
        client_nif: d.client_nif ?? '',
        client_email: d.client_email ?? '',
        estimate_date: d.estimate_date || new Date().toISOString().split('T')[0],
        valid_until: d.valid_until ?? '',
        notes: d.notes ?? '',
        irpf_rate: d.irpf_rate ?? 0,
        tax_rate: d.tax_rate ?? 21,
      })
      setLines(
        d.lines.length > 0
          ? d.lines.map(l => ({ description: l.description, quantity: l.quantity, unit_price: l.unit_price, tax_rate: l.tax_rate }))
          : [{ description: '', quantity: 1, unit_price: 0, tax_rate: 21 }],
      )
      setDialogOpen(true)
    } finally {
      setLoadingEdit(false)
    }
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
      const payload = {
        client_id: form.client_id || null,
        client_name: form.client_name,
        client_nif: form.client_nif || null,
        client_email: form.client_email?.trim() || null,
        estimate_date: form.estimate_date,
        valid_until: addDays(form.estimate_date, 30),
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
      }

      if (editingId) {
        const result = await updateEstimateFullAction({ estimateId: editingId, ...payload })
        if (!result.success) {
          toast.error('error' in result ? result.error : 'Error al actualizar el presupuesto')
          return
        }
        toast.success(`Presupuesto ${editingNumber} actualizado`)
      } else {
        const result = await createEstimateAction(payload)
        if (!result.success) {
          toast.error(result.error ?? 'Error al crear el presupuesto')
          return
        }
        toast.success(`Presupuesto ${result.data.estimate_number} creado`)
      }

      setDialogOpen(false)
      resetForm()
      load()
    } catch (error) {
      console.error('Error saving estimate:', error)
      toast.error(error instanceof Error ? error.message : 'Error desconocido al guardar el presupuesto')
    } finally {
      setSaving(false)
    }
  }

  const handleExportExcel = async () => {
    if (rows.length === 0) {
      toast.error('No hay presupuestos para exportar')
      return
    }
    const data = rows.map(est => ({
      'Nº Presupuesto': est.estimate_number,
      'Cliente': est.client_name,
      'Fecha': est.estimate_date,
      'Total': Number(est.total) || 0,
      'Estado': ESTIMATE_STATUS[est.status]?.label ?? est.status,
    }))
    await downloadExcel(data, 'presupuestos', 'Presupuestos')
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
        <Button variant="outline" size="sm" onClick={handleExportExcel}>
          <Download className="h-4 w-4 mr-2" /> Descargar Excel
        </Button>
        <Button onClick={openDialog} disabled={loadingEdit}><Plus className="h-4 w-4 mr-1" /> Nuevo presupuesto</Button>
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
                <EstimateTableRow key={est.id} est={est} onRefresh={load} onEdit={openEditDialog} />
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {/* New / Edit Estimate Dialog */}
      <Dialog open={dialogOpen} onOpenChange={(open) => { setDialogOpen(open); if (!open) resetForm() }}>
        <DialogContent className="max-w-3xl max-h-[90vh] flex flex-col">
          <DialogHeader><DialogTitle>{editingId ? `Editar presupuesto ${editingNumber}` : 'Nuevo presupuesto'}</DialogTitle></DialogHeader>
          <ScrollArea className="flex-1 pr-1">
            <div className="space-y-4 p-1">
              {(() => {
                const hasCompanies = !!selectedClient && selectedClient.companies.length > 0
                return (
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1 col-span-2">
                      <Label>Cliente</Label>
                      <ClientSearchCombobox
                        selectedClient={selectedClient}
                        value={form.client_id}
                        onSelect={c => {
                          setSelectedClient(c)
                          if (!c) {
                            setBillTo('client')
                            setForm(f => ({ ...f, client_id: '', client_name: '', client_email: '', client_nif: '' }))
                            return
                          }
                          setBillTo('client')
                          setForm(f => ({
                            ...f,
                            client_id: c.id,
                            client_name: c.full_name,
                            client_email: c.email ?? '',
                            client_nif: c.nif ?? '',
                          }))
                        }}
                      />
                    </div>
                    {hasCompanies && selectedClient && (
                      <div className="space-y-1 col-span-2">
                        <Label>Facturar a</Label>
                        <Select
                          value={billTo}
                          onValueChange={v => {
                            setBillTo(v)
                            if (v === 'client') {
                              setForm(f => ({
                                ...f,
                                client_name: selectedClient!.full_name,
                                client_email: selectedClient!.email ?? '',
                                client_nif: selectedClient!.nif ?? '',
                              }))
                            } else {
                              const company = selectedClient!.companies.find(cc => cc.id === v)
                              if (company) {
                                setForm(f => ({
                                  ...f,
                                  client_name: company.company_name,
                                  client_email: company.contact_email ?? selectedClient!.email ?? '',
                                  client_nif: company.nif ?? '',
                                }))
                              }
                            }
                          }}
                        >
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="client">
                              <span className="flex items-center gap-2"><User className="h-3.5 w-3.5" /> Particular · {selectedClient!.full_name}</span>
                            </SelectItem>
                            {selectedClient!.companies.map(cc => (
                              <SelectItem key={cc.id} value={cc.id}>
                                <span className="flex items-center gap-2"><Building2 className="h-3.5 w-3.5" /> {cc.company_name}{cc.is_default ? ' (por defecto)' : ''}</span>
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    )}
                    <div className="space-y-1">
                      <Label>Nombre presupuesto</Label>
                      <Input value={form.client_name} onChange={e => setForm(f => ({ ...f, client_name: e.target.value }))} />
                    </div>
                    <div className="space-y-1">
                      <Label>NIF / CIF</Label>
                      <Input value={form.client_nif} onChange={e => setForm(f => ({ ...f, client_nif: e.target.value }))} />
                    </div>
                    <div className="space-y-1">
                      <Label>Email del cliente</Label>
                      <Input type="email" value={form.client_email} onChange={e => setForm(f => ({ ...f, client_email: e.target.value }))} placeholder="email@ejemplo.com (opcional)" />
                    </div>
                    <div className="space-y-1">
                      <Label>Fecha</Label>
                      <DatePickerPopover value={form.estimate_date} onChange={date => setForm(f => ({ ...f, estimate_date: date }))} />
                    </div>
                  </div>
                )
              })()}

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
              {saving ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null} {editingId ? 'Guardar cambios' : 'Crear presupuesto'}
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
                      <span className="text-sm text-muted-foreground shrink-0 ml-2">{formatCurrency(p.price_with_tax)}</span>
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

  const handleExportExcel = async () => {
    if (rows.length === 0) {
      toast.error('No hay asientos para exportar')
      return
    }
    // Una fila por línea de asiento (cabecera repetida) — formato natural en Excel
    const data: Record<string, unknown>[] = []
    for (const e of rows) {
      const lines = e.lines ?? []
      if (lines.length === 0) {
        data.push({
          'Fecha': e.entry_date,
          'Nº Asiento': e.entry_number,
          'Descripción': e.description,
          'Cuenta': '',
          'Debe': Number(e.total_debit) || 0,
          'Haber': Number(e.total_credit) || 0,
        })
        continue
      }
      for (const ln of lines) {
        data.push({
          'Fecha': e.entry_date,
          'Nº Asiento': e.entry_number,
          'Descripción': ln.description ?? e.description,
          'Cuenta': ln.account_code,
          'Debe': Number(ln.debit) || 0,
          'Haber': Number(ln.credit) || 0,
        })
      }
    }
    const monthLabel = month ? `-${year}-${String(month).padStart(2, '0')}` : `-${year}`
    await downloadExcel(data, `asientos${monthLabel}`, 'Asientos')
  }

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
        <div className="flex-1" />
        <Button variant="outline" size="sm" className="h-9" onClick={handleExportExcel}>
          <Download className="h-4 w-4 mr-2" /> Descargar Excel
        </Button>
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
  const [exporting, setExporting] = useState(false)
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
  const totalSalesCount = quarters.reduce((s, q) => s + q.salesCount, 0)
  const totalPurchCount = quarters.reduce((s, q) => s + q.purchasesCount, 0)

  const handleExportExcel = async () => {
    setExporting(true)
    try {
      const res = await getVatQuarterlyDetail({ year })
      if (!res.success) {
        toast.error('error' in res ? res.error : 'No se pudo generar el Excel')
        return
      }
      const { quarters: qs, totalRepercutido, totalSoportado, invoicesIssued, invoicesReceived } = res.data
      const resumenRows: Record<string, unknown>[] = qs.map(q => ({
        'Trimestre': q.quarter,
        'Periodo': q.period,
        'Nº facturas emitidas': q.salesCount,
        'Base ventas': q.baseImponibleSales,
        'IVA repercutido': q.ivaRepercutido,
        'Nº facturas recibidas': q.purchasesCount,
        'Base compras': q.baseImponiblePurchases,
        'IVA soportado': q.ivaSoportado,
        'Resultado': q.resultado,
      }))
      resumenRows.push({
        'Trimestre': 'TOTAL',
        'Periodo': String(year),
        'Nº facturas emitidas': totalSalesCount,
        'Base ventas': baseSalesTotal,
        'IVA repercutido': totalRepercutido,
        'Nº facturas recibidas': totalPurchCount,
        'Base compras': basePurchTotal,
        'IVA soportado': totalSoportado,
        'Resultado': totalRepercutido - totalSoportado,
      })

      const emitidasRows: Record<string, unknown>[] = invoicesIssued.map(r => ({
        'Trimestre': r.trimestre,
        'Nº factura': r.invoice_number,
        'Fecha': r.invoice_date,
        'Cliente': r.client_name,
        'NIF': r.client_nif ?? '',
        'Base': r.subtotal,
        'IVA %': r.tax_rate,
        'IVA €': r.tax_amount,
        'IRPF %': r.irpf_rate,
        'IRPF €': r.irpf_amount,
        'Total': r.total,
        'Estado': r.status,
        'Origen': r.origen,
      }))
      if (emitidasRows.length > 0) {
        emitidasRows.push({
          'Trimestre': 'TOTAL', 'Nº factura': '', 'Fecha': '', 'Cliente': '', 'NIF': '',
          'Base': invoicesIssued.reduce((s, r) => s + r.subtotal, 0),
          'IVA %': '',
          'IVA €': invoicesIssued.reduce((s, r) => s + r.tax_amount, 0),
          'IRPF %': '',
          'IRPF €': invoicesIssued.reduce((s, r) => s + r.irpf_amount, 0),
          'Total': invoicesIssued.reduce((s, r) => s + r.total, 0),
          'Estado': '', 'Origen': '',
        })
      }

      const recibidasRows: Record<string, unknown>[] = invoicesReceived.map(r => ({
        'Trimestre': r.trimestre,
        'Nº factura': r.invoice_number,
        'Fecha': r.invoice_date,
        'Proveedor': r.supplier_name,
        'NIF': r.supplier_cif ?? '',
        'Base': r.amount,
        'IVA €': r.tax_amount,
        'IVA % calculado': r.iva_pct_calculado ?? '',
        'Retención IRPF': r.retention_amount,
        'Total': r.total_amount,
        'Estado pago': r.status,
        'Fecha pago': r.payment_date ?? '',
      }))
      if (recibidasRows.length > 0) {
        recibidasRows.push({
          'Trimestre': 'TOTAL', 'Nº factura': '', 'Fecha': '', 'Proveedor': '', 'NIF': '',
          'Base': invoicesReceived.reduce((s, r) => s + r.amount, 0),
          'IVA €': invoicesReceived.reduce((s, r) => s + r.tax_amount, 0),
          'IVA % calculado': '',
          'Retención IRPF': invoicesReceived.reduce((s, r) => s + r.retention_amount, 0),
          'Total': invoicesReceived.reduce((s, r) => s + r.total_amount, 0),
          'Estado pago': '', 'Fecha pago': '',
        })
      }

      await downloadExcelMulti([
        { name: 'Resumen', rows: resumenRows },
        { name: 'Facturas emitidas', rows: emitidasRows },
        { name: 'Facturas recibidas', rows: recibidasRows },
      ], `iva-trimestral-${year}`)
      toast.success('Excel descargado')
    } catch (err) {
      console.error('[accounting] export VAT Excel:', err)
      toast.error('Error al generar el Excel')
    } finally {
      setExporting(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3 flex-wrap">
          <Select value={String(year)} onValueChange={v => setYear(Number(v))}>
            <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
            <SelectContent>{years.map(y => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}</SelectContent>
          </Select>
          <p className="text-sm text-muted-foreground">Modelo 303 — Resumen trimestral de IVA</p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={handleExportExcel}
          disabled={exporting || loading}
          className="gap-2"
        >
          {exporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileSpreadsheet className="h-4 w-4" />}
          Descargar Excel
        </Button>
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
                  <TableHead className="text-right">Facturas</TableHead>
                  <TableHead className="text-right">Base ventas</TableHead>
                  <TableHead className="text-right">IVA repercutido</TableHead>
                  <TableHead className="text-right">Base compras</TableHead>
                  <TableHead className="text-right">IVA soportado</TableHead>
                  <TableHead className="text-right">Resultado</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {quarters.map(q => {
                  // Heurística: si hay base de compras pero el IVA soportado es 0,
                  // probablemente faltan IVAs registrados en facturas de proveedor.
                  const inconsistente = q.baseImponiblePurchases > 0 && q.ivaSoportado === 0 && q.purchasesCount > 0
                  return (
                    <TableRow key={q.quarter}>
                      <TableCell className="font-bold">{q.quarter}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{q.period}</TableCell>
                      <TableCell className="text-right text-xs text-muted-foreground tabular-nums">
                        {q.salesCount} · {q.purchasesCount}
                      </TableCell>
                      <TableCell className="text-right">{formatCurrency(q.baseImponibleSales)}</TableCell>
                      <TableCell className="text-right">{formatCurrency(q.ivaRepercutido)}</TableCell>
                      <TableCell className="text-right">{formatCurrency(q.baseImponiblePurchases)}</TableCell>
                      <TableCell className="text-right">
                        <span className="inline-flex items-center gap-1 justify-end w-full">
                          {inconsistente && (
                            <AlertTriangle
                              className="h-3.5 w-3.5 text-amber-500"
                              aria-label="Posible inconsistencia: hay base de compras sin IVA registrado"
                            />
                          )}
                          {formatCurrency(q.ivaSoportado)}
                        </span>
                      </TableCell>
                      <TableCell className={`text-right font-bold ${q.resultado >= 0 ? 'text-red-600' : 'text-green-600'}`}>
                        {formatCurrency(q.resultado)}
                      </TableCell>
                    </TableRow>
                  )
                })}
                <TableRow className="bg-muted/60 font-bold">
                  <TableCell colSpan={2}>TOTAL ANUAL {year}</TableCell>
                  <TableCell className="text-right text-xs text-muted-foreground tabular-nums">
                    {totalSalesCount} · {totalPurchCount}
                  </TableCell>
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

          <div className="text-[11px] text-muted-foreground space-y-1 px-1">
            <p>Columna <strong>Facturas</strong>: nº de tickets de ventas · nº de facturas de proveedor en el trimestre.</p>
            <p><strong>Base ventas</strong>: importe sin IVA de tickets cobrados (modelo 303 casilla 01).</p>
            <p><strong>IVA repercutido</strong>: IVA que cobras a tus clientes (casilla 03).</p>
            <p><strong>Base compras</strong>: importe sin IVA de facturas recibidas (casilla 28).</p>
            <p><strong>IVA soportado</strong>: IVA que pagas a tus proveedores y te puedes deducir (casilla 29).</p>
            <p><strong>Resultado</strong>: IVA repercutido − soportado. Positivo = a ingresar a Hacienda; negativo = a tu favor (casilla 71).</p>
            <p>El icono <AlertTriangle className="inline-block h-3 w-3 text-amber-500 -mt-0.5" /> junto a IVA soportado indica que el trimestre tiene base de compras pero IVA registrado a 0 — posible inconsistencia en las facturas de proveedor.</p>
          </div>
        </>
      )}
    </div>
  )
}

// ─── Tab: Movimientos ────────────────────────────────────────────────────────

const INCOME_CATEGORIES = ['sastreria', 'boutique', 'caja', 'Otros ingresos']
const EXPENSE_CATEGORIES = ['Alquiler', 'Nóminas', 'Suministros', 'Material', 'Publicidad', 'Servicios externos', 'Otros gastos']
const ALL_CATEGORIES = [...INCOME_CATEGORIES, ...EXPENSE_CATEGORIES]

const CATEGORY_DISPLAY: Record<string, { label: string; cls: string }> = {
  sastreria: { label: 'Sastrería', cls: 'bg-blue-500/15 text-blue-600 border border-blue-500/20' },
  boutique:  { label: 'Boutique',  cls: 'bg-purple-500/15 text-purple-600 border border-purple-500/20' },
  caja:      { label: 'Caja',      cls: 'bg-gray-500/15 text-gray-600 border border-gray-500/20' },
}
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
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null)
  const [deletingTxn, setDeletingTxn] = useState(false)
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

  const confirmDelete = async () => {
    if (!deleteTargetId) return
    setDeletingTxn(true)
    const r = await deleteManualTransaction({ id: deleteTargetId })
    setDeletingTxn(false)
    setDeleteTargetId(null)
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

  const handleExportExcel = async () => {
    if (filteredRows.length === 0) {
      toast.error('No hay movimientos para exportar')
      return
    }
    const data = filteredRows.map(m => ({
      'Fecha': m.date,
      'Tipo': m.type === 'income' ? 'Ingreso' : 'Gasto',
      'Descripción': m.description,
      'Categoría': m.category ?? '',
      'Base': Number(m.amount) || 0,
      'IVA': Number(m.tax_amount) || 0,
      'Total': Number(m.total) || 0,
      'Tienda': m.storeName ?? '',
    }))
    const monthLabel = filterMonth ? `-${filterYear}-${String(filterMonth).padStart(2, '0')}` : `-${filterYear}`
    await downloadExcel(data, `movimientos${monthLabel}`, 'Movimientos')
  }

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
        <Button variant="outline" size="sm" onClick={handleExportExcel}>
          <Download className="h-4 w-4 mr-2" /> Descargar Excel
        </Button>
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
                    <TableCell>
                      {r.category
                        ? CATEGORY_DISPLAY[r.category]
                          ? <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${CATEGORY_DISPLAY[r.category].cls}`}>{CATEGORY_DISPLAY[r.category].label}</span>
                          : <span className="text-xs text-muted-foreground">{r.category}</span>
                        : <span className="text-muted-foreground">—</span>}
                    </TableCell>
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
                            <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setDeleteTargetId(r.id)}>
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
                    category: t === 'income' ? 'sastreria' : 'Alquiler',
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

      <AlertDialog open={!!deleteTargetId} onOpenChange={(open) => !open && setDeleteTargetId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar cobro?</AlertDialogTitle>
            <AlertDialogDescription>
              Se eliminará este cobro de la contabilidad. Esta acción no se puede deshacer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deletingTxn}>No, volver</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={deletingTxn}
              onClick={confirmDelete}
            >
              Sí, eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

// ─── Tab: Resúmenes de Caja ─────────────────────────────────────────────────

interface CashSession {
  id: string
  opened_at: string | null
  closed_at: string | null
  opened_by: string | null
  closed_by: string | null
  opening_amount: number | null
  opening_breakdown: Record<string, number> | null
  closing_breakdown: Record<string, number> | null
  total_sales: number | null
  total_cash_sales: number | null
  total_card_sales: number | null
  total_bizum_sales: number | null
  total_transfer_sales: number | null
  total_voucher_sales: number | null
  total_returns: number | null
  total_withdrawals: number | null
  total_deposits_collected: number | null
  expected_cash: number | null
  counted_cash: number | null
  cash_difference: number | null
  closing_notes: string | null
  status: string
  store_id: string | null
  opened_by_profile?: { full_name: string } | null
  closed_by_profile?: { full_name: string } | null
  stores?: { name: string } | null
}

interface CajaManualTx {
  id: string
  type: string
  description: string | null
  category: string | null
  amount: number | null
  total: number | null
  notes: string | null
  created_at: string
  created_by: string | null
  cash_session_id: string | null
}

interface CashWithdrawal {
  id: string
  amount: number | null
  reason: string | null
  withdrawn_at: string
  withdrawn_by: string | null
  cash_session_id: string | null
}

interface TimelineEvent {
  type: string
  ts: string | null
  data: Record<string, unknown>
}

interface PaymentRow {
  payment_date: string
  amount: number | null
}

function CajaSessionsTab() {
  const supabase = useMemo(() => createClient(), [])
  const { can } = usePermissions()
  const canManageWithdrawals = can('cash_withdrawals.manage')
  const canManageSessions = can('cash_sessions.manage')
  const [vista, setVista] = useState<'list' | 'detail'>('list')
  const [selectedSession, setSelectedSession] = useState<CashSession | null>(null)
  const [sessions, setSessions] = useState<CashSession[]>([])
  const [cobrosBySession, setCobrosBySession] = useState<Record<string, number>>({})
  const [loading, setLoading] = useState(true)
  const [expandedMonths, setExpandedMonths] = useState<Set<string>>(new Set())
  const [timelineEvents, setTimelineEvents] = useState<TimelineEvent[]>([])
  const [detailLoading, setDetailLoading] = useState(false)
  const [detailTotalCobrosSastreria, setDetailTotalCobrosSastreria] = useState<number>(0)
  const [detailSastreriaByMethod, setDetailSastreriaByMethod] = useState<{ cash: number; card: number; bizum: number; transfer: number }>({ cash: 0, card: 0, bizum: 0, transfer: 0 })
  // Editar/borrar retiradas de caja (permiso cash_withdrawals.manage)
  const [wdEdit, setWdEdit] = useState<{ id: string; amount: string; reason: string } | null>(null)
  const [wdSaving, setWdSaving] = useState(false)
  const [wdDelete, setWdDelete] = useState<{ id: string; amount: number } | null>(null)
  const [wdDeleting, setWdDeleting] = useState(false)
  // Corregir/reabrir/borrar sesión de caja (permiso cash_sessions.manage)
  const [arqueoEdit, setArqueoEdit] = useState<
    { sessionId: string; openingAmount: string; countedCash: string; closingNotes: string
      origOpening: number; origCounted: number; origNotes: string
      totalCashSales: number; totalReturns: number; totalWithdrawals: number } | null>(null)
  const [arqueoSaving, setArqueoSaving] = useState(false)
  const [reopenTarget, setReopenTarget] = useState<{ sessionId: string; date: string } | null>(null)
  const [reopening, setReopening] = useState(false)
  const [delSessionTarget, setDelSessionTarget] = useState<{ sessionId: string; date: string } | null>(null)
  const [delSessionLoading, setDelSessionLoading] = useState(false)

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
      const list = (sessData ?? []) as unknown as CashSession[]
      setSessions(list)
      if (list.length > 0) {
        const ids = list.map((s: CashSession) => s.id).filter(Boolean)
        const { data: topSums } = await supabase
          .from('tailoring_order_payments')
          .select('cash_session_id, amount')
          .in('cash_session_id', ids)
        const bySession: Record<string, number> = {}
        for (const row of topSums ?? []) {
          const id = row.cash_session_id
          if (id) bySession[id] = (bySession[id] ?? 0) + Number(row.amount ?? 0)
        }
        const zeroSessions = list.filter((s: CashSession) => (bySession[s.id] ?? 0) === 0)
        if (zeroSessions.length > 0) {
          const openedDates = zeroSessions.map((s: CashSession) => s.opened_at ? s.opened_at.split('T')[0] : null).filter((d): d is string => d !== null)
          const closedDates = zeroSessions.map((s: CashSession) => s.closed_at ? s.closed_at.split('T')[0] : new Date().toISOString().split('T')[0])
          const minDate = openedDates.length ? openedDates.reduce((a, b) => a < b ? a : b) : null
          const maxDate = closedDates.reduce((a, b) => a > b ? a : b)
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
              const sum2 = (fallbackRows ?? []).reduce((acc: number, r: PaymentRow) => {
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
    const map: Record<string, CashSession[]> = {}
    for (const s of sessions) {
      const d = s.opened_at ? new Date(s.opened_at) : new Date()
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
      if (!map[key]) map[key] = []
      map[key].push(s)
    }
    const keys = Object.keys(map).sort().reverse()
    return { keys, map }
  }, [sessions])

  const loadDetail = useCallback(async (session: CashSession) => {
    setSelectedSession(session)
    setVista('detail')
    setDetailLoading(true)
    const openedDate = session.opened_at ? session.opened_at.split('T')[0] : null
    const openedAtFull = session.opened_at
    const closedAtFull = session.closed_at ?? new Date().toISOString()

    let txData: CajaManualTx[] = []
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

    const manual = txData.map((r: CajaManualTx) => ({ type: 'manual', ts: r.created_at, data: r as unknown as Record<string, unknown> }))
    const withdrawals = wdData.map((r: CashWithdrawal) => ({ type: 'withdrawal', ts: r.withdrawn_at, data: r as unknown as Record<string, unknown> }))
    const merged = [apertura, ...manual, ...withdrawals, ...(cierre ? [cierre] : [])].sort(
      (a, b) => new Date(a.ts || 0).getTime() - new Date(b.ts || 0).getTime()
    )
    setTimelineEvents(merged)

    const sumBySession = txData
      .filter((r: CajaManualTx) => r.category === 'sastreria')
      .reduce((acc: number, r: CajaManualTx) => acc + Number(r.total ?? 0), 0)
    if (sumBySession > 0) {
      setDetailTotalCobrosSastreria(sumBySession)
    } else if (openedDate) {
      const { data: mtSastreriaRange } = await supabase
        .from('manual_transactions')
        .select('total')
        .eq('category', 'sastreria')
        .gte('created_at', openedAtFull)
        .lte('created_at', closedAtFull)
      const fallbackSum = (mtSastreriaRange ?? []).reduce((acc: number, r: { total: number | null }) => acc + Number(r.total ?? 0), 0)
      setDetailTotalCobrosSastreria(fallbackSum)
    } else {
      setDetailTotalCobrosSastreria(0)
    }

    // Desglose de cobros sastrería por método de pago (para el arqueo PDF y vista)
    const byMethod = { cash: 0, card: 0, bizum: 0, transfer: 0 }
    const { data: sastPays } = await supabase
      .from('tailoring_order_payments')
      .select('amount, payment_method')
      .eq('cash_session_id', session.id)
    for (const p of sastPays ?? []) {
      const m = String(p.payment_method ?? '').toLowerCase()
      const amt = Number(p.amount ?? 0)
      if (m === 'cash' || m === 'efectivo') byMethod.cash += amt
      else if (m === 'card' || m === 'tarjeta') byMethod.card += amt
      else if (m === 'bizum') byMethod.bizum += amt
      else if (m === 'transfer' || m === 'transferencia') byMethod.transfer += amt
    }
    setDetailSastreriaByMethod(byMethod)

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
      .filter((ev: TimelineEvent) => ev.type === 'manual' && ev.data?.type === 'income' && (typeof ev.data?.notes === 'string' && ev.data.notes.toLowerCase().includes('efectivo')))
      .reduce((sum: number, ev: TimelineEvent) => sum + Number(ev.data?.total ?? 0), 0)
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

    // Refrescar el detalle tras editar/reabrir: re-lee la sesión (totales, arqueo,
    // estado) y la mezcla en selectedSession (el arqueo se recalcula en cliente).
    const refreshSessionDetail = async () => {
      const { data: fresh } = await supabase
        .from('cash_sessions')
        .select('total_withdrawals, expected_cash, cash_difference, counted_cash, opening_amount, status, closed_at, closed_by, closing_notes, opening_breakdown, closing_breakdown')
        .eq('id', s.id)
        .single()
      if (fresh) setSessions((prev) => prev.map((x) => (x.id === s.id ? { ...x, ...fresh } : x)))
      await loadDetail({ ...s, ...(fresh ?? {}) } as CashSession)
    }

    // ── Corregir/reabrir/borrar sesión ──
    const isEmptySession = s.status === 'closed'
      && Number(s.total_sales ?? 0) === 0 && Number(s.total_returns ?? 0) === 0 && Number(s.total_withdrawals ?? 0) === 0
      && !timelineEvents.some((ev) => ev.type === 'withdrawal')

    const handleArqueoSave = async () => {
      if (!arqueoEdit) return
      const newOpening = parseFloat(arqueoEdit.openingAmount)
      const newCounted = parseFloat(arqueoEdit.countedCash)
      if (isNaN(newOpening) || newOpening < 0) { toast.error('El fondo de apertura no puede ser negativo'); return }
      if (isNaN(newCounted) || newCounted < 0) { toast.error('El efectivo contado no puede ser negativo'); return }
      const newExpected = newOpening + arqueoEdit.totalCashSales - arqueoEdit.totalReturns - arqueoEdit.totalWithdrawals
      const newDiff = newCounted - newExpected
      if (Math.abs(newDiff) > 5 && !window.confirm(`Esta sesión quedará con un descuadre de ${formatCurrency(newDiff)}. ¿Continuar?`)) return

      const openingChanged = Math.abs(newOpening - arqueoEdit.origOpening) >= 0.01
      const closeChanged = Math.abs(newCounted - arqueoEdit.origCounted) >= 0.01 || (arqueoEdit.closingNotes.trim() !== (arqueoEdit.origNotes ?? ''))
      if (!openingChanged && !closeChanged) { toast.info('No hay cambios'); setArqueoEdit(null); return }

      setArqueoSaving(true)
      try {
        if (openingChanged) {
          const r = await updateCashSessionOpening({ sessionId: arqueoEdit.sessionId, openingAmount: newOpening })
          if (!r.success) { toast.error(r.error); return }
        }
        if (closeChanged) {
          const r = await updateCashSessionClose({ sessionId: arqueoEdit.sessionId, countedCash: newCounted, closingNotes: arqueoEdit.closingNotes.trim() || null })
          if (!r.success) { toast.error(r.error); return }
        }
        toast.success('Arqueo corregido')
        setArqueoEdit(null)
        await refreshSessionDetail()
      } finally {
        setArqueoSaving(false)
      }
    }

    const handleReopen = async () => {
      if (!reopenTarget) return
      setReopening(true)
      const r = await reopenCashSession({ sessionId: reopenTarget.sessionId })
      setReopening(false)
      setReopenTarget(null)
      if (r.success) { toast.success('Sesión reabierta'); await refreshSessionDetail() }
      else toast.error(r.error)
    }

    const handleDeleteSession = async () => {
      if (!delSessionTarget) return
      setDelSessionLoading(true)
      const r = await deleteCashSession({ sessionId: delSessionTarget.sessionId })
      setDelSessionLoading(false)
      setDelSessionTarget(null)
      if (r.success) {
        toast.success('Sesión eliminada')
        setSessions((prev) => prev.filter((x) => x.id !== s.id))
        setVista('list'); setSelectedSession(null); setTimelineEvents([])
      } else toast.error(r.error)
    }

    const handleWithdrawalSave = async () => {
      if (!wdEdit) return
      const amount = parseFloat(wdEdit.amount)
      if (!amount || amount <= 0) { toast.error('El importe debe ser mayor que 0'); return }
      if (!wdEdit.reason.trim()) { toast.error('El motivo no puede estar vacío'); return }
      setWdSaving(true)
      const r = await updateWithdrawal({ withdrawalId: wdEdit.id, amount, reason: wdEdit.reason.trim() })
      setWdSaving(false)
      if (r.success) { toast.success('Retirada actualizada'); setWdEdit(null); await refreshSessionDetail() }
      else toast.error(r.error)
    }

    const handleWithdrawalDelete = async () => {
      if (!wdDelete) return
      setWdDeleting(true)
      const r = await deleteWithdrawal({ withdrawalId: wdDelete.id })
      setWdDeleting(false)
      setWdDelete(null)
      if (r.success) { toast.success('Retirada eliminada'); await refreshSessionDetail() }
      else toast.error(r.error)
    }

    return (
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <Button variant="outline" size="sm" onClick={() => { setVista('list'); setSelectedSession(null); setTimelineEvents([]); setDetailTotalCobrosSastreria(0); setDetailSastreriaByMethod({ cash: 0, card: 0, bizum: 0, transfer: 0 }) }}>
            ← Volver al listado
          </Button>
          {s.status === 'closed' && (
            <button
              type="button"
              onClick={async () => {
                try {
                  await generateCashSessionReport({
                    storeName: s.stores?.name ?? s.store_id ?? 'Sin tienda',
                    openedBy: s.opened_by_profile?.full_name ?? s.opened_by ?? '—',
                    closedBy: s.closed_by_profile?.full_name ?? s.closed_by ?? '—',
                    openedAt: s.opened_at ?? '',
                    closedAt: s.closed_at ?? '',
                    openingAmount: Number(s.opening_amount ?? 0),
                    openingBreakdown: s.opening_breakdown ?? undefined,
                    closingBreakdown: s.closing_breakdown ?? undefined,
                    totalSales: Number(s.total_sales ?? 0),
                    totalCashSales: Number(s.total_cash_sales ?? 0),
                    totalCardSales: Number(s.total_card_sales ?? 0),
                    totalBizumSales: Number(s.total_bizum_sales ?? 0),
                    totalTransferSales: Number(s.total_transfer_sales ?? 0),
                    totalVoucherSales: Number(s.total_voucher_sales ?? 0),
                    totalReturns: Number(s.total_returns ?? 0),
                    totalWithdrawals: Number(s.total_withdrawals ?? 0),
                    depositsCollected: Number(s.total_deposits_collected ?? 0),
                    expectedCash: Number(s.expected_cash ?? 0),
                    countedCash: Number(s.counted_cash ?? 0),
                    cashDifference: Number(s.cash_difference ?? 0),
                    closingNotes: s.closing_notes ?? undefined,
                    sastreriaCashPayments: detailSastreriaByMethod.cash,
                    sastreriaCardPayments: detailSastreriaByMethod.card,
                    sastreriaBizumPayments: detailSastreriaByMethod.bizum,
                    sastreriaTransferPayments: detailSastreriaByMethod.transfer,
                  })
                } catch {
                  console.error('Error generando PDF de arqueo')
                }
              }}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-[#1B2A4A] text-white text-sm font-medium hover:bg-[#2D4470] transition-colors"
            >
              📄 Descargar arqueo
            </button>
          )}
          {canManageSessions && s.status === 'closed' && (
            <>
              <Button variant="outline" size="sm" onClick={() => setArqueoEdit({
                sessionId: s.id,
                openingAmount: String(Number(s.opening_amount ?? 0)),
                countedCash: String(Number(s.counted_cash ?? 0)),
                closingNotes: s.closing_notes ?? '',
                origOpening: Number(s.opening_amount ?? 0),
                origCounted: Number(s.counted_cash ?? 0),
                origNotes: s.closing_notes ?? '',
                totalCashSales: Number(s.total_cash_sales ?? 0),
                totalReturns: Number(s.total_returns ?? 0),
                totalWithdrawals: Number(s.total_withdrawals ?? 0),
              })}>
                <Pencil className="h-4 w-4 mr-1.5" /> Editar arqueo
              </Button>
              <Button variant="outline" size="sm" onClick={() => setReopenTarget({ sessionId: s.id, date: dateLong })}>
                <Lock className="h-4 w-4 mr-1.5" /> Reabrir
              </Button>
              {isEmptySession && (
                <Button variant="outline" size="sm" className="text-red-600 hover:text-red-700 hover:bg-red-50" onClick={() => setDelSessionTarget({ sessionId: s.id, date: dateLong })}>
                  <Trash2 className="h-4 w-4 mr-1.5" /> Borrar sesión
                </Button>
              )}
            </>
          )}
        </div>

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
                      const who = (d?.creator as { full_name?: string })?.full_name ?? (d?.profiles as { full_name?: string })?.full_name ?? d?.created_by ?? ''
                      const desc = String(isAperturaEv ? 'Apertura de caja' : isCierreEv ? 'Cierre de caja' : isManual ? (d?.description ?? '—') : (d?.reason ?? 'Retirada'))
                      const amount = Number(isManual ? d?.total : d?.amount) ?? (isAperturaEv ? Number(d?.total ?? 0) : 0)
                      const isIncome = isManual && d?.type === 'income'
                      const category = String(d?.category ?? '')
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

                      const methodLabel = formatMethod(d?.notes as string | null)
                      return (
                        <div key={ev.type + String(d?.id ?? '') + i} className="py-3 first:pt-0">
                          <div className="flex items-start gap-3">
                            <span className="text-sm text-muted-foreground w-12 shrink-0 tabular-nums">{formatTime(ts)}</span>
                            <span className="text-lg shrink-0">{icon}</span>
                            <div className="min-w-0 flex-1">
                              <p className={`text-sm font-medium ${textClass}`}>{desc}</p>
                              <p className="text-xs text-muted-foreground mt-0.5">{String(who)}</p>
                              {isRetirada && !!(d?.reason || (isManual && d?.description)) && <p className="text-xs text-red-600/80 mt-0.5">{String(d?.reason || d?.description)}</p>}
                              {isCobro && methodLabel && <div className="mt-1"><PaymentMethodBadge method={methodLabel} /></div>}
                            </div>
                            <span className={`text-sm font-medium tabular-nums shrink-0 ${amountClass}`}>
                              {isCierre ? '—' : isApertura ? (Number(s.opening_amount || 0).toFixed(2) + ' €') : (isRetirada ? '-' : isIncome ? '+' : '') + formatCurrency(amount)}
                            </span>
                            {ev.type === 'withdrawal' && canManageWithdrawals && (
                              <div className="flex items-center gap-0.5 shrink-0">
                                <Button
                                  variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-foreground"
                                  title="Editar retirada"
                                  onClick={() => setWdEdit({ id: String(d?.id), amount: String(d?.amount ?? ''), reason: String(d?.reason ?? '') })}
                                >
                                  <Pencil className="h-3.5 w-3.5" />
                                </Button>
                                <Button
                                  variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-red-600"
                                  title="Borrar retirada"
                                  onClick={() => setWdDelete({ id: String(d?.id), amount: Number(d?.amount ?? 0) })}
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </Button>
                              </div>
                            )}
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

        {/* Editar retirada de caja */}
        <Dialog open={!!wdEdit} onOpenChange={(o) => { if (!o) setWdEdit(null) }}>
          <DialogContent>
            <DialogHeader><DialogTitle>Editar retirada de caja</DialogTitle></DialogHeader>
            <div className="space-y-4 py-2">
              <div className="space-y-2">
                <Label>Importe (€)</Label>
                <Input type="number" step="0.01" value={wdEdit?.amount ?? ''} autoFocus
                  onChange={(e) => setWdEdit((p) => (p ? { ...p, amount: e.target.value } : p))} />
              </div>
              <div className="space-y-2">
                <Label>Motivo</Label>
                <Input value={wdEdit?.reason ?? ''}
                  onChange={(e) => setWdEdit((p) => (p ? { ...p, reason: e.target.value } : p))} />
              </div>
              {s.status === 'closed' && (
                <p className="text-xs text-muted-foreground">Esta sesión está cerrada: se recalculará el efectivo esperado y el descuadre.</p>
              )}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setWdEdit(null)} disabled={wdSaving}>Cancelar</Button>
              <Button onClick={handleWithdrawalSave} disabled={wdSaving}>
                {wdSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}Guardar
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Borrar retirada de caja */}
        <AlertDialog open={!!wdDelete} onOpenChange={(o) => { if (!o) setWdDelete(null) }}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>¿Borrar esta retirada?</AlertDialogTitle>
              <AlertDialogDescription>
                Se eliminará la retirada de {formatCurrency(wdDelete?.amount ?? 0)} y se ajustará el arqueo de la sesión{s.status === 'closed' ? ' (efectivo esperado y descuadre)' : ''}. Esta acción no se puede deshacer.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={wdDeleting}>Cancelar</AlertDialogCancel>
              <AlertDialogAction onClick={(e) => { e.preventDefault(); handleWithdrawalDelete() }} disabled={wdDeleting} className="bg-red-600 hover:bg-red-700">
                {wdDeleting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}Borrar
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* Editar arqueo (fondo + cierre) */}
        <Dialog open={!!arqueoEdit} onOpenChange={(o) => { if (!o) setArqueoEdit(null) }}>
          <DialogContent>
            <DialogHeader><DialogTitle>Editar arqueo de caja</DialogTitle></DialogHeader>
            {arqueoEdit && (() => {
              const o = parseFloat(arqueoEdit.openingAmount) || 0
              const c = parseFloat(arqueoEdit.countedCash) || 0
              const exp = o + arqueoEdit.totalCashSales - arqueoEdit.totalReturns - arqueoEdit.totalWithdrawals
              const diff = Math.round((c - exp) * 100) / 100
              return (
                <div className="space-y-4 py-2">
                  <div className="space-y-2">
                    <Label>Fondo de apertura (€)</Label>
                    <Input type="number" step="0.01" value={arqueoEdit.openingAmount}
                      onChange={(e) => setArqueoEdit((p) => (p ? { ...p, openingAmount: e.target.value } : p))} />
                  </div>
                  <div className="space-y-2">
                    <Label>Efectivo contado (€)</Label>
                    <Input type="number" step="0.01" value={arqueoEdit.countedCash}
                      onChange={(e) => setArqueoEdit((p) => (p ? { ...p, countedCash: e.target.value } : p))} />
                  </div>
                  <div className="space-y-2">
                    <Label>Notas de cierre</Label>
                    <Textarea rows={2} value={arqueoEdit.closingNotes}
                      onChange={(e) => setArqueoEdit((p) => (p ? { ...p, closingNotes: e.target.value } : p))} />
                  </div>
                  <div className="rounded-md border p-3 text-sm space-y-1 bg-muted/30">
                    <div className="flex justify-between"><span className="text-muted-foreground">Efectivo esperado (recalculado)</span><span className="tabular-nums">{formatCurrency(exp)}</span></div>
                    <div className="flex justify-between font-medium"><span className="text-muted-foreground">Descuadre</span><span className={`tabular-nums ${diff === 0 ? 'text-green-600' : 'text-red-600'}`}>{formatCurrency(diff)}</span></div>
                  </div>
                  {diff !== 0 && (
                    <p className="text-xs text-red-600">Esta sesión quedará con un descuadre de {formatCurrency(diff)}.</p>
                  )}
                </div>
              )
            })()}
            <DialogFooter>
              <Button variant="outline" onClick={() => setArqueoEdit(null)} disabled={arqueoSaving}>Cancelar</Button>
              <Button onClick={handleArqueoSave} disabled={arqueoSaving}>
                {arqueoSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}Guardar
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Reabrir sesión */}
        <AlertDialog open={!!reopenTarget} onOpenChange={(o) => { if (!o) setReopenTarget(null) }}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>¿Reabrir esta sesión de caja?</AlertDialogTitle>
              <AlertDialogDescription>
                Vas a reabrir la sesión de {reopenTarget?.date}. Mientras esté abierta, los nuevos pagos y retiradas de esta tienda se atribuirán a esta sesión, no a una nueva. Si la tienda ya tiene otra caja abierta, no se podrá reabrir.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={reopening}>Cancelar</AlertDialogCancel>
              <AlertDialogAction onClick={(e) => { e.preventDefault(); handleReopen() }} disabled={reopening}>
                {reopening ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}Reabrir
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* Borrar sesión */}
        <AlertDialog open={!!delSessionTarget} onOpenChange={(o) => { if (!o) setDelSessionTarget(null) }}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>¿Borrar esta sesión de caja?</AlertDialogTitle>
              <AlertDialogDescription>
                Vas a borrar la sesión de {delSessionTarget?.date}. Solo se permite si está vacía (sin ventas ni retiradas). Esta acción no se puede deshacer.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={delSessionLoading}>Cancelar</AlertDialogCancel>
              <AlertDialogAction onClick={(e) => { e.preventDefault(); handleDeleteSession() }} disabled={delSessionLoading} className="bg-red-600 hover:bg-red-700">
                {delSessionLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}Borrar
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    )
  }

  const handleExportExcel = async () => {
    if (sessions.length === 0) {
      toast.error('No hay sesiones de caja para exportar')
      return
    }
    const data = sessions.map(s => ({
      'Tienda': s.stores?.name ?? '',
      'Apertura': s.opened_at ?? '',
      'Cierre': s.closed_at ?? '',
      'Fondo inicial': Number(s.opening_amount) || 0,
      'Ventas Efectivo': Number(s.total_cash_sales) || 0,
      'Ventas Tarjeta': Number(s.total_card_sales) || 0,
      'Ventas Bizum': Number(s.total_bizum_sales) || 0,
      'Ventas Transferencia': Number(s.total_transfer_sales) || 0,
      'Total Ventas': Number(s.total_sales) || 0,
      'Devoluciones': Number(s.total_returns) || 0,
      'Diferencia': Number(s.cash_difference) || 0,
      'Estado': s.status,
    }))
    await downloadExcel(data, 'sesiones-caja', 'Caja')
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div>
              <CardTitle className="text-base">Sesiones de caja</CardTitle>
              <p className="text-sm text-muted-foreground">Agrupadas por mes. Clic en un mes para expandir/colapsar. Clic en una fila para ver el detalle.</p>
            </div>
            <Button variant="outline" size="sm" onClick={handleExportExcel}>
              <Download className="h-4 w-4 mr-2" /> Descargar Excel
            </Button>
          </div>
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
                              <TableHead>Tienda</TableHead>
                              <TableHead>Hora apertura</TableHead>
                              <TableHead>Abrió</TableHead>
                              <TableHead>Hora cierre</TableHead>
                              <TableHead>Cerró</TableHead>
                              <TableHead className="text-right">Total entrada</TableHead>
                              <TableHead>Estado</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {list.map((s: CashSession) => {
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
                                  <TableCell className="text-sm">{s.stores?.name ?? '—'}</TableCell>
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
