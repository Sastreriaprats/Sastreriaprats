'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  ArrowLeft, User, Phone, Shirt, History,
  Calendar, CreditCard, AlertTriangle,
} from 'lucide-react'
import { usePermissions } from '@/hooks/use-permissions'
import { formatCurrency, formatDate, getOrderStatusColor, getOrderStatusLabel } from '@/lib/utils'
import { OrderGarmentsTab } from './tabs/order-garments-tab'
import { OrderHistoryTab } from './tabs/order-history-tab'
import { OrderFittingsTab } from './tabs/order-fittings-tab'
import { OrderPaymentsTab } from './tabs/order-payments-tab'
import { ChangeStatusDialog } from './change-status-dialog'

export function OrderDetailContent({ order }: { order: any }) {
  const router = useRouter()
  const { can } = usePermissions()
  const [showStatusDialog, setShowStatusDialog] = useState(false)

  const isOverdue = order.estimated_delivery_date && new Date(order.estimated_delivery_date) < new Date() && !['delivered', 'cancelled'].includes(order.status)
  const totalCost = (order.total_material_cost || 0) + (order.total_labor_cost || 0) + (order.total_factory_cost || 0)
  const margin = order.total > 0 ? ((order.total - totalCost) / order.total * 100) : 0
  const garmentCount = order.tailoring_order_lines?.length || 0

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => router.push('/admin/pedidos')}><ArrowLeft className="h-5 w-5" /></Button>
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold font-mono">{order.order_number}</h1>
            <Badge className={`${getOrderStatusColor(order.status)}`}>{getOrderStatusLabel(order.status)}</Badge>
            <Badge variant="outline">{order.order_type === 'artesanal' ? 'Artesanal' : 'Industrial'}</Badge>
            {isOverdue && <Badge variant="destructive" className="gap-1"><AlertTriangle className="h-3 w-3" /> Retrasado</Badge>}
          </div>
          <div className="flex items-center gap-4 text-sm text-muted-foreground mt-1">
            <span className="flex items-center gap-1"><User className="h-3 w-3" />{order.clients?.full_name}</span>
            {order.clients?.phone && <span className="flex items-center gap-1"><Phone className="h-3 w-3" />{order.clients.phone}</span>}
            <span>Tienda: {order.stores?.name}</span>
            <span>Fecha: {formatDate(order.order_date || order.created_at)}</span>
          </div>
        </div>
        <div className="flex gap-2">
          {can('orders.edit') && !['delivered', 'cancelled'].includes(order.status) && (
            <Button onClick={() => setShowStatusDialog(true)} className="bg-prats-navy hover:bg-prats-navy-light">
              Cambiar estado
            </Button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-6 gap-4">
        <Card><CardContent className="pt-4 pb-3">
          <p className="text-xs text-muted-foreground">Total</p>
          <p className="text-xl font-bold">{formatCurrency(order.total)}</p>
        </CardContent></Card>
        <Card><CardContent className="pt-4 pb-3">
          <p className="text-xs text-muted-foreground">Pagado</p>
          <p className="text-xl font-bold text-green-600">{formatCurrency(order.total_paid)}</p>
        </CardContent></Card>
        <Card><CardContent className="pt-4 pb-3">
          <p className="text-xs text-muted-foreground">Pendiente</p>
          <p className={`text-xl font-bold ${order.total_pending > 0 ? 'text-amber-600' : ''}`}>{formatCurrency(order.total_pending)}</p>
        </CardContent></Card>
        <Card><CardContent className="pt-4 pb-3">
          <p className="text-xs text-muted-foreground">Coste</p>
          <p className="text-xl font-bold">{formatCurrency(totalCost)}</p>
        </CardContent></Card>
        <Card><CardContent className="pt-4 pb-3">
          <p className="text-xs text-muted-foreground">Margen</p>
          <p className={`text-xl font-bold ${margin > 50 ? 'text-green-600' : margin > 30 ? 'text-amber-600' : 'text-red-600'}`}>{margin.toFixed(1)}%</p>
        </CardContent></Card>
        <Card><CardContent className="pt-4 pb-3">
          <p className="text-xs text-muted-foreground">Entrega est.</p>
          <p className={`text-lg font-bold ${isOverdue ? 'text-red-600' : ''}`}>{formatDate(order.estimated_delivery_date)}</p>
        </CardContent></Card>
      </div>

      <Tabs defaultValue="prendas">
        <TabsList>
          <TabsTrigger value="prendas" className="gap-1"><Shirt className="h-4 w-4" /> Prendas ({garmentCount})</TabsTrigger>
          <TabsTrigger value="historial" className="gap-1"><History className="h-4 w-4" /> Historial</TabsTrigger>
          <TabsTrigger value="pruebas" className="gap-1"><Calendar className="h-4 w-4" /> Pruebas</TabsTrigger>
          <TabsTrigger value="pagos" className="gap-1"><CreditCard className="h-4 w-4" /> Pagos</TabsTrigger>
        </TabsList>
        <div className="mt-6">
          <TabsContent value="prendas"><OrderGarmentsTab order={order} /></TabsContent>
          <TabsContent value="historial"><OrderHistoryTab history={order.tailoring_order_state_history || []} /></TabsContent>
          <TabsContent value="pruebas"><OrderFittingsTab orderId={order.id} fittings={order.tailoring_fittings || []} storeId={order.store_id} /></TabsContent>
          <TabsContent value="pagos"><OrderPaymentsTab order={order} /></TabsContent>
        </div>
      </Tabs>

      <ChangeStatusDialog
        open={showStatusDialog} onOpenChange={setShowStatusDialog}
        orderId={order.id} currentStatus={order.status} lines={order.tailoring_order_lines || []}
        orderType={order.order_type}
      />
    </div>
  )
}
