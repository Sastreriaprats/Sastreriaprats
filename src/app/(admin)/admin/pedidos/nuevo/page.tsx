import { Metadata } from 'next'
import { requirePermission } from '@/actions/auth'
import { CreateOrderWizard } from './create-order-wizard'

export const metadata: Metadata = { title: 'Nuevo pedido' }

export default async function NewOrderPage() {
  await requirePermission('orders.create')
  return <CreateOrderWizard />
}
