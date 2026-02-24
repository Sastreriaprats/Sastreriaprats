import { createAdminClient } from '@/lib/supabase/admin'

type NotificationType = 'info' | 'warning' | 'error' | 'success' |
  'order_update' | 'stock_alert' | 'payment_due' | 'appointment' | 'system'

interface CreateNotificationParams {
  type: NotificationType
  title: string
  message: string
  link?: string
  user_id?: string
  module?: string
  entity_type?: string
  entity_id?: string
}

export async function createNotification(params: CreateNotificationParams) {
  const admin = createAdminClient()

  if (params.user_id) {
    await admin.from('notifications').insert({
      user_id: params.user_id,
      type: params.type,
      title: params.title,
      message: params.message,
      link: params.link || null,
      module: params.module || null,
      entity_type: params.entity_type || null,
      entity_id: params.entity_id || null,
      is_read: false,
    })
  } else {
    const { data: admins } = await admin
      .from('profiles')
      .select('id')
      .eq('is_active', true)

    const inserts = (admins || []).map(a => ({
      user_id: a.id,
      type: params.type,
      title: params.title,
      message: params.message,
      link: params.link || null,
      module: params.module || null,
      entity_type: params.entity_type || null,
      entity_id: params.entity_id || null,
      is_read: false,
    }))

    if (inserts.length > 0) {
      await admin.from('notifications').insert(inserts)
    }
  }
}

export async function notifyNewOnlineOrder(orderNumber: string, total: number) {
  await createNotification({
    type: 'order_update',
    title: `Nuevo pedido online: ${orderNumber}`,
    message: `Total: €${total.toFixed(2)}`,
    link: '/admin/pedidos?filter=online',
    module: 'orders',
  })
}

export async function notifyLowStock(productName: string, currentStock: number) {
  await createNotification({
    type: 'stock_alert',
    title: `Stock bajo: ${productName}`,
    message: `Quedan ${currentStock} unidades`,
    link: '/admin/stock',
    module: 'stock',
  })
}

export async function notifyOrderOverdue(orderNumber: string, daysOverdue: number) {
  await createNotification({
    type: 'warning',
    title: `Pedido retrasado: ${orderNumber}`,
    message: `${daysOverdue} días de retraso`,
    link: '/admin/pedidos',
    module: 'orders',
  })
}

export async function notifySupplierPaymentDue(supplierName: string, amount: number, dueDate: string) {
  await createNotification({
    type: 'payment_due',
    title: `Pago vencido: ${supplierName}`,
    message: `€${amount.toFixed(2)} venció el ${dueDate}`,
    link: '/admin/proveedores',
    module: 'suppliers',
  })
}

export async function notifyCampaignSent(campaignName: string, sentCount: number) {
  await createNotification({
    type: 'success',
    title: `Campaña enviada: ${campaignName}`,
    message: `${sentCount} emails enviados`,
    link: '/admin/emails',
    module: 'emails',
  })
}
