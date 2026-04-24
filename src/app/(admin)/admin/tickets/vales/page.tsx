import { requirePermission } from '@/actions/auth'
import { VouchersContent } from './vales-content'

export const metadata = { title: 'Vales | Tickets' }

export default async function VoucherPage() {
  await requirePermission('pos.access')
  return <VouchersContent />
}
