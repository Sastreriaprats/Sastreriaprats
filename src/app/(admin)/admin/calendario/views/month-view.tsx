'use client'

import { cn } from '@/lib/utils'
import type { CalendarEvent } from '../calendar-content'

const DAYS_ES = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom']

function getEventStyle(event: CalendarEvent) {
  if (event.status === 'cancelled') return 'bg-gray-100 text-gray-400 border-gray-200 opacity-60'
  if (event.status === 'completed') return `${event.color} ring-1 ring-green-400`
  if (event.status === 'no_show') return `${event.color} opacity-70 ring-1 ring-red-300`
  return event.color
}

function StatusIcon({ status }: { status: string }) {
  if (status === 'completed') return <span className="font-bold text-green-600 shrink-0">✓</span>
  if (status === 'no_show') return <span className="font-bold text-red-500 shrink-0">✗</span>
  if (status === 'cancelled') return <span className="text-gray-400 shrink-0">⊘</span>
  return null
}

export function MonthView({ currentDate, events, onSlotClick, onEventClick }: {
  currentDate: Date
  events: CalendarEvent[]
  onSlotClick: (date: string, time: string) => void
  onEventClick: (event: CalendarEvent) => void
}) {
  const year = currentDate.getFullYear()
  const month = currentDate.getMonth()
  const firstDay = new Date(year, month, 1)
  const lastDay = new Date(year, month + 1, 0)
  const startDay = (firstDay.getDay() + 6) % 7
  const totalDays = lastDay.getDate()
  const today = new Date().toISOString().split('T')[0]

  const getEventsForDay = (day: number) => {
    const dateStr = `${year}-${(month + 1).toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`
    return events.filter(e => e.date === dateStr)
  }

  return (
    <div className="border rounded-lg overflow-hidden">
      <div className="grid grid-cols-7 bg-muted/50">
        {DAYS_ES.map(day => (
          <div key={day} className="text-center text-xs font-semibold text-muted-foreground py-2 border-r last:border-r-0">
            {day}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7">
        {Array.from({ length: startDay }).map((_, i) => (
          <div key={`empty-${i}`} className="min-h-[90px] bg-muted/20 border-r border-b" />
        ))}
        {Array.from({ length: totalDays }).map((_, i) => {
          const day = i + 1
          const dateStr = `${year}-${(month + 1).toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`
          const dayEvents = getEventsForDay(day)
          const isToday = dateStr === today

          return (
            <div
              key={day}
              className={cn(
                'min-h-[90px] p-1 border-r border-b cursor-pointer hover:bg-muted/30 transition-colors',
                isToday && 'bg-prats-navy/5'
              )}
              onClick={() => onSlotClick(dateStr, '10:00')}
            >
              <div className="flex items-center justify-between">
                <span className={cn(
                  'text-sm font-medium px-1',
                  isToday && 'bg-prats-navy text-white rounded-full w-6 h-6 flex items-center justify-center'
                )}>
                  {day}
                </span>
                {dayEvents.length > 0 && (
                  <span className="text-[10px] text-muted-foreground">{dayEvents.length}</span>
                )}
              </div>
              <div className="mt-0.5 space-y-0.5">
                {dayEvents.slice(0, 3).map(e => (
                  <div
                    key={e.id}
                    className={cn('text-[10px] px-1 py-0.5 rounded truncate border flex items-center gap-0.5', getEventStyle(e))}
                    onClick={(ev) => { ev.stopPropagation(); onEventClick(e) }}
                  >
                    <StatusIcon status={e.status} />
                    <span className={cn('truncate', e.status === 'cancelled' && 'line-through')}>
                      {e.start_time?.slice(0, 5)} {e.title}
                    </span>
                  </div>
                ))}
                {dayEvents.length > 3 && (
                  <p className="text-[10px] text-muted-foreground pl-1">+{dayEvents.length - 3} más</p>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
