'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import { Loader2, Plus, Trash2, Search, Check, X } from 'lucide-react'
import { toast } from 'sonner'
import { listClients } from '@/actions/clients'
import { updateOrderAction } from '@/actions/orders'
import { createClient } from '@/lib/supabase/client'
import { formatCurrency } from '@/lib/utils'

type EditableLine = {
  id?: string
  garment_type_id: string
  line_type: 'artesanal' | 'industrial'
  unit_price: number
  discount_percentage: number
  tax_rate: number
  material_cost: number
  labor_cost: number
  factory_cost: number
  fabric_id?: string | null
  fabric_description?: string | null
  fabric_meters?: number | null
  supplier_id?: string | null
  model_name?: string | null
  model_size?: string | null
  finishing_notes?: string | null
  configuration: Record<string, unknown>
  sort_order: number
  // Local-only
  _key: string
}

type GarmentType = { id: string; name: string; code: string | null }
type StoreOpt = { id: string; name: string }
type ClientOpt = { id: string; full_name?: string | null; first_name?: string | null; last_name?: string | null; phone?: string | null; client_code?: string | null }

interface EditOrderDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  order: any
  onSaved?: () => void
}

const LINE_TYPES: Array<{ value: 'artesanal' | 'industrial'; label: string }> = [
  { value: 'artesanal', label: 'Artesanal' },
  { value: 'industrial', label: 'Industrial' },
]

