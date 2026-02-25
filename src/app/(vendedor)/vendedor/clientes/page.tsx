import { Metadata } from 'next'
import { requirePermission } from '@/actions/auth'
import { ClientsPageContent } from '@/app/(admin)/admin/clientes/clients-page-content'

export const metadata: Metadata = { title: 'Clientes' }

export default async function VendedorClientsPage() {
  await requirePermission('clients.view')
  return <ClientsPageContent basePath="/vendedor" />
}
