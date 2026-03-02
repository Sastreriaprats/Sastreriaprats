import { requirePermission } from '@/actions/auth'
import { TicketsContent } from './tickets-content'

export const metadata = { title: 'Tickets | Admin' }

export default async function TicketsPage() {
  await requirePermission('pos.access')
  return <TicketsContent />
}
