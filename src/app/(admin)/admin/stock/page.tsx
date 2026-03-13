import { Metadata } from 'next'
import { requirePermission } from '@/actions/auth'
import nextDynamic from 'next/dynamic'

const StockDashboard = nextDynamic(
  () => import('./stock-dashboard').then(m => ({ default: m.StockDashboard })),
  {
    loading: () => (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900" />
      </div>
    ),
  }
)

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: 'Stock y Productos' }

export default async function StockPage() {
  await requirePermission('products.view')
  return <StockDashboard />
}
