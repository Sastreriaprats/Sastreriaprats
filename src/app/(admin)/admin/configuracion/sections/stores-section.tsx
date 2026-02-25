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
import { createStoreAction, updateStoreAction, createWarehouseAction } from '@/actions/config'

export function StoresSection() {
  const supabase = useMemo(() => createClient(), [])
  const { data: storesData, refetch: refetchStores } = useStores()
  const stores = storesData ?? []
  const [warehouses, setWarehouses] = useState<any[]>([])
  const [warehousesLoading, setWarehousesLoading] = useState(true)
  const [showStoreDialog, setShowStoreDialog] = useState(false)
  const [showWarehouseDialog, setShowWarehouseDialog] = useState(false)
  const [editingStore, setEditingStore] = useState<any>(null)
  const [isSaving, setIsSaving] = useState(false)

  const [storeForm, setStoreForm] = useState({
    code: '', name: '', display_name: '', store_type: 'physical',
    address: '', city: 'Madrid', postal_code: '', province: 'Madrid', country: 'España',
    phone: '', email: '', default_cash_fund: '300', order_prefix: '', slug: '',
    opening_hours: {} as Record<string, { open: string; close: string }>,
    fiscal_name: '', fiscal_nif: '', fiscal_address: '',
    latitude: '', longitude: '', google_maps_url: '',
  })

  const [warehouseForm, setWarehouseForm] = useState({
    code: '', name: '', store_id: '', is_main: false, accepts_online_stock: false,
  })

  const days = [
    { key: 'mon', label: 'Lunes' }, { key: 'tue', label: 'Martes' }, { key: 'wed', label: 'Miércoles' },
    { key: 'thu', label: 'Jueves' }, { key: 'fri', label: 'Viernes' }, { key: 'sat', label: 'Sábado' },
    { key: 'sun', label: 'Domingo' },
  ]

  const fetchWarehouses = useCallback(async () => {
    setWarehousesLoading(true)
    try {
      const { data } = await supabase.from('warehouses').select('*, stores(name)').order('name')
      if (data) setWarehouses(data)
    } catch (err) {
      console.error('[StoresSection] fetchWarehouses error:', err)
      toast.error('Error al cargar almacenes')
    } finally {
      setWarehousesLoading(false)
    }
  }, [supabase])

  useEffect(() => { fetchWarehouses() }, [fetchWarehouses])

  const isLoading = warehousesLoading

  const handleSaveStore = async () => {
    setIsSaving(true)
    const payload = {
      code: storeForm.code.toUpperCase(), name: storeForm.name,
      display_name: storeForm.display_name || storeForm.name,
      store_type: storeForm.store_type, address: storeForm.address || undefined,
      city: storeForm.city, postal_code: storeForm.postal_code || undefined,
      province: storeForm.province, country: storeForm.country,
      phone: storeForm.phone || undefined, email: storeForm.email || undefined,
      opening_hours: storeForm.opening_hours,
      default_cash_fund: parseFloat(storeForm.default_cash_fund) || 300,
      order_prefix: storeForm.order_prefix || storeForm.code.toUpperCase(),
      slug: storeForm.slug || storeForm.name.toLowerCase().replace(/\s+/g, '-'),
      fiscal_name: storeForm.fiscal_name || undefined,
      fiscal_nif: storeForm.fiscal_nif || undefined,
      fiscal_address: storeForm.fiscal_address || undefined,
      latitude: storeForm.latitude ? parseFloat(storeForm.latitude) : undefined,
      longitude: storeForm.longitude ? parseFloat(storeForm.longitude) : undefined,
      google_maps_url: storeForm.google_maps_url || undefined,
    }

    const result = editingStore
      ? await updateStoreAction(editingStore.id, payload)
      : await createStoreAction(payload)

    if (result.error) toast.error(result.error)
    else { toast.success(editingStore ? 'Tienda actualizada' : 'Tienda creada con almacén'); setShowStoreDialog(false); refetchStores(); fetchWarehouses() }
    setIsSaving(false)
  }

  const editStore = (store: any) => {
    setEditingStore(store)
    setStoreForm({
      code: store.code, name: store.name, display_name: store.display_name || '',
      store_type: store.store_type, address: store.address || '', city: store.city || 'Madrid',
      postal_code: store.postal_code || '', province: store.province || 'Madrid', country: store.country || 'España',
      phone: store.phone || '', email: store.email || '',
      default_cash_fund: store.default_cash_fund?.toString() || '300',
      order_prefix: store.order_prefix || '', slug: store.slug || '',
      opening_hours: store.opening_hours || {},
      fiscal_name: store.fiscal_name || '', fiscal_nif: store.fiscal_nif || '', fiscal_address: store.fiscal_address || '',
      latitude: store.latitude?.toString() || '', longitude: store.longitude?.toString() || '',
      google_maps_url: store.google_maps_url || '',
    })
    setShowStoreDialog(true)
  }

  const newStore = () => {
    setEditingStore(null)
    setStoreForm({ code: '', name: '', display_name: '', store_type: 'physical', address: '', city: 'Madrid',
      postal_code: '', province: 'Madrid', country: 'España', phone: '', email: '', default_cash_fund: '300',
      order_prefix: '', slug: '', opening_hours: {}, fiscal_name: '', fiscal_nif: '', fiscal_address: '',
      latitude: '', longitude: '', google_maps_url: '' })
    setShowStoreDialog(true)
  }

  const setHours = (day: string, field: 'open' | 'close', value: string) => {
    setStoreForm(prev => ({
      ...prev, opening_hours: { ...prev.opening_hours, [day]: { ...(prev.opening_hours[day] || { open: '', close: '' }), [field]: value } }
    }))
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
          {warehouses.map((w: any) => (
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

      <Dialog open={showStoreDialog} onOpenChange={setShowStoreDialog}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingStore ? 'Editar tienda' : 'Nueva tienda'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2"><Label>Código *</Label><Input value={storeForm.code} onChange={(e) => setStoreForm(p => ({ ...p, code: e.target.value }))} placeholder="WEL" maxLength={10} /></div>
              <div className="space-y-2 col-span-2"><Label>Nombre *</Label><Input value={storeForm.name} onChange={(e) => setStoreForm(p => ({ ...p, name: e.target.value }))} /></div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2"><Label>Tipo</Label>
                <Select value={storeForm.store_type} onValueChange={(v) => setStoreForm(p => ({ ...p, store_type: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="physical">Física</SelectItem>
                    <SelectItem value="online">Online</SelectItem>
                    <SelectItem value="warehouse">Almacén</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2"><Label>Fondo de caja (€)</Label><Input type="number" value={storeForm.default_cash_fund} onChange={(e) => setStoreForm(p => ({ ...p, default_cash_fund: e.target.value }))} /></div>
            </div>
            <div className="space-y-2"><Label>Dirección</Label><Input value={storeForm.address} onChange={(e) => setStoreForm(p => ({ ...p, address: e.target.value }))} /></div>
            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2"><Label>Ciudad</Label><Input value={storeForm.city} onChange={(e) => setStoreForm(p => ({ ...p, city: e.target.value }))} /></div>
              <div className="space-y-2"><Label>CP</Label><Input value={storeForm.postal_code} onChange={(e) => setStoreForm(p => ({ ...p, postal_code: e.target.value }))} /></div>
              <div className="space-y-2"><Label>Provincia</Label><Input value={storeForm.province} onChange={(e) => setStoreForm(p => ({ ...p, province: e.target.value }))} /></div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2"><Label>Teléfono</Label><Input value={storeForm.phone} onChange={(e) => setStoreForm(p => ({ ...p, phone: e.target.value }))} /></div>
              <div className="space-y-2"><Label>Email</Label><Input value={storeForm.email} onChange={(e) => setStoreForm(p => ({ ...p, email: e.target.value }))} /></div>
            </div>

            <div className="space-y-2">
              <Label>Horario de apertura</Label>
              <div className="rounded-lg border p-3 space-y-2">
                {days.map(d => (
                  <div key={d.key} className="grid grid-cols-5 items-center gap-2">
                    <span className="text-sm">{d.label}</span>
                    <Input type="time" className="col-span-2" value={storeForm.opening_hours[d.key]?.open || ''} onChange={(e) => setHours(d.key, 'open', e.target.value)} />
                    <Input type="time" className="col-span-2" value={storeForm.opening_hours[d.key]?.close || ''} onChange={(e) => setHours(d.key, 'close', e.target.value)} />
                  </div>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <Label className="font-semibold">Datos fiscales</Label>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2"><Label>Razón social</Label><Input value={storeForm.fiscal_name} onChange={(e) => setStoreForm(p => ({ ...p, fiscal_name: e.target.value }))} /></div>
                <div className="space-y-2"><Label>NIF/CIF</Label><Input value={storeForm.fiscal_nif} onChange={(e) => setStoreForm(p => ({ ...p, fiscal_nif: e.target.value }))} /></div>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowStoreDialog(false)}>Cancelar</Button>
            <Button onClick={handleSaveStore} disabled={isSaving || !storeForm.code || !storeForm.name} className="bg-prats-navy hover:bg-prats-navy-light">
              {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null} {editingStore ? 'Guardar cambios' : 'Crear tienda'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
              const res = await createWarehouseAction(warehouseForm)
              if (res.error) toast.error(res.error)
              else { toast.success('Almacén creado'); setShowWarehouseDialog(false); fetchWarehouses() }
            }} disabled={!warehouseForm.code || !warehouseForm.name} className="bg-prats-navy hover:bg-prats-navy-light">
              Crear almacén
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
