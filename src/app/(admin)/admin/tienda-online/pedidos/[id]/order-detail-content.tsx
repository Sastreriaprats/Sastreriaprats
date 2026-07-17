'use client'

import { useState, useEffect, useMemo } from 'react'
import { useParams, useRouter, useSearchParams } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import {
  ArrowLeft, MapPin, Loader2, Truck, Pencil, X as XIcon, Ban,
  PackageCheck, Save, RotateCcw, ShoppingBag, History,
} from 'lucide-react'
import { toast } from 'sonner'
import {
  getOnlineOrderDetail,
  updateOnlineOrderStatusAction,
  cancelOnlineOrderLineAction,
  cancelOnlineOrderAction,
  updateOnlineOrderInfoAction,
  type OnlineOrderDetail,
  type OnlineOrderStatus,
  type OnlineOrderLineRow,
} from '@/actions/online-orders'
import { formatCurrency, formatDateTime } from '@/lib/utils'
import { PaymentMethodBadge } from '@/components/ui/payment-method-badge'

const STATUS_LABELS: Record<string, string> = {
  pending_payment: 'Pago pendiente',
  paid: 'Pagado',
  processing: 'En preparación',
  shipped: 'Enviado',
  delivered: 'Entregado',
  cancelled: 'Cancelado',
  refunded: 'Reembolsado',
}

const STATUS_COLORS: Record<string, string> = {
  pending_payment: 'bg-amber-100 text-amber-700 border-amber-200',
  paid: 'bg-green-100 text-green-700 border-green-200',
  processing: 'bg-blue-100 text-blue-700 border-blue-200',
  shipped: 'bg-purple-100 text-purple-700 border-purple-200',
  delivered: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  cancelled: 'bg-red-100 text-red-700 border-red-200',
  refunded: 'bg-gray-100 text-gray-700 border-gray-200',
}

const LINE_STATUS_LABELS: Record<string, string> = {
  active: 'Activa',
  cancelled: 'Cancelada',
  refunded: 'Reembolsada',
}

const LINE_STATUS_COLORS: Record<string, string> = {
  active: 'bg-green-100 text-green-700 border-green-200',
  cancelled: 'bg-red-100 text-red-700 border-red-200',
  refunded: 'bg-gray-100 text-gray-700 border-gray-200',
}

const STATUS_OPTIONS: OnlineOrderStatus[] = [
  'pending_payment', 'paid', 'processing', 'shipped', 'delivered', 'cancelled', 'refunded',
]

type ShippingAddress = {
  first_name?: string
  last_name?: string
  email?: string
  phone?: string
  address?: string
  postal_code?: string
  city?: string
  province?: string
  country?: string
}

