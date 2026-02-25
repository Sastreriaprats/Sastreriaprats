'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Store, TrendingUp, Package, AlertTriangle, Loader2, RefreshCw, ArrowRight } from 'lucide-react'
import { getStoresWithStats, type StoreStats } from '@/actions/dashboard'
import { formatCurrency } from '@/lib/utils'

export function TiendasContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const tab = searchParams.get('tab') || 'resumen'
  const [stores, setStores] = useState<StoreStats[]>([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    const res = await getStoresWithStats(undefined)
    if (res.success && res.data) setStores(res.data)
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  if (loading) {
    return (
      <div className="flex h-[50vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-prats-navy" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Tiendas</h1>
          <p className="text-muted-foreground">Stocks y ventas por tienda</p>
        </div>
        <Button variant="outline" size="sm" className="gap-2" onClick={load}>
          <RefreshCw className="h-4 w-4" /> Actualizar
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {stores.map((s) => (
          <Card
            key={s.id}
            className="cursor-pointer transition-shadow hover:shadow-md"
            onClick={() => router.push(`/admin/stock?store=${s.id}`)}
          >
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base flex items-center gap-2">
                  <Store className="h-4 w-4 text-prats-navy" />
                  {s.name}
                </CardTitle>
                <span className="text-xs text-muted-foreground">{s.code}</span>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Ventas hoy</span>
                <span className="font-medium">{formatCurrency(s.salesToday)}</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Ventas mes</span>
                <span className="font-medium">{formatCurrency(s.salesThisMonth)}</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground flex items-center gap-1">
                  <Package className="h-3.5 w-3" /> Stock (unidades)
                </span>
                <span className="font-medium">{s.totalStockUnits}</span>
              </div>
              {s.lowStockCount > 0 && (
                <div className="flex items-center gap-1 text-amber-600 text-sm">
                  <AlertTriangle className="h-4 w-4 flex-shrink-0" />
                  <span>{s.lowStockCount} producto{s.lowStockCount !== 1 ? 's' : ''} bajo mínimo</span>
                </div>
              )}
              <Button variant="ghost" size="sm" className="w-full gap-1 mt-2" onClick={(e) => { e.stopPropagation(); router.push(`/admin/stock?store=${s.id}`) }}>
                Ver stock <ArrowRight className="h-3 w-3" />
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>

      {stores.length === 0 && (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            No hay tiendas activas. Configura tiendas en <Button variant="link" className="p-0 h-auto" onClick={() => router.push('/admin/configuracion?tab=stores')}>Configuración → Tiendas</Button>.
          </CardContent>
        </Card>
      )}
    </div>
  )
}
