import { Metadata } from 'next'
import { requireAnyPermission } from '@/actions/auth'
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
  // Admin/propietario (reports.view) ve todo; vendedores (reports.view_own) entran
  // a su vista personal. El scoping real (solo su fila) se aplica en las acciones.
  await requireAnyPermission(['reports.view', 'reports.view_own', 'reports.view_all_employees'])
  return <ReportsContent />
}
