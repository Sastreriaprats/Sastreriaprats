'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Package, AlertTriangle, TrendingDown, Truck, Plus, Warehouse, ArrowLeftRight, ClipboardList, Download, Loader2, Bookmark } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { toast } from 'sonner'
import { Skeleton } from '@/components/ui/skeleton'
import { usePermissions } from '@/hooks/use-permissions'
import { getStockDashboardStats, getPendingTransfersCount } from '@/actions/products'
import { listReservations } from '@/actions/reservations'
import { ProductsTab } from './tabs/products-tab'
import { MovementsTab } from './tabs/movements-tab'
import { FabricsTab } from './tabs/fabrics-tab'
import { WarehousesTab } from './tabs/warehouses-tab'
import { TransfersTab } from './tabs/transfers-tab'
import { ReservationsTab } from './tabs/reservations-tab'
import { AlbaranesContent } from '../almacen/albaranes/albaranes-content'

const VALID_TABS = ['productos', 'almacenes', 'tejidos', 'movimientos', 'traspasos', 'reservas', 'albaranes']

export function StockDashboard() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { can } = usePermissions()
  const fabricTabRef = useRef<{ openNewFabricDialog: () => void } | null>(null)

  const initialTab = VALID_TABS.includes(searchParams.get('tab') || '') ? searchParams.get('tab')! : 'productos'
  const [activeTab, setActiveTab] = useState(initialTab)
  const [stats, setStats] = useState({ totalProducts: 0, lowStock: 0, outOfStock: 0, pendingOrders: 0 })
  const [pendingTransfersCount, setPendingTransfersCount] = useState(0)
  const [pendingReservationsCount, setPendingReservationsCount] = useState(0)
  const [isLoading, setIsLoading] = useState(true)
  const [outOfStockFilter, setOutOfStockFilter] = useState(false)
  const [isExporting, setIsExporting] = useState(false)

  const handleExportInventory = async () => {
    setIsExporting(true)
    try {
      const res = await fetch('/api/reports/export-inventory')
      if (!res.ok) {
        const body = await res.json().catch(() => ({ error: 'Error al exportar' }))
        toast.error(body.error || 'Error al exportar el inventario')
        return
      }
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      const dispo = res.headers.get('Content-Disposition') || ''
      const match = dispo.match(/filename="([^"]+)"/)
      a.download = match ? match[1] : `inventario-prats-${new Date().toISOString().slice(0, 10)}.csv`
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
      toast.success('Inventario descargado')
    } catch {
      toast.error('Error al descargar el inventario')
    } finally {
      setIsExporting(false)
    }
  }

  const handleTabChange = (tab: string) => {
    setActiveTab(tab)
    if (tab !== 'almacenes') setOutOfStockFilter(false)
    const params = new URLSearchParams(window.location.search)
    params.set('tab', tab)
    // Al cambiar de pestaña, resetear paginación
    params.delete('page')
    params.delete('search')
    router.replace(`/admin/stock?${params.toString()}`, { scroll: false })
  }

  const goToOutOfStock = () => {
    setOutOfStockFilter(true)
    setActiveTab('almacenes')
    router.replace('/admin/stock?tab=almacenes', { scroll: false })
  }

  useEffect(() => {
    getStockDashboardStats()
      .then(result => {
        if (result.success && result.data) {
          setStats(result.data)
        }
        setIsLoading(false)
      })
      .catch(err => {
        console.error('[StockDashboard] getStockDashboardStats:', err)
        setIsLoading(false)
      })
  }, [])

  useEffect(() => {
    getPendingTransfersCount()
      .then(r => { if (r?.success && typeof r.data === 'number') setPendingTransfersCount(r.data) })
      .catch(() => {})
  }, [])

  useEffect(() => {
    const onUpdate = () => {
      getPendingTransfersCount()
        .then(r => { if (r?.success && typeof r.data === 'number') setPendingTransfersCount(r.data) })
        .catch(() => {})
    }
    window.addEventListener('stock-transfers-updated', onUpdate)
    return () => window.removeEventListener('stock-transfers-updated', onUpdate)
  }, [])

  useEffect(() => {
    listReservations({ status: 'pending_stock', page: 0, pageSize: 1 })
      .then(r => { if (r?.success && r.data) setPendingReservationsCount(r.data.total) })
      .catch(() => {})
  }, [])

  return (
    <div className="space-y-6">
      {pendingTransfersCount > 0 && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 flex items-center justify-between gap-4">
          <p className="text-sm font-medium text-amber-900 flex items-center gap-2">
            <ArrowLeftRight className="h-5 w-5 text-amber-600 shrink-0" />
            Tienes {pendingTransfersCount} traspaso{pendingTransfersCount !== 1 ? 's' : ''} de almacén pendiente{pendingTransfersCount !== 1 ? 's' : ''} de aprobar
          </p>
          <Button
            variant="outline"
            size="sm"
            className="shrink-0 border-amber-400 text-amber-800 hover:bg-amber-100"
            onClick={() => handleTabChange('traspasos')}
          >
            Ver traspasos
          </Button>
        </div>
      )}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Stock y Productos</h1>
          <p className="text-muted-foreground">Gestión de catálogo, inventario y proveedores</p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={handleExportInventory}
            disabled={isExporting}
            className="gap-2"
            title="Descargar CSV del inventario por variante y almacén"
          >
            {isExporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
            Descargar inventario
          </Button>
          {activeTab === 'tejidos' && can('products.create') ? (
            <Button onClick={() => fabricTabRef.current?.openNewFabricDialog()} className="gap-2 bg-prats-navy hover:bg-prats-navy-light">
              <Plus className="h-4 w-4" /> Nuevo tejido
            </Button>
          ) : (activeTab === 'productos' || activeTab === 'almacenes') && can('products.create') ? (
            <Button onClick={() => router.push('/admin/stock/productos/nuevo')} className="gap-2 bg-prats-navy hover:bg-prats-navy-light">
              <Plus className="h-4 w-4" /> Nuevo producto
            </Button>
          ) : null}
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card><CardContent className="pt-4 pb-3">
          <div className="flex items-center gap-2 text-xs text-muted-foreground"><Package className="h-3 w-3" /> Productos activos</div>
          {isLoading ? <Skeleton className="h-8 w-14 mt-1" /> : <p className="text-2xl font-bold">{stats.totalProducts}</p>}
        </CardContent></Card>
        <Card className={!isLoading && stats.lowStock > 0 ? 'ring-1 ring-amber-300' : ''}>
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center gap-2 text-xs text-amber-600"><AlertTriangle className="h-3 w-3" /> Stock bajo</div>
            {isLoading ? <Skeleton className="h-8 w-10 mt-1" /> : <p className="text-2xl font-bold text-amber-600">{stats.lowStock}</p>}
          </CardContent>
        </Card>
        <Card
          className={`${!isLoading && stats.outOfStock > 0 ? 'ring-1 ring-red-300' : ''} ${!isLoading && stats.outOfStock > 0 ? 'cursor-pointer hover:bg-red-50 transition-colors' : ''}`}
          onClick={!isLoading && stats.outOfStock > 0 ? goToOutOfStock : undefined}
          title={!isLoading && stats.outOfStock > 0 ? 'Ver productos sin stock' : undefined}
        >
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center gap-2 text-xs text-red-600"><TrendingDown className="h-3 w-3" /> Sin stock</div>
            {isLoading ? <Skeleton className="h-8 w-10 mt-1" /> : (
              <>
                <p className="text-2xl font-bold text-red-600">{stats.outOfStock}</p>
                {stats.outOfStock > 0 && <p className="text-[10px] text-red-400 mt-0.5">Click para ver →</p>}
              </>
            )}
          </CardContent>
        </Card>
        <Card><CardContent className="pt-4 pb-3">
          <div className="flex items-center gap-2 text-xs text-muted-foreground"><Truck className="h-3 w-3" /> Pedidos pendientes</div>
          {isLoading ? <Skeleton className="h-8 w-10 mt-1" /> : <p className="text-2xl font-bold">{stats.pendingOrders}</p>}
        </CardContent></Card>
      </div>

      <Tabs value={activeTab} onValueChange={handleTabChange}>
        <TabsList>
          <TabsTrigger value="productos" className="gap-1"><Package className="h-4 w-4" /> Productos</TabsTrigger>
          <TabsTrigger value="almacenes" className="gap-1"><Warehouse className="h-4 w-4" /> Almacenes</TabsTrigger>
          <TabsTrigger value="tejidos" className="gap-1">
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 6h18M3 12h18M3 18h18" /></svg>
            Tejidos
          </TabsTrigger>
          <TabsTrigger value="movimientos" className="gap-1">
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" /></svg>
            Movimientos
          </TabsTrigger>
          <TabsTrigger value="traspasos" className="gap-1"><ArrowLeftRight className="h-4 w-4" /> Traspasos</TabsTrigger>
          <TabsTrigger value="reservas" className="gap-1">
            <Bookmark className="h-4 w-4" /> Reservas
            {pendingReservationsCount > 0 && (
              <Badge variant="destructive" className="ml-1 h-4 min-w-4 px-1 text-[10px]">{pendingReservationsCount}</Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="albaranes" className="gap-1"><ClipboardList className="h-4 w-4" /> Albaranes</TabsTrigger>
        </TabsList>
        <div className="mt-6">
          <TabsContent value="productos"><ProductsTab /></TabsContent>
          <TabsContent value="almacenes"><WarehousesTab outOfStockFilter={outOfStockFilter} onClearOutOfStockFilter={() => setOutOfStockFilter(false)} /></TabsContent>
          <TabsContent value="tejidos"><FabricsTab ref={fabricTabRef} /></TabsContent>
          <TabsContent value="movimientos"><MovementsTab /></TabsContent>
          <TabsContent value="traspasos">
            <TransfersTab />
          </TabsContent>
          <TabsContent value="reservas">
            <ReservationsTab />
          </TabsContent>
          <TabsContent value="albaranes">
            <AlbaranesContent />
          </TabsContent>
        </div>
      </Tabs>
    </div>
  )
}
