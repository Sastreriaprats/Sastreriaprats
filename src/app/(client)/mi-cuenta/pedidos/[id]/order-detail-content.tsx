'use client'

import Link from 'next/link'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { ArrowLeft, Truck, CheckCircle, Clock, MapPin } from 'lucide-react'
import { formatDate, formatDateTime, formatCurrency } from '@/lib/utils'
import { cn } from '@/lib/utils'

const statusLabels: Record<string, string> = {
  pending_payment: 'Pendiente pago', paid: 'Pagado', processing: 'Procesando',
  shipped: 'Enviado', delivered: 'Entregado', cancelled: 'Cancelado',
  created: 'Creado', fabric_ordered: 'Tejido pedido', fabric_received: 'Tejido recibido',
  factory_ordered: 'En fábrica', in_production: 'En producción',
  fitting: 'Prueba', adjustments: 'Ajustes', finished: 'Terminado',
}

const statusColors: Record<string, string> = {
  pending_payment: 'bg-amber-100 text-amber-700', paid: 'bg-green-100 text-green-700',
  processing: 'bg-blue-100 text-blue-700', shipped: 'bg-purple-100 text-purple-700',
  delivered: 'bg-green-100 text-green-700', cancelled: 'bg-red-100 text-red-700',
  created: 'bg-gray-100 text-gray-700', in_production: 'bg-blue-100 text-blue-700',
  fitting: 'bg-purple-100 text-purple-700', finished: 'bg-green-100 text-green-700',
  fabric_ordered: 'bg-orange-100 text-orange-700',
}

const onlineSteps = ['paid', 'processing', 'shipped', 'delivered']
const tailoringSteps = ['created', 'fabric_ordered', 'in_production', 'fitting', 'finished', 'delivered']

