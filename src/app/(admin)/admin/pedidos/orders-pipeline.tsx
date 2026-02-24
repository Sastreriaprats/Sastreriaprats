'use client'

import { useRouter } from 'next/navigation'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area'
import { Loader2, AlertTriangle } from 'lucide-react'
import { formatCurrency, formatDate, getOrderStatusColor, getOrderStatusLabel } from '@/lib/utils'

const pipelineStatuses = [
  'created', 'fabric_ordered', 'fabric_received', 'factory_ordered',
  'in_production', 'fitting', 'adjustments', 'finished',
]

export function OrdersPipeline({ orders, isLoading, onRefresh }: {
  orders: any[]; isLoading: boolean; onRefresh: () => void
}) {
  const router = useRouter()

  if (isLoading) return <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin" /></div>

  const columns = pipelineStatuses.map(status => ({
    status,
    label: getOrderStatusLabel(status),
    color: getOrderStatusColor(status),
    orders: orders.filter((o: any) => o.status === status),
  }))

  return (
    <ScrollArea className="w-full">
      <div className="flex gap-4 pb-4" style={{ minWidth: `${columns.length * 260}px` }}>
        {columns.map(col => (
          <div key={col.status} className="w-[240px] flex-shrink-0">
            <div className="mb-3 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Badge className={`text-xs ${col.color}`}>{col.label}</Badge>
                <span className="text-xs text-muted-foreground font-medium">{col.orders.length}</span>
              </div>
            </div>
            <div className="space-y-2 min-h-[200px]">
              {col.orders.map((order: any) => {
                const isOverdue = order.estimated_delivery_date && new Date(order.estimated_delivery_date) < new Date()
                return (
                  <Card key={order.id} className="cursor-pointer hover:shadow-md transition-shadow"
                    onClick={() => router.push(`/admin/pedidos/${order.id}`)}>
                    <CardContent className="p-3">
                      <div className="flex items-center justify-between mb-1">
                        <span className="font-mono text-xs font-medium">{order.order_number}</span>
                        {isOverdue && <AlertTriangle className="h-3 w-3 text-red-500" />}
                      </div>
                      <p className="text-sm font-medium truncate">{order.clients?.full_name}</p>
                      <div className="flex items-center justify-between mt-2 text-xs text-muted-foreground">
                        <span>{formatDate(order.estimated_delivery_date)}</span>
                        <span className="font-medium text-foreground">{formatCurrency(order.total)}</span>
                      </div>
                      {order.total_pending > 0 && (
                        <p className="text-xs text-amber-600 mt-1">Pdte: {formatCurrency(order.total_pending)}</p>
                      )}
                    </CardContent>
                  </Card>
                )
              })}
            </div>
          </div>
        ))}
      </div>
      <ScrollBar orientation="horizontal" />
    </ScrollArea>
  )
}
