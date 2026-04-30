'use client'

import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { ArrowLeft, MapPin, Loader2, Truck } from 'lucide-react'
import { toast } from 'sonner'
import { getOnlineOrderDetail, updateOnlineOrderStatusAction, type OnlineOrderDetail, type OnlineOrderStatus } from '@/actions/online-orders'
import { formatCurrency, formatDateTime } from '@/lib/utils'

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
  pending_payment: 'bg-amber-100 text-amber-700',
  paid: 'bg-green-100 text-green-700',
  processing: 'bg-blue-100 text-blue-700',
  shipped: 'bg-purple-100 text-purple-700',
  delivered: 'bg-green-100 text-green-700',
  cancelled: 'bg-red-100 text-red-700',
  refunded: 'bg-gray-100 text-gray-700',
}

const STATUS_OPTIONS: OnlineOrderStatus[] = [
  'pending_payment', 'paid', 'processing', 'shipped', 'delivered', 'cancelled', 'refunded',
]

export function AdminOrderDetailContent() {
  const params = useParams()
  const router = useRouter()
  const id = params?.id as string
  const [order, setOrder] = useState<OnlineOrderDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [pendingStatus, setPendingStatus] = useState<OnlineOrderStatus | null>(null)
  const [trackingInput, setTrackingInput] = useState('')
  const [carrierInput, setCarrierInput] = useState('')
  const [updating, setUpdating] = useState(false)

  const reload = async () => {
    if (!id) return
    const res = await getOnlineOrderDetail(id)
    if (res.success && res.data) setOrder(res.data)
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

  useEffect(() => {
    if (!id) {
      setLoading(false)
      return
    }
    let cancelled = false
    getOnlineOrderDetail(id).then((res) => {
      if (cancelled) return
      setOrder(res.success && res.data ? res.data : null)
      setLoading(false)
    })
    return () => { cancelled = true }
  }, [id])

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

  let shippingAddress: Record<string, unknown> | null = null
  if (order.shipping_address) {
    try {
      shippingAddress = typeof order.shipping_address === 'string'
        ? JSON.parse(order.shipping_address as string)
        : (order.shipping_address as Record<string, unknown>)
    } catch {
      /* ignore */
    }
  }

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
            <Badge className={STATUS_COLORS[order.status] ?? 'bg-gray-100 text-gray-700'}>
              {STATUS_LABELS[order.status] ?? order.status}
            </Badge>
            <Select
              value={order.status}
              onValueChange={(v) => setPendingStatus(v as OnlineOrderStatus)}
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
        <p className="text-xl font-semibold">{formatCurrency(order.total)}</p>
      </div>

      {order.shipping_tracking_number && (
        <Card className="border-purple-200 bg-purple-50/50">
          <CardContent className="py-4 flex items-center gap-3">
            <Truck className="h-5 w-5 text-purple-600" />
            <div>
              <p className="text-sm font-medium text-purple-700">Seguimiento</p>
              <p className="font-mono text-sm">{order.shipping_tracking_number}</p>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Contenido del pedido</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {order.lines.map((line) => (
                <div
                  key={line.id}
                  className="flex items-center justify-between rounded-lg border bg-muted/30 p-3"
                >
                  <div>
                    <p className="text-sm font-medium">{line.product_name || 'Artículo'}</p>
                    {line.variant_sku && (
                      <p className="text-xs text-muted-foreground font-mono">
                        {line.variant_sku} × {line.quantity}
                      </p>
                    )}
                  </div>
                  <p className="text-sm font-medium">{formatCurrency(line.total)}</p>
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
                <span>Total</span>
                <span>{formatCurrency(order.total)}</span>
              </div>
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

          {shippingAddress && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <MapPin className="h-4 w-4" /> Dirección de envío
                </CardTitle>
              </CardHeader>
              <CardContent className="text-sm text-muted-foreground space-y-1">
                <p className="font-medium text-foreground">
                  {String(shippingAddress.first_name ?? '')} {String(shippingAddress.last_name ?? '')}
                </p>
                <p>{String(shippingAddress.address ?? '')}</p>
                <p>
                  {String(shippingAddress.postal_code ?? '')} {String(shippingAddress.city ?? '')}
                  {shippingAddress.province != null && `, ${String(shippingAddress.province)}`}
                </p>
                {shippingAddress.phone != null ? <p>{String(shippingAddress.phone)}</p> : null}
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Pago</CardTitle>
            </CardHeader>
            <CardContent className="text-sm">
              <p>
                <span className="text-muted-foreground">Método:</span>{' '}
                {order.payment_method || '—'}
              </p>
              {order.paid_at && (
                <p className="mt-1">
                  <span className="text-muted-foreground">Pagado:</span>{' '}
                  {formatDateTime(order.paid_at)}
                </p>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

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
    </div>
  )
}
