import { Metadata } from 'next'
import { requirePermission } from '@/actions/auth'
import { ArreglosListContent } from '@/app/(admin)/admin/arreglos/arreglos-list-content'

export const metadata: Metadata = { title: 'Arreglos' }

export default async function VendedorArreglosPage() {
  await requirePermission('clients.view')
  return <ArreglosListContent basePath="/vendedor" />
}
