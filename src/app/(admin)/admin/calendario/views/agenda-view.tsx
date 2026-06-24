'use client'

import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { CheckCircle2, XCircle, Ban, Plus, CalendarDays } from 'lucide-react'
import type { CalendarEvent } from '../calendar-content'

const WEEKDAYS_SHORT = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb']
const WEEKDAYS_LONG = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado']
const MONTHS_SHORT = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']

const typeStripe: Record<string, string> = {
  fitting: 'bg-purple-500',
  delivery: 'bg-green-500',
  consultation: 'bg-blue-500',
  boutique: 'bg-pink-500',
  meeting: 'bg-amber-500',
  other: 'bg-gray-400',
}

const statusConfig: Record<string, { label: string; icon: React.ReactNode; className: string }> = {
  scheduled: { label: 'Programada', icon: null, className: 'bg-blue-100 text-blue-700 border-blue-200' },
  confirmed: { label: 'Confirmada', icon: null, className: 'bg-cyan-100 text-cyan-700 border-cyan-200' },
  completed: { label: 'Acudió', icon: <CheckCircle2 className="h-3 w-3" />, className: 'bg-green-100 text-green-700 border-green-200' },
  cancelled: { label: 'Cancelada', icon: <Ban className="h-3 w-3" />, className: 'bg-gray-100 text-gray-500 border-gray-200' },
  no_show: { label: 'No acudió', icon: <XCircle className="h-3 w-3" />, className: 'bg-red-100 text-red-700 border-red-200' },
}

/** Vista tipo "Agenda" (lista de citas agrupadas por día). Pensada sobre todo para móvil. */
export function AgendaView({ events, onSlotClick, onEventClick }: {
  events: CalendarEvent[]
  onSlotClick: (date: string, time: string) => void
  onEventClick: (event: CalendarEvent) => void
}) {
  const today = new Date().toISOString().split('T')[0]

  // Agrupar por fecha, ordenar días y citas
  const byDate = new Map<string, CalendarEvent[]>()
  for (const e of events) {
    if (!byDate.has(e.date)) byDate.set(e.date, [])
    byDate.get(e.date)!.push(e)
  }
  const days = [...byDate.keys()].sort()
  for (const d of days) {
    byDate.get(d)!.sort((a, b) => a.start_time.localeCompare(b.start_time))
  }

  if (days.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
        <CalendarDays className="h-10 w-10 mb-3 text-gray-300" />
        <p className="text-base font-semibold text-gray-400">No hay citas en este periodo</p>
        <p className="text-sm text-gray-400 mt-1">Usa «Nueva cita» o cambia de semana</p>
      </div>
    )
  }

  return (
    <div className="space-y-5">
      {days.map(dateStr => {
        const [y, m, d] = dateStr.split('-').map(Number)
        const dt = new Date(y, m - 1, d)
        const dow = dt.getDay()
        const isToday = dateStr === today
        const dayEvents = byDate.get(dateStr)!

        return (
          <div key={dateStr}>
            {/* Cabecera de día */}
            <div className="flex items-center justify-between mb-2 sticky top-0 bg-background/95 backdrop-blur py-1 z-10">
              <div className="flex items-center gap-3">
                <div className={cn(
                  'flex flex-col items-center justify-center rounded-lg w-12 h-12 shrink-0',
                  isToday ? 'bg-prats-navy text-white' : 'bg-muted text-foreground'
                )}>
                  <span className="text-[10px] uppercase leading-none">{WEEKDAYS_SHORT[dow]}</span>
                  <span className="text-lg font-bold leading-tight">{d}</span>
                </div>
                <div>
                  <p className="font-semibold leading-tight">
                    {isToday ? 'Hoy' : WEEKDAYS_LONG[dow]}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {d} {MONTHS_SHORT[m - 1]} · {dayEvents.length} {dayEvents.length === 1 ? 'cita' : 'citas'}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => onSlotClick(dateStr, '10:00')}
                className="flex items-center justify-center h-8 w-8 rounded-full hover:bg-muted text-muted-foreground"
                aria-label="Añadir cita este día"
              >
                <Plus className="h-4 w-4" />
              </button>
            </div>

            {/* Citas del día */}
            <div className="space-y-2">
              {dayEvents.map(e => {
                const sc = statusConfig[e.status] || statusConfig.scheduled
                const cancelled = e.status === 'cancelled'
                return (
                  <button
                    key={e.id}
                    type="button"
                    onClick={() => onEventClick(e)}
                    className={cn(
                      'w-full flex items-stretch gap-3 rounded-lg border bg-card p-3 text-left transition-colors hover:bg-muted/40 active:bg-muted/60',
                      cancelled && 'opacity-60'
                    )}
                  >
                    <div className={cn('w-1.5 rounded-full shrink-0', typeStripe[e.type] || typeStripe.other)} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2 mb-0.5">
                        <span className={cn('text-sm font-bold tabular-nums', cancelled && 'line-through')}>
                          {e.start_time.slice(0, 5)}<span className="text-muted-foreground font-normal"> – {e.end_time.slice(0, 5)}</span>
                        </span>
                        <Badge variant="outline" className={cn('text-[10px] h-5 flex items-center gap-0.5 shrink-0', sc.className)}>
                          {sc.icon}{sc.label}
                        </Badge>
                      </div>
                      <p className={cn('font-medium truncate', cancelled && 'line-through')}>{e.title}</p>
                      {e.client_name && (
                        <p className="text-sm text-muted-foreground truncate">{e.client_name}</p>
                      )}
                      {e.tailor_name && (
                        <p className="text-xs text-muted-foreground truncate">Sastre: {e.tailor_name}</p>
                      )}
                    </div>
                  </button>
                )
              })}
            </div>
          </div>
        )
      })}
    </div>
  )
}
