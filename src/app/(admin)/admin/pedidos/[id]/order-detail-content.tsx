'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import Link from 'next/link'
import {
  ArrowLeft, User, Phone, Shirt, History,
  Calendar, CreditCard, AlertTriangle, ExternalLink, Check, Loader2, X,
} from 'lucide-react'
import { toast } from 'sonner'
import { usePermissions } from '@/hooks/use-permissions'
import { updateOrderPaymentDate } from '@/actions/orders'
import { formatCurrency, formatDate, getOrderStatusColor, getOrderStatusLabel } from '@/lib/utils'
import { OrderGarmentsTab } from './tabs/order-garments-tab'
import { OrderHistoryTab } from './tabs/order-history-tab'
import { OrderFittingsTab } from './tabs/order-fittings-tab'
import { OrderPaymentsTab } from './tabs/order-payments-tab'
import { ChangeStatusDialog } from './change-status-dialog'
import { EditOrderDialog } from '@/components/orders/edit-order-dialog'
import { PaymentHistory } from '@/components/payments/payment-history'
import { Pencil } from 'lucide-react'

export function OrderDetailContent({ order }: { order: any }) {
  const router = useRouter()
  const { can, isAdmin } = usePermissions()
  const canViewCosts = can('orders.view_costs')
  const [showStatusDialog, setShowStatusDialog] = useState(false)
  const [showEditDialog, setShowEditDialog] = useState(false)

  // Fecha de pago editable manualmente.
  const [paymentDate, setPaymentDate] = useState<string | null>(order.payment_date ?? null)
  const [editingPaymentDate, setEditingPaymentDate] = useState(false)
  const [paymentDateDraft, setPaymentDateDraft] = useState('')
  const [savingPaymentDate, setSavingPaymentDate] = useState(false)
  const toDateInput = (d: string | null | undefined): string => (d ? String(d).slice(0, 10) : '')

  async function savePaymentDate() {
    setSavingPaymentDate(true)
    const res = await updateOrderPaymentDate({ orderId: order.id, payment_date: paymentDateDraft || null })
    setSavingPaymentDate(false)
    if (res.success) {
      setPaymentDate(paymentDateDraft || null)
      setEditingPaymentDate(false)
      toast.success('Fecha de pago actualizada')
      router.refresh()
    } else {
      toast.error((res as { error?: string })?.error || 'Error al actualizar la fecha de pago')
    }
  }

  const isOverdue = order.estimated_delivery_date && new Date(order.estimated_delivery_date) < new Date() && !['delivered', 'cancelled'].includes(order.status)
  const totalCost = (order.total_material_cost || 0) + (order.total_labor_cost || 0) + (order.total_factory_cost || 0)
  const marginAmount = Number(order.total ?? 0) - totalCost
  const marginPct = order.total > 0 ? (marginAmount / Number(order.total) * 100) : 0
  const marginColor = marginPct >= 20 ? 'text-green-600' : marginPct >= 10 ? 'text-amber-600' : 'text-red-600'
  const garmentCount = order.tailoring_order_lines?.length || 0

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => router.back()}><ArrowLeft className="h-5 w-5" /></Button>
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold font-mono">{order.order_number}</h1>
            <Badge className={`${getOrderStatusColor(order.status)}`}>{getOrderStatusLabel(order.status)}</Badge>
            <Badge variant="outline">{order.order_type === 'artesanal' ? 'Artesanal' : 'Industrial'}</Badge>
            {isOverdue && <Badge variant="destructive" className="gap-1"><AlertTriangle className="h-3 w-3" /> Retrasado</Badge>}
          </div>
          <div className="flex items-center gap-4 text-sm text-muted-foreground mt-1 flex-wrap">
            <span className="flex items-center gap-1"><User className="h-3 w-3" />{order.clients?.full_name}</span>
            {order.clients?.phone && <span className="flex items-center gap-1"><Phone className="h-3 w-3" />{order.clients.phone}</span>}
            <span>Tienda: {order.stores?.name}</span>
            <span>Fecha: {formatDate(order.order_date || order.created_at)}</span>
            {editingPaymentDate ? (
              <span className="flex items-center gap-1">
                Pago:
                <Input
                  type="date"
                  value={paymentDateDraft}
                  onChange={(e) => setPaymentDateDraft(e.target.value)}
                  className="h-7 w-[150px] text-sm"
                  disabled={savingPaymentDate}
                />
                <Button size="icon" variant="ghost" className="h-7 w-7" onClick={savePaymentDate} disabled={savingPaymentDate}>
                  {savingPaymentDate ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                </Button>
                <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setEditingPaymentDate(false)} disabled={savingPaymentDate}>
                  <X className="h-3.5 w-3.5" />
                </Button>
              </span>
            ) : (
              <span className="flex items-center gap-1">
                Pago: {paymentDate ? formatDate(paymentDate) : '—'}
                {can('orders.edit') && (
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-6 w-6"
                    onClick={() => { setPaymentDateDraft(toDateInput(paymentDate)); setEditingPaymentDate(true) }}
                  >
                    <Pencil className="h-3 w-3" />
                  </Button>
                )}
              </span>
            )}
            {order.supplier_order_id && (
              <Link
                href={`/admin/proveedores/pedidos/${order.supplier_order_id}`}
                className="inline-flex items-center gap-1 text-prats-navy hover:underline"
              >
                <ExternalLink className="h-3 w-3" />
                Pedido a proveedor: {order.supplier_orders?.order_number ?? (Array.isArray(order.supplier_orders) ? order.supplier_orders[0]?.order_number : '—')}
              </Link>
            )}
          </div>
        </div>
        <div className="flex gap-2">
          {can('orders.edit') && !['delivered', 'cancelled'].includes(order.status) && (
            <Button onClick={() => setShowEditDialog(true)} variant="outline" className="gap-1">
              <Pencil className="h-4 w-4" /> Editar pedido
            </Button>
          )}
          {can('orders.edit') && (isAdmin || !['delivered', 'cancelled'].includes(order.status)) && (
            <Button onClick={() => setShowStatusDialog(true)} className="bg-prats-navy hover:bg-prats-navy-light">
              Cambiar estado
            </Button>
          )}
        </div>
      </div>

      <div className={`grid grid-cols-2 gap-4 ${canViewCosts ? 'md:grid-cols-6' : 'md:grid-cols-4'}`}>
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
        {canViewCosts && (
          <>
            <Card><CardContent className="pt-4 pb-3">
              <p className="text-xs text-muted-foreground">Coste</p>
              <p className="text-xl font-bold">{formatCurrency(totalCost)}</p>
            </CardContent></Card>
            <Card><CardContent className="pt-4 pb-3">
              <p className="text-xs text-muted-foreground">Margen</p>
              <p className={`text-xl font-bold ${marginColor}`}>{formatCurrency(marginAmount)}</p>
              <p className={`text-xs font-medium ${marginColor}`}>{marginPct.toFixed(1)}%</p>
            </CardContent></Card>
          </>
        )}
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
          <TabsContent value="pagos">
            <div className="space-y-8">
              <PaymentHistory
                entityType="tailoring_order"
                entityId={order.id}
                total={order.total ?? 0}
                entityStoreId={order.store_id ?? null}
                entityStoreName={order.stores?.name ?? null}
              />
              <OrderPaymentsTab order={order} />
            </div>
          </TabsContent>
        </div>
      </Tabs>

      <ChangeStatusDialog
        open={showStatusDialog} onOpenChange={setShowStatusDialog}
        orderId={order.id} currentStatus={order.status} lines={order.tailoring_order_lines || []}
        orderType={order.order_type}
      />

      <EditOrderDialog
        open={showEditDialog}
        onOpenChange={setShowEditDialog}
        order={order}
        onSaved={() => router.refresh()}
      />
    </div>
  )
}