export function AdminOrderDetailContent() {
  const params = useParams()
  const router = useRouter()
  const searchParams = useSearchParams()
  const id = params?.id as string
  const [order, setOrder] = useState<OnlineOrderDetail | null>(null)
  const [loading, setLoading] = useState(true)

  const [pendingStatus, setPendingStatus] = useState<OnlineOrderStatus | null>(null)
  const [trackingInput, setTrackingInput] = useState('')
  const [carrierInput, setCarrierInput] = useState('')
  const [updating, setUpdating] = useState(false)

  // Cancelación de línea individual
  const [lineToCancel, setLineToCancel] = useState<OnlineOrderLineRow | null>(null)
  const [lineRestock, setLineRestock] = useState(true)
  const [lineReason, setLineReason] = useState('')
  const [cancellingLine, setCancellingLine] = useState(false)

  // Cancelación de pedido completo
  const [confirmCancelOrder, setConfirmCancelOrder] = useState(false)
  const [orderRestock, setOrderRestock] = useState(true)
  const [orderCancelReason, setOrderCancelReason] = useState('')
  const [cancellingOrder, setCancellingOrder] = useState(false)

  // Modo edición de cabecera (dirección/tracking/notas)
  const initialEdit = searchParams?.get('edit') === '1'
  const [editing, setEditing] = useState<boolean>(initialEdit)
  const [editForm, setEditForm] = useState<{
    address: ShippingAddress
    tracking_number: string
    carrier: string
    notes: string
  }>({
    address: {},
    tracking_number: '',
    carrier: '',
    notes: '',
  })
  const [savingInfo, setSavingInfo] = useState(false)

  const reload = async () => {
    if (!id) return
    const res = await getOnlineOrderDetail(id)
    if (res.success && res.data) {
      setOrder(res.data)
      const addr = parseAddress(res.data.shipping_address)
      setEditForm({
        address: addr ?? {},
        tracking_number: res.data.shipping_tracking_number ?? '',
        carrier: res.data.shipping_carrier ?? '',
        notes: res.data.notes ?? '',
      })
    }
  }

  const confirmStatusChange = async () => {
    if (!order || !pendingStatus) return
    setUpdating(true)
    const res = await updateOnlineOrderStatusAction({
      orderId: order.id,
      status: pendingStatus,
      trackingNumber: pendingStatus === 'shipped' ? trackingInput.trim() || null : null,
      carrier: pendingStatus === 'shipped' ? carrierInput.trim() || null : null,
    })
    setUpdating(false)
    if (!res.success) {
      toast.error('error' in res ? res.error : 'No se pudo cambiar el estado')
      return
    }
    toast.success(`Estado cambiado a "${STATUS_LABELS[pendingStatus] ?? pendingStatus}"`)
    setPendingStatus(null)
    setTrackingInput('')
    setCarrierInput('')
    await reload()
  }

  const confirmLineCancel = async () => {
    if (!lineToCancel) return
    setCancellingLine(true)
    const res = await cancelOnlineOrderLineAction({
      lineId: lineToCancel.id,
      restock: lineRestock,
      reason: lineReason.trim() || null,
    })
    setCancellingLine(false)
    if (!res.success) {
      toast.error('error' in res ? res.error : 'No se pudo cancelar la línea')
      return
    }
    toast.success(
      res.data.restocked
        ? 'Línea cancelada y stock repuesto'
        : 'Línea cancelada'
    )
    setLineToCancel(null)
    setLineReason('')
    setLineRestock(true)
    await reload()
  }

  const confirmOrderCancel = async () => {
    if (!order) return
    setCancellingOrder(true)
    const res = await cancelOnlineOrderAction({
      orderId: order.id,
      restock: orderRestock,
      reason: orderCancelReason.trim() || null,
    })
    setCancellingOrder(false)
    if (!res.success) {
      toast.error('error' in res ? res.error : 'No se pudo cancelar el pedido')
      return
    }
    toast.success(
      res.data.restockedLines > 0
        ? `Pedido cancelado y stock repuesto en ${res.data.restockedLines} línea${res.data.restockedLines === 1 ? '' : 's'}`
        : 'Pedido cancelado'
    )
    setConfirmCancelOrder(false)
    setOrderCancelReason('')
    setOrderRestock(true)
    await reload()
  }

  const saveInfo = async () => {
    if (!order) return
    setSavingInfo(true)
    const res = await updateOnlineOrderInfoAction({
      orderId: order.id,
      shipping_address: editForm.address as Record<string, unknown>,
      tracking_number: editForm.tracking_number,
      carrier: editForm.carrier,
      notes: editForm.notes,
    })
    setSavingInfo(false)
    if (!res.success) {
      toast.error('error' in res ? res.error : 'No se pudieron guardar los cambios')
      return
    }
    toast.success('Pedido actualizado')
    setEditing(false)
    await reload()
  }

  useEffect(() => {
    if (!id) {
      setLoading(false)
      return
    }
    let cancelled = false
    getOnlineOrderDetail(id).then((res) => {
      if (cancelled) return
      const data = res.success && res.data ? res.data : null
      setOrder(data)
      if (data) {
        const addr = parseAddress(data.shipping_address)
        setEditForm({
          address: addr ?? {},
          tracking_number: data.shipping_tracking_number ?? '',
          carrier: data.shipping_carrier ?? '',
          notes: data.notes ?? '',
        })
      }
      setLoading(false)
    })
    return () => { cancelled = true }
  }, [id])

  const activeTotal = useMemo(() => {
    if (!order) return 0
    return order.lines
      .filter((l) => l.status === 'active')
      .reduce((sum, l) => sum + Number(l.total || 0), 0)
  }, [order])

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (!order) {
    return (
      <div className="space-y-4">
        <button
          type="button"
          onClick={() => router.back()}
          className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" /> Volver a pedidos
        </button>
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            Pedido no encontrado.
          </CardContent>
        </Card>
      </div>
    )
  }

  const shippingAddress = parseAddress(order.shipping_address)
  const orderClosed = ['cancelled', 'refunded'].includes(order.status)
  const hasActiveLines = order.lines.some((l) => l.status === 'active')

  return (
    <div className="space-y-6">
      <button
        type="button"
        onClick={() => router.back()}
        className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" /> Volver a pedidos
      </button>

      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-2xl font-bold font-mono">{order.order_number}</h1>
            <Badge variant="outline" className={STATUS_COLORS[order.status] ?? ''}>
              {STATUS_LABELS[order.status] ?? order.status}
            </Badge>
            <Select
              value={order.status}
              onValueChange={(v) => setPendingStatus(v as OnlineOrderStatus)}
              disabled={orderClosed}
            >
              <SelectTrigger className="w-44 h-8 text-xs">
                <SelectValue placeholder="Cambiar estado…" />
              </SelectTrigger>
              <SelectContent>
                {STATUS_OPTIONS.map((s) => (
                  <SelectItem key={s} value={s}>
                    {STATUS_LABELS[s]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <p className="text-sm text-muted-foreground mt-1">
            {formatDateTime(order.created_at)}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {!orderClosed && (
            <Button
              variant="outline"
              size="sm"
              className="gap-1 text-red-600 hover:text-red-700"
              onClick={() => setConfirmCancelOrder(true)}
            >
              <Ban className="h-4 w-4" /> Cancelar pedido
            </Button>
          )}
          <p className="text-xl font-semibold ml-2">{formatCurrency(order.total)}</p>
        </div>
      </div>

      {order.status === 'cancelled' && order.cancellation_reason && (
        <Card className="border-red-200 bg-red-50/50">
          <CardContent className="py-3 px-4 text-sm">
            <span className="font-medium text-red-700">Motivo cancelación:</span>{' '}
            <span className="text-red-900">{order.cancellation_reason}</span>
          </CardContent>
        </Card>
      )}

      {order.shipping_tracking_number && (
        <Card className="border-purple-200 bg-purple-50/50">
          <CardContent className="py-4 flex items-center gap-3">
            <Truck className="h-5 w-5 text-purple-600" />
            <div className="flex-1">
              <p className="text-sm font-medium text-purple-700">Seguimiento</p>
              <p className="font-mono text-sm">{order.shipping_tracking_number}</p>
              {order.shipping_carrier && (
                <p className="text-xs text-muted-foreground">{order.shipping_carrier}</p>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <ShoppingBag className="h-4 w-4" /> Contenido del pedido
            </CardTitle>
            <span className="text-xs text-muted-foreground">
              {order.lines.length} línea{order.lines.length === 1 ? '' : 's'}
              {' · '}
              {order.lines.filter((l) => l.status === 'active').length} activa{order.lines.filter((l) => l.status === 'active').length === 1 ? '' : 's'}
            </span>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {order.lines.map((line) => (
                <div
                  key={line.id}
                  className={`flex items-start justify-between gap-3 rounded-lg border p-3 ${
                    line.status === 'cancelled'
                      ? 'bg-muted/40 border-dashed'
                      : 'bg-background'
                  }`}
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className={`text-sm font-medium ${line.status === 'cancelled' ? 'line-through text-muted-foreground' : ''}`}>
                        {line.product_name || 'Artículo'}
                      </p>
                      <Badge variant="outline" className={`text-xs ${LINE_STATUS_COLORS[line.status] ?? ''}`}>
                        {LINE_STATUS_LABELS[line.status] ?? line.status}
                      </Badge>
                      {line.stock_restored && (
                        <Badge variant="outline" className="text-xs bg-blue-50 text-blue-700 border-blue-200 gap-1">
                          <RotateCcw className="h-3 w-3" /> Stock repuesto
                        </Badge>
                      )}
                    </div>
                    <div className="mt-1 text-xs text-muted-foreground space-y-0.5">
                      {line.variant_sku && (
                        <p className="font-mono">{line.variant_sku} × {line.quantity}</p>
                      )}
                      {!line.variant_sku && <p>× {line.quantity}</p>}
                      <p>Precio unitario: {formatCurrency(line.unit_price)}</p>
                      {line.status === 'cancelled' && line.cancellation_reason && (
                        <p className="text-red-700">Motivo: {line.cancellation_reason}</p>
                      )}
                      {line.status === 'cancelled' && line.cancelled_at && (
                        <p>Cancelada: {formatDateTime(line.cancelled_at)}</p>
                      )}
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-1 min-w-[120px]">
                    <p className={`text-sm font-medium ${line.status === 'cancelled' ? 'line-through text-muted-foreground' : ''}`}>
                      {formatCurrency(line.total)}
                    </p>
                    {line.status === 'active' && !orderClosed && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 gap-1 px-2 text-red-600 hover:text-red-700 hover:bg-red-50"
                        onClick={() => {
                          setLineToCancel(line)
                          setLineRestock(true)
                          setLineReason('')
                        }}
                      >
                        <Ban className="h-3.5 w-3.5" /> Cancelar
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-4 space-y-1 border-t pt-4 text-sm">
              {order.subtotal != null && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Subtotal</span>
                  <span>{formatCurrency(order.subtotal)}</span>
                </div>
              )}
              {order.shipping_cost != null && Number(order.shipping_cost) > 0 && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Envío</span>
                  <span>{formatCurrency(order.shipping_cost)}</span>
                </div>
              )}
              <div className="flex justify-between font-semibold text-base pt-1">
                <span>Total cobrado</span>
                <span>{formatCurrency(order.total)}</span>
              </div>
              {order.lines.some((l) => l.status === 'cancelled') && (
                <div className="flex justify-between text-xs text-muted-foreground pt-1">
                  <span>Total efectivo (líneas activas)</span>
                  <span>{formatCurrency(activeTotal + Number(order.shipping_cost ?? 0))}</span>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        <div className="space-y-6">
          {order.client && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Cliente</CardTitle>
              </CardHeader>
              <CardContent className="text-sm space-y-1">
                <p className="font-medium">
                  {[order.client.first_name, order.client.last_name].filter(Boolean).join(' ') || '—'}
                </p>
                <p>{order.client.email}</p>
                {order.client.phone && <p>{order.client.phone}</p>}
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-base flex items-center gap-2">
                <MapPin className="h-4 w-4" /> Envío
              </CardTitle>
              {!editing ? (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 gap-1 px-2"
                  onClick={() => setEditing(true)}
                  disabled={orderClosed}
                >
                  <Pencil className="h-3.5 w-3.5" /> Editar
                </Button>
              ) : (
                <div className="flex gap-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 gap-1 px-2"
                    onClick={() => {
                      setEditing(false)
                      const addr = parseAddress(order.shipping_address) ?? {}
                      setEditForm({
                        address: addr,
                        tracking_number: order.shipping_tracking_number ?? '',
                        carrier: order.shipping_carrier ?? '',
                        notes: order.notes ?? '',
                      })
                    }}
                  >
                    <XIcon className="h-3.5 w-3.5" /> Cancelar
                  </Button>
                  <Button
                    size="sm"
                    className="h-7 gap-1 px-2"
                    onClick={saveInfo}
                    disabled={savingInfo}
                  >
                    {savingInfo ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                    Guardar
                  </Button>
                </div>
              )}
            </CardHeader>
            <CardContent className="text-sm space-y-2">
              {!editing ? (
                shippingAddress ? (
                  <>
                    <p className="font-medium">
                      {String(shippingAddress.first_name ?? '')} {String(shippingAddress.last_name ?? '')}
                    </p>
                    <p className="text-muted-foreground">{String(shippingAddress.address ?? '')}</p>
                    <p className="text-muted-foreground">
                      {String(shippingAddress.postal_code ?? '')} {String(shippingAddress.city ?? '')}
                      {shippingAddress.province && `, ${String(shippingAddress.province)}`}
                    </p>
                    {shippingAddress.phone && <p className="text-muted-foreground">{String(shippingAddress.phone)}</p>}
                  </>
                ) : (
                  <p className="text-muted-foreground">Sin dirección registrada.</p>
                )
              ) : (
                <div className="space-y-2">
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <Label className="text-xs">Nombre</Label>
                      <Input
                        className="h-8 text-sm"
                        value={editForm.address.first_name ?? ''}
                        onChange={(e) => setEditForm({ ...editForm, address: { ...editForm.address, first_name: e.target.value } })}
                      />
                    </div>
                    <div>
                      <Label className="text-xs">Apellidos</Label>
                      <Input
                        className="h-8 text-sm"
                        value={editForm.address.last_name ?? ''}
                        onChange={(e) => setEditForm({ ...editForm, address: { ...editForm.address, last_name: e.target.value } })}
                      />
                    </div>
                  </div>
                  <div>
                    <Label className="text-xs">Dirección</Label>
                    <Input
                      className="h-8 text-sm"
                      value={editForm.address.address ?? ''}
                      onChange={(e) => setEditForm({ ...editForm, address: { ...editForm.address, address: e.target.value } })}
                    />
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    <div>
                      <Label className="text-xs">CP</Label>
                      <Input
                        className="h-8 text-sm"
                        value={editForm.address.postal_code ?? ''}
                        onChange={(e) => setEditForm({ ...editForm, address: { ...editForm.address, postal_code: e.target.value } })}
                      />
                    </div>
                    <div className="col-span-2">
                      <Label className="text-xs">Ciudad</Label>
                      <Input
                        className="h-8 text-sm"
                        value={editForm.address.city ?? ''}
                        onChange={(e) => setEditForm({ ...editForm, address: { ...editForm.address, city: e.target.value } })}
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <Label className="text-xs">Provincia</Label>
                      <Input
                        className="h-8 text-sm"
                        value={editForm.address.province ?? ''}
                        onChange={(e) => setEditForm({ ...editForm, address: { ...editForm.address, province: e.target.value } })}
                      />
                    </div>
                    <div>
                      <Label className="text-xs">Teléfono</Label>
                      <Input
                        className="h-8 text-sm"
                        value={editForm.address.phone ?? ''}
                        onChange={(e) => setEditForm({ ...editForm, address: { ...editForm.address, phone: e.target.value } })}
                      />
                    </div>
                  </div>
                  <div className="border-t pt-2">
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <Label className="text-xs">Nº seguimiento</Label>
                        <Input
                          className="h-8 text-sm"
                          value={editForm.tracking_number}
                          onChange={(e) => setEditForm({ ...editForm, tracking_number: e.target.value })}
                        />
                      </div>
                      <div>
                        <Label className="text-xs">Transportista</Label>
                        <Input
                          className="h-8 text-sm"
                          value={editForm.carrier}
                          onChange={(e) => setEditForm({ ...editForm, carrier: e.target.value })}
                        />
                      </div>
                    </div>
                  </div>
                  <div>
                    <Label className="text-xs">Notas internas</Label>
                    <Textarea
                      className="text-sm min-h-[60px]"
                      value={editForm.notes}
                      onChange={(e) => setEditForm({ ...editForm, notes: e.target.value })}
                      placeholder="Notas internas sobre el pedido…"
                    />
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Pago</CardTitle>
            </CardHeader>
            <CardContent className="text-sm space-y-2">
              <div className="flex items-center gap-2">
                <span className="text-muted-foreground">Método:</span>
                <PaymentMethodBadge method={order.payment_method ?? undefined} />
                {!order.payment_method && <span>—</span>}
              </div>
              {order.paid_at && (
                <p>
                  <span className="text-muted-foreground">Pagado:</span>{' '}
                  {formatDateTime(order.paid_at)}
                </p>
              )}
              {order.shipped_at && (
                <p>
                  <span className="text-muted-foreground">Enviado:</span>{' '}
                  {formatDateTime(order.shipped_at)}
                </p>
              )}
              {order.delivered_at && (
                <p>
                  <span className="text-muted-foreground">Entregado:</span>{' '}
                  {formatDateTime(order.delivered_at)}
                </p>
              )}
            </CardContent>
          </Card>

          {order.notes && !editing && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Notas internas</CardTitle>
              </CardHeader>
              <CardContent className="text-sm whitespace-pre-wrap">
                {order.notes}
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <History className="h-4 w-4" /> Historial
              </CardTitle>
            </CardHeader>
            <CardContent>
              {(order.events ?? []).length === 0 ? (
                <p className="text-sm text-muted-foreground">Sin eventos registrados.</p>
              ) : (
                <ol className="space-y-4">
                  {order.events.map((ev, i) => (
                    <li key={ev.id} className="relative pl-5">
                      {i < order.events.length - 1 && (
                        <span className="absolute left-[4px] top-4 -bottom-4 w-px bg-border" aria-hidden />
                      )}
                      <span className="absolute left-0 top-1.5 h-2.5 w-2.5 rounded-full border-2 border-primary bg-background" aria-hidden />
                      <p className="text-xs text-muted-foreground">{formatDateTime(ev.at)}</p>
                      <p className="text-sm leading-snug">{ev.text}</p>
                      {ev.user && (
                        <p className="text-xs text-muted-foreground">por {ev.user}</p>
                      )}
                    </li>
                  ))}
                </ol>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Dialog: cambio de estado */}
      <AlertDialog
        open={pendingStatus !== null}
        onOpenChange={(open) => { if (!open) { setPendingStatus(null); setTrackingInput(''); setCarrierInput('') } }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              ¿Cambiar estado del pedido {order.order_number} a{' '}
              <span className="font-semibold">
                &quot;{pendingStatus ? STATUS_LABELS[pendingStatus] ?? pendingStatus : ''}&quot;
              </span>?
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3">
                <p>El cambio queda registrado en el historial del pedido.</p>
                {pendingStatus === 'shipped' && (
                  <div className="space-y-2 rounded border bg-purple-50/40 p-3">
                    <p className="text-xs text-purple-900">
                      Al marcar como enviado se enviará un email al cliente con el número de seguimiento (si lo indicas).
                    </p>
                    <div className="space-y-1">
                      <Label className="text-xs">Número de seguimiento (opcional)</Label>
                      <Input
                        value={trackingInput}
                        onChange={(e) => setTrackingInput(e.target.value)}
                        placeholder="Ej: 1Z999AA10123456784"
                        className="h-8 text-sm"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Transportista (opcional)</Label>
                      <Input
                        value={carrierInput}
                        onChange={(e) => setCarrierInput(e.target.value)}
                        placeholder="Ej: SEUR, UPS, Correos…"
                        className="h-8 text-sm"
                      />
                    </div>
                  </div>
                )}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={updating}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => { e.preventDefault(); confirmStatusChange() }}
              disabled={updating}
            >
              {updating && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              Confirmar cambio
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Dialog: cancelar línea */}
      <AlertDialog
        open={lineToCancel !== null}
        onOpenChange={(open) => { if (!open) { setLineToCancel(null); setLineReason(''); setLineRestock(true) } }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              ¿Cancelar la línea{' '}
              <span className="font-semibold">&quot;{lineToCancel?.product_name ?? ''}&quot;</span>?
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3">
                <p>
                  La línea quedará marcada como cancelada. El total cobrado no se modifica,
                  pero el total efectivo del pedido sí.
                </p>
                {lineToCancel?.variant_id ? (
                  <label className="flex items-start gap-2 rounded border bg-blue-50/40 p-3 cursor-pointer">
                    <Checkbox
                      checked={lineRestock}
                      onCheckedChange={(v) => setLineRestock(Boolean(v))}
                      className="mt-0.5"
                    />
                    <div className="text-xs">
                      <span className="font-medium text-blue-900 block">
                        Reponer al stock ({lineToCancel?.quantity ?? 0} ud)
                      </span>
                      <span className="text-blue-700">
                        Se devolverá la cantidad al almacén y se registrará un movimiento de stock tipo
                        &quot;return&quot;.
                      </span>
                    </div>
                  </label>
                ) : (
                  <p className="text-xs text-muted-foreground italic">
                    Línea sin variante asociada — no se puede reponer stock.
                  </p>
                )}
                <div className="space-y-1">
                  <Label className="text-xs">Motivo (opcional)</Label>
                  <Textarea
                    value={lineReason}
                    onChange={(e) => setLineReason(e.target.value)}
                    placeholder="Ej: producto sin stock, cliente solicitó cambio…"
                    className="text-sm min-h-[60px]"
                  />
                </div>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={cancellingLine}>Volver</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => { e.preventDefault(); confirmLineCancel() }}
              disabled={cancellingLine}
              className="bg-red-600 hover:bg-red-700"
            >
              {cancellingLine && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              <Ban className="h-4 w-4 mr-1" /> Cancelar línea
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Dialog: cancelar pedido completo */}
      <AlertDialog
        open={confirmCancelOrder}
        onOpenChange={(open) => { if (!open) { setConfirmCancelOrder(false); setOrderCancelReason(''); setOrderRestock(true) } }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              ¿Cancelar el pedido {order.order_number}?
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3">
                <p>
                  Todas las líneas activas se marcarán como canceladas y el pedido pasará a
                  estado &quot;Cancelado&quot;. Esta acción no reembolsa el pago automáticamente.
                </p>
                {hasActiveLines ? (
                  <label className="flex items-start gap-2 rounded border bg-blue-50/40 p-3 cursor-pointer">
                    <Checkbox
                      checked={orderRestock}
                      onCheckedChange={(v) => setOrderRestock(Boolean(v))}
                      className="mt-0.5"
                    />
                    <div className="text-xs">
                      <span className="font-medium text-blue-900 block">
                        Reponer stock de las líneas activas
                      </span>
                      <span className="text-blue-700">
                        Se devolverán al almacén las cantidades de cada línea con variante asociada.
                      </span>
                    </div>
                  </label>
                ) : (
                  <p className="text-xs text-muted-foreground italic">
                    Todas las líneas ya estaban canceladas — no se repone stock.
                  </p>
                )}
                <div className="space-y-1">
                  <Label className="text-xs">Motivo (opcional)</Label>
                  <Textarea
                    value={orderCancelReason}
                    onChange={(e) => setOrderCancelReason(e.target.value)}
                    placeholder="Ej: cliente solicitó cancelación, error en stock…"
                    className="text-sm min-h-[60px]"
                  />
                </div>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={cancellingOrder}>Volver</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => { e.preventDefault(); confirmOrderCancel() }}
              disabled={cancellingOrder}
              className="bg-red-600 hover:bg-red-700"
            >
              {cancellingOrder && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              <Ban className="h-4 w-4 mr-1" /> Cancelar pedido
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

function parseAddress(raw: unknown): ShippingAddress | null {
  if (!raw) return null
  try {
    if (typeof raw === 'string') return JSON.parse(raw) as ShippingAddress
    return raw as ShippingAddress
  } catch {
    return null
  }
}
