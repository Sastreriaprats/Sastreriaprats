import { Metadata } from 'next'
import { requirePermission } from '@/actions/auth'
import { CobrosContent } from './cobros-content'

export const metadata: Metadata = { title: 'Cobros Pendientes' }

export default async function CobrosPage() {
  await requirePermission('orders.view')
  return <CobrosContent />
}
