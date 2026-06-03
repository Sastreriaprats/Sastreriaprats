import { Metadata } from 'next'
import { requirePermission } from '@/actions/auth'
import { ArreglosListContent } from './arreglos-list-content'

export const metadata: Metadata = { title: 'Arreglos' }

export default async function ArreglosPage() {
  await requirePermission('clients.view')
  return <ArreglosListContent />
}
