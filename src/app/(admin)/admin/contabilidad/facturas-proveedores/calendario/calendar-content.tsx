'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { ChevronLeft, ChevronRight, Calendar, Loader2, CheckCircle } from 'lucide-react'
import { formatCurrency, formatDate } from '@/lib/utils'
import { toast } from 'sonner'
import {
  getSupplierInvoicesForCalendar,
  markSupplierInvoicePaidAction,
} from '@/actions/supplier-invoices'

const MONTHS = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre']

type CalendarEvent = {
  id: string
  title: string
  start: string
  status: string
  total_amount: number
  supplier_name: string
}

function today() {
  return new Date().toISOString().slice(0, 10)
}

function getEventColor(status: string, dueDate: string) {
  if (status === 'pagada') return 'bg-green-100 border-green-300 text-green-800'
  if (dueDate < today()) return 'bg-red-100 border-red-300 text-red-800'
  const d = new Date(dueDate)
  const t = new Date()
  t.setDate(t.getDate() + 7)
  if (d <= t) return 'bg-amber-100 border-amber-300 text-amber-800'
  return 'bg-gray-100 border-gray-300 text-gray-700'
}

export function SupplierInvoicesCalendarContent() {
  const router = useRouter()
  const [year, setYear] = useState(new Date().getFullYear())
  const [month, setMonth] = useState(new Date().getMonth() + 1)
  const [events, setEvents] = useState<CalendarEvent[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(null)
  const [markingPaid, setMarkingPaid] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    const r = await getSupplierInvoicesForCalendar({ year, month })
    if (r.success) setEvents(r.data)
    setLoading(false)
  }, [year, month])

  useEffect(() => {
    load()
  }, [load])

  const prevMonth = () => {
    if (month === 1) {
      setMonth(12)
      setYear((y) => y - 1)
    } else {
      setMonth((m) => m - 1)
    }
  }

  const nextMonth = () => {
    if (month === 12) {
      setMonth(1)
      setYear((y) => y + 1)
    } else {
      setMonth((m) => m + 1)
    }
  }

  const firstDay = new Date(year, month - 1, 1)
  const lastDay = new Date(year, month, 0)
  const startPadding = firstDay.getDay()
  const daysInMonth = lastDay.getDate()
  const totalCells = Math.ceil((startPadding + daysInMonth) / 7) * 7

  const eventsByDate: Record<string, CalendarEvent[]> = {}
  for (const e of events) {
    if (!eventsByDate[e.start]) eventsByDate[e.start] = []
    eventsByDate[e.start].push(e)
  }

  const handleMarkPaid = async () => {
    if (!selectedEvent) return
    setMarkingPaid(true)
    const r = await markSupplierInvoicePaidAction({
      id: selectedEvent.id,
      payment_date: today(),
      payment_method: 'Transferencia',
    })
    setMarkingPaid(false)
    setSelectedEvent(null)
    if (r.success) {
      toast.success('Marcada como pagada')
      load()
    } else {
      toast.error(r.error)
    }
  }

  return (
    <div className="space-y-6 p-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Calendar className="h-7 w-7" />
            Calendario de vencimientos
          </h1>
          <p className="text-muted-foreground text-sm mt-1">Facturas de proveedores por fecha de vencimiento.</p>
        </div>
        <Button variant="outline" onClick={() => router.back()}>
          Volver al listado
        </Button>
      </div>

      <Card>
        <CardContent className="pt-4">
          <div className="flex items-center justify-between mb-4">
            <Button variant="outline" size="icon" onClick={prevMonth}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <h2 className="text-lg font-semibold">
              {MONTHS[month - 1]} {year}
            </h2>
            <Button variant="outline" size="icon" onClick={nextMonth}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>

          {loading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <div className="grid grid-cols-7 gap-1 text-sm">
              {['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'].map((d) => (
                <div key={d} className="font-medium text-center text-muted-foreground py-1">
                  {d}
                </div>
              ))}
              {Array.from({ length: totalCells }, (_, i) => {
                const dayNum = i - startPadding + 1
                const isCurrentMonth = dayNum >= 1 && dayNum <= daysInMonth
                const dateStr = isCurrentMonth ? `${year}-${String(month).padStart(2, '0')}-${String(dayNum).padStart(2, '0')}` : ''
                const dayEvents = dateStr ? eventsByDate[dateStr] ?? [] : []
                const isToday = dateStr === today()

                return (
                  <div
                    key={i}
                    className={`min-h-[80px] border rounded p-1 ${!isCurrentMonth ? 'bg-muted/30' : ''} ${isToday ? 'ring-2 ring-primary' : ''}`}
                  >
                    <div className="text-right text-muted-foreground font-medium mb-1">
                      {isCurrentMonth ? dayNum : ''}
                    </div>
                    <div className="space-y-0.5">
                      {dayEvents.map((ev) => (
                        <button
                          key={ev.id}
                          type="button"
                          className={`w-full text-left text-xs rounded border px-1 py-0.5 truncate ${getEventColor(ev.status, ev.start)}`}
                          onClick={() => setSelectedEvent(ev)}
                          title={ev.title}
                        >
                          {ev.supplier_name} · {formatCurrency(ev.total_amount)}
                        </button>
                      ))}
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          <div className="mt-4 flex flex-wrap gap-4 text-xs text-muted-foreground">
            <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-red-100 border border-red-300" /> Vencida</span>
            <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-amber-100 border border-amber-300" /> Próxima (≤7 días)</span>
            <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-green-100 border border-green-300" /> Pagada</span>
            <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-gray-100 border border-gray-300" /> Futura</span>
          </div>
        </CardContent>
      </Card>

      <Dialog open={!!selectedEvent} onOpenChange={(open) => !open && setSelectedEvent(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Detalle factura</DialogTitle>
          </DialogHeader>
          {selectedEvent && (
            <div className="space-y-2">
              <p><span className="font-medium">Proveedor:</span> {selectedEvent.supplier_name}</p>
              <p><span className="font-medium">Vencimiento:</span> {formatDate(selectedEvent.start)}</p>
              <p><span className="font-medium">Importe:</span> {formatCurrency(selectedEvent.total_amount)}</p>
              <p>
                <span className="font-medium">Estado:</span>{' '}
                <span className={selectedEvent.start < today() ? 'text-red-600' : 'text-amber-600'}>
                  {selectedEvent.status === 'pagada' ? 'Pagada' : selectedEvent.start < today() ? 'Vencida' : 'Pendiente'}
                </span>
              </p>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => router.back()}>
              Ver listado
            </Button>
            {selectedEvent && selectedEvent.status !== 'pagada' && (
              <Button onClick={handleMarkPaid} disabled={markingPaid}>
                {markingPaid && <Loader2 className="h-4 w-4 animate-spin mr-1" />}
                <CheckCircle className="h-4 w-4 mr-1" />
                Marcar como pagada
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
