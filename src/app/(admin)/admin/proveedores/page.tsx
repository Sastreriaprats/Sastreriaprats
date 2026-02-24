import { Metadata } from 'next'
import { requirePermission } from '@/actions/auth'
import { SuppliersPageContent } from './suppliers-page-content'

export const metadata: Metadata = { title: 'Proveedores' }

export default async function SuppliersPage() {
  await requirePermission('suppliers.view')
  return <SuppliersPageContent />
}
