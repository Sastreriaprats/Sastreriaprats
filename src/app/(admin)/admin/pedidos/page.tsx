import { Metadata } from 'next'
import { requirePermission } from '@/actions/auth'
import { OrdersPageContent } from './orders-page-content'

export const metadata: Metadata = { title: 'Pedidos de Sastrería' }

export default async function OrdersPage(props: { searchParams: Promise<{ view?: string; status?: string; type?: string; tab?: string }> }) {
  await requirePermission('orders.view')
  const searchParams = await props.searchParams
  const validTabs = ['tailoring', 'supplier', 'reservations'] as const
  const initialTab = validTabs.includes(searchParams.tab as any) ? (searchParams.tab as (typeof validTabs)[number]) : 'tailoring'
  return (
    <OrdersPageContent
      initialView={searchParams.view || 'table'}
      initialStatus={searchParams.status === 'overdue' ? 'overdue' : undefined}
      initialType={searchParams.type}
      initialTab={initialTab}
    />
  )
}
