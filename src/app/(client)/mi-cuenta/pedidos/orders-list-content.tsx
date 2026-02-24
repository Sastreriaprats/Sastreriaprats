'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ShoppingBag, Scissors, Truck } from 'lucide-react'
import { formatDate, formatCurrency } from '@/lib/utils'
import { cn } from '@/lib/utils'

const statusLabels: Record<string, string> = {
  pending_payment: 'Pendiente pago', paid: 'Pagado', processing: 'Procesando',
  shipped: 'Enviado', delivered: 'Entregado', cancelled: 'Cancelado',
  created: 'Creado', fabric_ordered: 'Tejido pedido', in_production: 'En producción',
  fitting: 'En prueba', adjustments: 'Ajustes', finished: 'Terminado',
}

const statusColors: Record<string, string> = {
  pending_payment: 'bg-amber-100 text-amber-700', paid: 'bg-green-100 text-green-700',
  processing: 'bg-blue-100 text-blue-700', shipped: 'bg-purple-100 text-purple-700',
  delivered: 'bg-green-100 text-green-700', cancelled: 'bg-red-100 text-red-700',
  created: 'bg-gray-100 text-gray-700', fabric_ordered: 'bg-orange-100 text-orange-700',
  in_production: 'bg-blue-100 text-blue-700', fitting: 'bg-purple-100 text-purple-700',
  adjustments: 'bg-amber-100 text-amber-700', finished: 'bg-green-100 text-green-700',
}

export function OrdersListContent({ onlineOrders, tailoringOrders }: {
  onlineOrders: Record<string, unknown>[]
  tailoringOrders: Record<string, unknown>[]
}) {
  const [filter, setFilter] = useState<'all' | 'online' | 'tailoring'>('all')

  type OrderItem = Record<string, unknown> & { type: string; date: string }
  const allOrders: OrderItem[] = [
    ...onlineOrders.map(o => ({ ...o, type: 'online', date: o.created_at as string })),
    ...tailoringOrders.map(o => ({ ...o, type: 'tailoring', date: (o.created_at || o.order_date) as string })),
  ].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())

  const filtered = filter === 'all' ? allOrders : allOrders.filter(o => o.type === filter)

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-prats-navy">Mis pedidos</h1>
        <div className="flex rounded-lg border p-0.5">
          {(['all', 'online', 'tailoring'] as const).map(f => (
            <Button
              key={f}
              variant={filter === f ? 'default' : 'ghost'}
              size="sm"
              className="h-7 px-3 text-xs"
              onClick={() => setFilter(f)}
            >
              {f === 'all' ? 'Todos' : f === 'online' ? 'Online' : 'Sastrería'}
            </Button>
          ))}
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="text-center py-16">
          <ShoppingBag className="mx-auto h-16 w-16 text-gray-200 mb-4" />
          <p className="text-gray-400">Sin pedidos</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((order) => (
            <Link
              key={order.id as string}
              href={`/mi-cuenta/pedidos/${order.id}?type=${order.type}`}
              className="block p-4 rounded-xl border hover:shadow-md transition-shadow"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className={cn(
                    'h-10 w-10 rounded-lg flex items-center justify-center',
                    order.type === 'online' ? 'bg-blue-50' : 'bg-purple-50'
                  )}>
                    {order.type === 'online'
                      ? <ShoppingBag className="h-5 w-5 text-blue-500" />
                      : <Scissors className="h-5 w-5 text-purple-500" />}
                  </div>
                  <div>
                    <p className="font-medium font-mono text-sm">{order.order_number as string}</p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <Badge className={`text-[10px] ${statusColors[order.status as string] || ''}`}>
                        {statusLabels[order.status as string] || (order.status as string)}
                      </Badge>
                      <span className="text-xs text-gray-400">{formatDate(order.date)}</span>
                    </div>
                  </div>
                </div>
                <div className="text-right">
                  <p className="font-bold text-prats-navy">{formatCurrency(order.total as number)}</p>
                  {(order.shipping_tracking_number as string) && (
                    <p className="text-xs text-gray-400 flex items-center gap-1">
                      <Truck className="h-3 w-3" />{order.shipping_tracking_number as string}
                    </p>
                  )}
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
