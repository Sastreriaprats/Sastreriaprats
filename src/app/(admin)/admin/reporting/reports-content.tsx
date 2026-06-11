'use client'

import { useState, useEffect, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Input } from '@/components/ui/input'
import { DatePickerPopover } from '@/components/ui/date-picker-popover'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  TrendingUp, TrendingDown, DollarSign, Users, ShoppingBag, Scissors,
  BarChart3, FileSpreadsheet, FileText, Loader2, Store, UserCog, Clock, Wallet,
  Flame, Star, Receipt, Layers,
} from 'lucide-react'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, CartesianGrid } from 'recharts'
import { useAuth } from '@/components/providers/auth-provider'
import { getSalesReport, getComparePeriods, getTopProducts, getTailorPerformance, getClientsAnalytics, getClientsAdvancedAnalytics, getSalesByStore, getSalesByEmployee, getSalesByTimePattern, getExpensesReport, getExpensesComparison, getTailoringByCategory, type ReportChannel, type TaxMode, type ClientsAdvancedAnalytics, type TailoringCategoryRow } from '@/actions/reports'
import { getStoresList } from '@/actions/config'
import { SalesChart } from './charts/sales-chart'
import { TopProductsChart } from './charts/top-products-chart'
import { TailorTable } from './tables/tailor-table'
import { ClientsChart } from './charts/clients-chart'
import { formatCurrency, normalizeSearchTerm } from '@/lib/utils'
import { toast } from 'sonner'

function getDefaultStart() {
  const d = new Date()
  d.setDate(1)
  return d.toISOString().split('T')[0]
}
function getDefaultEnd() {
  return new Date().toISOString().split('T')[0]
}

type SalesData = {
  chartData: { date: string; pos: number; online: number; tailoring: number; total: number }[]
  totals: { pos: number; online: number; tailoring: number; total: number; ticketCount: number; avgTicket: number }
  byStore?: { store_id: string; store_name: string; boutique: number; gift_cards: number; online: number; tailoring: number; total: number }[]
}

type TailoringByCatData = {
  breakdown: TailoringCategoryRow[]
  total: { amount: number; garments: number }
  byStore?: { store_id: string; store_name: string; total: number; amounts: { category: string; amount: number }[] }[]
}

type CompareData = {
  current: { revenue: number; newClients: number; ordersCount: number }
  previous: { revenue: number; newClients: number; ordersCount: number }
  changes: { revenue: number; newClients: number; ordersCount: number }
}

type ProductItem = { name: string; sku: string; units: number; revenue: number }

type TailorItem = {
  tailor_id: string; name: string; orders: number; revenue: number
  fittings: number; completed: number; avgOrderValue: number; completionRate: number
  paid_in_period: number; pending_of_period_orders: number; paidRate: number
}

type ClientsData = {
  newClients: number; totalClientsHistorical: number
  sources: Record<string, number>
  topClients: { full_name: string; total_revenue: number }[]
  clientsWithPurchases: number
}

type StoreItem = { store_id: string; store_name: string; pos: number; gift_cards: number; tailoring: number; total: number }

type EmployeeItem = {
  employee_id: string; employee_name: string
  pos_ops: number; pos_total: number; boutique_total: number
  tailoring_ops: number; tailoring_total: number
  tailor_orders_count: number; tailor_orders_revenue: number
  total: number
}

type StoreOption = { id: string; name: string }

type TimePatternData = {
  byHour: { hour: number; total: number; count: number }[]
  byDayOfWeek: { day: number; label: string; total: number; count: number }[]
}

type ExpensesData = {
  byCategory: { category: string; count: number; total: number }[]
  grandTotal: number
  recentExpenses: { description: string; category: string; total: number; date: string }[]
  providersBreakdown: {
    type: string
    label: string
    total: number
    count: number
    invoices: { invoice_number: string; supplier_name: string; total: number; count: number }[]
  }[]
}

type ExpensesComparison = { current: number; previous: number; change: number }

