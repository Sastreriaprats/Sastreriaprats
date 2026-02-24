import { Metadata } from 'next'
import { requirePermission } from '@/actions/auth'
import { AccountingContent } from './accounting-content'

export const metadata: Metadata = { title: 'Contabilidad' }

export default async function AccountingPage() {
  await requirePermission('accounting.view')
  return <AccountingContent />
}
