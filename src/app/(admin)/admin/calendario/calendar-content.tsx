'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { ChevronLeft, ChevronRight, Loader2, Plus, ShieldBan, Trash2, CalendarOff, Search } from 'lucide-react'
import { toast } from 'sonner'
import { useAuth } from '@/components/providers/auth-provider'
import { usePermissions } from '@/hooks/use-permissions'
import { listAppointments, findNextAppointmentByClient } from '@/actions/calendar'
import { formatDate } from '@/lib/utils'
import { createClient } from '@/lib/supabase/client'
import { MonthView } from './views/month-view'
import { WeekView } from './views/week-view'
import { DayView } from './views/day-view'
import { AppointmentDialog } from './appointment-dialog'
import { ScheduleBlocksPanel } from './schedule-blocks-panel'

const MONTHS_ES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
]

export interface CalendarEvent {
  id: string
  type: string
  title: string
  subtitle?: string
  date: string
  start_time: string
  end_time: string
  duration_minutes: number
  status: string
  color: string
  client_name?: string
  tailor_name?: string
  store_name?: string
  order_number?: string
  raw: Record<string, unknown>
}

const typeColors: Record<string, string> = {
  fitting: 'bg-purple-100 text-purple-700 border-purple-300',
  delivery: 'bg-green-100 text-green-700 border-green-300',
  consultation: 'bg-blue-100 text-blue-700 border-blue-300',
  boutique: 'bg-pink-100 text-pink-700 border-pink-300',
  meeting: 'bg-amber-100 text-amber-700 border-amber-300',
  other: 'bg-gray-100 text-gray-700 border-gray-300',
}

const typeLabels: Record<string, string> = {
  fitting: 'Prueba',
  delivery: 'Entrega',
  consultation: 'Consulta',
  boutique: 'Boutique',
  meeting: 'Reunión',
  other: 'Otro',
}

