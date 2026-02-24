import { Metadata } from 'next'
import { requirePermission } from '@/actions/auth'
import { StockDashboard } from './stock-dashboard'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: 'Stock y Productos' }

export default async function StockPage() {
  await requirePermission('products.view')
  return <StockDashboard />
}
