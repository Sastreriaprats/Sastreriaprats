import { Metadata } from 'next'
import { requirePermission } from '@/actions/auth'
import { ClientsPageContent } from './clients-page-content'

export const metadata: Metadata = { title: 'Clientes' }

export default async function ClientsPage() {
  await requirePermission('clients.view')
  return <ClientsPageContent />
}
