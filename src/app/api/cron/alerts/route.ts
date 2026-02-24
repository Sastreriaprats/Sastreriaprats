import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const admin = createAdminClient()
  const today = new Date().toISOString().split('T')[0]
  const alerts: string[] = []

  const { data: dueDates } = await admin
    .from('supplier_due_dates')
    .select('*, suppliers(name)')
    .eq('is_paid', false)
    .lte('due_date', new Date(Date.now() + 7 * 86400000).toISOString().split('T')[0])
    .eq('alert_sent', false)

  if (dueDates && dueDates.length > 0) {
    for (const dd of dueDates) {
      await admin.from('notifications').insert({
        type: 'supplier_payment_due',
        title: `Vencimiento proveedor: ${(dd as any).suppliers?.name}`,
        message: `Pago de ${dd.amount}€ vence el ${dd.due_date}`,
        link: `/admin/proveedores/${dd.supplier_id}`,
        target_roles: ['admin', 'accountant'],
      })
      await admin.from('supplier_due_dates').update({ alert_sent: true }).eq('id', dd.id)
    }
    alerts.push(`${dueDates.length} vencimientos de proveedor`)
  }

  const { data: overdueOrders } = await admin
    .from('tailoring_orders')
    .select('id, order_number, clients(full_name)')
    .lt('estimated_delivery_date', today)
    .not('status', 'in', '("delivered","cancelled")')

  if (overdueOrders && overdueOrders.length > 0) {
    await admin.from('notifications').insert({
      type: 'order_overdue',
      title: 'Pedidos con retraso',
      message: `${overdueOrders.length} pedidos pasados de fecha estimada`,
      link: '/admin/pedidos?filter=overdue',
      target_roles: ['admin', 'tailor'],
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