export function EditOrderDialog({ open, onOpenChange, order, onSaved }: EditOrderDialogProps) {
  const router = useRouter()

  // Cabecera
  const [clientId, setClientId] = useState<string | null>(order?.client_id ?? null)
  const [clientLabel, setClientLabel] = useState<string>(order?.clients?.full_name ?? '')
  const [clientQuery, setClientQuery] = useState('')
  const [clientResults, setClientResults] = useState<ClientOpt[]>([])
  const [clientSearching, setClientSearching] = useState(false)

  const [storeId, setStoreId] = useState<string>(order?.store_id ?? '')
  const [orderType, setOrderType] = useState<'artesanal' | 'industrial'>(order?.order_type ?? 'artesanal')
  const [estimatedDate, setEstimatedDate] = useState<string>(order?.estimated_delivery_date ?? '')
  const [deliveryMethod, setDeliveryMethod] = useState<'store' | 'home'>(order?.delivery_method ?? 'store')
  const [deliveryAddress, setDeliveryAddress] = useState<string>(order?.delivery_address ?? '')
  const [deliveryCity, setDeliveryCity] = useState<string>(order?.delivery_city ?? '')
  const [deliveryCP, setDeliveryCP] = useState<string>(order?.delivery_postal_code ?? '')
  const [discountPct, setDiscountPct] = useState<number>(Number(order?.discount_percentage ?? 0))
  const [internalNotes, setInternalNotes] = useState<string>(order?.internal_notes ?? '')
  const [clientNotes, setClientNotes] = useState<string>(order?.client_notes ?? '')

  const [lines, setLines] = useState<EditableLine[]>(() =>
    (order?.tailoring_order_lines ?? []).map((l: any, idx: number) => ({
      id: l.id,
      garment_type_id: l.garment_type_id,
      line_type: l.line_type,
      unit_price: Number(l.unit_price ?? 0),
      discount_percentage: Number(l.discount_percentage ?? 0),
      tax_rate: Number(l.tax_rate ?? 21),
      material_cost: Number(l.material_cost ?? 0),
      labor_cost: Number(l.labor_cost ?? 0),
      factory_cost: Number(l.factory_cost ?? 0),
      fabric_id: l.fabric_id ?? null,
      fabric_description: l.fabric_description ?? '',
      fabric_meters: l.fabric_meters ?? null,
      supplier_id: l.supplier_id ?? null,
      model_name: l.model_name ?? '',
      model_size: l.model_size ?? '',
      finishing_notes: l.finishing_notes ?? '',
      configuration: (l.configuration as Record<string, unknown>) ?? {},
      sort_order: l.sort_order ?? idx,
      _key: `existing-${l.id}`,
    })),
  )

  const [garmentTypes, setGarmentTypes] = useState<GarmentType[]>([])
  const [stores, setStores] = useState<StoreOpt[]>([])
  const [saving, setSaving] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)

  // Cargar tipos de prenda y tiendas
  useEffect(() => {
    if (!open) return
    const sb = createClient()
    sb.from('garment_types').select('id, name, code').eq('is_active', true).order('name')
      .then(({ data }) => { if (data) setGarmentTypes(data as GarmentType[]) })
    sb.from('stores').select('id, name').eq('is_active', true).neq('store_type', 'online').order('name')
      .then(({ data }) => { if (data) setStores(data as StoreOpt[]) })
  }, [open])

  // Buscar cliente
  useEffect(() => {
    if (!open) return
    const q = clientQuery.trim()
    if (q.length < 2) { setClientResults([]); return }
    let cancelled = false
    setClientSearching(true)
    const timer = setTimeout(() => {
      listClients({ search: q, pageSize: 10 })
        .then((res) => {
          if (cancelled) return
          if (res.success) {
            const payload = res.data as any
            const rows = Array.isArray(payload?.data) ? payload.data : Array.isArray(payload) ? payload : []
            setClientResults(rows as ClientOpt[])
          }
        })
        .finally(() => { if (!cancelled) setClientSearching(false) })
    }, 300)
    return () => { cancelled = true; clearTimeout(timer) }
  }, [clientQuery, open])

  // Cálculos en vivo
  const summary = useMemo(() => {
    const subtotalLines = lines.reduce((s, l) => {
      const d = l.unit_price * (l.discount_percentage / 100)
      return s + (l.unit_price - d)
    }, 0)
    const afterHeaderDiscount = subtotalLines * (1 - discountPct / 100)
    const discountAmount = Math.round((subtotalLines - afterHeaderDiscount) * 100) / 100
    let taxAmount = 0
    for (const l of lines) {
      const lt = l.unit_price * (1 - l.discount_percentage / 100)
      const ltAfter = lt * (1 - discountPct / 100)
      taxAmount += ltAfter * l.tax_rate / (100 + l.tax_rate)
    }
    taxAmount = Math.round(taxAmount * 100) / 100
    const total = Math.round(afterHeaderDiscount * 100) / 100
    const subtotal = Math.round((total - taxAmount) * 100) / 100
    const totalCost = lines.reduce(
      (s, l) => s + Number(l.material_cost || 0) + Number(l.labor_cost || 0) + Number(l.factory_cost || 0),
      0,
    )
    const margin = total - totalCost
    const marginPct = total > 0 ? (margin / total) * 100 : 0
    return {
      subtotal, discountAmount, taxAmount, total,
      totalCost: Math.round(totalCost * 100) / 100,
      margin: Math.round(margin * 100) / 100,
      marginPct,
    }
  }, [lines, discountPct])

  const marginColor = summary.marginPct >= 20 ? 'text-green-600' : summary.marginPct >= 10 ? 'text-amber-600' : 'text-red-600'

  // Helpers para líneas
  const addLine = () => {
    const defaultGarmentId = garmentTypes[0]?.id ?? ''
    setLines((prev) => [
      ...prev,
      {
        garment_type_id: defaultGarmentId,
        line_type: orderType,
        unit_price: 0,
        discount_percentage: 0,
        tax_rate: 21,
        material_cost: 0,
        labor_cost: 0,
        factory_cost: 0,
        fabric_id: null,
        fabric_description: '',
        fabric_meters: null,
        supplier_id: null,
        model_name: '',
        model_size: '',
        finishing_notes: '',
        configuration: {},
        sort_order: prev.length,
        _key: `new-${Date.now()}-${Math.random()}`,
      },
    ])
  }

  const removeLine = (key: string) => setLines((prev) => prev.filter((l) => l._key !== key))

  const updateLine = useCallback(<K extends keyof EditableLine>(key: string, field: K, value: EditableLine[K]) => {
    setLines((prev) => prev.map((l) => (l._key === key ? { ...l, [field]: value } : l)))
  }, [])

  const canSave = clientId && storeId && !saving && lines.length > 0

  const handleSubmit = async () => {
    if (!clientId || !storeId) { toast.error('Cliente y tienda son obligatorios'); return }
    setSaving(true)
    const res = await updateOrderAction({
      orderId: order.id,
      client_id: clientId,
      store_id: storeId,
      order_type: orderType,
      estimated_delivery_date: estimatedDate || null,
      delivery_method: deliveryMethod,
      delivery_address: deliveryMethod === 'home' ? (deliveryAddress.trim() || null) : null,
      delivery_city: deliveryMethod === 'home' ? (deliveryCity.trim() || null) : null,
      delivery_postal_code: deliveryMethod === 'home' ? (deliveryCP.trim() || null) : null,
      discount_percentage: discountPct,
      internal_notes: internalNotes.trim() || null,
      client_notes: clientNotes.trim() || null,
      lines: lines.map((l, i) => ({
        id: l.id,
        garment_type_id: l.garment_type_id,
        line_type: l.line_type,
        unit_price: l.unit_price,
        discount_percentage: l.discount_percentage,
        tax_rate: l.tax_rate,
        material_cost: l.material_cost,
        labor_cost: l.labor_cost,
        factory_cost: l.factory_cost,
        fabric_id: l.fabric_id || null,
        fabric_description: l.fabric_description || null,
        fabric_meters: l.fabric_meters ?? null,
        supplier_id: l.supplier_id || null,
        model_name: l.model_name || null,
        model_size: l.model_size || null,
        finishing_notes: l.finishing_notes || null,
        configuration: l.configuration ?? {},
        sort_order: i,
      })),
    })
    setSaving(false)
    setConfirmOpen(false)
    if (!res.success) { toast.error(res.error || 'No se pudo guardar'); return }
    toast.success('Pedido actualizado')
    onOpenChange(false)
    onSaved?.()
    router.refresh()
  }

  return (
    <>
      <Dialog open={open} onOpenChange={(v) => { if (!saving) onOpenChange(v) }}>
        <DialogContent className="max-w-5xl w-[calc(100vw-2rem)] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Editar pedido {order?.order_number}</DialogTitle>
          </DialogHeader>

          {/* SECCIÓN 1 — Datos generales */}
          <section className="space-y-3">
            <h3 className="text-sm font-semibold">Datos generales</h3>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {/* Cliente */}
              <div className="space-y-1">
                <Label>Cliente</Label>
                {clientId ? (
                  <div className="flex items-center justify-between gap-2 rounded-md border px-3 py-2 text-sm">
                    <span className="truncate">{clientLabel || '—'}</span>
                    <Button variant="ghost" size="sm" onClick={() => { setClientId(null); setClientLabel('') }}>
                      <X className="h-3 w-3" /> Cambiar
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-1">
                    <div className="relative">
                      <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input
                        className="pl-8"
                        placeholder="Buscar cliente..."
                        value={clientQuery}
                        onChange={(e) => setClientQuery(e.target.value)}
                      />
                      {clientSearching && <Loader2 className="absolute right-2 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin" />}
                    </div>
                    {clientResults.length > 0 && (
                      <div className="max-h-40 overflow-y-auto rounded-md border">
                        {clientResults.map((c) => {
                          const name = c.full_name || [c.first_name, c.last_name].filter(Boolean).join(' ') || '—'
                          return (
                            <button
                              key={c.id}
                              type="button"
                              className="w-full px-3 py-2 text-left text-sm hover:bg-muted border-b last:border-b-0"
                              onClick={() => { setClientId(c.id); setClientLabel(name); setClientQuery(''); setClientResults([]) }}
                            >
                              <span>{name}</span>
                              {c.phone && <span className="ml-2 text-xs text-muted-foreground">{c.phone}</span>}
                            </button>
                          )
                        })}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Tienda */}
              <div className="space-y-1">
                <Label>Tienda</Label>
                <Select value={storeId} onValueChange={setStoreId}>
                  <SelectTrigger><SelectValue placeholder="Seleccionar" /></SelectTrigger>
                  <SelectContent>
                    {stores.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>

              {/* Tipo de pedido */}
              <div className="space-y-1">
                <Label>Tipo de pedido</Label>
                <Select value={orderType} onValueChange={(v) => setOrderType(v as 'artesanal' | 'industrial')}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="artesanal">Artesanal</SelectItem>
                    <SelectItem value="industrial">Industrial</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Fecha entrega */}
              <div className="space-y-1">
                <Label>Fecha entrega estimada</Label>
                <Input type="date" value={estimatedDate?.slice(0, 10) ?? ''} onChange={(e) => setEstimatedDate(e.target.value)} />
              </div>

              {/* Método entrega */}
              <div className="space-y-1">
                <Label>Método de entrega</Label>
                <Select value={deliveryMethod} onValueChange={(v) => setDeliveryMethod(v as 'store' | 'home')}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="store">Recoger en tienda</SelectItem>
                    <SelectItem value="home">Domicilio</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Descuento % */}
              <div className="space-y-1">
                <Label>Descuento global (%)</Label>
                <Input
                  type="number" min={0} max={100} step={0.01}
                  value={discountPct}
                  onChange={(e) => setDiscountPct(Math.max(0, Math.min(100, parseFloat(e.target.value) || 0)))}
                />
              </div>

              {/* Dirección si es home */}
              {deliveryMethod === 'home' && (
                <>
                  <div className="space-y-1 md:col-span-2">
                    <Label>Dirección</Label>
                    <Input value={deliveryAddress} onChange={(e) => setDeliveryAddress(e.target.value)} />
                  </div>
                  <div className="space-y-1">
                    <Label>Ciudad</Label>
                    <Input value={deliveryCity} onChange={(e) => setDeliveryCity(e.target.value)} />
                  </div>
                  <div className="space-y-1">
                    <Label>Código postal</Label>
                    <Input value={deliveryCP} onChange={(e) => setDeliveryCP(e.target.value)} />
                  </div>
                </>
              )}

              {/* Notas */}
              <div className="space-y-1 md:col-span-2">
                <Label>Notas internas</Label>
                <Textarea rows={2} value={internalNotes} onChange={(e) => setInternalNotes(e.target.value)} />
              </div>
              <div className="space-y-1 md:col-span-2">
                <Label>Notas cliente</Label>
                <Textarea rows={2} value={clientNotes} onChange={(e) => setClientNotes(e.target.value)} />
              </div>
            </div>
          </section>

          {/* SECCIÓN 2 — Líneas */}
          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold">Prendas ({lines.length})</h3>
              <Button size="sm" variant="outline" className="gap-1" onClick={addLine}>
                <Plus className="h-3 w-3" /> Añadir línea
              </Button>
            </div>
            {lines.length === 0 ? (
              <div className="rounded-md border p-6 text-center text-sm text-muted-foreground">
                No hay prendas. Añade al menos una.
              </div>
            ) : (
              <div className="overflow-x-auto rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[180px]">Prenda</TableHead>
                      <TableHead className="w-[110px]">Tipo</TableHead>
                      <TableHead className="w-[90px]">PVP (€)</TableHead>
                      <TableHead className="w-[80px]">Dto. %</TableHead>
                      <TableHead className="w-[80px]">IVA %</TableHead>
                      <TableHead className="w-[90px]">Material</TableHead>
                      <TableHead className="w-[90px]">M. Obra</TableHead>
                      <TableHead className="w-[90px]">Fábrica</TableHead>
                      <TableHead className="w-[140px]">Tejido</TableHead>
                      <TableHead className="w-[80px]">Metros</TableHead>
                      <TableHead className="w-[140px]">Notas acabado</TableHead>
                      <TableHead className="w-[40px]" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {lines.map((l) => (
                      <TableRow key={l._key}>
                        <TableCell>
                          <Select value={l.garment_type_id} onValueChange={(v) => updateLine(l._key, 'garment_type_id', v)}>
                            <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              {garmentTypes.map((g) => <SelectItem key={g.id} value={g.id}>{g.name}</SelectItem>)}
                            </SelectContent>
                          </Select>
                        </TableCell>
                        <TableCell>
                          <Select value={l.line_type} onValueChange={(v) => updateLine(l._key, 'line_type', v as 'artesanal' | 'industrial')}>
                            <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              {LINE_TYPES.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                            </SelectContent>
                          </Select>
                        </TableCell>
                        <TableCell>
                          <Input className="h-8 text-xs" type="number" min={0} step={0.01}
                            value={l.unit_price} onChange={(e) => updateLine(l._key, 'unit_price', parseFloat(e.target.value) || 0)} />
                        </TableCell>
                        <TableCell>
                          <Input className="h-8 text-xs" type="number" min={0} max={100} step={0.01}
                            value={l.discount_percentage} onChange={(e) => updateLine(l._key, 'discount_percentage', parseFloat(e.target.value) || 0)} />
                        </TableCell>
                        <TableCell>
                          <Input className="h-8 text-xs" type="number" min={0} max={100} step={0.01}
                            value={l.tax_rate} onChange={(e) => updateLine(l._key, 'tax_rate', parseFloat(e.target.value) || 0)} />
                        </TableCell>
                        <TableCell>
                          <Input className="h-8 text-xs" type="number" min={0} step={0.01}
                            value={l.material_cost} onChange={(e) => updateLine(l._key, 'material_cost', parseFloat(e.target.value) || 0)} />
                        </TableCell>
                        <TableCell>
                          <Input className="h-8 text-xs" type="number" min={0} step={0.01}
                            value={l.labor_cost} onChange={(e) => updateLine(l._key, 'labor_cost', parseFloat(e.target.value) || 0)} />
                        </TableCell>
                        <TableCell>
                          <Input className="h-8 text-xs" type="number" min={0} step={0.01}
                            value={l.factory_cost} onChange={(e) => updateLine(l._key, 'factory_cost', parseFloat(e.target.value) || 0)} />
                        </TableCell>
                        <TableCell>
                          <Input className="h-8 text-xs" placeholder="Descripción"
                            value={l.fabric_description ?? ''} onChange={(e) => updateLine(l._key, 'fabric_description', e.target.value)} />
                        </TableCell>
                        <TableCell>
                          <Input className="h-8 text-xs" type="number" min={0} step={0.1}
                            value={l.fabric_meters ?? ''} onChange={(e) => updateLine(l._key, 'fabric_meters', e.target.value === '' ? null : (parseFloat(e.target.value) || 0))} />
                        </TableCell>
                        <TableCell>
                          <Input className="h-8 text-xs"
                            value={l.finishing_notes ?? ''} onChange={(e) => updateLine(l._key, 'finishing_notes', e.target.value)} />
                        </TableCell>
                        <TableCell>
                          <Button variant="ghost" size="icon" className="h-7 w-7 text-red-600" onClick={() => removeLine(l._key)}>
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
            <p className="text-xs text-muted-foreground">
              La ficha completa de confección (configuración JSONB) se preserva al editar. Para modificarla en detalle, usa el flujo de nueva venta.
            </p>
          </section>

          {/* SECCIÓN 3 — Resumen */}
          <section className="rounded-lg border bg-muted/30 p-4 space-y-2">
            <h3 className="text-sm font-semibold">Resumen</h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
              <div>
                <p className="text-xs text-muted-foreground">Subtotal (sin IVA)</p>
                <p className="font-semibold tabular-nums">{formatCurrency(summary.subtotal)}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Descuento</p>
                <p className="font-semibold tabular-nums">-{formatCurrency(summary.discountAmount)}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">IVA</p>
                <p className="font-semibold tabular-nums">{formatCurrency(summary.taxAmount)}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Total</p>
                <p className="text-base font-bold tabular-nums">{formatCurrency(summary.total)}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Coste total</p>
                <p className="font-semibold tabular-nums">{formatCurrency(summary.totalCost)}</p>
              </div>
              <div className="md:col-span-2">
                <p className="text-xs text-muted-foreground">Margen</p>
                <p className={`text-base font-bold tabular-nums ${marginColor}`}>
                  {formatCurrency(summary.margin)} <span className="text-xs">({summary.marginPct.toFixed(1)}%)</span>
                </p>
              </div>
              <div>
                <Badge variant="outline">
                  {lines.length} {lines.length === 1 ? 'prenda' : 'prendas'}
                </Badge>
              </div>
            </div>
          </section>

          <DialogFooter>
            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Cancelar</Button>
            <Button onClick={() => setConfirmOpen(true)} disabled={!canSave} className="bg-prats-navy hover:bg-prats-navy-light">
              Guardar cambios
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Guardar los cambios en el pedido {order?.order_number}?</AlertDialogTitle>
            <AlertDialogDescription>
              Los cambios quedarán registrados en el historial del pedido.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={saving}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              disabled={saving}
              className="bg-prats-navy hover:bg-prats-navy-light"
              onClick={(e) => { e.preventDefault(); handleSubmit() }}
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Check className="h-4 w-4 mr-2" />}
              Confirmar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
