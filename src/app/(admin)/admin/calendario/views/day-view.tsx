'use client'

import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { CheckCircle2, XCircle, Ban } from 'lucide-react'
import type { CalendarEvent } from '../calendar-content'

const HOURS = Array.from({ length: 13 }, (_, i) => i + 8)

const typeLabels: Record<string, string> = {
  fitting: 'Prueba', delivery: 'Entrega', consultation: 'Consulta',
  boutique: 'Boutique', meeting: 'Reunión', other: 'Otro',
}

const statusConfig: Record<string, { label: string; icon: React.ReactNode; className: string }> = {
  scheduled: { label: 'Programada', icon: null, className: 'bg-blue-100 text-blue-700 border-blue-200' },
  confirmed: { label: 'Confirmada', icon: null, className: 'bg-cyan-100 text-cyan-700 border-cyan-200' },
  completed: { label: 'Acudió', icon: <CheckCircle2 className="h-3 w-3" />, className: 'bg-green-100 text-green-700 border-green-200' },
  cancelled: { label: 'Cancelada', icon: <Ban className="h-3 w-3" />, className: 'bg-gray-100 text-gray-500 border-gray-200' },
  no_show: { label: 'No acudió', icon: <XCircle className="h-3 w-3" />, className: 'bg-red-100 text-red-700 border-red-200' },
}

function getEventStyle(event: CalendarEvent) {
  if (event.status === 'cancelled') return 'bg-gray-100 text-gray-400 border-gray-200 opacity-70'
  if (event.status === 'completed') return `${event.color} ring-1 ring-green-400`
  if (event.status === 'no_show') return `${event.color} opacity-75 ring-1 ring-red-400`
  return event.color
}

