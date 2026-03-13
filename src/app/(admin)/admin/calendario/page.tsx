import { Metadata } from 'next'
import { requirePermission } from '@/actions/auth'
import dynamic from 'next/dynamic'

const CalendarContent = dynamic(
  () => import('./calendar-content').then(m => ({ default: m.CalendarContent })),
  {
    loading: () => (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900" />
      </div>
    ),
  }
)

export const metadata: Metadata = { title: 'Calendario' }

export default async function CalendarPage() {
  await requirePermission('calendar.view')
  return <CalendarContent />
}
