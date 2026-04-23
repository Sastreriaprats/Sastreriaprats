'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useStores } from '@/hooks/use-cached-queries'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import {
  Card, CardContent, CardDescription, CardHeader, CardTitle,
} from '@/components/ui/card'
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { Plus, Store, Warehouse, Pencil, Loader2, MapPin } from 'lucide-react'
import { toast } from 'sonner'
import { createWarehouseAction } from '@/actions/config'
import { StoreEditDialog, type StoreEditRow } from '@/components/admin/store-edit-dialog'

export function StoresSection() {
  const supabase = useMemo(() => createClient(), [])
  const { data: storesData, refetch: refetchStores } = useStores()
  const stores = storesData ?? []
  interface WarehouseRow { id: string; code: string; name: string; is_main: boolean; accepts_online_stock: boolean; stores?: { name: string } | null }
  const [warehouses, setWarehouses] = useState<WarehouseRow[]>([])
  const [warehousesLoading, setWarehousesLoading] = useState(true)
  const [showStoreDialog, setShowStoreDialog] = useState(false)
  const [showWarehouseDialog, setShowWarehouseDialog] = useState(false)
  const [editingStore, setEditingStore] = useState<StoreEditRow | null>(null)
  const [isSaving, setIsSaving] = useState(false)

  const [warehouseForm, setWarehouseForm] = useState({
    code: '', name: '', store_id: '', is_main: false, accepts_online_stock: false,
  })

  const fetchWarehouses = useCallback(async () => {
    setWarehousesLoading(true)
    try {
      const { data } = await supabase.from('warehouses').select('*, stores(name)').order('name')
      if (data) setWarehouses(data as WarehouseRow[])
    } catch (err) {
      console.error('[StoresSection] fetchWarehouses error:', err)
      toast.error('Error al cargar almacenes')
    } finally {
      setWarehousesLoading(false)
    }
  }, [supabase])

  useEffect(() => { fetchWarehouses() }, [fetchWarehouses])

  const isLoading = warehousesLoading

  const editStore = (store: StoreEditRow) => {
    setEditingStore(store)
    setShowStoreDialog(true)
  }

  const newStore = () => {
    setEditingStore(null)
    setShowStoreDialog(true)
  }

  return (
    <div className="space-y-6">
      <div>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold">Tiendas</h3>
          <Button onClick={newStore} size="sm" className="gap-2 bg-prats-navy hover:bg-prats-navy-light"><Plus className="h-4 w-4" /> Nueva tienda</Button>
        </div>
        {isLoading ? (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {[1, 2, 3].map((i) => (
              <Card key={i}>
                <CardHeader className="pb-3">
                  <div className="h-5 w-32 animate-pulse rounded bg-muted" />
                  <div className="flex gap-2 mt-2"><div className="h-5 w-12 animate-pulse rounded bg-muted" /><div className="h-5 w-14 animate-pulse rounded bg-muted" /></div>
                </CardHeader>
                <CardContent className="space-y-1">
                  <div className="h-4 w-full animate-pulse rounded bg-muted" />
                  <div className="h-4 w-3/4 animate-pulse rounded bg-muted" />
                </CardContent>
              </Card>
            ))}
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {stores.map((store) => (
              <Card key={store.id}>
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <CardTitle className="flex items-center gap-2 text-base"><Store className="h-4 w-4" />{store.name}</CardTitle>
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => editStore(store)}><Pencil className="h-4 w-4" /></Button>
                  </div>
                  <CardDescription>
                    <Badge variant="outline" className="text-xs mr-1">{store.code}</Badge>
                    <Badge variant="default" className="text-xs">{store.store_type === 'online' ? 'Online' : 'Física'}</Badge>
                  </CardDescription>
                </CardHeader>
                <CardContent className="text-sm text-muted-foreground space-y-1">
                  {store.address && <p className="flex items-center gap-1"><MapPin className="h-3 w-3" />{store.address}, {store.city}</p>}
                  {store.phone && <p>{store.phone}</p>}
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      <div>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold">Almacenes</h3>
          <Button onClick={() => setShowWarehouseDialog(true)} size="sm" variant="outline" className="gap-2"><Plus className="h-4 w-4" /> Nuevo almacén</Button>
        </div>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {warehouses.map((w) => (
            <Card key={w.id}>
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-sm"><Warehouse className="h-4 w-4" />{w.name}</CardTitle>
              </CardHeader>
              <CardContent className="text-xs text-muted-foreground">
                <p>Código: {w.code}</p>
                <p>Tienda: {w.stores?.name || 'Independiente'}</p>
                {w.is_main && <Badge variant="secondary" className="text-xs mt-1">Principal</Badge>}
                {w.accepts_online_stock && <Badge variant="outline" className="text-xs mt-1 ml-1">Stock online</Badge>}
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      <StoreEditDialog
        open={showStoreDialog}
        onOpenChange={setShowStoreDialog}
        store={editingStore}
        onSaved={() => { refetchStores(); fetchWarehouses() }}
      />

      <Dialog open={showWarehouseDialog} onOpenChange={setShowWarehouseDialog}>
        <DialogContent>
          <DialogHeader><DialogTitle>Nuevo almacén</DialogTitle></DialogHeader>
          <div className="space-y-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2"><Label>Código *</Label><Input value={warehouseForm.code} onChange={(e) => setWarehouseForm(p => ({ ...p, code: e.target.value }))} /></div>
              <div className="space-y-2"><Label>Nombre *</Label><Input value={warehouseForm.name} onChange={(e) => setWarehouseForm(p => ({ ...p, name: e.target.value }))} /></div>
            </div>
            <div className="space-y-2"><Label>Tienda vinculada</Label>
              <Select value={warehouseForm.store_id} onValueChange={(v) => setWarehouseForm(p => ({ ...p, store_id: v }))}>
                <SelectTrigger><SelectValue placeholder="Independiente" /></SelectTrigger>
                <SelectContent>
                  {stores.map(s => (<SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2"><Switch checked={warehouseForm.is_main} onCheckedChange={(c) => setWarehouseForm(p => ({ ...p, is_main: c }))} /><Label>Almacén principal</Label></div>
              <div className="flex items-center gap-2"><Switch checked={warehouseForm.accepts_online_stock} onCheckedChange={(c) => setWarehouseForm(p => ({ ...p, accepts_online_stock: c }))} /><Label>Stock online</Label></div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowWarehouseDialog(false)}>Cancelar</Button>
            <Button onClick={async () => {
              setIsSaving(true)
              const res = await createWarehouseAction(warehouseForm)
              if (res.error) toast.error(res.error)
              else { toast.success('Almacén creado'); setShowWarehouseDialog(false); fetchWarehouses() }
              setIsSaving(false)
            }} disabled={isSaving || !warehouseForm.code || !warehouseForm.name} className="bg-prats-navy hover:bg-prats-navy-light">
              {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null} Crear almacén
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