export function CalendarContent() {
  const supabase = useMemo(() => createClient(), [])
  const { activeStoreId } = useAuth()
  const { can } = usePermissions()
  const [view, setView] = useState<'month' | 'week' | 'day'>('week')
  const [currentDate, setCurrentDate] = useState(new Date())
  const [events, setEvents] = useState<CalendarEvent[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [tailorFilter, setTailorFilter] = useState('all')
  const [tailors, setTailors] = useState<{ id: string; full_name: string }[]>([])
  const [showCreateDialog, setShowCreateDialog] = useState(false)
  const [selectedSlot, setSelectedSlot] = useState<{ date: string; time: string } | null>(null)
  const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(null)
  const [showBlocks, setShowBlocks] = useState(false)
  const [clientSearch, setClientSearch] = useState('')
  const [searchingClient, setSearchingClient] = useState(false)

  useEffect(() => {
    let cancelled = false
    async function loadTailors() {
      try {
        const { data } = await supabase
          .from('user_roles')
          .select('user_id, roles!inner(name)')
          .in('roles.name', ['sastre', 'sastre_plus'])
        if (cancelled || !data || data.length === 0) return
        const userIds = [...new Set(data.map((ur: Record<string, unknown>) => ur.user_id as string))]
        const { data: profiles } = await supabase
          .from('profiles')
          .select('id, full_name')
          .in('id', userIds)
          .eq('is_active', true)
        if (!cancelled && profiles) setTailors(profiles as { id: string; full_name: string }[])
      } catch (err) {
        console.error('[CalendarContent] loadTailors error:', err)
      }
    }
    loadTailors()
    return () => { cancelled = true }
  }, [])

  const getDateRange = useCallback(() => {
    const d = new Date(currentDate)
    if (view === 'month') {
      const start = new Date(d.getFullYear(), d.getMonth(), 1)
      const end = new Date(d.getFullYear(), d.getMonth() + 1, 0)
      return { start: start.toISOString().split('T')[0], end: end.toISOString().split('T')[0] }
    } else if (view === 'week') {
      const dayOfWeek = (d.getDay() + 6) % 7
      const start = new Date(d)
      start.setDate(d.getDate() - dayOfWeek)
      const end = new Date(start)
      end.setDate(start.getDate() + 6)
      return { start: start.toISOString().split('T')[0], end: end.toISOString().split('T')[0] }
    } else {
      return { start: d.toISOString().split('T')[0], end: d.toISOString().split('T')[0] }
    }
  }, [currentDate, view])

  const fetchEvents = useCallback(async () => {
    setIsLoading(true)
    try {
      const { start, end } = getDateRange()
      const result = await listAppointments({
        start_date: start,
        end_date: end,
        store_id: activeStoreId || undefined,
        tailor_id: tailorFilter !== 'all' ? tailorFilter : undefined,
      })

      if (result.success) {
        setEvents(
          (result.data as Record<string, unknown>[]).map((a) => ({
            id: a.id as string,
            type: a.type as string,
            title: a.title as string,
            subtitle: (a.clients as Record<string, unknown> | null)?.full_name as string | undefined,
            date: a.date as string,
            start_time: String(a.start_time || '').slice(0, 5),
            end_time: String(a.end_time || '').slice(0, 5),
            duration_minutes: (a.duration_minutes as number) || 60,
            status: a.status as string,
            color: typeColors[a.type as string] || typeColors.other,
            client_name: (a.clients as Record<string, unknown> | null)?.full_name as string | undefined,
            tailor_name: (a.profiles as Record<string, unknown> | null)?.full_name as string | undefined,
            store_name: (a.stores as Record<string, unknown> | null)?.name as string | undefined,
            order_number: (a.tailoring_orders as Record<string, unknown> | null)?.order_number as string | undefined,
            raw: a,
          }))
        )
      }
    } catch (err) {
      console.error('[CalendarContent] fetchEvents error:', err)
    } finally {
      setIsLoading(false)
    }
  }, [getDateRange, activeStoreId, tailorFilter])

  useEffect(() => { fetchEvents() }, [fetchEvents])

  const navigate = (dir: number) => {
    const d = new Date(currentDate)
    if (view === 'month') d.setMonth(d.getMonth() + dir)
    else if (view === 'week') d.setDate(d.getDate() + dir * 7)
    else d.setDate(d.getDate() + dir)
    setCurrentDate(d)
  }

  const goToday = () => setCurrentDate(new Date())

  const handleClientSearch = async () => {
    const term = clientSearch.trim()
    if (!term) return
    setSearchingClient(true)
    try {
      const res = await findNextAppointmentByClient({ query: term })
      if (!res.success) {
        toast.error(res.error || 'Error al buscar')
        return
      }
      const { appointment, hasPastOnly } = res.data
      if (appointment) {
        const [y, m, d] = appointment.date.split('-').map(Number)
        setCurrentDate(new Date(y, m - 1, d))
        setView('day')
        toast.success(`${appointment.client_name} · ${formatDate(appointment.date)} a las ${appointment.start_time}`)
      } else if (hasPastOnly) {
        toast.info(`${term}: solo tiene citas pasadas`)
      } else {
        toast.info(`No hay citas para "${term}"`)
      }
    } finally {
      setSearchingClient(false)
    }
  }

  const handleSlotClick = (date: string, time: string) => {
    setSelectedSlot({ date, time })
    setSelectedEvent(null)
    setShowCreateDialog(true)
  }

  const handleEventClick = (event: CalendarEvent) => {
    setSelectedEvent(event)
    setSelectedSlot(null)
    setShowCreateDialog(true)
  }

  const getTitle = () => {
    if (view === 'month') return `${MONTHS_ES[currentDate.getMonth()]} ${currentDate.getFullYear()}`
    if (view === 'week') {
      const { start, end } = getDateRange()
      return `${formatDate(start)} — ${formatDate(end)}`
    }
    return formatDate(currentDate.toISOString().split('T')[0])
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Calendario</h1>
          <p className="text-muted-foreground">Citas, pruebas, entregas y agenda</p>
        </div>
        <div className="flex items-center gap-2">
          {can('calendar.edit') && (
            <>
              <Button
                variant="outline"
                onClick={() => setShowBlocks(!showBlocks)}
                className="gap-2"
              >
                <CalendarOff className="h-4 w-4" /> Bloqueos
              </Button>
              <Button
                onClick={() => { setSelectedSlot(null); setSelectedEvent(null); setShowCreateDialog(true) }}
                className="gap-2 bg-prats-navy hover:bg-prats-navy-light"
              >
                <Plus className="h-4 w-4" /> Nueva cita
              </Button>
            </>
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
            <ChevronLeft className="h-5 w-5" />
          </Button>
          <h2 className="text-lg font-bold min-w-[200px] text-center">{getTitle()}</h2>
          <Button variant="ghost" size="icon" onClick={() => navigate(1)}>
            <ChevronRight className="h-5 w-5" />
          </Button>
          <Button variant="outline" size="sm" onClick={goToday}>Hoy</Button>
        </div>

        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
            <Input
              value={clientSearch}
              onChange={(e) => setClientSearch(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleClientSearch() } }}
              placeholder="Buscar cliente..."
              className="w-48 h-8 pl-7 pr-8 text-xs"
              disabled={searchingClient}
            />
            {searchingClient && (
              <Loader2 className="absolute right-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 animate-spin text-muted-foreground" />
            )}
          </div>

          <Select value={tailorFilter} onValueChange={setTailorFilter}>
            <SelectTrigger className="w-40 h-8 text-xs">
              <SelectValue placeholder="Todos los sastres" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos los sastres</SelectItem>
              {tailors.map(t => (
                <SelectItem key={t.id} value={t.id}>{t.full_name}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <div className="flex rounded-lg border p-0.5">
            <Button variant={view === 'day' ? 'default' : 'ghost'} size="sm" className="h-7 px-2 text-xs" onClick={() => setView('day')}>Día</Button>
            <Button variant={view === 'week' ? 'default' : 'ghost'} size="sm" className="h-7 px-2 text-xs" onClick={() => setView('week')}>Semana</Button>
            <Button variant={view === 'month' ? 'default' : 'ghost'} size="sm" className="h-7 px-2 text-xs" onClick={() => setView('month')}>Mes</Button>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap gap-3 text-xs">
        {Object.entries(typeLabels).map(([key, label]) => (
          <span key={key} className="flex items-center gap-1">
            <span className={`h-2.5 w-2.5 rounded-full ${typeColors[key]?.split(' ')[0]}`} />
            {label}
          </span>
        ))}
      </div>

      {showBlocks && <ScheduleBlocksPanel />}

      {isLoading ? (
        <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin" /></div>
      ) : (
        <>
          {view === 'month' && <MonthView currentDate={currentDate} events={events} onSlotClick={handleSlotClick} onEventClick={handleEventClick} />}
          {view === 'week' && <WeekView currentDate={currentDate} events={events} onSlotClick={handleSlotClick} onEventClick={handleEventClick} />}
          {view === 'day' && <DayView currentDate={currentDate} events={events} onSlotClick={handleSlotClick} onEventClick={handleEventClick} />}
        </>
      )}

      <AppointmentDialog
        open={showCreateDialog}
        onOpenChange={setShowCreateDialog}
        selectedSlot={selectedSlot}
        selectedEvent={selectedEvent}
        tailors={tailors}
        onSaved={async () => {
          await fetchEvents()
          // Actualiza el evento seleccionado con los datos frescos para reflejar el nuevo estado
          if (selectedEvent) {
            const { start, end } = getDateRange()
            const result = await listAppointments({
              start_date: start,
              end_date: end,
              store_id: activeStoreId || undefined,
            })
            if (result.success) {
              const fresh = (result.data as Record<string, unknown>[]).find(a => a.id === selectedEvent.id)
              if (fresh) {
                setSelectedEvent(prev => prev ? { ...prev, status: fresh.status as string, raw: fresh } : prev)
              }
            }
          }
        }}
      />
    </div>
  )
}
