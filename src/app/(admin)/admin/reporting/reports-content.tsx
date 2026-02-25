'use client'

import { useState, useEffect, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  TrendingUp, TrendingDown, DollarSign, Users, ShoppingBag, Scissors,
  BarChart3, FileSpreadsheet, FileText, Loader2,
} from 'lucide-react'
import { useAuth } from '@/components/providers/auth-provider'
import { getSalesReport, getComparePeriods, getTopProducts, getTailorPerformance, getClientsAnalytics } from '@/actions/reports'
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
}

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

      const [salesRes, compareRes, productsRes, tailorRes, clientsRes] = await Promise.all([
        getSalesReport({ start_date: start, end_date: end, store_id: activeStoreId || undefined, group_by: groupBy }),
        getComparePeriods({
          current_start: start, current_end: end,
          previous_start: prevStart.toISOString().split('T')[0],
          previous_end: prevEnd.toISOString().split('T')[0],
          store_id: activeStoreId || undefined,
        }),
        getTopProducts({ start_date: start, end_date: end, limit: 10 }),
        getTailorPerformance({ start_date: start, end_date: end }),
        getClientsAnalytics({ start_date: start, end_date: end }),
      ])

      if (salesRes.success) setSalesData(salesRes.data)
      if (compareRes.success) setCompareData(compareRes.data)
      if (productsRes.success) setTopProducts(productsRes.data)
      if (tailorRes.success) setTailorData(tailorRes.data)
      if (clientsRes.success) setClientsData(clientsRes.data)
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
          <Input type="date" value={dateRange.start} onChange={e => setDateRange(prev => ({ ...prev, start: e.target.value }))} className="h-8 w-36 text-xs" />
          <span className="text-xs text-muted-foreground">a</span>
          <Input type="date" value={dateRange.end} onChange={e => setDateRange(prev => ({ ...prev, end: e.target.value }))} className="h-8 w-36 text-xs" />
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
            </TabsList>

            <div className="mt-6">
              <TabsContent value="sales"><SalesChart data={salesData?.chartData || []} /></TabsContent>
              <TabsContent value="products"><TopProductsChart products={topProducts} /></TabsContent>
              <TabsContent value="tailors"><TailorTable data={tailorData} /></TabsContent>
              <TabsContent value="clients"><ClientsChart data={clientsData} /></TabsContent>
            </div>
          </Tabs>
        </>
      )}
    </div>
  )
}
