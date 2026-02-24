import { Metadata } from 'next'
import { requirePermission } from '@/actions/auth'
import { CalendarContent } from './calendar-content'

export const metadata: Metadata = { title: 'Calendario' }

export default async function CalendarPage() {
  await requirePermission('calendar.view')
  return <CalendarContent />
}