export function DayView({ currentDate, events, onSlotClick, onEventClick }: {
  currentDate: Date
  events: CalendarEvent[]
  onSlotClick: (date: string, time: string) => void
  onEventClick: (event: CalendarEvent) => void
}) {
  const dateStr = currentDate.toISOString().split('T')[0]
  const today = new Date().toISOString().split('T')[0]
  const isToday = dateStr === today

  const getEventsForHour = (hour: number) => {
    const hourStr = `${hour.toString().padStart(2, '0')}:`
    return events.filter(e => e.date === dateStr && e.start_time.startsWith(hourStr))
  }

  const dayEvents = events.filter(e => e.date === dateStr)

  const attendanceCounts = {
    completed: dayEvents.filter(e => e.status === 'completed').length,
    no_show: dayEvents.filter(e => e.status === 'no_show').length,
    pending: dayEvents.filter(e => e.status === 'scheduled' || e.status === 'confirmed').length,
    cancelled: dayEvents.filter(e => e.status === 'cancelled').length,
  }

  return (
    <div className="grid gap-6 lg:grid-cols-4">
      <div className="lg:col-span-3 border rounded-lg overflow-hidden">
        <div className="max-h-[600px] overflow-y-auto">
          {HOURS.map(hour => {
            const hourEvents = getEventsForHour(hour)
            return (
              <div key={hour} className="grid grid-cols-[80px_1fr] border-b last:border-b-0">
                <div className="p-2 text-sm text-muted-foreground text-right pr-3 border-r h-20 flex items-start justify-end pt-1">
                  {hour.toString().padStart(2, '0')}:00
                </div>
                <div
                  className="relative h-20 cursor-pointer hover:bg-muted/30 transition-colors p-1"
                  onClick={() => onSlotClick(dateStr, `${hour.toString().padStart(2, '0')}:00`)}
                >
                  {hourEvents.map(event => {
                    const sc = statusConfig[event.status] || statusConfig.scheduled
                    return (
                      <div
                        key={event.id}
                        className={cn('rounded px-2 py-1 mb-1 border cursor-pointer', getEventStyle(event))}
                        onClick={(e) => { e.stopPropagation(); onEventClick(event) }}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className={cn('text-xs font-medium', event.status === 'cancelled' && 'line-through')}>
                            {event.start_time.slice(0, 5)} - {event.end_time.slice(0, 5)}
                          </span>
                          <div className="flex items-center gap-1">
                            <Badge variant="outline" className="text-[10px] h-4">{event.duration_minutes} min</Badge>
                            <Badge variant="outline" className={`text-[10px] h-4 flex items-center gap-0.5 ${sc.className}`}>
                              {sc.icon}{sc.label}
                            </Badge>
                          </div>
                        </div>
                        <p className={cn('text-sm font-medium', event.status === 'cancelled' && 'line-through')}>{event.title}</p>
                        {event.client_name && <p className="text-xs opacity-80">{event.client_name}</p>}
                        {event.tailor_name && <p className="text-xs opacity-70">Sastre: {event.tailor_name}</p>}
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      <div className="space-y-4">
        <div className="border rounded-lg p-4">
          <h3 className="font-semibold text-sm mb-1">
            {isToday
              ? 'Hoy'
              : currentDate.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' })}
          </h3>
          <p className="text-2xl font-bold">{dayEvents.length}</p>
          <p className="text-xs text-muted-foreground">citas en total</p>
        </div>

        {/* Resumen de asistencia */}
        <div className="border rounded-lg p-4 space-y-2">
          <h3 className="font-semibold text-sm">Asistencia</h3>
          {attendanceCounts.completed > 0 && (
            <div className="flex items-center justify-between text-sm">
              <span className="flex items-center gap-1.5 text-green-700"><CheckCircle2 className="h-3.5 w-3.5" />Acudieron</span>
              <span className="font-bold text-green-700">{attendanceCounts.completed}</span>
            </div>
          )}
          {attendanceCounts.no_show > 0 && (
            <div className="flex items-center justify-between text-sm">
              <span className="flex items-center gap-1.5 text-red-600"><XCircle className="h-3.5 w-3.5" />No acudieron</span>
              <span className="font-bold text-red-600">{attendanceCounts.no_show}</span>
            </div>
          )}
          {attendanceCounts.pending > 0 && (
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Sin confirmar</span>
              <span className="font-medium">{attendanceCounts.pending}</span>
            </div>
          )}
          {attendanceCounts.cancelled > 0 && (
            <div className="flex items-center justify-between text-sm">
              <span className="flex items-center gap-1.5 text-gray-400"><Ban className="h-3.5 w-3.5" />Canceladas</span>
              <span className="font-medium text-gray-400">{attendanceCounts.cancelled}</span>
            </div>
          )}
          {dayEvents.length === 0 && (
            <p className="text-xs text-muted-foreground">Sin citas</p>
          )}
        </div>

        {/* Por tipo */}
        <div className="border rounded-lg p-4">
          <h3 className="font-semibold text-sm mb-3">Por tipo</h3>
          <div className="space-y-2 text-sm">
            {Object.entries(
              dayEvents.reduce((acc, e) => {
                acc[e.type] = (acc[e.type] || 0) + 1
                return acc
              }, {} as Record<string, number>)
            ).map(([type, count]) => (
              <div key={type} className="flex justify-between">
                <span className="text-muted-foreground">{typeLabels[type] || type}</span>
                <span className="font-medium">{count}</span>
              </div>
            ))}
            {dayEvents.length === 0 && <p className="text-xs text-muted-foreground text-center py-1">Sin citas</p>}
          </div>
        </div>

        {/* Lista rápida */}
        <div className="border rounded-lg p-4">
          <h3 className="font-semibold text-sm mb-3">Citas del día</h3>
          <div className="space-y-2">
            {dayEvents
              .sort((a, b) => a.start_time.localeCompare(b.start_time))
              .map(e => {
                const sc = statusConfig[e.status] || statusConfig.scheduled
                return (
                  <div
                    key={e.id}
                    className={cn('p-2 rounded border text-xs cursor-pointer', e.status === 'cancelled' ? 'opacity-60 bg-gray-50 border-gray-200' : e.color)}
                    onClick={() => onEventClick(e)}
                  >
                    <div className="flex items-center justify-between gap-1">
                      <p className={cn('font-medium truncate', e.status === 'cancelled' && 'line-through')}>
                        {e.start_time.slice(0, 5)} — {e.title}
                      </p>
                      {sc.icon && <span className={`shrink-0 ${e.status === 'completed' ? 'text-green-600' : 'text-red-500'}`}>{sc.icon}</span>}
                    </div>
                    {e.client_name && <p className="opacity-80">{e.client_name}</p>}
                  </div>
                )
              })}
            {dayEvents.length === 0 && (
              <p className="text-xs text-muted-foreground text-center py-2">Sin citas</p>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
