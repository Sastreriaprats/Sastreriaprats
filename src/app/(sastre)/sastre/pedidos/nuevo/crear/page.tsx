import { redirect } from 'next/navigation'
import { requirePermission } from '@/actions/auth'
import { CreateOrderWizard } from '@/app/(admin)/admin/pedidos/nuevo/create-order-wizard'

export const metadata = { title: 'Nuevo producto · Sastre' }

type Props = { searchParams: Promise<{ orderType?: string }> }

export default async function SastreNuevoProductoCrearPage({ searchParams }: Props) {
  await requirePermission('orders.create')
  const params = await searchParams
  const orderType = params.orderType === 'artesanal' || params.orderType === 'industrial' || params.orderType === 'camiseria' ? params.orderType : null
  if (!orderType) redirect('/sastre/pedidos/nuevo')

  return <CreateOrderWizard fromSastre initialOrderType={orderType} />
}
