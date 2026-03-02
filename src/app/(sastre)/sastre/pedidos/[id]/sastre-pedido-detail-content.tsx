'use client'

import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { formatCurrency, formatDate, getOrderStatusLabel } from '@/lib/utils'
import { PaymentHistory } from '@/components/payments/payment-history'

export function SastrePedidoDetailContent({ order }: { order: any }) {
  const clientName = order.clients?.full_name ?? order.client_id ?? '—'

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <Card className="border-[#c9a96e]/20 bg-white/5">
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <h2 className="text-xl font-semibold text-white">{order.order_number}</h2>
              <p className="text-white/60 text-sm mt-0.5">Cliente: {clientName}</p>
            </div>
            <span className="text-xs px-2 py-1 rounded bg-white/10 text-white/80">
              {getOrderStatusLabel(order.status)}
            </span>
          </div>
        </CardHeader>
        <CardContent className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
          <div>
            <p className="text-white/50">Fecha</p>
            <p className="text-white">{formatDate(order.order_date)}</p>
          </div>
          <div>
            <p className="text-white/50">Total</p>
            <p className="text-white">{formatCurrency(order.total)}</p>
          </div>
          <div>
            <p className="text-white/50">Pagado</p>
            <p className="text-white">{formatCurrency(order.total_paid ?? 0)}</p>
          </div>
          <div>
            <p className="text-white/50">Pendiente</p>
            <p className="text-amber-400 font-medium">{formatCurrency(order.total_pending ?? 0)}</p>
          </div>
        </CardContent>
      </Card>

      <Card className="border-[#c9a96e]/20 bg-white/5">
        <CardHeader>
          <h3 className="text-lg font-medium text-white">Pagos</h3>
        </CardHeader>
        <CardContent>
          <PaymentHistory
            entityType="tailoring_order"
            entityId={order.id}
            total={Number(order.total)}
          />
        </CardContent>
      </Card>
    </div>
  )
}
