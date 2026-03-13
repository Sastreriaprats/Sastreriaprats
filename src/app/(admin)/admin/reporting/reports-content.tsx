'use client'

import { useState, useEffect, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Input } from '@/components/ui/input'
import { DatePickerPopover } from '@/components/ui/date-picker-popover'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  TrendingUp, TrendingDown, DollarSign, Users, ShoppingBag, Scissors,
  BarChart3, FileSpreadsheet, FileText, Loader2, Store, UserCog, Clock, Wallet,
  Flame, Star, Receipt,
} from 'lucide-react'
import { useAuth } from '@/components/providers/auth-provider'
import { getSalesReport, getComparePeriods, getTopProducts, getTailorPerformance, getClientsAnalytics, getSalesByStore, getSalesByEmployee, getSalesByTimePattern, getExpensesReport, getExpensesComparison } from '@/actions/reports'
import { SalesChart } from './charts/sales-chart'
import { TopProductsChart } from './charts/top-products-chart'
import { TailorTable } from './tables/tailor-table'
import { ClientsChart } from './charts/clients-chart'
import { formatCurrency } from '@/lib/utils'
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
}

type ClientsData = {
  newClients: number; totalClients: number
  sources: Record<string, number>
  topClients: { full_name: string; total_revenue: number }[]
  clientsWithPurchases: number
}

type StoreItem = { store_id: string; store_name: string; pos: number; tailoring: number; total: number }

type EmployeeItem = {
  employee_id: string; employee_name: string
  pos_ops: number; pos_total: number
  tailoring_ops: number; tailoring_total: number
  total: number
}

type TimePatternData = {
  byHour: { hour: number; total: number; count: number }[]
  byDayOfWeek: { day: number; label: string; total: number; count: number }[]
}

