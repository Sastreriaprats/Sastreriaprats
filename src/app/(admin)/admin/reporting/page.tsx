import { Metadata } from 'next'
import { requirePermission } from '@/actions/auth'
import { ReportsContent } from './reports-content'

export const metadata: Metadata = { title: 'Informes y Reporting' }

export default async function ReportingPage() {
  await requirePermission('reports.view')
  return <ReportsContent />
}
