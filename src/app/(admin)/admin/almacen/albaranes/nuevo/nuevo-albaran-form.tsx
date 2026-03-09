'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Trash2, Plus, Search } from 'lucide-react'
import { toast } from 'sonner'
import { listPhysicalWarehouses } from '@/actions/products'
import {
  createDeliveryNote,
  confirmDeliveryNote,
  searchProductVariantsForDeliveryNote,
} from '@/actions/delivery-notes'

type Line = {
  product_variant_id: string
  product_name: string
  sku: string
  quantity: number
  unit_price: number
}

export function NuevoAlbaranForm() {
  const router = useRouter()
  const [type, setType] = useState<'traspaso' | 'entrada_stock' | 'salida_stock' | 'ajuste'>('traspaso')
  const [fromWarehouseId, setFromWarehouseId] = useState('')
  const [toWarehouseId, setToWarehouseId] = useState('')
  const [notes, setNotes] = useState('')
  const [warehouses, setWarehouses] = useState<any[]>([])
  const [lines, setLines] = useState<Line[]>([])
  const [variantSearch, setVariantSearch] = useState('')
  const [variantOptions, setVariantOptions] = useState<any[]>([])

  useEffect(() => {
    listPhysicalWarehouses().then((r) => {
      if (r.success && r.data) setWarehouses(r.data)
    })
  }, [])

  useEffect(() => {
    const needsOriginStock = type === 'traspaso' || type === 'salida_stock' || type === 'ajuste'
    const warehouseId = needsOriginStock ? fromWarehouseId : undefined
    if (needsOriginStock && !warehouseId) {
      setVariantOptions([])
      return
    }
    const t = setTimeout(() => {
      searchProductVariantsForDeliveryNote({
        search: variantSearch || undefined,
        warehouseId,
      })
        .then((r) => {
          if (r.success && r.data) setVariantOptions(r.data)
        })
    }, 250)
    return () => clearTimeout(t)
  }, [variantSearch, fromWarehouseId, type])

  const canSubmit = useMemo(() => lines.length > 0 && (type !== 'traspaso' || fromWarehouseId !== toWarehouseId), [fromWarehouseId, lines.length, toWarehouseId, type])

  const addVariant = (variantId: string) => {
    const item = variantOptions.find((v) => v.id === variantId)
    if (!item) return
    setLines((prev) => {
      const existing = prev.find((l) => l.product_variant_id === item.id)
      if (existing) {
        return prev.map((l) => l.product_variant_id === item.id ? { ...l, quantity: l.quantity + 1 } : l)
      }
      return [
        ...prev,
        {
          product_variant_id: item.id,
          product_name: item.product_name,
          sku: item.variant_sku || item.product_sku,
          quantity: 1,
          unit_price: Number(item.unit_price || 0),
        },
      ]
    })
  }

  const save = async (confirm: boolean) => {
    if (!canSubmit) return toast.error('Completa líneas y almacenes antes de guardar')
    const payload = {
      type,
      from_warehouse_id: fromWarehouseId || null,
      to_warehouse_id: toWarehouseId || null,
      notes: notes || null,
      lines: lines.map((l, idx) => ({
        product_variant_id: l.product_variant_id,
        product_name: l.product_name,
        sku: l.sku,
        quantity: Number(l.quantity),
        unit_price: Number(l.unit_price),
        sort_order: idx,
      })),
    }
    const created = await createDeliveryNote(payload)
    if (!created.success || !created.data?.id) return toast.error(created.success ? 'No se pudo crear albarán' : created.error)
    if (confirm) {
      const confirmed = await confirmDeliveryNote(created.data.id)
      if (!confirmed.success) return toast.error(confirmed.error || 'No se pudo confirmar')
    }
    toast.success(confirm ? 'Albarán confirmado' : 'Borrador guardado')
    router.push(`/admin/almacen/albaranes/${created.data.id}`)
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Nuevo albarán</h1>
        <p className="text-muted-foreground">Crear albarán propio para traspasos y movimientos de almacén</p>
      </div>

      <Card>
        <CardHeader><CardTitle>Cabecera</CardTitle></CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="space-y-2">
            <Label>Tipo</Label>
            <Select value={type} onValueChange={(v: any) => setType(v)}>
              <SelectTrigger><SelectValue placeholder="Tipo" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="traspaso">Traspaso</SelectItem>
                <SelectItem value="entrada_stock">Entrada stock</SelectItem>
                <SelectItem value="salida_stock">Salida stock</SelectItem>
                <SelectItem value="ajuste">Ajuste</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Almacén origen</Label>
            <Select value={fromWarehouseId} onValueChange={setFromWarehouseId}>
              <SelectTrigger><SelectValue placeholder="Selecciona origen" /></SelectTrigger>
              <SelectContent>
                {warehouses.map((w) => <SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Almacén destino</Label>
            <Select value={toWarehouseId} onValueChange={setToWarehouseId}>
              <SelectTrigger><SelectValue placeholder="Selecciona destino" /></SelectTrigger>
              <SelectContent>
                {warehouses.map((w) => <SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="md:col-span-3 space-y-2">
            <Label>Notas</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Notas del albarán..." />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Líneas</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="md:col-span-2">
              <Input
                placeholder="Buscar variante por nombre o SKU..."
                value={variantSearch}
                onChange={(e) => setVariantSearch(e.target.value)}
              />
            </div>
            <Select
              onValueChange={addVariant}
              disabled={(type === 'traspaso' || type === 'salida_stock' || type === 'ajuste') && !fromWarehouseId}
            >
              <SelectTrigger>
                <SelectValue
                  placeholder={(type === 'traspaso' || type === 'salida_stock' || type === 'ajuste') && !fromWarehouseId
                    ? 'Selecciona almacén origen primero'
                    : 'Añadir variante encontrada'}
                />
              </SelectTrigger>
              <SelectContent>
                {variantOptions.map((v) => (
                  <SelectItem key={v.id} value={v.id}>
                    {v.product_name} · {v.variant_sku || v.product_sku}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Producto</TableHead>
                  <TableHead>SKU</TableHead>
                  <TableHead>Cantidad</TableHead>
                  <TableHead>Precio Unit.</TableHead>
                  <TableHead className="text-right">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {lines.length === 0 ? (
                  <TableRow><TableCell colSpan={5} className="h-20 text-center text-muted-foreground">Sin líneas</TableCell></TableRow>
                ) : lines.map((line) => (
                  <TableRow key={line.product_variant_id}>
                    <TableCell>{line.product_name}</TableCell>
                    <TableCell className="font-mono text-xs">{line.sku}</TableCell>
                    <TableCell>
                      <Input
                        type="number"
                        min={1}
                        value={line.quantity}
                        onChange={(e) => setLines((prev) => prev.map((l) => l.product_variant_id === line.product_variant_id ? { ...l, quantity: Number(e.target.value || 1) } : l))}
                      />
                    </TableCell>
                    <TableCell>
                      <Input
                        type="number"
                        min={0}
                        step="0.01"
                        value={line.unit_price}
                        onChange={(e) => setLines((prev) => prev.map((l) => l.product_variant_id === line.product_variant_id ? { ...l, unit_price: Number(e.target.value || 0) } : l))}
                      />
                    </TableCell>
                    <TableCell className="text-right">
                      <Button variant="outline" size="sm" onClick={() => setLines((prev) => prev.filter((l) => l.product_variant_id !== line.product_variant_id))}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={() => router.back()}>Cancelar</Button>
        <Button variant="outline" className="gap-2" onClick={() => save(false)}>
          <Plus className="h-4 w-4" /> Guardar borrador
        </Button>
        <Button className="gap-2 bg-prats-navy hover:bg-prats-navy-light" onClick={() => save(true)}>
          <Search className="h-4 w-4" /> Confirmar albarán
        </Button>
      </div>
    </div>
  )
}
