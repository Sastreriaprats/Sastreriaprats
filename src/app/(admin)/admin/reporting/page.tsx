import { Metadata } from 'next'
import { requirePermission } from '@/actions/auth'
import dynamic from 'next/dynamic'

const ReportsContent = dynamic(
  () => import('./reports-content').then(m => ({ default: m.ReportsContent })),
  {
    loading: () => (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900" />
      </div>
    ),
  }
)

export const metadata: Metadata = { title: 'Informes y Reporting' }

export default async function ReportingPage() {
  await requirePermission('reports.view')
  return <ReportsContent />
}
