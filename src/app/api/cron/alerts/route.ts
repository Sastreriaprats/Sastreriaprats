import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { createNotification } from '@/lib/notifications/create-notification'

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const admin = createAdminClient()
  const today = new Date().toISOString().split('T')[0]
  const in7 = new Date(Date.now() + 7 * 86400000).toISOString().split('T')[0]
  const alerts: string[] = []

  const { data: dueDates } = await admin
    .from('supplier_due_dates')
    .select('*, suppliers(name)')
    .eq('is_paid', false)
    .lte('due_date', in7)
    .eq('alert_sent', false)

  if (dueDates && dueDates.length > 0) {
    for (const dd of dueDates) {
      await createNotification({
        type: 'payment_due',
        title: `Vencimiento proveedor: ${(dd as any).suppliers?.name}`,
        message: `Pago de ${dd.amount}€ vence el ${dd.due_date}`,
        link: `/admin/proveedores/${dd.supplier_id}`,
        module: 'suppliers',
      })
      await admin.from('supplier_due_dates').update({ alert_sent: true }).eq('id', dd.id)
    }
    alerts.push(`${dueDates.length} vencimientos de proveedor`)
  }

  const { data: apInvoicesDue } = await admin
    .from('ap_supplier_invoices')
    .select('id, supplier_name, total_amount, due_date')
    .in('status', ['pendiente', 'vencida'])
    .gte('due_date', today)
    .lte('due_date', in7)
    .eq('payment_alert_sent', false)
    .or('alert_on_payment.is.null,alert_on_payment.eq.true')

  if (apInvoicesDue && apInvoicesDue.length > 0) {
    for (const inv of apInvoicesDue) {
      await createNotification({
        type: 'payment_due',
        title: `Factura proveedor vence: ${inv.supplier_name}`,
        message: `${Number(inv.total_amount).toFixed(2)}€ vence el ${inv.due_date}`,
        link: '/admin/contabilidad/facturas-proveedores',
        module: 'accounting',
      })
      await admin.from('ap_supplier_invoices').update({ payment_alert_sent: true }).eq('id', inv.id)
    }
    alerts.push(`${apInvoicesDue.length} facturas proveedor próximas a vencer`)
  }

  const { data: supplierOrdersDelivery } = await admin
    .from('supplier_orders')
    .select('id, order_number, estimated_delivery_date, suppliers(name)')
    .not('status', 'in', '("received","cancelled")')
    .gte('estimated_delivery_date', today)
    .lte('estimated_delivery_date', in7)
    .eq('delivery_alert_sent', false)
    .or('alert_on_delivery.is.null,alert_on_delivery.eq.true')

  if (supplierOrdersDelivery && supplierOrdersDelivery.length > 0) {
    for (const o of supplierOrdersDelivery) {
      await createNotification({
        type: 'info',
        title: `Entrega estimada pedido: ${o.order_number}`,
        message: `Pedido a ${(o as any).suppliers?.name ?? 'proveedor'} previsto el ${o.estimated_delivery_date}`,
        link: '/admin/proveedores',
        module: 'suppliers',
      })
      await admin.from('supplier_orders').update({ delivery_alert_sent: true }).eq('id', o.id)
    }
    alerts.push(`${supplierOrdersDelivery.length} pedidos a proveedor con entrega próxima`)
  }

  const { data: overdueOrders } = await admin
    .from('tailoring_orders')
    .select('id, order_number, clients(full_name)')
    .lt('estimated_delivery_date', today)
    .not('status', 'in', '("delivered","cancelled")')

  if (overdueOrders && overdueOrders.length > 0) {
    await createNotification({
      type: 'order_update',
      title: 'Pedidos con retraso',
      message: `${overdueOrders.length} pedidos pasados de fecha estimada`,
      link: '/admin/pedidos?status=overdue',
      module: 'orders',
    })
    alerts.push(`${overdueOrders.length} pedidos con retraso`)
  }

  await admin
    .from('vouchers')
    .update({ status: 'expired' })
    .eq('status', 'active')
    .lt('expiry_date', today)

  return NextResponse.json({ success: true, date: today, alerts })
}
