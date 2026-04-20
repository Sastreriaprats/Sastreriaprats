'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Loader2, Search, User, X, Bookmark, AlertCircle, ImageOff, Check, Banknote, CreditCard, Smartphone, ArrowRightLeft } from 'lucide-react'
import { toast } from 'sonner'
import { createReservation, getMainWarehouseForStore } from '@/actions/reservations'
import { listClients } from '@/actions/clients'
import { searchProductsForPos } from '@/actions/pos'
import { listPhysicalWarehouses } from '@/actions/products'
import type { ReservationPaymentMethod } from '@/lib/validations/reservations'
import { formatCurrency } from '@/lib/utils'

type ProductVariantResult = {
  id: string
  variant_sku?: string | null
  size?: string | null
  color?: string | null
  barcode?: string | null
  price_override?: number | string | null
  products?: {
    id?: string
    name?: string
    sku?: string
    main_image_url?: string | null
    brand?: string
    base_price?: number | string | null
    price_with_tax?: number | string | null
    tax_rate?: number | string | null
  }
  stock_levels?: Array<{ quantity?: number; available?: number; warehouse_id?: string }>
}

export type ReservationSuccessPayload = {
  id: string
  reservation_number: string
  status: 'active' | 'pending_stock' | 'fulfilled' | 'cancelled' | 'expired' | string
  had_stock: boolean
  unit_price: number
  total: number
  total_paid: number
  payment_status: 'pending' | 'partial' | 'paid'
  quantity: number
  expires_at: string | null
  reason: string | null
  notes: string | null
  client: { id: string; name: string; code: string | null } | null
  product: {
    variant_id: string
    product_name: string
    sku: string | null
    size: string | null
    color: string | null
  }
  initial_payment: { method: ReservationPaymentMethod; amount: number } | null
}

type ClientResult = {
  id: string
  client_code?: string | null
  full_name?: string | null
  first_name?: string | null
  last_name?: string | null
  phone?: string | null
}

type WarehouseOption = { id: string; name: string; code: string; storeName?: string }

export interface ReservationFormDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Cuando viene desde el POS se fija al almacén principal de esta tienda. */
  storeId?: string | null
  /** Sesión de caja abierta (para registrar pagos). */
  cashSessionId?: string | null
  /** Precargar cliente (asignado en el POS). */
  defaultClientId?: string | null
  defaultClientName?: string | null
  /** Si `lockClient=true` no se permite cambiar el cliente desde el formulario. */
  lockClient?: boolean
  /** Permite al admin elegir almacén explícitamente. */
  allowWarehouseSelection?: boolean
  onSuccess?: (result: ReservationSuccessPayload) => void
}

const PAYMENT_METHODS: Array<{ value: ReservationPaymentMethod; label: string; icon: React.ComponentType<{ className?: string }> }> = [
  { value: 'cash',     label: 'Efectivo',       icon: Banknote },
  { value: 'card',     label: 'Tarjeta',        icon: CreditCard },
  { value: 'bizum',    label: 'Bizum',          icon: Smartphone },
  { value: 'transfer', label: 'Transferencia',  icon: ArrowRightLeft },
]

