import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { isAuthorizedCron } from '@/lib/cron-auth'
import { createNotification } from '@/lib/notifications/create-notification'

export async function GET(request: NextRequest) {
  if (!isAuthorizedCron(request.headers.get('authorization'))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const admin = createAdminClient()
  const today = new Date().toISOString().split('T')[0]
  const in7 = new Date(Date.now() + 7 * 86400000).toISOString().split('T')[0]
  const alerts: string[] = []
  // Los errores de consulta se acumulan en vez de tragarse: hasta ahora un fallo
  // (columna inexistente, timeout, permisos) dejaba `data` a null, el bloque se
  // saltaba y el cron respondía {success:true, alerts:[]}, indistinguible de "hoy
  // no hay nada que avisar". Se informan AL FINAL para que un bloque roto no
  // cancele los siguientes ni la caducidad de vales.
  const errors: string[] = []

  const { data: dueDates, error: dueDatesError } = await admin
    .from('supplier_due_dates')
    .select('*, suppliers(name)')
    .eq('is_paid', false)
    .lte('due_date', in7)
    .eq('alert_sent', false)

  if (dueDatesError) errors.push(`supplier_due_dates: ${dueDatesError.message}`)

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

  const { data: apInvoicesDue, error: apInvoicesError } = await admin
    .from('ap_supplier_invoices')
    .select('id, supplier_name, total_amount, due_date')
    .eq('is_proforma', false) // las proformas no generan avisos de vencimiento
    .in('status', ['pendiente', 'vencida'])
    .gte('due_date', today)
    .lte('due_date', in7)
    .eq('payment_alert_sent', false)
    .or('alert_on_payment.is.null,alert_on_payment.eq.true')

  if (apInvoicesError) errors.push(`ap_supplier_invoices: ${apInvoicesError.message}`)

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

  const { data: supplierOrdersDelivery, error: supplierOrdersError } = await admin
    .from('supplier_orders')
    .select('id, order_number, estimated_delivery_date, suppliers(name)')
    .not('status', 'in', '("received","cancelled")')
    .gte('estimated_delivery_date', today)
    .lte('estimated_delivery_date', in7)
    .eq('delivery_alert_sent', false)
    .or('alert_on_delivery.is.null,alert_on_delivery.eq.true')

  if (supplierOrdersError) errors.push(`supplier_orders: ${supplierOrdersError.message}`)

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

  // Conteo EXACTO: con select() plano Supabase corta en 1000 filas y la alarma
  // mentiría en cuanto el listado creciera.
  const { count: overdueOrdersCount, error: overdueError } = await admin
    .from('tailoring_orders')
    .select('id', { count: 'exact', head: true })
    .lt('estimated_delivery_date', today)
    .not('status', 'in', '("delivered","cancelled")')

  if (overdueError) errors.push(`tailoring_orders: ${overdueError.message}`)

  if (overdueOrdersCount && overdueOrdersCount > 0) {
    await createNotification({
      type: 'order_update',
      title: 'Pedidos con retraso',
      message: `${overdueOrdersCount} pedidos pasados de fecha estimada`,
      link: '/admin/pedidos?status=overdue',
      module: 'orders',
    })
    alerts.push(`${overdueOrdersCount} pedidos con retraso`)
  }

  const { error: vouchersError } = await admin
    .from('vouchers')
    .update({ status: 'expired' })
    .eq('status', 'active')
    .lt('expiry_date', today)
  if (vouchersError) errors.push(`vouchers: ${vouchersError.message}`)

  // Si algo falló se responde 500 CON el detalle, pero solo después de haber
  // ejecutado todos los bloques: el fallo deja de ser invisible y aun así se hace
  // todo el trabajo que sí se puede hacer.
  if (errors.length > 0) {
    console.error('[cron/alerts] consultas con error:', errors.join(' | '))
    return NextResponse.json({ success: false, date: today, alerts, errors }, { status: 500 })
  }

  return NextResponse.json({ success: true, date: today, alerts })
}
