import { Metadata } from 'next'
import { requirePermission } from '@/actions/auth'
import { OfficialsPageContent } from './officials-page-content'

export const metadata: Metadata = { title: 'Oficiales' }

export default async function OfficialsPage() {
  await requirePermission('officials.view')
  return <OfficialsPageContent />
}
