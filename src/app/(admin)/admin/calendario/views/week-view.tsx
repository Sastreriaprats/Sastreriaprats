'use client'

import { cn } from '@/lib/utils'
import type { CalendarEvent } from '../calendar-content'

const HOURS = Array.from({ length: 13 }, (_, i) => i + 8)
const DAYS_ES = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb']

function StatusDot({ status }: { status: string }) {
  if (status === 'completed') return <span className="absolute top-0.5 right-0.5 text-[8px] font-bold text-green-700">✓</span>
  if (status === 'no_show') return <span className="absolute top-0.5 right-0.5 text-[8px] font-bold text-red-700">✗</span>
  if (status === 'cancelled') return <span className="absolute top-0.5 right-0.5 text-[8px] text-gray-400">⊘</span>
  return null
}

function getEventStyle(event: CalendarEvent) {
  if (event.status === 'cancelled') return 'bg-gray-100 text-gray-400 border-gray-200 opacity-60'
  if (event.status === 'completed') return `${event.color} ring-1 ring-green-400`
  if (event.status === 'no_show') return `${event.color} ring-1 ring-red-400 opacity-75`
  return event.color
}

export function WeekView({ currentDate, events, onSlotClick, onEventClick }: {
  currentDate: Date
  events: CalendarEvent[]
  onSlotClick: (date: string, time: string) => void
  onEventClick: (event: CalendarEvent) => void
}) {
  const dayOfWeek = (currentDate.getDay() + 6) % 7
  const weekStart = new Date(currentDate)
  weekStart.setDate(currentDate.getDate() - dayOfWeek)

  const weekDays = Array.from({ length: 6 }, (_, i) => {
    const d = new Date(weekStart)
    d.setDate(weekStart.getDate() + i)
    return d
  })

  const today = new Date().toISOString().split('T')[0]

  const getEventsForSlot = (date: string, hour: number) => {
    const hourStr = `${hour.toString().padStart(2, '0')}:`
    return events.filter(e => e.date === date && e.start_time.startsWith(hourStr))
  }

  const getEventTop = (startTime: string) => {
    const [, m] = startTime.split(':').map(Number)
    return (m / 60) * 100
  }

  const getEventHeight = (duration: number) => {
    return Math.max((duration / 60) * 100, 25)
  }

  return (
    <div className="border rounded-lg overflow-hidden">
      <div className="grid grid-cols-[60px_repeat(6,1fr)] border-b bg-muted/50">
        <div className="p-2 text-xs text-muted-foreground text-center border-r">Hora</div>
        {weekDays.map((day, i) => {
          const dateStr = day.toISOString().split('T')[0]
          const isToday = dateStr === today
          return (
            <div key={i} className={cn('p-2 text-center border-r last:border-r-0', isToday && 'bg-prats-navy/5')}>
              <p className="text-xs text-muted-foreground">{DAYS_ES[i]}</p>
              <p className={cn(
                'text-sm font-bold',
                isToday && 'bg-prats-navy text-white rounded-full w-7 h-7 flex items-center justify-center mx-auto'
              )}>
                {day.getDate()}
              </p>
            </div>
          )
        })}
      </div>

      <div className="max-h-[600px] overflow-y-auto">
        {HOURS.map(hour => (
          <div key={hour} className="grid grid-cols-[60px_repeat(6,1fr)] border-b last:border-b-0">
            <div className="p-1 text-[10px] text-muted-foreground text-right pr-2 border-r h-16 flex items-start justify-end">
              {hour.toString().padStart(2, '0')}:00
            </div>
            {weekDays.map((day, i) => {
              const dateStr = day.toISOString().split('T')[0]
              const isToday = dateStr === today
              const slotEvents = getEventsForSlot(dateStr, hour)

              return (
                <div
                  key={i}
                  className={cn(
                    'relative h-16 border-r last:border-r-0 cursor-pointer hover:bg-muted/30 transition-colors',
                    isToday && 'bg-prats-navy/[0.02]'
                  )}
                  onClick={() => onSlotClick(dateStr, `${hour.toString().padStart(2, '0')}:00`)}
                >
                  {slotEvents.map(event => (
                    <div
                      key={event.id}
                      className={cn(
                        'absolute left-0.5 right-0.5 rounded px-1 py-0.5 text-[10px] border cursor-pointer z-10 overflow-hidden',
                        getEventStyle(event)
                      )}
                      style={{
                        top: `${getEventTop(event.start_time)}%`,
                        height: `${getEventHeight(event.duration_minutes)}%`,
                        minHeight: '18px',
                      }}
                      onClick={(e) => { e.stopPropagation(); onEventClick(event) }}
                    >
                      <StatusDot status={event.status} />
                      <p className={cn('font-medium truncate', event.status === 'cancelled' && 'line-through')}>
                        {event.start_time.slice(0, 5)} {event.title}
                      </p>
                      {event.client_name && <p className="truncate opacity-80">{event.client_name}</p>}
                    </div>
                  ))}
                </div>
              )
            })}
          </div>
        ))}
      </div>
    </div>
  )
}