export function OrderDetailContent({ order, lines, history }: {
  order: Record<string, unknown>
  lines: Record<string, unknown>[]
  history: Record<string, unknown>[]
}) {
  const isTailoring = order.type === 'tailoring'
  const steps = isTailoring ? tailoringSteps : onlineSteps
  const currentStepIndex = steps.indexOf(order.status as string)
  const isCancelled = order.status === 'cancelled'

  let shippingAddress: Record<string, unknown> | null = null
  if (order.shipping_address) {
    try {
      shippingAddress = typeof order.shipping_address === 'string'
        ? JSON.parse(order.shipping_address as string)
        : order.shipping_address as Record<string, unknown>
    } catch { /* ignore */ }
  }

  return (
    <div className="space-y-6">
      <Link
        href="/mi-cuenta/pedidos"
        className="inline-flex items-center gap-2 text-sm text-gray-400 hover:text-prats-navy transition-colors"
      >
        <ArrowLeft className="h-4 w-4" />Volver a pedidos
      </Link>

      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-prats-navy font-mono">{order.order_number as string}</h1>
            <Badge className={statusColors[order.status as string]}>
              {statusLabels[order.status as string] || (order.status as string)}
            </Badge>
          </div>
          <p className="text-sm text-gray-400 mt-1">
            {formatDate((order.created_at || order.order_date) as string)}
          </p>
        </div>
        <p className="text-2xl font-bold text-prats-navy">{formatCurrency(order.total as number)}</p>
      </div>

      {!isCancelled && (
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              {steps.map((step, i) => {
                const isComplete = i <= currentStepIndex
                const isCurrent = i === currentStepIndex
                return (
                  <div key={step} className="flex flex-col items-center flex-1">
                    <div className="flex items-center w-full">
                      {i > 0 && (
                        <div className={cn('flex-1 h-0.5', i <= currentStepIndex ? 'bg-green-500' : 'bg-gray-200')} />
                      )}
                      <div className={cn(
                        'h-8 w-8 rounded-full flex items-center justify-center flex-shrink-0 border-2 transition-all',
                        isComplete ? 'bg-green-500 border-green-500 text-white'
                          : isCurrent ? 'border-prats-navy text-prats-navy bg-white'
                          : 'border-gray-200 text-gray-300 bg-white'
                      )}>
                        {isComplete ? <CheckCircle className="h-4 w-4" /> : <span className="text-xs">{i + 1}</span>}
                      </div>
                      {i < steps.length - 1 && (
                        <div className={cn('flex-1 h-0.5', i < currentStepIndex ? 'bg-green-500' : 'bg-gray-200')} />
                      )}
                    </div>
                    <p className={cn(
                      'text-[10px] mt-2 text-center',
                      isComplete || isCurrent ? 'text-prats-navy font-medium' : 'text-gray-400'
                    )}>
                      {statusLabels[step]}
                    </p>
                  </div>
                )
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {(order.shipping_tracking_number as string) && (
        <Card className="border-purple-200 bg-purple-50">
          <CardContent className="pt-4 pb-3 flex items-center gap-3">
            <Truck className="h-5 w-5 text-purple-600" />
            <div>
              <p className="text-sm font-medium text-purple-700">Número de seguimiento</p>
              <p className="font-mono text-sm">{order.shipping_tracking_number as string}</p>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle className="text-base">Artículos</CardTitle></CardHeader>
          <CardContent>
            <div className="space-y-3">
              {lines.map((line, i) => {
                const garment = line.garment_types as Record<string, unknown> | null
                return (
                  <div key={i} className="flex items-center justify-between p-3 rounded-lg bg-gray-50">
                    <div>
                      <p className="text-sm font-medium">
                        {(line.product_name as string) || garment?.name as string || `Artículo ${i + 1}`}
                      </p>
                      <p className="text-xs text-gray-400">
                        {(line.variant_sku as string) && <span className="font-mono">{line.variant_sku as string} · </span>}
                        ×{(line.quantity as number) || 1}
                      </p>
                    </div>
                    <p className="font-medium text-sm">
                      {formatCurrency((line.total || line.line_total || (line.unit_price as number) * ((line.quantity as number) || 1)) as number)}
                    </p>
                  </div>
                )
              })}
            </div>
            <Separator className="my-4" />
            <div className="space-y-1 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-500">Subtotal</span>
                <span>{formatCurrency((order.subtotal || order.total) as number)}</span>
              </div>
              {(order.shipping_cost as number) > 0 && (
                <div className="flex justify-between">
                  <span className="text-gray-500">Envío</span>
                  <span>{formatCurrency(order.shipping_cost as number)}</span>
                </div>
              )}
              <div className="flex justify-between font-bold text-lg">
                <span>Total</span>
                <span>{formatCurrency(order.total as number)}</span>
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="space-y-6">
          {shippingAddress && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <MapPin className="h-4 w-4" />Dirección de envío
                </CardTitle>
              </CardHeader>
              <CardContent className="text-sm text-gray-600 space-y-1">
                <p className="font-medium">
                  {shippingAddress.first_name as string} {shippingAddress.last_name as string}
                </p>
                <p>{shippingAddress.address as string}</p>
                <p>
                  {shippingAddress.postal_code as string} {shippingAddress.city as string}
                  {(shippingAddress.province as string) && `, ${shippingAddress.province as string}`}
                </p>
                {(shippingAddress.phone as string) && <p>{shippingAddress.phone as string}</p>}
              </CardContent>
            </Card>
          )}

          {history.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Clock className="h-4 w-4" />Historial
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {history
                    .sort((a, b) => new Date(b.changed_at as string).getTime() - new Date(a.changed_at as string).getTime())
                    .map((h) => (
                      <div key={h.id as string} className="flex items-start gap-3">
                        <div className="h-2 w-2 rounded-full bg-prats-navy mt-1.5 flex-shrink-0" />
                        <div>
                          <div className="flex items-center gap-2">
                            <Badge className={`text-[10px] ${statusColors[h.to_status as string] || ''}`}>
                              {statusLabels[h.to_status as string] || (h.to_status as string)}
                            </Badge>
                            <span className="text-xs text-gray-400">{formatDateTime(h.changed_at as string)}</span>
                          </div>
                          {(h.notes as string) && <p className="text-xs text-gray-500 mt-0.5">{h.notes as string}</p>}
                        </div>
                      </div>
                    ))}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  )
}
