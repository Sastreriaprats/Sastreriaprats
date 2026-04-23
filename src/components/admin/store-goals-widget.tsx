'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Target, ArrowRight, Store } from 'lucide-react'
import { getStoresWithStats, type StoreStats } from '@/actions/dashboard'
import { formatCurrency } from '@/lib/utils'

const MONTH_NAMES = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
]

export function StoreGoalsWidget() {
  const router = useRouter()
  const [stores, setStores] = useState<StoreStats[] | null>(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(() => {
    setLoading(true)
    getStoresWithStats()
      .then(res => { if (res.success) setStores(res.data) })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => { load() }, [load])

  const now = new Date()
  const monthLabel = `${MONTH_NAMES[now.getMonth()]} ${now.getFullYear()}`

  if (loading) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <Skeleton className="h-5 w-48" />
          <Skeleton className="h-3 w-64 mt-1" />
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {[1, 2].map(i => (
              <div key={i} className="space-y-2">
                <Skeleton className="h-4 w-32" />
                <Skeleton className="h-6 w-full" />
                <Skeleton className="h-6 w-full" />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    )
  }

  if (!stores || stores.length === 0) return null

  const totalBoutiqueTarget = stores.reduce((s, r) => s + r.boutiqueTarget, 0)
  const totalSastreriaTarget = stores.reduce((s, r) => s + r.sastreriaTarget, 0)
  const totalBoutiqueSales = stores.reduce((s, r) => s + r.boutiqueSalesThisMonth, 0)
  const totalSastreriaSales = stores.reduce((s, r) => s + r.sastreriaSalesThisMonth, 0)
  const hasAnyTarget = totalBoutiqueTarget > 0 || totalSastreriaTarget > 0

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div>
            <CardTitle className="text-base flex items-center gap-2">
              <Target className="h-4 w-4 text-prats-navy" /> Objetivos del mes
            </CardTitle>
            <p className="text-xs text-muted-foreground mt-0.5">
              Progreso de facturación vs objetivo · {monthLabel}
            </p>
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="gap-1 text-xs shrink-0"
            onClick={() => router.push('/admin/configuracion?tab=goals')}
          >
            Definir objetivos <ArrowRight className="h-3 w-3" />
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {!hasAnyTarget ? (
          <div className="text-center py-6">
            <p className="text-sm text-muted-foreground mb-3">
              Aún no hay objetivos definidos para este mes
            </p>
            <Button
              size="sm"
              variant="outline"
              onClick={() => router.push('/admin/configuracion?tab=goals')}
            >
              Configurar objetivos
            </Button>
          </div>
        ) : (
          <div className="space-y-5">
            {/* Resumen global */}
            {stores.length > 1 && (
              <div className="pb-4 border-b">
                <div className="flex items-center gap-2 mb-3">
                  <span className="text-sm font-semibold">Total todas las tiendas</span>
                </div>
                <div className="grid gap-3 md:grid-cols-2">
                  <ProgressRow
                    label="Boutique"
                    actual={totalBoutiqueSales}
                    target={totalBoutiqueTarget}
                    color="bg-prats-navy"
                  />
                  <ProgressRow
                    label="Sastrería"
                    actual={totalSastreriaSales}
                    target={totalSastreriaTarget}
                    color="bg-amber-600"
                  />
                </div>
              </div>
            )}

            {/* Por tienda */}
            <div className="grid gap-4 md:grid-cols-2">
              {stores.map(store => {
                const noTarget = store.boutiqueTarget === 0 && store.sastreriaTarget === 0
                if (noTarget) return null
                return (
                  <div key={store.id} className="space-y-2.5">
                    <div className="flex items-center gap-2 text-sm font-medium">
                      <Store className="h-3.5 w-3.5 text-muted-foreground" />
                      {store.name}
                    </div>
                    <ProgressRow
                      label="Boutique"
                      actual={store.boutiqueSalesThisMonth}
                      target={store.boutiqueTarget}
                      color="bg-prats-navy"
                    />
                    <ProgressRow
                      label="Sastrería"
                      actual={store.sastreriaSalesThisMonth}
                      target={store.sastreriaTarget}
                      color="bg-amber-600"
                    />
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function ProgressRow({
  label, actual, target, color,
}: {
  label: string
  actual: number
  target: number
  color: string
}) {
  const pct = target > 0 ? Math.min(100, (actual / target) * 100) : 0
  const pctRaw = target > 0 ? (actual / target) * 100 : 0
  const over = pctRaw > 100
  const reached = pctRaw >= 100
  const barColor = over ? 'bg-green-600' : color
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-xs">
        <span className="font-medium">{label}</span>
        <span className="tabular-nums text-muted-foreground">
          <span className={`font-semibold ${reached ? 'text-green-600' : 'text-foreground'}`}>
            {formatCurrency(actual)}
          </span>
          {target > 0 && <> / {formatCurrency(target)}</>}
        </span>
      </div>
      <div className="relative h-2 w-full rounded-full bg-muted overflow-hidden">
        {target > 0 ? (
          <div
            className={`h-full ${barColor} transition-all`}
            style={{ width: `${pct}%` }}
          />
        ) : null}
      </div>
      <div className="flex items-center justify-between text-[10px] text-muted-foreground">
        {target > 0 ? (
          <>
            <span className={reached ? 'text-green-600 font-semibold' : ''}>
              {pctRaw.toFixed(0)}% del objetivo
            </span>
            {target > actual && (
              <span>Faltan {formatCurrency(target - actual)}</span>
            )}
            {over && <span className="text-green-600">+{formatCurrency(actual - target)}</span>}
          </>
        ) : (
          <span>Sin objetivo definido</span>
        )}
      </div>
    </div>
  )
}
