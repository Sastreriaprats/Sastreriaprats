import { Metadata } from 'next'
import { requirePermission } from '@/actions/auth'
import { ReturnsListContent } from './returns-list-content'

export const metadata: Metadata = { title: 'Devoluciones' }

export default async function ReturnsPage() {
  await requirePermission('returns.view')
  return <ReturnsListContent />
}
