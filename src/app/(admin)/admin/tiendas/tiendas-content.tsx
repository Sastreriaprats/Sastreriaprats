'use client'

import { useState, useCallback, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Store, Package, AlertTriangle, Loader2, RefreshCw, ArrowRight, Plus, Pencil, Trash2, RotateCcw } from 'lucide-react'
import { getStoresWithStats, type StoreStats } from '@/actions/dashboard'
import { deleteStoreAction, reactivateStoreAction } from '@/actions/config'
import { formatCurrency, cn } from '@/lib/utils'
import { useStores } from '@/hooks/use-cached-queries'
import { StoreEditDialog, type StoreEditRow } from '@/components/admin/store-edit-dialog'
import { toast } from 'sonner'

export function TiendasContent({ initialStores = [] }: { initialStores?: StoreStats[] }) {
  const router = useRouter()
  const [stores, setStores] = useState<StoreStats[]>(initialStores)
  const [loading, setLoading] = useState(false)
  const { data: storesFull, refetch: refetchStoresFull } = useStores()
  const [editOpen, setEditOpen] = useState(false)
  const [editingStore, setEditingStore] = useState<StoreEditRow | null>(null)
  const [showInactive, setShowInactive] = useState(true)
  const [confirmTarget, setConfirmTarget] = useState<{ id: string; name: string; mode: 'deactivate' | 'reactivate' } | null>(null)
  const [actionLoading, setActionLoading] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    const res = await getStoresWithStats({ includeInactive: true })
    if (res.success && res.data) setStores(res.data)
    setLoading(false)
  }, [])

  const visibleStores = useMemo(
    () => (showInactive ? stores : stores.filter((s) => s.isActive)),
    [stores, showInactive],
  )

  const inactiveCount = useMemo(() => stores.filter((s) => !s.isActive).length, [stores])

  const openEdit = (storeId: string) => {
    const full = storesFull?.find(s => s.id === storeId)
    if (!full) return
    setEditingStore(full as StoreEditRow)
    setEditOpen(true)
  }

  const openNew = () => {
    setEditingStore(null)
    setEditOpen(true)
  }

  const confirmAction = async () => {
    if (!confirmTarget) return
    setActionLoading(true)
    const res = confirmTarget.mode === 'deactivate'
      ? await deleteStoreAction(confirmTarget.id)
      : await reactivateStoreAction(confirmTarget.id)
    setActionLoading(false)
    if (res.error) {
      toast.error(res.error)
      return
    }
    toast.success(confirmTarget.mode === 'deactivate' ? 'Tienda desactivada' : 'Tienda reactivada')
    setConfirmTarget(null)
    await load()
    refetchStoresFull()
  }

  if (loading && stores.length === 0) {
    return (
      <div className="flex h-[50vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-prats-navy" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Tiendas</h1>
          <p className="text-muted-foreground">Stocks y ventas por tienda</p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          {inactiveCount > 0 && (
            <div className="flex items-center gap-2">
              <Switch id="show-inactive" checked={showInactive} onCheckedChange={setShowInactive} />
              <Label htmlFor="show-inactive" className="text-sm cursor-pointer">
                Mostrar inactivas ({inactiveCount})
              </Label>
            </div>
          )}
          <Button variant="outline" size="sm" className="gap-2" onClick={load}>
            <RefreshCw className="h-4 w-4" /> Actualizar
          </Button>
          <Button
            size="sm"
            className="gap-2 bg-prats-navy hover:bg-prats-navy-light"
            onClick={openNew}
          >
            <Plus className="h-4 w-4" /> Nueva tienda
          </Button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {visibleStores.map((s) => {
          const isInactive = !s.isActive
          return (
            <Card
              key={s.id}
              className={cn(
                'transition-shadow hover:shadow-md',
                isInactive ? 'opacity-60 bg-muted/30' : 'cursor-pointer',
              )}
              onClick={() => { if (!isInactive) router.push(`/admin/stock?store=${s.id}`) }}
            >
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base flex items-center gap-2 min-w-0">
                    <Store className="h-4 w-4 text-prats-navy shrink-0" />
                    <span className="truncate">{s.name}</span>
                    {isInactive && <Badge variant="secondary" className="text-xs shrink-0">Inactiva</Badge>}
                  </CardTitle>
                  <div className="flex items-center gap-1">
                    <span className="text-xs text-muted-foreground">{s.code}</span>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      onClick={(e) => { e.stopPropagation(); openEdit(s.id) }}
                      title="Editar tienda"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    {isInactive ? (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-green-700 hover:text-green-800 hover:bg-green-50"
                        onClick={(e) => { e.stopPropagation(); setConfirmTarget({ id: s.id, name: s.name, mode: 'reactivate' }) }}
                        title="Reactivar tienda"
                      >
                        <RotateCcw className="h-3.5 w-3.5" />
                      </Button>
                    ) : (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-red-600 hover:text-red-700 hover:bg-red-50"
                        onClick={(e) => { e.stopPropagation(); setConfirmTarget({ id: s.id, name: s.name, mode: 'deactivate' }) }}
                        title="Desactivar tienda"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </div>
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
                {!isInactive && (
                  <Button variant="ghost" size="sm" className="w-full gap-1 mt-2" onClick={(e) => { e.stopPropagation(); router.push(`/admin/stock?store=${s.id}`) }}>
                    Ver stock <ArrowRight className="h-3 w-3" />
                  </Button>
                )}
              </CardContent>
            </Card>
          )
        })}
      </div>

      {visibleStores.length === 0 && (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            {stores.length === 0 ? (
              <>No hay tiendas. <Button variant="link" className="p-0 h-auto" onClick={openNew}>Crear nueva tienda</Button>.</>
            ) : (
              <>No hay tiendas activas. Activa &quot;Mostrar inactivas&quot; para ver las desactivadas.</>
            )}
          </CardContent>
        </Card>
      )}

      <StoreEditDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        store={editingStore}
        onSaved={() => { refetchStoresFull(); load() }}
      />

      <AlertDialog open={!!confirmTarget} onOpenChange={(open) => { if (!open) setConfirmTarget(null) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirmTarget?.mode === 'deactivate' ? 'Desactivar tienda' : 'Reactivar tienda'}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirmTarget?.mode === 'deactivate' ? (
                <>
                  ¿Desactivar la tienda <strong>{confirmTarget?.name}</strong>? La tienda dejará de aparecer
                  en los selectores pero sus datos históricos se conservan. Podrás reactivarla más tarde.
                </>
              ) : (
                <>¿Reactivar la tienda <strong>{confirmTarget?.name}</strong>? Volverá a aparecer en todos los selectores.</>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={actionLoading}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => { e.preventDefault(); confirmAction() }}
              disabled={actionLoading}
              className={confirmTarget?.mode === 'deactivate' ? 'bg-red-600 hover:bg-red-700' : ''}
            >
              {actionLoading && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              {confirmTarget?.mode === 'deactivate' ? 'Desactivar' : 'Reactivar'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