export function ReservationFormDialog({
  open,
  onOpenChange,
  storeId,
  cashSessionId,
  defaultClientId,
  defaultClientName,
  lockClient,
  allowWarehouseSelection,
  onSuccess,
}: ReservationFormDialogProps) {
  const [warehouseId, setWarehouseId] = useState<string | null>(null)
  const [warehouseOptions, setWarehouseOptions] = useState<WarehouseOption[]>([])
  const [warehouseLoading, setWarehouseLoading] = useState(false)

  const [productQuery, setProductQuery] = useState('')
  const [productResults, setProductResults] = useState<ProductVariantResult[]>([])
  const [productSearching, setProductSearching] = useState(false)
  const [selectedVariant, setSelectedVariant] = useState<ProductVariantResult | null>(null)

  const [clientId, setClientId] = useState<string | null>(defaultClientId ?? null)
  const [clientName, setClientName] = useState<string>(defaultClientName ?? '')
  const [clientQuery, setClientQuery] = useState('')
  const [clientResults, setClientResults] = useState<ClientResult[]>([])
  const [clientSearching, setClientSearching] = useState(false)

  const [quantity, setQuantity] = useState<number>(1)
  const [unitPrice, setUnitPrice] = useState<number>(0)
  const [unitPriceInput, setUnitPriceInput] = useState<string>('0')
  const [reason, setReason] = useState('')
  const [notes, setNotes] = useState('')
  const [expiresAt, setExpiresAt] = useState('')
  const [paymentMode, setPaymentMode] = useState<'none' | 'partial' | 'full'>('none')
  const [paymentMethod, setPaymentMethod] = useState<ReservationPaymentMethod>('cash')
  const [partialAmount, setPartialAmount] = useState<string>('')
  const [submitting, setSubmitting] = useState(false)

  const resetForm = useCallback(() => {
    setProductQuery('')
    setProductResults([])
    setSelectedVariant(null)
    setClientQuery('')
    setClientResults([])
    if (!lockClient) {
      setClientId(defaultClientId ?? null)
      setClientName(defaultClientName ?? '')
    }
    setQuantity(1)
    setUnitPrice(0)
    setUnitPriceInput('0')
    setReason('')
    setNotes('')
    setExpiresAt('')
    setPaymentMode('none')
    setPaymentMethod('cash')
    setPartialAmount('')
  }, [defaultClientId, defaultClientName, lockClient])

  useEffect(() => {
    if (!open) return
    setClientId(defaultClientId ?? null)
    setClientName(defaultClientName ?? '')
  }, [open, defaultClientId, defaultClientName])

  // Resolver warehouseId por storeId (POS) o dejar al admin elegir.
  useEffect(() => {
    if (!open) return
    if (allowWarehouseSelection) {
      let cancelled = false
      setWarehouseLoading(true)
      listPhysicalWarehouses()
        .then((res) => {
          if (cancelled) return
          if (res.success) setWarehouseOptions(res.data || [])
        })
        .finally(() => {
          if (!cancelled) setWarehouseLoading(false)
        })
      return () => { cancelled = true }
    }
    if (storeId) {
      let cancelled = false
      getMainWarehouseForStore({ storeId })
        .then((res) => {
          if (cancelled) return
          if (res.success && res.data?.id) {
            setWarehouseId(res.data.id)
          } else {
            setWarehouseId(null)
          }
        })
      return () => { cancelled = true }
    }
    setWarehouseId(null)
  }, [open, storeId, allowWarehouseSelection])

  // Buscar productos
  useEffect(() => {
    if (!open) return
    const q = productQuery.trim()
    if (q.length < 2 || !storeId) {
      setProductResults([])
      return
    }
    let cancelled = false
    setProductSearching(true)
    const timer = setTimeout(() => {
      searchProductsForPos({ query: q, storeId })
        .then((res) => {
          if (cancelled) return
          if (res.success) setProductResults((res.data as ProductVariantResult[]) || [])
        })
        .finally(() => {
          if (!cancelled) setProductSearching(false)
        })
    }, 300)
    return () => { cancelled = true; clearTimeout(timer) }
  }, [productQuery, storeId, open])

  // Buscar clientes (si no está bloqueado)
  useEffect(() => {
    if (!open || lockClient) return
    const q = clientQuery.trim()
    if (q.length < 2) { setClientResults([]); return }
    let cancelled = false
    setClientSearching(true)
    const timer = setTimeout(() => {
      listClients({ search: q, pageSize: 15 })
        .then((res) => {
          if (cancelled) return
          if (res.success) setClientResults(((res.data as any)?.items ?? []) as ClientResult[])
        })
        .finally(() => {
          if (!cancelled) setClientSearching(false)
        })
    }, 300)
    return () => { cancelled = true; clearTimeout(timer) }
  }, [clientQuery, open, lockClient])

  const variantAvailable = useMemo(() => {
    if (!selectedVariant?.stock_levels) return 0
    const row = Array.isArray(selectedVariant.stock_levels)
      ? selectedVariant.stock_levels[0]
      : null
    if (!row) return 0
    if (typeof row.available === 'number') return row.available
    return Number(row.quantity ?? 0)
  }, [selectedVariant])

  // Prellenar precio al seleccionar variante (PVP con IVA)
  useEffect(() => {
    if (!selectedVariant) return
    const override = Number(selectedVariant.price_override ?? 0)
    const withTax = Number(selectedVariant.products?.price_with_tax ?? 0)
    const base = Number(selectedVariant.products?.base_price ?? 0)
    const taxRate = Number(selectedVariant.products?.tax_rate ?? 21)
    const price = override > 0
      ? override
      : withTax > 0
        ? withTax
        : base > 0
          ? Math.round(base * (1 + taxRate / 100) * 100) / 100
          : 0
    setUnitPrice(price)
    setUnitPriceInput(price ? price.toFixed(2) : '0')
  }, [selectedVariant])

  const totalAmount = useMemo(() => {
    return Math.round(unitPrice * quantity * 100) / 100
  }, [unitPrice, quantity])

  const paymentAmount = useMemo(() => {
    if (paymentMode === 'none') return 0
    if (paymentMode === 'full') return totalAmount
    const n = Number(partialAmount.replace(',', '.'))
    return Number.isFinite(n) && n > 0 ? Math.min(n, totalAmount) : 0
  }, [paymentMode, partialAmount, totalAmount])

  const canSubmit = Boolean(
    clientId && selectedVariant && warehouseId && quantity > 0 && !submitting,
  )

  const handleSubmit = async () => {
    if (!clientId) { toast.error('Selecciona un cliente'); return }
    if (!selectedVariant) { toast.error('Selecciona un producto'); return }
    if (!warehouseId) { toast.error('No se pudo determinar el almacén'); return }
    if (quantity <= 0) { toast.error('La cantidad debe ser mayor que 0'); return }
    if (unitPrice < 0) { toast.error('El precio no puede ser negativo'); return }

    if (paymentMode !== 'none' && totalAmount <= 0) {
      toast.error('No puedes registrar un pago sobre una reserva sin precio')
      return
    }
    if (paymentMode === 'partial' && paymentAmount <= 0) {
      toast.error('Introduce el importe del pago parcial')
      return
    }

    const initial_payment = paymentMode === 'none' || paymentAmount <= 0
      ? null
      : { method: paymentMethod, amount: paymentAmount }

    setSubmitting(true)
    const result = await createReservation({
      client_id: clientId,
      product_variant_id: selectedVariant.id,
      warehouse_id: warehouseId,
      store_id: storeId ?? null,
      cash_session_id: cashSessionId ?? null,
      quantity,
      unit_price: unitPrice,
      notes: notes || null,
      reason: reason || null,
      expires_at: expiresAt ? new Date(expiresAt).toISOString() : null,
      initial_payment,
    })
    setSubmitting(false)

    if (!result.success) {
      toast.error(result.error || 'No se pudo crear la reserva')
      return
    }

    const data = result.data
    if (data.status === 'active') {
      toast.success(`Reserva ${data.reservation_number} creada (stock bloqueado)`)
    } else {
      toast.warning(`Reserva ${data.reservation_number} pendiente de stock — avisaremos al recibir mercancía`)
    }

    const successPayload: ReservationSuccessPayload = {
      id: data.id,
      reservation_number: data.reservation_number,
      status: data.status,
      had_stock: data.had_stock,
      unit_price: data.unit_price,
      total: data.total,
      total_paid: data.total_paid,
      payment_status: data.payment_status,
      quantity,
      expires_at: expiresAt ? new Date(expiresAt).toISOString() : null,
      reason: reason || null,
      notes: notes || null,
      client: clientId
        ? { id: clientId, name: clientName, code: null }
        : null,
      product: {
        variant_id: selectedVariant.id,
        product_name: selectedVariant.products?.name || '—',
        sku: selectedVariant.variant_sku || selectedVariant.products?.sku || null,
        size: selectedVariant.size || null,
        color: selectedVariant.color || null,
      },
      initial_payment,
    }
    onSuccess?.(successPayload)
    resetForm()
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { onOpenChange(v); if (!v) resetForm() }}>
      <DialogContent className="max-w-2xl w-[calc(100vw-2rem)] max-h-[90vh] overflow-y-auto overflow-x-hidden">
        <DialogHeader className="min-w-0">
          <DialogTitle className="flex items-center gap-2">
            <Bookmark className="h-5 w-5 text-purple-600" /> Nueva reserva
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 min-w-0">
          {/* Cliente */}
          <div className="space-y-1">
            <Label className="flex items-center gap-1"><User className="h-3.5 w-3.5" /> Cliente</Label>
            {clientId && clientName ? (
              <div className="flex items-center justify-between gap-2 rounded-md border px-3 py-2 text-sm">
                <span className="font-medium truncate min-w-0">{clientName}</span>
                {!lockClient && (
                  <Button variant="ghost" size="sm" className="gap-1 shrink-0" onClick={() => { setClientId(null); setClientName('') }}>
                    <X className="h-3 w-3" /> Cambiar
                  </Button>
                )}
              </div>
            ) : (
              <div className="space-y-2">
                <div className="relative">
                  <Search className="absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    className="pl-8"
                    placeholder="Buscar cliente por nombre, teléfono o código..."
                    value={clientQuery}
                    onChange={(e) => setClientQuery(e.target.value)}
                  />
                  {clientSearching && (
                    <Loader2 className="absolute right-2 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-muted-foreground" />
                  )}
                </div>
                {clientResults.length > 0 && (
                  <div className="rounded-md border max-h-40 overflow-y-auto">
                    {clientResults.map((c) => {
                      const name = c.full_name || [c.first_name, c.last_name].filter(Boolean).join(' ') || 'Sin nombre'
                      return (
                        <button
                          key={c.id}
                          type="button"
                          className="w-full flex items-center justify-between px-3 py-2 text-sm hover:bg-slate-50 border-b last:border-b-0"
                          onClick={() => { setClientId(c.id); setClientName(name); setClientQuery(''); setClientResults([]) }}
                        >
                          <span>{name}</span>
                          <span className="text-xs text-muted-foreground font-mono">{c.client_code || c.phone || ''}</span>
                        </button>
                      )
                    })}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Almacén (solo admin) */}
          {allowWarehouseSelection && (
            <div className="space-y-1">
              <Label>Almacén</Label>
              <Select value={warehouseId || ''} onValueChange={(v) => setWarehouseId(v || null)}>
                <SelectTrigger>
                  <SelectValue placeholder={warehouseLoading ? 'Cargando...' : 'Selecciona almacén'} />
                </SelectTrigger>
                <SelectContent>
                  {warehouseOptions.map((w) => (
                    <SelectItem key={w.id} value={w.id}>
                      {w.name} {w.storeName ? `(${w.storeName})` : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Producto */}
          <div className="space-y-1">
            <Label>Producto</Label>
            {selectedVariant ? (
              <div className="flex items-start justify-between rounded-md border px-3 py-2 text-sm gap-3">
                {selectedVariant.products?.main_image_url ? (
                  <img src={selectedVariant.products.main_image_url} alt="" className="w-12 h-12 rounded object-cover bg-slate-100" />
                ) : (
                  <div className="w-12 h-12 rounded bg-slate-100 flex items-center justify-center">
                    <ImageOff className="h-4 w-4 text-slate-300" />
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <div className="font-medium truncate">{selectedVariant.products?.name || '—'}</div>
                  <div className="text-xs text-muted-foreground font-mono truncate">
                    {selectedVariant.products?.sku || ''} {selectedVariant.variant_sku ? `· ${selectedVariant.variant_sku}` : ''}
                  </div>
                  <div className="text-xs mt-0.5 flex gap-1 flex-wrap">
                    {selectedVariant.size && <Badge variant="secondary" className="text-[10px]">T.{selectedVariant.size}</Badge>}
                    {selectedVariant.color && <Badge variant="secondary" className="text-[10px]">{selectedVariant.color}</Badge>}
                    <span className={`text-xs tabular-nums ${variantAvailable > 0 ? 'text-green-600' : 'text-amber-600'}`}>
                      {variantAvailable > 0 ? `${variantAvailable} disponibles` : 'Sin stock disponible'}
                    </span>
                  </div>
                </div>
                <Button variant="ghost" size="sm" className="shrink-0" onClick={() => setSelectedVariant(null)}>
                  <X className="h-3 w-3" />
                </Button>
              </div>
            ) : (
              <div className="space-y-2">
                <div className="relative">
                  <Search className="absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    className="pl-8"
                    placeholder="Buscar por nombre, referencia, SKU o EAN..."
                    value={productQuery}
                    onChange={(e) => setProductQuery(e.target.value)}
                    disabled={!storeId}
                  />
                  {productSearching && (
                    <Loader2 className="absolute right-2 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-muted-foreground" />
                  )}
                </div>
                {!storeId && (
                  <p className="text-xs text-amber-700 flex items-center gap-1">
                    <AlertCircle className="h-3 w-3" /> Necesitas una tienda activa para buscar productos.
                  </p>
                )}
                {productResults.length > 0 && (
                  <div className="rounded-md border max-h-56 overflow-y-auto">
                    {productResults.map((v) => {
                      const available = Array.isArray(v.stock_levels)
                        ? (v.stock_levels[0]?.available ?? v.stock_levels[0]?.quantity ?? 0)
                        : 0
                      return (
                        <button
                          key={v.id}
                          type="button"
                          className="w-full flex items-center gap-3 px-3 py-2 text-sm hover:bg-slate-50 border-b last:border-b-0 text-left"
                          onClick={() => { setSelectedVariant(v); setProductQuery(''); setProductResults([]) }}
                        >
                          {v.products?.main_image_url ? (
                            <img src={v.products.main_image_url} alt="" className="w-10 h-10 rounded object-cover bg-slate-100 shrink-0" />
                          ) : (
                            <div className="w-10 h-10 rounded bg-slate-100 flex items-center justify-center shrink-0">
                              <ImageOff className="h-4 w-4 text-slate-300" />
                            </div>
                          )}
                          <div className="flex-1 min-w-0">
                            <div className="truncate font-medium">{v.products?.name || '—'}</div>
                            <div className="text-xs text-muted-foreground font-mono truncate">
                              {v.products?.sku || ''} {v.variant_sku ? `· ${v.variant_sku}` : ''}
                            </div>
                          </div>
                          <div className="flex items-center gap-1 shrink-0">
                            {v.size && <Badge variant="secondary" className="text-[10px]">T.{v.size}</Badge>}
                            {v.color && <Badge variant="secondary" className="text-[10px]">{v.color}</Badge>}
                          </div>
                          <div className={`text-xs tabular-nums shrink-0 ${available > 0 ? 'text-green-600' : 'text-amber-600'}`}>
                            {available > 0 ? `${available} uds` : 'Pendiente'}
                          </div>
                        </button>
                      )
                    })}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Cantidad + Precio */}
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1">
              <Label>Cantidad</Label>
              <Input
                type="number"
                min={1}
                value={quantity}
                onChange={(e) => {
                  const n = Number(e.target.value)
                  setQuantity(Math.max(1, Number.isFinite(n) ? Math.trunc(n) : 1))
                }}
              />
              {selectedVariant && variantAvailable < quantity && (
                <p className="text-xs text-amber-700 flex items-center gap-1">
                  <AlertCircle className="h-3 w-3" />
                  Solo {variantAvailable} disponibles — reserva pendiente.
                </p>
              )}
            </div>
            <div className="space-y-1">
              <Label>PVP unitario (IVA incl.)</Label>
              <Input
                type="number"
                step="0.01"
                min={0}
                value={unitPriceInput}
                onChange={(e) => {
                  setUnitPriceInput(e.target.value)
                  const n = Number(e.target.value.replace(',', '.'))
                  setUnitPrice(Number.isFinite(n) && n >= 0 ? n : 0)
                }}
              />
            </div>
            <div className="space-y-1">
              <Label>Fecha límite</Label>
              <Input
                type="date"
                value={expiresAt}
                onChange={(e) => setExpiresAt(e.target.value)}
              />
            </div>
          </div>

          {/* Total */}
          <div className="flex items-center justify-between rounded-md border bg-slate-50 px-3 py-2">
            <span className="text-sm font-medium">Total reserva</span>
            <span className="text-base font-bold tabular-nums">{formatCurrency(totalAmount)}</span>
          </div>

          {/* Pago */}
          <div className="space-y-2 rounded-md border px-3 py-3">
            <Label>Pago al crear la reserva</Label>
            <div className="grid grid-cols-3 gap-2">
              {([
                { v: 'none',    label: 'Sin pago' },
                { v: 'partial', label: 'Parcial' },
                { v: 'full',    label: 'Completo' },
              ] as const).map((opt) => (
                <button
                  key={opt.v}
                  type="button"
                  onClick={() => setPaymentMode(opt.v)}
                  className={`rounded-md border px-3 py-2 text-sm font-medium transition-colors ${
                    paymentMode === opt.v
                      ? 'border-purple-600 bg-purple-50 text-purple-800'
                      : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                  }`}
                  disabled={totalAmount <= 0 && opt.v !== 'none'}
                >
                  {opt.label}
                </button>
              ))}
            </div>

            {paymentMode !== 'none' && (
              <div className="space-y-2 pt-2">
                <div className="space-y-1">
                  <Label className="text-xs">Método de pago</Label>
                  <div className="grid grid-cols-4 gap-2">
                    {PAYMENT_METHODS.map((m) => {
                      const Icon = m.icon
                      return (
                        <button
                          key={m.value}
                          type="button"
                          onClick={() => setPaymentMethod(m.value)}
                          className={`flex flex-col items-center justify-center gap-1 rounded-md border px-2 py-2 text-xs transition-colors ${
                            paymentMethod === m.value
                              ? 'border-purple-600 bg-purple-50 text-purple-800'
                              : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                          }`}
                        >
                          <Icon className="h-4 w-4" />
                          {m.label}
                        </button>
                      )
                    })}
                  </div>
                </div>

                {paymentMode === 'partial' ? (
                  <div className="space-y-1">
                    <Label className="text-xs">Importe entregado</Label>
                    <Input
                      type="number"
                      step="0.01"
                      min={0}
                      max={totalAmount}
                      value={partialAmount}
                      placeholder={`Máximo ${formatCurrency(totalAmount)}`}
                      onChange={(e) => setPartialAmount(e.target.value)}
                    />
                  </div>
                ) : (
                  <div className="rounded-md bg-slate-50 px-3 py-2 text-xs text-slate-600">
                    Se registrará un pago de <span className="font-semibold">{formatCurrency(totalAmount)}</span> por {PAYMENT_METHODS.find((m) => m.value === paymentMethod)?.label.toLowerCase()}.
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Motivo */}
          <div className="space-y-1">
            <Label>Motivo (opcional)</Label>
            <Input
              placeholder="Ej. Pasa la semana que viene, arreglo, encargo..."
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              maxLength={200}
            />
          </div>

          {/* Notas */}
          <div className="space-y-1">
            <Label>Notas internas (opcional)</Label>
            <Textarea
              rows={2}
              placeholder="Información adicional sobre la reserva"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              maxLength={500}
            />
          </div>
        </div>

        <DialogFooter className="min-w-0 gap-2 sm:gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
            Cancelar
          </Button>
          <Button onClick={handleSubmit} disabled={!canSubmit} className="gap-1">
            {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
            Crear reserva
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
