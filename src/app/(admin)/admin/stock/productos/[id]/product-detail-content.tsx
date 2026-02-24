'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import {
  ArrowLeft, Plus, ArrowUp, Loader2, Image as ImageIcon, Pencil, ArrowLeftRight,
} from 'lucide-react'
import { useAction } from '@/hooks/use-action'
import { usePermissions } from '@/hooks/use-permissions'
import { adjustStock, createVariantAction, moveStockBetweenWarehouses, updateProductAction } from '@/actions/products'
import { formatCurrency } from '@/lib/utils'
import { ProductForm } from '../product-form'

export function ProductDetailContent({
  product,
  categories,
  suppliers,
  physicalWarehouses = [],
}: {
  product: any
  categories: { id: string; name: string; slug: string }[]
  suppliers: { id: string; name: string }[]
  physicalWarehouses?: { id: string; name: string; code: string }[]
}) {
  const router = useRouter()
  const { can } = usePermissions()
  const variants = product.product_variants || []

  const [showEditDialog, setShowEditDialog] = useState(false)
  const [showAdjust, setShowAdjust] = useState(false)
  const [adjustForm, setAdjustForm] = useState({ variantId: '', warehouseId: '', quantity: 0, reason: '', movementType: 'adjustment_positive' as const })

  const [showNewVariant, setShowNewVariant] = useState(false)
  const [variantForm, setVariantForm] = useState({ variant_sku: '', size: '', color: '', barcode: '' })
  const [showTransfer, setShowTransfer] = useState(false)
  const [transferForm, setTransferForm] = useState({ variantId: '', fromWarehouseId: '', toWarehouseId: '', quantity: 0, reason: '' })
  const [showSubtractMeters, setShowSubtractMeters] = useState(false)
  const [subtractMetersForm, setSubtractMetersForm] = useState({ variantId: '', warehouseId: '', quantity: 0, reason: '' })
  const [selectedWarehouseId, setSelectedWarehouseId] = useState<string | null>(null)

  const { execute: doAdjust, isLoading: isAdjusting } = useAction(adjustStock, {
    successMessage: 'Stock ajustado',
    onSuccess: () => { setShowAdjust(false); setAdjustForm({ variantId: '', warehouseId: '', quantity: 0, reason: '', movementType: 'adjustment_positive' }); router.refresh() },
  })

  const { execute: doCreateVariant, isLoading: isCreatingVariant } = useAction(createVariantAction, {
    successMessage: 'Variante creada',
    onSuccess: () => { setShowNewVariant(false); router.refresh() },
  })

  const { execute: doMoveStock, isLoading: isMovingStock } = useAction(moveStockBetweenWarehouses, {
    successMessage: 'Traspaso realizado',
    onSuccess: () => { setShowTransfer(false); setTransferForm({ variantId: '', fromWarehouseId: '', toWarehouseId: '', quantity: 0, reason: '' }); router.refresh() },
  })

  const { execute: doUpdateProduct, isLoading: isUpdatingProduct } = useAction(updateProductAction, { successMessage: 'Producto actualizado', onSuccess: () => router.refresh() })

  const totalStock = variants.reduce((sum: number, v: any) =>
    sum + (v.stock_levels?.reduce((s: number, sl: any) => s + (sl.quantity || 0), 0) || 0), 0
  )

  const isFabric = String(product?.product_type || '') === 'tailoring_fabric'

  const warehousesFromVariants: { id: string; name: string; storeName?: string }[] = []
  for (const v of variants) {
    for (const sl of v.stock_levels || []) {
      const wh = sl.warehouses
      const store = wh?.store ?? wh?.stores
      if (store?.store_type !== 'physical') continue
      if (!warehousesFromVariants.some(w => w.id === sl.warehouse_id)) {
        warehousesFromVariants.push({
          id: sl.warehouse_id,
          name: wh?.name || sl.warehouse_id,
          storeName: store?.name || store?.code,
        })
      }
    }
  }
  const allWarehouses =
    physicalWarehouses.length > 0
      ? physicalWarehouses.map((w) => ({ id: w.id, name: w.name || w.code, storeName: undefined }))
      : warehousesFromVariants

  const warehousesToShow =
    selectedWarehouseId && allWarehouses.some((w) => w.id === selectedWarehouseId)
      ? allWarehouses.filter((w) => w.id === selectedWarehouseId)
      : allWarehouses

  const handleAdjustStock = async () => {
    let variantId = adjustForm.variantId
    if (!variantId && variants.length === 0 && allWarehouses.length > 0) {
      const created = await doCreateVariant({
        product_id: product.id,
        variant_sku: `${product.sku}-01`,
        size: undefined,
        color: undefined,
      }) as { id: string } | null
      if (!created?.id) return
      variantId = created.id
    }
    if (!variantId || !adjustForm.warehouseId || !adjustForm.reason?.trim()) return
    const qty = isFabric ? Math.round(Number(adjustForm.quantity) || 0) : (Number(adjustForm.quantity) || 0)
    if (qty <= 0) return
    await doAdjust({
      variantId,
      warehouseId: adjustForm.warehouseId,
      quantity: qty,
      reason: adjustForm.reason.trim(),
      movementType: adjustForm.movementType,
    })
  }

  const handleSubtractMetersSubmit = async () => {
    let variantId = subtractMetersForm.variantId
    if (!variantId && variants.length === 0 && allWarehouses.length > 0) {
      const created = await doCreateVariant({
        product_id: product.id,
        variant_sku: `${product.sku}-01`,
        size: undefined,
        color: undefined,
      }) as { id: string } | null
      if (!created?.id) return
      variantId = created.id
    }
    if (!variantId || !subtractMetersForm.warehouseId || subtractMetersForm.quantity <= 0) return
    const qty = Math.round(subtractMetersForm.quantity)
    if (qty <= 0) return
    await doAdjust({
      variantId,
      warehouseId: subtractMetersForm.warehouseId,
      quantity: qty,
      reason: subtractMetersForm.reason.trim() || 'Metros usados (tejido)',
      movementType: 'adjustment_negative',
    })
    const used = (product?.fabric_meters_used != null ? Number(product.fabric_meters_used) : 0) + subtractMetersForm.quantity
    await doUpdateProduct({ id: product.id, data: { fabric_meters_used: used } })
    setShowSubtractMeters(false)
    setSubtractMetersForm({ variantId: '', warehouseId: '', quantity: 0, reason: '' })
    router.refresh()
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-4 min-w-0">
          <Button variant="ghost" size="icon" onClick={() => router.push('/admin/stock')}><ArrowLeft className="h-5 w-5" /></Button>
          <div className="min-w-0">
            <div className="flex items-center gap-3 flex-wrap">
              <h1 className="text-2xl font-bold">{product.name}</h1>
              <Badge variant="outline" className="font-mono">{product.sku}</Badge>
            </div>
            <p className="text-muted-foreground text-sm">
              {product.brand && `${product.brand} · `}{product.collection && `${product.collection} · `}{product.product_type}
            </p>
          </div>
        </div>
        {can('products.edit') && (
          <Button
            onClick={() => setShowEditDialog(true)}
            className="gap-2 bg-red-800 hover:bg-red-900 text-white shrink-0"
          >
            <Pencil className="h-4 w-4" /> Editar producto
          </Button>
        )}
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <Card><CardContent className="pt-4 pb-3"><p className="text-xs text-muted-foreground">PVP</p><p className="text-xl font-bold">{formatCurrency(product.base_price)}</p></CardContent></Card>
        <Card><CardContent className="pt-4 pb-3"><p className="text-xs text-muted-foreground">Coste</p><p className="text-xl font-bold">{formatCurrency(product.cost_price)}</p></CardContent></Card>
        <Card><CardContent className="pt-4 pb-3"><p className="text-xs text-muted-foreground">IVA</p><p className="text-xl font-bold">{product.tax_rate}%</p></CardContent></Card>
        <Card><CardContent className="pt-4 pb-3">
          <p className="text-xs text-muted-foreground">{isFabric ? 'Metros disponibles' : 'Stock total'}</p>
          <p className={`text-xl font-bold ${totalStock <= 0 ? 'text-red-600' : ''}`}>{isFabric ? `${Number(totalStock).toFixed(1)} m` : totalStock}</p>
        </CardContent></Card>
        <Card><CardContent className="pt-4 pb-3"><p className="text-xs text-muted-foreground">Variantes</p><p className="text-xl font-bold">{variants.length}</p></CardContent></Card>
      </div>

      {isFabric && (
        <Card>
          <CardHeader><CardTitle className="text-base">Datos del tejido</CardTitle></CardHeader>
          <CardContent>
            <div className="grid gap-4 sm:grid-cols-3">
              <div>
                <p className="text-xs text-muted-foreground">Metros disponibles</p>
                <p className={`text-lg font-semibold ${totalStock <= 0 ? 'text-red-600' : ''}`}>{Number(totalStock).toFixed(1)} m</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Color</p>
                <p className="text-lg font-semibold">{product.color || (variants[0] as any)?.color || '-'}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Metros gastados</p>
                <p className="text-lg font-semibold">{(product.fabric_meters_used != null ? Number(product.fabric_meters_used) : 0).toFixed(1)} m</p>
                <p className="text-xs text-muted-foreground">Editable en «Editar producto»</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-4">
              <CardTitle className="text-base">Variantes y stock por almacén</CardTitle>
              {allWarehouses.length > 0 && (
                <div className="flex items-center gap-2">
                  <span className="text-sm text-muted-foreground whitespace-nowrap">Ver almacén:</span>
                  <Select value={selectedWarehouseId ?? 'all'} onValueChange={(v) => setSelectedWarehouseId(v === 'all' ? null : v)}>
                    <SelectTrigger className="w-[220px]">
                      <SelectValue placeholder="Todos" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todos</SelectItem>
                      {allWarehouses.map((w) => (
                        <SelectItem key={w.id} value={w.id}>{w.storeName ? `${w.name} — ${w.storeName}` : w.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>
            <div className="flex gap-2 flex-wrap">
              {can('stock.edit') && (
                <>
                  <Button size="sm" variant="outline" className="gap-1" onClick={() => setShowAdjust(true)}><ArrowUp className="h-3 w-3" /> Ajustar stock</Button>
                  {isFabric && (
                    <Button size="sm" variant="outline" className="gap-1" onClick={() => setShowSubtractMeters(true)} title="Descontar metros usados y actualizar metros gastados">
                      Descontar metros usados
                    </Button>
                  )}
                  <Button size="sm" variant="outline" className="gap-1" onClick={() => setShowTransfer(true)}><ArrowLeftRight className="h-3 w-3" /> Traspaso</Button>
                </>
              )}
              {can('products.create') && <Button size="sm" className="gap-1 bg-prats-navy hover:bg-prats-navy-light" onClick={() => setShowNewVariant(true)}><Plus className="h-3 w-3" /> Nueva variante</Button>}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="rounded-lg border overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>SKU variante</TableHead><TableHead>Talla</TableHead><TableHead>Color</TableHead>
                  <TableHead>Código barras</TableHead><TableHead>Precio</TableHead>
                  {warehousesToShow.map(w => <TableHead key={w.id} className="text-center">{w.storeName ? `${w.name} (${w.storeName})` : w.name}</TableHead>)}
                  <TableHead className="text-center">Total</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {variants.map((v: any) => {
                  const variantTotal = v.stock_levels?.reduce((s: number, sl: any) => s + (sl.quantity || 0), 0) || 0
                  return (
                    <TableRow key={v.id} className={!v.is_active ? 'opacity-50' : ''}>
                      <TableCell className="font-mono text-sm">{v.variant_sku}</TableCell>
                      <TableCell>{v.size || '-'}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          {v.color_hex && <div className="h-3 w-3 rounded-full border" style={{ backgroundColor: v.color_hex }} />}
                          {v.color || '-'}
                        </div>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">{v.barcode || '-'}</TableCell>
                      <TableCell>{v.price_override ? formatCurrency(v.price_override) : <span className="text-muted-foreground text-xs">base</span>}</TableCell>
                      {warehousesToShow.map(w => {
                        const sl = v.stock_levels?.find((s: any) => s.warehouse_id === w.id)
                        const qty = sl?.quantity || 0
                        return (
                          <TableCell key={w.id} className="text-center">
                            <span className={`font-medium ${qty <= 0 ? 'text-red-600' : qty <= 2 ? 'text-amber-600' : ''}`}>{qty}</span>
                            {sl?.reserved > 0 && <span className="text-xs text-muted-foreground ml-1">({sl.reserved} res.)</span>}
                          </TableCell>
                        )
                      })}
                      <TableCell className="text-center font-bold">{variantTotal}</TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader><CardTitle className="text-base">Detalles</CardTitle></CardHeader>
          <CardContent className="text-sm space-y-2">
            {isFabric && (
              <>
                <p><span className="text-muted-foreground">Metros disponibles:</span> <span className="font-semibold">{Number(totalStock).toFixed(1)} m</span></p>
                <p><span className="text-muted-foreground">Color:</span> <span className="font-semibold">{product.color || (variants[0] as any)?.color || '-'}</span></p>
                <p><span className="text-muted-foreground">Metros gastados:</span> <span className="font-semibold">{(product.fabric_meters_used != null ? Number(product.fabric_meters_used) : 0).toFixed(1)} m</span></p>
              </>
            )}
            {product.description && <p>{product.description}</p>}
            <p><span className="text-muted-foreground">Proveedor:</span> {product.suppliers?.name || '-'}</p>
            <p><span className="text-muted-foreground">Ref. proveedor:</span> {product.supplier_reference || '-'}</p>
            <p><span className="text-muted-foreground">Categoría:</span> {product.product_categories?.name || '-'}</p>
            {!isFabric && <p><span className="text-muted-foreground">Color:</span> {product.color || (variants[0] as any)?.color || '-'}</p>}
            <p><span className="text-muted-foreground">Material:</span> {product.material || '-'}</p>
            <p><span className="text-muted-foreground">Web:</span> {product.is_visible_web ? 'Visible' : 'No visible'}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-base">Márgenes</CardTitle></CardHeader>
          <CardContent className="text-sm space-y-2">
            {product.cost_price > 0 ? (
              <>
                <p><span className="text-muted-foreground">Margen bruto:</span> <span className="font-medium">{formatCurrency(product.base_price - product.cost_price)}</span></p>
                <p><span className="text-muted-foreground">% Margen:</span> <span className="font-medium">{((product.base_price - product.cost_price) / product.base_price * 100).toFixed(1)}%</span></p>
                <p><span className="text-muted-foreground">Multiplicador:</span> <span className="font-medium">&times;{(product.base_price / product.cost_price).toFixed(2)}</span></p>
              </>
            ) : (
              <p className="text-muted-foreground">Sin coste definido</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Adjust stock dialog */}
      <Dialog open={showAdjust} onOpenChange={setShowAdjust}>
        <DialogContent>
          <DialogHeader><DialogTitle>Ajustar stock</DialogTitle></DialogHeader>
          {variants.length === 0 && allWarehouses.length > 0 && (
            <p className="text-sm text-muted-foreground bg-muted/50 rounded-md p-3">
              No hay variantes. Se creará automáticamente una variante única ({product.sku}-01) y se aplicará el ajuste en el almacén elegido.
            </p>
          )}
          <div className="space-y-4 py-4">
            {variants.length > 0 && (
              <div className="space-y-2"><Label>Variante</Label>
                <Select value={adjustForm.variantId} onValueChange={(v) => setAdjustForm(p => ({ ...p, variantId: v }))}>
                  <SelectTrigger><SelectValue placeholder="Seleccionar" /></SelectTrigger>
                  <SelectContent>{variants.map((v: any) => <SelectItem key={v.id} value={v.id}>{v.variant_sku} — T.{v.size || '-'} {v.color || ''}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            )}
            <div className="space-y-2"><Label>Almacén</Label>
              <Select value={adjustForm.warehouseId} onValueChange={(v) => setAdjustForm(p => ({ ...p, warehouseId: v }))}>
                <SelectTrigger><SelectValue placeholder="Seleccionar" /></SelectTrigger>
                <SelectContent>{allWarehouses.map(w => <SelectItem key={w.id} value={w.id}>{w.storeName ? `${w.name} — ${w.storeName}` : w.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2"><Label>Tipo</Label>
                <Select value={adjustForm.movementType} onValueChange={(v: any) => setAdjustForm(p => ({ ...p, movementType: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="adjustment_positive">Ajuste positivo (+)</SelectItem>
                    <SelectItem value="adjustment_negative">Ajuste negativo (-)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2"><Label>{isFabric ? 'Metros / Cantidad' : 'Cantidad'}</Label>
                <Input type="number" min={1} step={isFabric ? 0.01 : 1} value={adjustForm.quantity || ''} onChange={(e) => setAdjustForm(p => ({ ...p, quantity: isFabric ? parseFloat(e.target.value) || 0 : (parseInt(e.target.value) || 0) }))} />
              </div>
            </div>
            <div className="space-y-2"><Label>Motivo *</Label>
              <Textarea value={adjustForm.reason} onChange={(e) => setAdjustForm(p => ({ ...p, reason: e.target.value }))} placeholder="Motivo del ajuste..." rows={2} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAdjust(false)}>Cancelar</Button>
            <Button
              onClick={() => handleAdjustStock()}
              disabled={isAdjusting || isCreatingVariant || !adjustForm.warehouseId || !adjustForm.reason?.trim() || (adjustForm.quantity ?? 0) <= 0 || (variants.length > 0 && !adjustForm.variantId)}
              className="bg-prats-navy hover:bg-prats-navy-light"
            >
              {(isAdjusting || isCreatingVariant) && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Ajustar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Descontar metros usados (solo tejidos) */}
      {isFabric && (
        <Dialog open={showSubtractMeters} onOpenChange={setShowSubtractMeters}>
          <DialogContent>
            <DialogHeader><DialogTitle>Descontar metros usados</DialogTitle></DialogHeader>
            <p className="text-sm text-muted-foreground">Se reducirá el stock en la variante/almacén elegido y se sumará la cantidad a «Metros gastados» del producto.</p>
            {variants.length === 0 && allWarehouses.length > 0 && (
              <p className="text-sm text-muted-foreground bg-muted/50 rounded-md p-3">
                No hay variantes. Se creará automáticamente una variante única ({product.sku}-01) y se descontarán los metros en el almacén elegido.
              </p>
            )}
            <div className="space-y-4 py-4">
              {variants.length > 0 && (
                <div className="space-y-2">
                  <Label>Variante</Label>
                  <Select value={subtractMetersForm.variantId} onValueChange={(v) => setSubtractMetersForm((f) => ({ ...f, variantId: v }))}>
                    <SelectTrigger><SelectValue placeholder="Seleccionar" /></SelectTrigger>
                    <SelectContent>
                      {variants.map((v: any) => (
                        <SelectItem key={v.id} value={v.id}>{v.variant_sku} — T.{v.size || '-'} {v.color || ''}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              <div className="space-y-2">
                <Label>Almacén</Label>
                <Select value={subtractMetersForm.warehouseId} onValueChange={(v) => setSubtractMetersForm((f) => ({ ...f, warehouseId: v }))}>
                  <SelectTrigger><SelectValue placeholder="Seleccionar" /></SelectTrigger>
                  <SelectContent>
                    {allWarehouses.map((w) => (
                      <SelectItem key={w.id} value={w.id}>{w.storeName ? `${w.name} — ${w.storeName}` : w.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Metros a descontar</Label>
                <Input
                  type="number"
                  min={0.01}
                  step={0.01}
                  value={subtractMetersForm.quantity || ''}
                  onChange={(e) => setSubtractMetersForm((f) => ({ ...f, quantity: parseFloat(e.target.value) || 0 }))}
                  placeholder="Ej. 2,5"
                />
              </div>
              <div className="space-y-2">
                <Label>Motivo (opcional)</Label>
                <Input
                  value={subtractMetersForm.reason}
                  onChange={(e) => setSubtractMetersForm((f) => ({ ...f, reason: e.target.value }))}
                  placeholder="Ej. Chaleco cliente X"
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowSubtractMeters(false)}>Cancelar</Button>
              <Button
                onClick={() => handleSubtractMetersSubmit()}
                disabled={isAdjusting || isUpdatingProduct || isCreatingVariant || !subtractMetersForm.warehouseId || subtractMetersForm.quantity <= 0}
                className="bg-prats-navy hover:bg-prats-navy-light"
              >
                {(isAdjusting || isUpdatingProduct || isCreatingVariant) && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Descontar metros
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* Edit product dialog */}
      <Dialog open={showEditDialog} onOpenChange={setShowEditDialog}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Editar producto</DialogTitle></DialogHeader>
          <ProductForm
            categories={categories}
            suppliers={suppliers}
            initialProduct={product}
            onSuccess={() => {
              setShowEditDialog(false)
              router.refresh()
            }}
            onCancel={() => setShowEditDialog(false)}
          />
        </DialogContent>
      </Dialog>

      {/* Traspaso entre almacenes */}
      <Dialog open={showTransfer} onOpenChange={setShowTransfer}>
        <DialogContent>
          <DialogHeader><DialogTitle>Traspaso entre almacenes</DialogTitle></DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2"><Label>Variante</Label>
              <Select value={transferForm.variantId} onValueChange={(v) => setTransferForm(p => ({ ...p, variantId: v }))}>
                <SelectTrigger><SelectValue placeholder="Seleccionar" /></SelectTrigger>
                <SelectContent>
                  {variants.map((v: any) => (
                    <SelectItem key={v.id} value={v.id}>{v.variant_sku} — T.{v.size || '-'} {v.color || ''}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2"><Label>Desde almacén</Label>
              <Select value={transferForm.fromWarehouseId} onValueChange={(v) => setTransferForm(p => ({ ...p, fromWarehouseId: v }))}>
                <SelectTrigger><SelectValue placeholder="Seleccionar" /></SelectTrigger>
                <SelectContent>
                  {allWarehouses.map(w => (
                    <SelectItem key={w.id} value={w.id}>{w.storeName ? `${w.name} (${w.storeName})` : w.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2"><Label>A almacén</Label>
              <Select value={transferForm.toWarehouseId} onValueChange={(v) => setTransferForm(p => ({ ...p, toWarehouseId: v }))}>
                <SelectTrigger><SelectValue placeholder="Seleccionar" /></SelectTrigger>
                <SelectContent>
                  {allWarehouses.filter(w => w.id !== transferForm.fromWarehouseId).map(w => (
                    <SelectItem key={w.id} value={w.id}>{w.storeName ? `${w.name} (${w.storeName})` : w.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2"><Label>Cantidad</Label>
              <Input type="number" min={1} value={transferForm.quantity || ''} onChange={(e) => setTransferForm(p => ({ ...p, quantity: parseInt(e.target.value) || 0 }))} />
            </div>
            <div className="space-y-2"><Label>Motivo (opcional)</Label>
              <Input value={transferForm.reason} onChange={(e) => setTransferForm(p => ({ ...p, reason: e.target.value }))} placeholder="Traspaso entre almacenes" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowTransfer(false)}>Cancelar</Button>
            <Button onClick={() => doMoveStock(transferForm)} disabled={isMovingStock || !transferForm.variantId || !transferForm.fromWarehouseId || !transferForm.toWarehouseId || transferForm.quantity < 1} className="bg-prats-navy hover:bg-prats-navy-light">
              {isMovingStock ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null} Mover
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* New variant dialog */}
      <Dialog open={showNewVariant} onOpenChange={setShowNewVariant}>
        <DialogContent>
          <DialogHeader><DialogTitle>Nueva variante</DialogTitle></DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2"><Label>SKU variante *</Label>
              <Input value={variantForm.variant_sku} onChange={(e) => setVariantForm(p => ({ ...p, variant_sku: e.target.value }))} placeholder={`${product.sku}-01`} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2"><Label>Talla</Label><Input value={variantForm.size} onChange={(e) => setVariantForm(p => ({ ...p, size: e.target.value }))} placeholder="48, 50, M, L..." /></div>
              <div className="space-y-2"><Label>Color</Label><Input value={variantForm.color} onChange={(e) => setVariantForm(p => ({ ...p, color: e.target.value }))} placeholder="Azul marino" /></div>
            </div>
            <div className="space-y-2"><Label>Código de barras</Label><Input value={variantForm.barcode} onChange={(e) => setVariantForm(p => ({ ...p, barcode: e.target.value }))} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowNewVariant(false)}>Cancelar</Button>
            <Button onClick={() => doCreateVariant({ ...variantForm, product_id: product.id })} disabled={isCreatingVariant || !variantForm.variant_sku}
              className="bg-prats-navy hover:bg-prats-navy-light">
              {isCreatingVariant ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null} Crear variante
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
