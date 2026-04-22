import { Metadata } from 'next'
import { requirePermission } from '@/actions/auth'
import { AdminNewOrderWizard } from './admin-new-order-wizard'

export const metadata: Metadata = { title: 'Nuevo pedido' }

export default async function NewOrderPage() {
  await requirePermission('orders.create')
  return <AdminNewOrderWizard />
}
