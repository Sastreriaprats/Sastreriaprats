import { Metadata } from 'next'
import { requirePermission } from '@/actions/auth'
import { AlbaranesContent } from './albaranes-content'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: 'Albaranes' }

export default async function AlbaranesPage() {
  await requirePermission('products.view')
  return <AlbaranesContent />
}
