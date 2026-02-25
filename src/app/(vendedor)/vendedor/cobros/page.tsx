import { Metadata } from 'next'
import { requirePermission } from '@/actions/auth'
import { CobrosContent } from '@/app/(admin)/admin/cobros/cobros-content'

export const metadata: Metadata = { title: 'Cobros Pendientes' }

export default async function VendedorCobrosPage() {
  await requirePermission('orders.view')
  return <CobrosContent />
}
