import { Metadata } from 'next'
import { requirePermission } from '@/actions/auth'
import { AccountingPageClient } from './accounting-page-client'

export const metadata: Metadata = { title: 'Contabilidad' }

export default async function AccountingPage() {
  await requirePermission('accounting.view')
  return <AccountingPageClient />
}
