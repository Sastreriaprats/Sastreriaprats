import { Metadata } from 'next'
import { requirePermission } from '@/actions/auth'
import { DashboardContent } from './dashboard-content'

export const metadata: Metadata = { title: 'Dashboard — Sastrería Prats' }

export default async function DashboardPage() {
  await requirePermission('dashboard.view')
  return <DashboardContent />
}
