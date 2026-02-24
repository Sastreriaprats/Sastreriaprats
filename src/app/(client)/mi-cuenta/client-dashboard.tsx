'use client'

import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ShoppingBag, Scissors, ArrowRight, Package } from 'lucide-react'
import { formatDate, formatCurrency } from '@/lib/utils'

const statusLabels: Record<string, string> = {
  pending_payment: 'Pendiente pago', paid: 'Pagado', processing: 'Procesando',
  shipped: 'Enviado', delivered: 'Entregado', cancelled: 'Cancelado',
  created: 'Creado', in_production: 'En producción', fitting: 'En prueba',
  finished: 'Terminado', fabric_ordered: 'Tejido pedido',
}

const statusColors: Record<string, string> = {
  pending_payment: 'bg-amber-100 text-amber-700', paid: 'bg-green-100 text-green-700',
  processing: 'bg-blue-100 text-blue-700', shipped: 'bg-purple-100 text-purple-700',
  delivered: 'bg-green-100 text-green-700', cancelled: 'bg-red-100 text-red-700',
  created: 'bg-gray-100 text-gray-700', in_production: 'bg-blue-100 text-blue-700',
  fitting: 'bg-purple-100 text-purple-700', finished: 'bg-green-100 text-green-700',
  fabric_ordered: 'bg-orange-100 text-orange-700',
}

export function ClientDashboard({ client, recentOnline, recentTailoring }: {
  client: Record<string, unknown> | null
  recentOnline: Record<string, unknown>[]
  recentTailoring: Record<string, unknown>[]
}) {
  type OrderItem = Record<string, unknown> & { type: string; _date: string }
  const allOrders: OrderItem[] = [
    ...recentOnline.map(o => ({ ...o, type: 'online', _date: o.created_at as string })),
    ...recentTailoring.map(o => ({ ...o, type: 'tailoring', _date: (o.created_at || o.order_date) as string })),
  ].sort((a, b) =>
    new Date(b._date).getTime() - new Date(a._date).getTime()
  ).slice(0, 5)

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-prats-navy">
          Hola, {(client?.first_name as string) || 'Cliente'}
        </h1>
        <p className="text-sm text-gray-500">Bienvenido a tu área personal</p>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-4 pb-3 text-center">
            <ShoppingBag className="h-5 w-5 mx-auto text-prats-gold mb-1" />
            <p className="text-2xl font-bold text-prats-navy">{recentOnline.length}</p>
            <p className="text-xs text-gray-400">Pedidos online</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3 text-center">
            <Scissors className="h-5 w-5 mx-auto text-prats-gold mb-1" />
            <p className="text-2xl font-bold text-prats-navy">{recentTailoring.length}</p>
            <p className="text-xs text-gray-400">Pedidos sastrería</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3 text-center">
            <Package className="h-5 w-5 mx-auto text-prats-gold mb-1" />
            <p className="text-2xl font-bold text-prats-navy capitalize">
              {(client?.category as string) || 'standard'}
            </p>
            <p className="text-xs text-gray-400">Categoría</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">Pedidos recientes</CardTitle>
            <Link href="/mi-cuenta/pedidos">
              <Button variant="ghost" size="sm" className="text-xs gap-1">
                Ver todos <ArrowRight className="h-3 w-3" />
              </Button>
            </Link>
          </div>
        </CardHeader>
        <CardContent>
          {allOrders.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-4">Sin pedidos todavía</p>
          ) : (
            <div className="space-y-2">
              {allOrders.map((order) => (
                <Link
                  key={order.id as string}
                  href={`/mi-cuenta/pedidos/${order.id}?type=${order.type}`}
                  className="flex items-center justify-between p-3 rounded-lg border hover:bg-gray-50 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    {order.type === 'online' ? (
                      <ShoppingBag className="h-4 w-4 text-gray-400" />
                    ) : (
                      <Scissors className="h-4 w-4 text-gray-400" />
                    )}
                    <div>
                      <p className="text-sm font-medium font-mono">{order.order_number as string}</p>
                      <Badge className={`text-[10px] ${statusColors[order.status as string] || ''}`}>
                        {statusLabels[order.status as string] || (order.status as string)}
                      </Badge>
                    </div>
                  </div>
                  <p className="text-sm font-bold">{formatCurrency(order.total as number)}</p>
                </Link>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