export function ReportsContent() {
  const { activeStoreId } = useAuth()
  const [dateRange, setDateRange] = useState({ start: getDefaultStart(), end: getDefaultEnd() })
  const [groupBy, setGroupBy] = useState<'day' | 'week' | 'month'>('day')
  const [isLoading, setIsLoading] = useState(true)
  const [salesData, setSalesData] = useState<SalesData | null>(null)
  const [compareData, setCompareData] = useState<CompareData | null>(null)
  const [topProducts, setTopProducts] = useState<ProductItem[]>([])
  const [productSearch, setProductSearch] = useState('')
  const [tailorData, setTailorData] = useState<TailorItem[]>([])
  const [clientsData, setClientsData] = useState<ClientsData | null>(null)
  const [clientsAdvanced, setClientsAdvanced] = useState<ClientsAdvancedAnalytics | null>(null)
  const [storeData, setStoreData] = useState<StoreItem[]>([])
  const [employeeData, setEmployeeData] = useState<EmployeeItem[]>([])
  const [timePatternData, setTimePatternData] = useState<TimePatternData | null>(null)
  const [tailoringByCat, setTailoringByCat] = useState<TailoringByCatData | null>(null)
  const [expensesData, setExpensesData] = useState<ExpensesData | null>(null)
  const [expensesComparison, setExpensesComparison] = useState<ExpensesComparison | null>(null)
  const [isExporting, setIsExporting] = useState(false)
  const [activeTab, setActiveTab] = useState<string>('sales')
  const [stores, setStores] = useState<StoreOption[]>([])
  const [storeFilter, setStoreFilter] = useState<string>(activeStoreId || 'all')
  const [channelFilter, setChannelFilter] = useState<ReportChannel>('all')
  const [taxMode, setTaxMode] = useState<TaxMode>('without_tax')
  // Dimensión nº4: desglose por tienda. Estado COMPARTIDO por todas las pestañas
  // que lo soporten (Ventas ahora; nº5/nº10/hora/clientes después). Solo aplica
  // cuando no hay una tienda concreta filtrada (storeFilter='all').
  const [groupByStore, setGroupByStore] = useState(false)

  useEffect(() => {
    let alive = true
    getStoresList().then(res => {
      if (!alive) return
      if (res.data) setStores(res.data.map(s => ({ id: s.id, name: s.display_name || s.name })))
    })
    return () => { alive = false }
  }, [])

  const fetchAll = useCallback(async () => {
    setIsLoading(true)
    try {
      const { start, end } = dateRange
      const storeId = storeFilter === 'all' ? undefined : storeFilter
      const channel = channelFilter
      const tax_mode = taxMode

      const startD = new Date(start)
      const endD = new Date(end)
      const diff = endD.getTime() - startD.getTime()
      const prevEnd = new Date(startD.getTime() - 86400000)
      const prevStart = new Date(prevEnd.getTime() - diff)

      const prevStartStr = prevStart.toISOString().split('T')[0]
      const prevEndStr = prevEnd.toISOString().split('T')[0]

      const [salesRes, compareRes, productsRes, tailorRes, clientsRes, clientsAdvRes, storeRes, employeeRes, timeRes, expensesRes, expCompRes, tailoringCatRes] = await Promise.all([
        getSalesReport({ start_date: start, end_date: end, store_id: storeId, channel, group_by: groupBy, tax_mode }),
        getComparePeriods({
          current_start: start, current_end: end,
          previous_start: prevStartStr, previous_end: prevEndStr,
          store_id: storeId, channel, tax_mode,
        }),
        getTopProducts({ start_date: start, end_date: end, store_id: storeId, channel, limit: 50, tax_mode }),
        getTailorPerformance({ start_date: start, end_date: end, store_id: storeId, channel, tax_mode }),
        getClientsAnalytics({ start_date: start, end_date: end, store_id: storeId }),
        getClientsAdvancedAnalytics({ start_date: start, end_date: end, store_id: storeId }),
        getSalesByStore({ start_date: start, end_date: end, store_id: storeId, channel, tax_mode }),
        getSalesByEmployee({ start_date: start, end_date: end, store_id: storeId, channel, tax_mode }),
        getSalesByTimePattern({ start_date: start, end_date: end, store_id: storeId, channel, tax_mode }),
        getExpensesReport({ start_date: start, end_date: end, tax_mode }),
        getExpensesComparison({ current_start: start, current_end: end, previous_start: prevStartStr, previous_end: prevEndStr, tax_mode }),
        getTailoringByCategory({ start_date: start, end_date: end, store_id: storeId }),
      ])

      if (salesRes.success) setSalesData(salesRes.data)
      if (compareRes.success) setCompareData(compareRes.data)
      if (productsRes.success) setTopProducts(productsRes.data)
      if (tailorRes.success) setTailorData(tailorRes.data)
      if (clientsRes.success) setClientsData(clientsRes.data)
      if (clientsAdvRes.success) setClientsAdvanced(clientsAdvRes.data)
      if (storeRes.success) setStoreData(storeRes.data)
      if (employeeRes.success) setEmployeeData(employeeRes.data)
      if (timeRes.success) setTimePatternData(timeRes.data)
      if (expensesRes.success) setExpensesData(expensesRes.data)
      if (expCompRes.success) setExpensesComparison(expCompRes.data)
      if (tailoringCatRes.success) setTailoringByCat(tailoringCatRes.data)
    } catch (err) {
      console.error('[ReportsContent fetchAll]', err)
      toast.error('Error al cargar los informes')
    } finally {
      setIsLoading(false)
    }
  }, [dateRange, groupBy, storeFilter, channelFilter, taxMode])

  useEffect(() => { fetchAll() }, [fetchAll])

  const setPreset = (preset: string) => {
    const now = new Date()
    let start: Date
    const end: Date = now
    switch (preset) {
      case 'today': start = new Date(now); break
      case 'week': start = new Date(now); start.setDate(now.getDate() - 7); break
      case 'month': start = new Date(now.getFullYear(), now.getMonth(), 1); break
      case 'quarter': start = new Date(now.getFullYear(), Math.floor(now.getMonth() / 3) * 3, 1); break
      case 'year': start = new Date(now.getFullYear(), 0, 1); break
      default: start = new Date(now.getFullYear(), now.getMonth(), 1)
    }
    setDateRange({ start: start.toISOString().split('T')[0], end: end.toISOString().split('T')[0] })
  }

  const activeStoreName = storeFilter === 'all'
    ? 'Todas las tiendas'
    : (stores.find(s => s.id === storeFilter)?.name || '')

  // Desglose por tienda activo solo en modo "Todas" + toggle on. Cada pestaña que
  // lo soporte mapea su `byStore` a StoreBreakdownRow[] aquí.
  const showStoreBreakdown = groupByStore && storeFilter === 'all'
  const salesStoreBreakdown: StoreBreakdownRow[] | null = showStoreBreakdown && salesData?.byStore
    ? salesData.byStore.map(s => ({
        store_id: s.store_id, store_name: s.store_name, total: s.total,
        metrics: [
          { key: 'boutique', label: 'Boutique', value: s.boutique, color: SALES_STORE_COLORS.boutique },
          { key: 'gift_cards', label: 'Tarjetas regalo', value: s.gift_cards, color: SALES_STORE_COLORS.gift_cards },
          { key: 'online', label: 'Online', value: s.online, color: SALES_STORE_COLORS.online },
          { key: 'tailoring', label: 'Sastrería', value: s.tailoring, color: SALES_STORE_COLORS.tailoring },
        ],
      }))
    : null

  const tailoringStoreBreakdown: StoreBreakdownRow[] | null = showStoreBreakdown && tailoringByCat?.byStore
    ? (() => {
        const labelOf = new Map<string, string>(tailoringByCat.breakdown.map(b => [b.category as string, b.label]))
        return tailoringByCat.byStore.map(s => ({
          store_id: s.store_id, store_name: s.store_name, total: s.total,
          metrics: s.amounts.map(a => ({
            key: a.category, label: labelOf.get(a.category) || a.category,
            value: a.amount, color: CATEGORY_COLORS[a.category] || '#64748b',
          })),
        }))
      })()
    : null

  const channelLabel = channelFilter === 'boutique'
    ? 'Boutique'
    : channelFilter === 'tailoring'
      ? 'Sastrería'
      : 'Todos los canales'

  const taxLabel = taxMode === 'without_tax' ? 'Sin IVA (base imponible)' : 'Con IVA'

  const buildExportPayload = () => ({
    ...dateRange,
    tab: activeTab,
    storeFilter: storeFilter === 'all' ? null : storeFilter,
    storeFilterName: activeStoreName,
    channelFilter,
    channelLabel,
    taxMode,
    taxLabel,
    salesData,
    compareData,
    topProducts,
    tailorData,
    clientsData,
    clientsAdvanced,
    storeData,
    employeeData,
    timePatternData,
    expensesData,
    expensesComparison,
  })

  const handleExportPDF = async () => {
    setIsExporting(true)
    try {
      const res = await fetch('/api/reports/export-pdf', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(buildExportPayload()),
      })
      if (res.ok) {
        const blob = await res.blob()
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = `informe-prats-${activeTab}-${dateRange.start}-${dateRange.end}.html`
        a.click()
        URL.revokeObjectURL(url)
        toast.success('PDF descargado')
      }
    } catch {
      toast.error('Error al exportar')
    }
    setIsExporting(false)
  }

  const handleExportExcel = async () => {
    setIsExporting(true)
    try {
      const res = await fetch('/api/reports/export-excel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(buildExportPayload()),
      })
      if (res.ok) {
        const blob = await res.blob()
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = `informe-prats-${activeTab}-${dateRange.start}-${dateRange.end}.xlsx`
        a.click()
        URL.revokeObjectURL(url)
        toast.success('Excel descargado')
      }
    } catch {
      toast.error('Error al exportar')
    }
    setIsExporting(false)
  }

  const pctBadge = (value: number) => (
    <span className={`inline-flex items-center gap-0.5 text-xs font-medium ${value >= 0 ? 'text-green-600' : 'text-red-600'}`}>
      {value >= 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
      {Math.abs(value).toFixed(1)}%
    </span>
  )

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Informes</h1>
          <p className="text-muted-foreground">
            Análisis de ventas, clientes y rendimiento
            <span className="ml-2 inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
              {taxMode === 'without_tax' ? 'Sin IVA' : 'Con IVA'}
            </span>
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" className="gap-1" onClick={handleExportPDF} disabled={isExporting || isLoading}>
            <FileText className="h-3 w-3" /> PDF
          </Button>
          <Button variant="outline" size="sm" className="gap-1" onClick={handleExportExcel} disabled={isExporting || isLoading}>
            <FileSpreadsheet className="h-3 w-3" /> Excel
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="flex rounded-lg border p-0.5">
          {[
            { key: 'today', label: 'Hoy' }, { key: 'week', label: '7 días' },
            { key: 'month', label: 'Mes' }, { key: 'quarter', label: 'Trimestre' },
            { key: 'year', label: 'Año' },
          ].map(p => (
            <Button key={p.key} variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={() => setPreset(p.key)}>
              {p.label}
            </Button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <DatePickerPopover containerClassName="w-36 h-8" value={dateRange.start} onChange={date => setDateRange(prev => ({ ...prev, start: date }))} />
          <span className="text-xs text-muted-foreground">a</span>
          <DatePickerPopover containerClassName="w-36 h-8" value={dateRange.end} onChange={date => setDateRange(prev => ({ ...prev, end: date }))} />
        </div>
        <Select value={groupBy} onValueChange={(v: 'day' | 'week' | 'month') => setGroupBy(v)}>
          <SelectTrigger className="w-28 h-8 text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="day">Por día</SelectItem>
            <SelectItem value="week">Por semana</SelectItem>
            <SelectItem value="month">Por mes</SelectItem>
          </SelectContent>
        </Select>

        <Select value={storeFilter} onValueChange={setStoreFilter}>
          <SelectTrigger className="w-44 h-8 text-xs">
            <Store className="h-3 w-3 mr-1 text-muted-foreground" />
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas las tiendas</SelectItem>
            {stores.map(s => (
              <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={channelFilter} onValueChange={(v: ReportChannel) => setChannelFilter(v)}>
          <SelectTrigger className="w-36 h-8 text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos los canales</SelectItem>
            <SelectItem value="boutique">Boutique</SelectItem>
            <SelectItem value="tailoring">Sastrería</SelectItem>
          </SelectContent>
        </Select>

        <div className="flex items-center gap-2 h-8">
          <Switch
            id="tax-mode"
            checked={taxMode === 'without_tax'}
            onCheckedChange={(checked) => setTaxMode(checked ? 'without_tax' : 'with_tax')}
          />
          <Label htmlFor="tax-mode" className="text-xs cursor-pointer select-none">
            Sin IVA
          </Label>
        </div>

        {storeFilter === 'all' && (
          <div className="flex items-center gap-2 h-8">
            <Switch
              id="group-by-store"
              checked={groupByStore}
              onCheckedChange={setGroupByStore}
            />
            <Label htmlFor="group-by-store" className="text-xs cursor-pointer select-none flex items-center gap-1">
              <Store className="h-3 w-3" /> Ver por tienda
            </Label>
          </div>
        )}
      </div>

      {isLoading ? (
        <div className="flex justify-center py-20"><Loader2 className="h-8 w-8 animate-spin" /></div>
      ) : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
            <Card>
              <CardContent className="pt-4 pb-3">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs text-muted-foreground">Facturación total</span>
                  <DollarSign className="h-4 w-4 text-muted-foreground" />
                </div>
                <p className="text-2xl font-bold">{formatCurrency(salesData?.totals?.total || 0)}</p>
                {compareData && pctBadge(compareData.changes.revenue)}
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4 pb-3">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs text-muted-foreground">Boutique + Tarjetas</span>
                  <ShoppingBag className="h-4 w-4 text-muted-foreground" />
                </div>
                <p className="text-2xl font-bold">{formatCurrency(salesData?.totals?.pos || 0)}</p>
                <p className="text-xs text-muted-foreground">Online: {formatCurrency(salesData?.totals?.online || 0)}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4 pb-3">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs text-muted-foreground">Sastrería</span>
                  <Scissors className="h-4 w-4 text-muted-foreground" />
                </div>
                <p className="text-2xl font-bold">{formatCurrency(salesData?.totals?.tailoring || 0)}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4 pb-3">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs text-muted-foreground">Ticket medio</span>
                  <BarChart3 className="h-4 w-4 text-muted-foreground" />
                </div>
                <p className="text-2xl font-bold">{formatCurrency(salesData?.totals?.avgTicket || 0)}</p>
                <p className="text-xs text-muted-foreground">{salesData?.totals?.ticketCount || 0} tickets</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4 pb-3">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs text-muted-foreground">Nuevos clientes</span>
                  <Users className="h-4 w-4 text-muted-foreground" />
                </div>
                <p className="text-2xl font-bold">{clientsData?.newClients || 0}</p>
                {compareData && pctBadge(compareData.changes.newClients)}
              </CardContent>
            </Card>
          </div>

          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList>
              <TabsTrigger value="sales" className="gap-1"><BarChart3 className="h-4 w-4" /> Ventas</TabsTrigger>
              <TabsTrigger value="bytype" className="gap-1"><Layers className="h-4 w-4" /> Ventas por tipo</TabsTrigger>
              <TabsTrigger value="products" className="gap-1"><ShoppingBag className="h-4 w-4" /> Productos</TabsTrigger>
              <TabsTrigger value="tailors" className="gap-1"><Scissors className="h-4 w-4" /> Sastres</TabsTrigger>
              <TabsTrigger value="clients" className="gap-1"><Users className="h-4 w-4" /> Clientes</TabsTrigger>
              <TabsTrigger value="stores" className="gap-1"><Store className="h-4 w-4" /> Por tienda</TabsTrigger>
              <TabsTrigger value="employees" className="gap-1"><UserCog className="h-4 w-4" /> Por empleado</TabsTrigger>
              <TabsTrigger value="time" className="gap-1"><Clock className="h-4 w-4" /> Por hora/día</TabsTrigger>
              <TabsTrigger value="expenses" className="gap-1"><Wallet className="h-4 w-4" /> Gastos</TabsTrigger>
            </TabsList>

            <div className="mt-6">
              <TabsContent value="sales"><VentasTab salesData={salesData} timePatternData={timePatternData} storeBreakdown={salesStoreBreakdown} /></TabsContent>
              <TabsContent value="bytype"><TailoringByTypeTab data={tailoringByCat} storeName={activeStoreName} storeBreakdown={tailoringStoreBreakdown} /></TabsContent>
              <TabsContent value="products">
                <Input
                  placeholder="Filtrar por producto o SKU..."
                  value={productSearch}
                  onChange={(e) => setProductSearch(e.target.value)}
                  className="max-w-sm mb-4"
                />
                <TopProductsChart
                  products={(() => {
                    const q = normalizeSearchTerm(productSearch)
                    if (!q) return topProducts
                    return topProducts.filter(p =>
                      normalizeSearchTerm(p.name || '').includes(q) ||
                      normalizeSearchTerm(p.sku || '').includes(q),
                    )
                  })()}
                />
              </TabsContent>
              <TabsContent value="tailors"><TailorTable data={tailorData} /></TabsContent>
              <TabsContent value="clients"><ClientsChart data={clientsData} advanced={clientsAdvanced} /></TabsContent>
              <TabsContent value="stores"><StoreTab data={storeData} /></TabsContent>
              <TabsContent value="employees"><EmployeeTab data={employeeData} /></TabsContent>
              <TabsContent value="time"><TimePatternTab data={timePatternData} /></TabsContent>
              <TabsContent value="expenses"><ExpensesTab data={expensesData} comparison={expensesComparison} /></TabsContent>
            </div>
          </Tabs>
        </>
      )}
    </div>
  )
}

// ─── Desglose por tienda (dimensión nº4, REUTILIZABLE) ───────────────────────
// Componente genérico que pinta el desglose por tienda de CUALQUIER informe:
// barras apiladas por tienda (una franja por métrica) + leyenda + tabla con una
// columna por métrica y la fila TOTAL. Cada pestaña (Ventas, nº5, nº10, hora,
// clientes) solo tiene que mapear su `byStore` a `StoreBreakdownRow[]` con las
// métricas que correspondan; este componente no sabe nada del informe concreto.

export type StoreBreakdownMetric = { key: string; label: string; value: number; color: string }
export type StoreBreakdownRow = { store_id: string; store_name: string; total: number; metrics: StoreBreakdownMetric[] }

function StoreBreakdown({ rows, title = 'Desglose por tienda' }: { rows: StoreBreakdownRow[]; title?: string }) {
  if (!rows.length) return null
  const maxTotal = Math.max(...rows.map(r => r.total), 1)
  const legend = rows[0]?.metrics ?? []
  const metricTotal = (key: string) => rows.reduce((s, r) => s + (r.metrics.find(m => m.key === key)?.value || 0), 0)

  return (
    <Card>
      <CardHeader><CardTitle className="text-base flex items-center gap-2"><Store className="h-4 w-4" /> {title}</CardTitle></CardHeader>
      <CardContent>
        <div className="space-y-4">
          {rows.map(r => (
            <div key={r.store_id}>
              <div className="flex justify-between text-sm mb-1">
                <span className="font-medium">{r.store_name}</span>
                <span className="text-muted-foreground">{formatCurrency(r.total)}</span>
              </div>
              <div className="flex h-4 rounded-full overflow-hidden bg-gray-100">
                {r.metrics.map(m => {
                  const w = maxTotal > 0 ? (m.value / maxTotal) * 100 : 0
                  return w > 0
                    ? <div key={m.key} className="transition-all" style={{ width: `${w}%`, backgroundColor: m.color }} title={`${m.label}: ${formatCurrency(m.value)}`} />
                    : null
                })}
              </div>
            </div>
          ))}
        </div>
        <div className="flex flex-wrap justify-center gap-4 mt-5 text-xs">
          {legend.map(m => (
            <span key={m.key} className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: m.color }} />{m.label}</span>
          ))}
        </div>
        <Table className="mt-4">
          <TableHeader>
            <TableRow>
              <TableHead>Tienda</TableHead>
              {legend.map(m => <TableHead key={m.key} className="text-right">{m.label}</TableHead>)}
              <TableHead className="text-right">Total</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map(r => (
              <TableRow key={r.store_id}>
                <TableCell className="font-medium">{r.store_name}</TableCell>
                {r.metrics.map(m => <TableCell key={m.key} className="text-right">{formatCurrency(m.value)}</TableCell>)}
                <TableCell className="text-right font-bold">{formatCurrency(r.total)}</TableCell>
              </TableRow>
            ))}
            {rows.length > 1 && (
              <TableRow className="bg-muted/50 font-bold">
                <TableCell>TOTAL</TableCell>
                {legend.map(m => <TableCell key={m.key} className="text-right">{formatCurrency(metricTotal(m.key))}</TableCell>)}
                <TableCell className="text-right">{formatCurrency(rows.reduce((s, r) => s + r.total, 0))}</TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  )
}

// ─── Tab: Ventas ─────────────────────────────────────────────────────────────

const SALES_STORE_COLORS = { boutique: '#1e3a5f', gift_cards: '#f59e0b', online: '#0ea5e9', tailoring: '#c084fc' }

function VentasTab({ salesData, timePatternData, storeBreakdown }: { salesData: SalesData | null; timePatternData: TimePatternData | null; storeBreakdown: StoreBreakdownRow[] | null }) {
  const chartData = salesData?.chartData || []

  const bestDay = chartData.length
    ? chartData.reduce((best, d) => d.total > best.total ? d : best)
    : null

  const peakHour = timePatternData?.byHour.reduce((best, h) => h.total > best.total ? h : best, { hour: 0, total: 0 }) || null

  return (
    <div className="space-y-4">
      {(bestDay || peakHour) && (
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
          {bestDay && bestDay.total > 0 && (
            <div className="flex items-center gap-3 p-3 rounded-xl border bg-amber-50 border-amber-200">
              <Star className="h-5 w-5 text-amber-500 shrink-0" />
              <div>
                <p className="text-[11px] text-muted-foreground">Mejor día</p>
                <p className="text-sm font-bold">{bestDay.date.slice(5)}</p>
                <p className="text-xs text-muted-foreground">{formatCurrency(bestDay.total)}</p>
              </div>
            </div>
          )}
          {peakHour && peakHour.total > 0 && (
            <div className="flex items-center gap-3 p-3 rounded-xl border bg-indigo-50 border-indigo-200">
              <Flame className="h-5 w-5 text-indigo-500 shrink-0" />
              <div>
                <p className="text-[11px] text-muted-foreground">Hora pico</p>
                <p className="text-sm font-bold">{peakHour.hour}:00 h</p>
                <p className="text-xs text-muted-foreground">{formatCurrency(peakHour.total)}</p>
              </div>
            </div>
          )}
          {salesData && salesData.totals.avgTicket > 0 && (
            <div className="flex items-center gap-3 p-3 rounded-xl border bg-green-50 border-green-200">
              <Receipt className="h-5 w-5 text-green-600 shrink-0" />
              <div>
                <p className="text-[11px] text-muted-foreground">Ticket medio</p>
                <p className="text-sm font-bold">{formatCurrency(salesData.totals.avgTicket)}</p>
                <p className="text-xs text-muted-foreground">{salesData.totals.ticketCount} tickets</p>
              </div>
            </div>
          )}
        </div>
      )}
      {storeBreakdown && <StoreBreakdown rows={storeBreakdown} title="Ventas por tienda" />}
      <SalesChart data={chartData} />
    </div>
  )
}

// ─── Tab: Ventas por tipo (Sastrería/Camisería × Artesanal/Industrial) ───────

const CATEGORY_COLORS: Record<string, string> = {
  sastreria_artesanal: '#1e3a5f',   // navy
  sastreria_industrial: '#3b82f6',  // azul
  camiseria_artesanal: '#d97706',   // ámbar
  camiseria_industrial: '#f97316',  // naranja
  boutique: '#10b981',              // esmeralda
  gift_cards: '#ec4899',            // rosa
}
const CATEGORY_SHORT: Record<string, string> = {
  sastreria_artesanal: 'Sast. Artesanal',
  sastreria_industrial: 'Sast. Industrial',
  camiseria_artesanal: 'Cam. Artesanal',
  camiseria_industrial: 'Cam. Industrial',
  boutique: 'Boutique',
  gift_cards: 'Tarjetas',
}

function TailoringByTypeTab({ data, storeName, storeBreakdown }: { data: TailoringByCatData | null; storeName: string; storeBreakdown: StoreBreakdownRow[] | null }) {
  const storeBadge = (
    <Badge className="bg-prats-navy text-white gap-1 shrink-0">
      <Store className="h-3 w-3" />
      {storeName === 'Todas las tiendas' ? 'Todas las tiendas' : `Tienda: ${storeName}`}
    </Badge>
  )

  if (!data || data.total.garments === 0) {
    return (
      <div className="space-y-4">
        <div className="flex justify-end">{storeBadge}</div>
        <p className="text-center text-muted-foreground py-12">Sin ventas para el periodo seleccionado</p>
      </div>
    )
  }

  const chartData = data.breakdown.map((b) => ({
    key: b.category,
    name: CATEGORY_SHORT[b.category] ?? b.label,
    importe: Math.round(b.amount * 100) / 100,
    prendas: b.garments,
  }))

  return (
    <div className="space-y-6">
      {storeBreakdown && <StoreBreakdown rows={storeBreakdown} title="Ventas por tipo y tienda" />}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <CardTitle className="text-base">Facturación por tipo</CardTitle>
            {storeBadge}
          </div>
          <p className="text-xs text-muted-foreground">
            Importe neto (sin IVA) · 4 categorías de confección + Boutique + Tarjetas regalo · por fecha de creación
          </p>
        </CardHeader>
        <CardContent>
          <div className="h-72 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ top: 8, right: 16, left: 8, bottom: 8 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="name" fontSize={12} tickLine={false} />
                <YAxis fontSize={11} tickFormatter={(v: number) => `${Math.round(v / 1000)}k`} width={42} />
                <Tooltip
                  formatter={(value, _name, item) => [
                    `${formatCurrency(Number(value ?? 0))} · ${(item?.payload as { prendas?: number })?.prendas ?? 0} prendas`,
                    'Facturado',
                  ]}
                  labelFormatter={(label) => String(label)}
                />
                <Bar dataKey="importe" radius={[4, 4, 0, 0]}>
                  {chartData.map((d) => (
                    <Cell key={d.key} fill={CATEGORY_COLORS[d.key] ?? '#64748b'} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-4">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Tipo</TableHead>
                <TableHead className="text-right">Facturado</TableHead>
                <TableHead className="text-right">Prendas</TableHead>
                <TableHead className="text-right">% sobre total</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.breakdown.map((b) => (
                <TableRow key={b.category}>
                  <TableCell className="flex items-center gap-2 font-medium">
                    <span className="inline-block h-3 w-3 rounded-sm" style={{ backgroundColor: CATEGORY_COLORS[b.category] }} />
                    {b.label}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{formatCurrency(b.amount)}</TableCell>
                  <TableCell className="text-right tabular-nums">{b.garments}</TableCell>
                  <TableCell className="text-right tabular-nums text-muted-foreground">
                    {data.total.amount > 0 ? `${((b.amount / data.total.amount) * 100).toFixed(1)}%` : '—'}
                  </TableCell>
                </TableRow>
              ))}
              <TableRow className="border-t-2 font-bold">
                <TableCell>Total</TableCell>
                <TableCell className="text-right tabular-nums">{formatCurrency(data.total.amount)}</TableCell>
                <TableCell className="text-right tabular-nums">{data.total.garments}</TableCell>
                <TableCell className="text-right tabular-nums">100%</TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  )
}

// ─── Tab: Por tienda ─────────────────────────────────────────────────────────

function StoreTab({ data }: { data: StoreItem[] }) {
  if (!data.length) return <p className="text-center text-muted-foreground py-12">Sin datos para el periodo seleccionado</p>

  const maxTotal = Math.max(...data.map(d => d.total))

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      {/* Gráfico de barras */}
      <Card>
        <CardHeader><CardTitle className="text-base">Facturación por tienda</CardTitle></CardHeader>
        <CardContent>
          <div className="space-y-4">
            {data.map((s) => {
              const posW = maxTotal > 0 ? (s.pos / maxTotal) * 100 : 0
              const giftW = maxTotal > 0 ? (s.gift_cards / maxTotal) * 100 : 0
              const tailW = maxTotal > 0 ? (s.tailoring / maxTotal) * 100 : 0
              return (
                <div key={s.store_id}>
                  <div className="flex justify-between text-sm mb-1">
                    <span className="font-medium">{s.store_name}</span>
                    <span className="text-muted-foreground">{formatCurrency(s.total)}</span>
                  </div>
                  <div className="flex h-4 rounded-full overflow-hidden bg-gray-100">
                    {posW > 0 && (
                      <div className="bg-prats-navy transition-all" style={{ width: `${posW}%` }} title={`Boutique: ${formatCurrency(s.pos)}`} />
                    )}
                    {giftW > 0 && (
                      <div className="bg-amber-400 transition-all" style={{ width: `${giftW}%` }} title={`Tarjetas regalo: ${formatCurrency(s.gift_cards)}`} />
                    )}
                    {tailW > 0 && (
                      <div className="bg-purple-400 transition-all" style={{ width: `${tailW}%` }} title={`Sastrería: ${formatCurrency(s.tailoring)}`} />
                    )}
                  </div>
                </div>
              )
            })}
          </div>
          <div className="flex justify-center gap-6 mt-6 text-xs">
            <span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-sm bg-prats-navy" />Boutique</span>
            <span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-sm bg-amber-400" />Tarjetas regalo</span>
            <span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-sm bg-purple-400" />Sastrería</span>
          </div>
        </CardContent>
      </Card>

      {/* Tabla */}
      <Card>
        <CardHeader><CardTitle className="text-base">Detalle por tienda</CardTitle></CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Tienda</TableHead>
                <TableHead className="text-right">Boutique</TableHead>
                <TableHead className="text-right">Tarjetas regalo</TableHead>
                <TableHead className="text-right">Sastrería</TableHead>
                <TableHead className="text-right">Total</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.map((s) => (
                <TableRow key={s.store_id}>
                  <TableCell className="font-medium">{s.store_name}</TableCell>
                  <TableCell className="text-right">{formatCurrency(s.pos)}</TableCell>
                  <TableCell className="text-right">{formatCurrency(s.gift_cards)}</TableCell>
                  <TableCell className="text-right">{formatCurrency(s.tailoring)}</TableCell>
                  <TableCell className="text-right font-bold">{formatCurrency(s.total)}</TableCell>
                </TableRow>
              ))}
              {data.length > 1 && (
                <TableRow className="bg-muted/50 font-bold">
                  <TableCell>TOTAL</TableCell>
                  <TableCell className="text-right">{formatCurrency(data.reduce((s, d) => s + d.pos, 0))}</TableCell>
                  <TableCell className="text-right">{formatCurrency(data.reduce((s, d) => s + d.gift_cards, 0))}</TableCell>
                  <TableCell className="text-right">{formatCurrency(data.reduce((s, d) => s + d.tailoring, 0))}</TableCell>
                  <TableCell className="text-right">{formatCurrency(data.reduce((s, d) => s + d.total, 0))}</TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  )
}

// ─── Tab: Por empleado ───────────────────────────────────────────────────────

function EmployeeTab({ data }: { data: EmployeeItem[] }) {
  if (!data.length) return <p className="text-center text-muted-foreground py-12">Sin datos para el periodo seleccionado</p>

  const hasTpv = data.some(e => e.pos_ops > 0 || e.pos_total > 0)
  const hasBoutique = data.some(e => e.boutique_total > 0)
  const hasTailoring = data.some(e => e.tailoring_ops > 0 || e.tailoring_total > 0)
  const hasTailorOrders = data.some(e => e.tailor_orders_count > 0 || e.tailor_orders_revenue > 0)

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader><CardTitle className="text-base">Ventas por empleado</CardTitle></CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Empleado</TableHead>
                {hasTpv && <TableHead className="text-right">Ventas TPV</TableHead>}
                {hasTpv && <TableHead className="text-right">Total TPV</TableHead>}
                {hasBoutique && <TableHead className="text-right">Boutique</TableHead>}
                {hasTailoring && <TableHead className="text-right">Cobros Sast.</TableHead>}
                {hasTailoring && <TableHead className="text-right">Total Sast.</TableHead>}
                {hasTailorOrders && <TableHead className="text-right">Pedidos sastre</TableHead>}
                {hasTailorOrders && <TableHead className="text-right">Fact. sastre</TableHead>}
                <TableHead className="text-right">Total</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.map((e) => (
                <TableRow key={e.employee_id}>
                  <TableCell className="font-medium">{e.employee_name}</TableCell>
                  {hasTpv && <TableCell className="text-right text-muted-foreground">{e.pos_ops}</TableCell>}
                  {hasTpv && <TableCell className="text-right">{formatCurrency(e.pos_total)}</TableCell>}
                  {hasBoutique && <TableCell className="text-right">{formatCurrency(e.boutique_total)}</TableCell>}
                  {hasTailoring && <TableCell className="text-right text-muted-foreground">{e.tailoring_ops}</TableCell>}
                  {hasTailoring && <TableCell className="text-right">{formatCurrency(e.tailoring_total)}</TableCell>}
                  {hasTailorOrders && <TableCell className="text-right text-muted-foreground">{e.tailor_orders_count}</TableCell>}
                  {hasTailorOrders && <TableCell className="text-right">{formatCurrency(e.tailor_orders_revenue)}</TableCell>}
                  <TableCell className="text-right font-bold">{formatCurrency(e.total)}</TableCell>
                </TableRow>
              ))}
              {data.length > 1 && (
                <TableRow className="bg-muted/50 font-bold">
                  <TableCell>TOTAL</TableCell>
                  {hasTpv && <TableCell className="text-right">{data.reduce((s, e) => s + e.pos_ops, 0)}</TableCell>}
                  {hasTpv && <TableCell className="text-right">{formatCurrency(data.reduce((s, e) => s + e.pos_total, 0))}</TableCell>}
                  {hasBoutique && <TableCell className="text-right">{formatCurrency(data.reduce((s, e) => s + e.boutique_total, 0))}</TableCell>}
                  {hasTailoring && <TableCell className="text-right">{data.reduce((s, e) => s + e.tailoring_ops, 0)}</TableCell>}
                  {hasTailoring && <TableCell className="text-right">{formatCurrency(data.reduce((s, e) => s + e.tailoring_total, 0))}</TableCell>}
                  {hasTailorOrders && <TableCell className="text-right">{data.reduce((s, e) => s + e.tailor_orders_count, 0)}</TableCell>}
                  {hasTailorOrders && <TableCell className="text-right">{formatCurrency(data.reduce((s, e) => s + e.tailor_orders_revenue, 0))}</TableCell>}
                  <TableCell className="text-right">{formatCurrency(data.reduce((s, e) => s + e.total, 0))}</TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
          <div className="text-[11px] text-muted-foreground mt-3 space-y-1">
            <p>Esta tabla muestra el dinero que <strong>pasó por las manos</strong> de cada empleado en el periodo.</p>
            {hasBoutique && (
              <p>
                <strong>Boutique</strong>: parte del <strong>Total TPV</strong> que corresponde a venta de
                producto de tienda (no incluye cobros de sastrería hechos en caja).
              </p>
            )}
            {hasTailoring && (
              <p>
                <strong>Cobros Sast.</strong>: pagos de sastrería registrados por este empleado en su POS, incluso
                si el pedido es de otro sastre. La pestaña &ldquo;Sastres&rdquo; muestra los mismos cobros agrupados
                por el sastre del pedido.
              </p>
            )}
            {hasTailorOrders && (
              <p>
                <strong>Pedidos sastre</strong>: pedidos creados por este sastre en el periodo (informativo, NO se
                suma al Total para evitar duplicar con los cobros que ya se contabilizan al cobrarse).
              </p>
            )}
          </div>
        </CardContent>
      </Card>

      <Card className="border-dashed">
        <CardContent className="pt-4 pb-4">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Star className="h-4 w-4" />
            <span>Comisiones — próximamente</span>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

// ─── Tab: Por hora / día de semana ───────────────────────────────────────────

function TimePatternTab({ data }: { data: TimePatternData | null }) {
  if (!data) return <p className="text-center text-muted-foreground py-12">Sin datos para el periodo seleccionado</p>

  const maxHour = Math.max(...data.byHour.map(h => h.total), 1)
  const maxDay = Math.max(...data.byDayOfWeek.map(d => d.total), 1)

  const peakHour = data.byHour.reduce((best, h) => h.total > best.total ? h : best, { hour: 0, total: 0, count: 0 })
  const peakDay = data.byDayOfWeek.reduce((best, d) => d.total > best.total ? d : best, { day: 0, label: '', total: 0, count: 0 })

  return (
    <div className="space-y-6">
      {(peakHour.total > 0 || peakDay.total > 0) && (
        <div className="grid grid-cols-2 gap-3">
          {peakHour.total > 0 && (
            <div className="flex items-center gap-3 p-3 rounded-xl border bg-indigo-50 border-indigo-200">
              <Flame className="h-5 w-5 text-indigo-500 shrink-0" />
              <div>
                <p className="text-[11px] text-muted-foreground">Hora pico</p>
                <p className="text-sm font-bold">{peakHour.hour}:00 – {peakHour.hour + 1}:00 h</p>
                <p className="text-xs text-muted-foreground">{formatCurrency(peakHour.total)}</p>
              </div>
            </div>
          )}
          {peakDay.total > 0 && (
            <div className="flex items-center gap-3 p-3 rounded-xl border bg-indigo-50 border-indigo-200">
              <Star className="h-5 w-5 text-indigo-500 shrink-0" />
              <div>
                <p className="text-[11px] text-muted-foreground">Día más activo</p>
                <p className="text-sm font-bold">{peakDay.label}</p>
                <p className="text-xs text-muted-foreground">{formatCurrency(peakDay.total)}</p>
              </div>
            </div>
          )}
        </div>
      )}

      <Card>
        <CardHeader><CardTitle className="text-base">Ventas por hora del día</CardTitle></CardHeader>
        <CardContent>
          <div className="flex items-end gap-px" style={{ height: '192px' }}>
            {data.byHour.map((h) => (
              <div key={h.hour} className="flex-1 flex flex-col justify-end h-full group relative cursor-pointer">
                <div
                  className="rounded-t-sm transition-all"
                  style={{
                    height: `${(h.total / maxHour) * 100}%`,
                    minHeight: h.total > 0 ? '2px' : '0',
                    backgroundColor: h.total === peakHour.total && h.total > 0 ? '#4f46e5' : '#6366f1',
                    opacity: h.total > 0 ? 1 : 0.15,
                  }}
                />
                {h.total > 0 && (
                  <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 hidden group-hover:block z-10 bg-white border rounded-lg shadow-lg p-2 text-xs w-28 pointer-events-none">
                    <p className="font-medium">{h.hour}:00 h</p>
                    <p>{formatCurrency(h.total)}</p>
                    <p className="text-muted-foreground">{h.count} op.</p>
                  </div>
                )}
              </div>
            ))}
          </div>
          <div className="flex mt-1">
            {data.byHour.map((h) => (
              <div key={h.hour} className="flex-1 text-center">
                {h.hour % 4 === 0 && (
                  <span className="text-[9px] text-muted-foreground">{h.hour}h</span>
                )}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Ventas por día de la semana</CardTitle></CardHeader>
        <CardContent>
          <div className="flex items-end gap-3" style={{ height: '192px' }}>
            {data.byDayOfWeek.map((d) => (
              <div key={d.day} className="flex-1 flex flex-col items-center justify-end h-full group relative cursor-pointer">
                <div
                  className="w-full rounded-t-sm transition-all"
                  style={{
                    height: `${(d.total / maxDay) * 100}%`,
                    minHeight: d.total > 0 ? '2px' : '0',
                    backgroundColor: d.total === peakDay.total && d.total > 0 ? '#4f46e5' : '#6366f1',
                    opacity: d.total > 0 ? 1 : 0.15,
                  }}
                />
                {d.total > 0 && (
                  <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 hidden group-hover:block z-10 bg-white border rounded-lg shadow-lg p-2 text-xs w-28 pointer-events-none">
                    <p className="font-medium">{d.label}</p>
                    <p>{formatCurrency(d.total)}</p>
                    <p className="text-muted-foreground">{d.count} op.</p>
                  </div>
                )}
                <span className="text-xs text-muted-foreground mt-1.5">{d.label}</span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

// ─── Tab: Gastos ─────────────────────────────────────────────────────────────

function ExpensesTab({ data, comparison }: { data: ExpensesData | null; comparison: ExpensesComparison | null }) {
  if (!data) return <p className="text-center text-muted-foreground py-12">Sin datos para el periodo seleccionado</p>

  if (!data.byCategory.length) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-3 text-muted-foreground">
        <Wallet className="h-12 w-12 opacity-30" />
        <p className="text-base font-medium">Sin gastos registrados en el periodo</p>
        <p className="text-sm">Los movimientos de tipo «gasto» aparecerán aquí</p>
      </div>
    )
  }

  const maxCat = Math.max(...data.byCategory.map(c => c.total), 1)

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardContent className="pt-5 pb-4">
            <div className="flex items-center justify-between mb-1">
              <span className="text-sm text-muted-foreground">Total gastos en el periodo</span>
              <TrendingDown className="h-4 w-4 text-red-500" />
            </div>
            <p className="text-3xl font-bold text-red-600">{formatCurrency(data.grandTotal)}</p>
            <p className="text-xs text-muted-foreground mt-1">{data.byCategory.reduce((s, c) => s + c.count, 0)} movimientos</p>
          </CardContent>
        </Card>

        {comparison && (
          <Card>
            <CardContent className="pt-5 pb-4">
              <div className="flex items-center justify-between mb-1">
                <span className="text-sm text-muted-foreground">Vs. periodo anterior</span>
                {comparison.change <= 0
                  ? <TrendingDown className="h-4 w-4 text-green-500" />
                  : <TrendingUp className="h-4 w-4 text-red-500" />}
              </div>
              <p className="text-3xl font-bold">{formatCurrency(comparison.previous)}</p>
              <p className={`text-xs mt-1 font-medium ${comparison.change <= 0 ? 'text-green-600' : 'text-red-600'}`}>
                {comparison.change <= 0 ? '↓' : '↑'} {Math.abs(comparison.change).toFixed(1)}% respecto al periodo anterior
              </p>
            </CardContent>
          </Card>
        )}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle className="text-base">Por categoría</CardTitle></CardHeader>
          <CardContent>
            <div className="space-y-3">
              {data.byCategory.map((c) => (
                <div key={c.category}>
                  <div className="flex justify-between text-sm mb-1">
                    <span className="font-medium">{c.category}</span>
                    <span className="text-muted-foreground">{formatCurrency(c.total)}</span>
                  </div>
                  <div className="h-3 bg-gray-100 rounded-full overflow-hidden">
                    <div className="h-full bg-red-400 rounded-full transition-all" style={{ width: `${(c.total / maxCat) * 100}%` }} />
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">Detalle por categoría</CardTitle></CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Categoría</TableHead>
                  <TableHead className="text-right">Movimientos</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.byCategory.map((c) => (
                  <TableRow key={c.category}>
                    <TableCell className="font-medium">{c.category}</TableCell>
                    <TableCell className="text-right text-muted-foreground">{c.count}</TableCell>
                    <TableCell className="text-right font-bold text-red-600">{formatCurrency(c.total)}</TableCell>
                  </TableRow>
                ))}
                {data.byCategory.length > 1 && (
                  <TableRow className="bg-muted/50 font-bold">
                    <TableCell>TOTAL</TableCell>
                    <TableCell className="text-right">{data.byCategory.reduce((s, c) => s + c.count, 0)}</TableCell>
                    <TableCell className="text-right text-red-700">{formatCurrency(data.grandTotal)}</TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>

      {data.providersBreakdown && data.providersBreakdown.length > 0 && (
        <Card>
          <CardHeader><CardTitle className="text-base">Proveedores — desglose por tipo y factura</CardTitle></CardHeader>
          <CardContent>
            <div className="space-y-2">
              {data.providersBreakdown.map((t) => (
                <details key={t.type} className="rounded-lg border" open>
                  <summary className="flex items-center justify-between px-3 py-2 cursor-pointer select-none font-medium">
                    <span>{t.label} <span className="text-xs text-muted-foreground font-normal">({t.invoices.length} {t.invoices.length === 1 ? 'factura' : 'facturas'})</span></span>
                    <span className="text-red-600 font-bold">{formatCurrency(t.total)}</span>
                  </summary>
                  <div className="border-t">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Nº factura</TableHead>
                          <TableHead>Proveedor</TableHead>
                          <TableHead className="text-right">Importe</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {t.invoices.map((inv, i) => (
                          <TableRow key={i}>
                            <TableCell className="font-mono text-xs">{inv.invoice_number}</TableCell>
                            <TableCell className="text-sm">{inv.supplier_name}</TableCell>
                            <TableCell className="text-right">{formatCurrency(inv.total)}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </details>
              ))}
              <div className="flex justify-between px-3 py-2 font-bold border-t">
                <span>TOTAL proveedores</span>
                <span className="text-red-700">{formatCurrency(data.providersBreakdown.reduce((s, t) => s + t.total, 0))}</span>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {data.recentExpenses && data.recentExpenses.length > 0 && (
        <Card>
          <CardHeader><CardTitle className="text-base">Últimos movimientos</CardTitle></CardHeader>
          <CardContent>
            <div className="space-y-2">
              {data.recentExpenses.map((tx, i) => (
                <div key={i} className="flex items-center justify-between p-2.5 rounded-lg border bg-red-50/50">
                  <div className="flex items-center gap-3">
                    <Receipt className="h-4 w-4 text-red-400 shrink-0" />
                    <div>
                      <p className="text-sm font-medium">{tx.description || tx.category}</p>
                      <p className="text-xs text-muted-foreground">{tx.category} · {tx.date}</p>
                    </div>
                  </div>
                  <span className="text-sm font-bold text-red-600">{formatCurrency(tx.total)}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