type ExpensesData = {
  byCategory: { category: string; count: number; total: number }[]
  grandTotal: number
  recentExpenses: { description: string; category: string; total: number; date: string }[]
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
  const [tailorData, setTailorData] = useState<TailorItem[]>([])
  const [clientsData, setClientsData] = useState<ClientsData | null>(null)
  const [storeData, setStoreData] = useState<StoreItem[]>([])
  const [employeeData, setEmployeeData] = useState<EmployeeItem[]>([])
  const [timePatternData, setTimePatternData] = useState<TimePatternData | null>(null)
  const [expensesData, setExpensesData] = useState<ExpensesData | null>(null)
  const [expensesComparison, setExpensesComparison] = useState<ExpensesComparison | null>(null)
  const [isExporting, setIsExporting] = useState(false)

  const fetchAll = useCallback(async () => {
    setIsLoading(true)
    try {
      const { start, end } = dateRange

      const startD = new Date(start)
      const endD = new Date(end)
      const diff = endD.getTime() - startD.getTime()
      const prevEnd = new Date(startD.getTime() - 86400000)
      const prevStart = new Date(prevEnd.getTime() - diff)

      const prevStartStr = prevStart.toISOString().split('T')[0]
      const prevEndStr = prevEnd.toISOString().split('T')[0]

      const [salesRes, compareRes, productsRes, tailorRes, clientsRes, storeRes, employeeRes, timeRes, expensesRes, expCompRes] = await Promise.all([
        getSalesReport({ start_date: start, end_date: end, store_id: activeStoreId || undefined, group_by: groupBy }),
        getComparePeriods({
          current_start: start, current_end: end,
          previous_start: prevStartStr, previous_end: prevEndStr,
          store_id: activeStoreId || undefined,
        }),
        getTopProducts({ start_date: start, end_date: end, limit: 10 }),
        getTailorPerformance({ start_date: start, end_date: end }),
        getClientsAnalytics({ start_date: start, end_date: end }),
        getSalesByStore({ start_date: start, end_date: end }),
        getSalesByEmployee({ start_date: start, end_date: end }),
        getSalesByTimePattern({ start_date: start, end_date: end }),
        getExpensesReport({ start_date: start, end_date: end }),
        getExpensesComparison({ current_start: start, current_end: end, previous_start: prevStartStr, previous_end: prevEndStr }),
      ])

      if (salesRes.success) setSalesData(salesRes.data)
      if (compareRes.success) setCompareData(compareRes.data)
      if (productsRes.success) setTopProducts(productsRes.data)
      if (tailorRes.success) setTailorData(tailorRes.data)
      if (clientsRes.success) setClientsData(clientsRes.data)
      if (storeRes.success) setStoreData(storeRes.data)
      if (employeeRes.success) setEmployeeData(employeeRes.data)
      if (timeRes.success) setTimePatternData(timeRes.data)
      if (expensesRes.success) setExpensesData(expensesRes.data)
      if (expCompRes.success) setExpensesComparison(expCompRes.data)
    } catch (err) {
      console.error('[ReportsContent fetchAll]', err)
      toast.error('Error al cargar los informes')
    } finally {
      setIsLoading(false)
    }
  }, [dateRange, groupBy, activeStoreId])

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

  const handleExportPDF = async () => {
    setIsExporting(true)
    try {
      const res = await fetch('/api/reports/export-pdf', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...dateRange, salesData, compareData, topProducts, tailorData }),
      })
      if (res.ok) {
        const blob = await res.blob()
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = `informe-prats-${dateRange.start}-${dateRange.end}.html`
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
        body: JSON.stringify({ ...dateRange, salesData, topProducts, tailorData }),
      })
      if (res.ok) {
        const blob = await res.blob()
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = `informe-prats-${dateRange.start}-${dateRange.end}.csv`
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
          <p className="text-muted-foreground">Análisis de ventas, clientes y rendimiento</p>
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
                  <span className="text-xs text-muted-foreground">TPV / Boutique</span>
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

          <Tabs defaultValue="sales">
            <TabsList>
              <TabsTrigger value="sales" className="gap-1"><BarChart3 className="h-4 w-4" /> Ventas</TabsTrigger>
              <TabsTrigger value="products" className="gap-1"><ShoppingBag className="h-4 w-4" /> Productos</TabsTrigger>
              <TabsTrigger value="tailors" className="gap-1"><Scissors className="h-4 w-4" /> Sastres</TabsTrigger>
              <TabsTrigger value="clients" className="gap-1"><Users className="h-4 w-4" /> Clientes</TabsTrigger>
              <TabsTrigger value="stores" className="gap-1"><Store className="h-4 w-4" /> Por tienda</TabsTrigger>
              <TabsTrigger value="employees" className="gap-1"><UserCog className="h-4 w-4" /> Por empleado</TabsTrigger>
              <TabsTrigger value="time" className="gap-1"><Clock className="h-4 w-4" /> Por hora/día</TabsTrigger>
              <TabsTrigger value="expenses" className="gap-1"><Wallet className="h-4 w-4" /> Gastos</TabsTrigger>
            </TabsList>

            <div className="mt-6">
              <TabsContent value="sales"><VentasTab salesData={salesData} timePatternData={timePatternData} /></TabsContent>
              <TabsContent value="products"><TopProductsChart products={topProducts} /></TabsContent>
              <TabsContent value="tailors"><TailorTable data={tailorData} /></TabsContent>
              <TabsContent value="clients"><ClientsChart data={clientsData} /></TabsContent>
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

// ─── Tab: Ventas ─────────────────────────────────────────────────────────────

function VentasTab({ salesData, timePatternData }: { salesData: SalesData | null; timePatternData: TimePatternData | null }) {
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
      <SalesChart data={chartData} />
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
              const tailW = maxTotal > 0 ? (s.tailoring / maxTotal) * 100 : 0
              return (
                <div key={s.store_id}>
                  <div className="flex justify-between text-sm mb-1">
                    <span className="font-medium">{s.store_name}</span>
                    <span className="text-muted-foreground">{formatCurrency(s.total)}</span>
                  </div>
                  <div className="flex h-4 rounded-full overflow-hidden bg-gray-100">
                    {posW > 0 && (
                      <div className="bg-prats-navy transition-all" style={{ width: `${posW}%` }} title={`TPV: ${formatCurrency(s.pos)}`} />
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
            <span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-sm bg-prats-navy" />TPV</span>
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
                <TableHead className="text-right">TPV</TableHead>
                <TableHead className="text-right">Sastrería</TableHead>
                <TableHead className="text-right">Total</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.map((s) => (
                <TableRow key={s.store_id}>
                  <TableCell className="font-medium">{s.store_name}</TableCell>
                  <TableCell className="text-right">{formatCurrency(s.pos)}</TableCell>
                  <TableCell className="text-right">{formatCurrency(s.tailoring)}</TableCell>
                  <TableCell className="text-right font-bold">{formatCurrency(s.total)}</TableCell>
                </TableRow>
              ))}
              {data.length > 1 && (
                <TableRow className="bg-muted/50 font-bold">
                  <TableCell>TOTAL</TableCell>
                  <TableCell className="text-right">{formatCurrency(data.reduce((s, d) => s + d.pos, 0))}</TableCell>
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
  const hasTailoring = data.some(e => e.tailoring_ops > 0 || e.tailoring_total > 0)

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
                {hasTailoring && <TableHead className="text-right">Cobros Sast.</TableHead>}
                {hasTailoring && <TableHead className="text-right">Total Sast.</TableHead>}
                <TableHead className="text-right">Total</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.map((e) => (
                <TableRow key={e.employee_id}>
                  <TableCell className="font-medium">{e.employee_name}</TableCell>
                  {hasTpv && <TableCell className="text-right text-muted-foreground">{e.pos_ops}</TableCell>}
                  {hasTpv && <TableCell className="text-right">{formatCurrency(e.pos_total)}</TableCell>}
                  {hasTailoring && <TableCell className="text-right text-muted-foreground">{e.tailoring_ops}</TableCell>}
                  {hasTailoring && <TableCell className="text-right">{formatCurrency(e.tailoring_total)}</TableCell>}
                  <TableCell className="text-right font-bold">{formatCurrency(e.total)}</TableCell>
                </TableRow>
              ))}
              {data.length > 1 && (
                <TableRow className="bg-muted/50 font-bold">
                  <TableCell>TOTAL</TableCell>
                  {hasTpv && <TableCell className="text-right">{data.reduce((s, e) => s + e.pos_ops, 0)}</TableCell>}
                  {hasTpv && <TableCell className="text-right">{formatCurrency(data.reduce((s, e) => s + e.pos_total, 0))}</TableCell>}
                  {hasTailoring && <TableCell className="text-right">{data.reduce((s, e) => s + e.tailoring_ops, 0)}</TableCell>}
                  {hasTailoring && <TableCell className="text-right">{formatCurrency(data.reduce((s, e) => s + e.tailoring_total, 0))}</TableCell>}
                  <TableCell className="text-right">{formatCurrency(data.reduce((s, e) => s + e.total, 0))}</TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
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
        <p className="text-sm">Los movimientos de tipo "gasto" aparecerán aquí</p>
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
