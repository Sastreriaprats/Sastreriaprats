'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Loader2, CheckCircle2, CalendarDays, Clock, MapPin, X, ChevronLeft } from 'lucide-react'
import { toast } from 'sonner'
import { bookAppointment, cancelClientAppointment, getClientAppointmentsWeb } from '@/actions/bookings'

const DAYS_ES = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb']
const MONTHS_ES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']

const typeOptions = [
  { value: 'consultation', label: 'Consulta / Primera visita', description: 'Conoce nuestra colección y servicios' },
  { value: 'fitting', label: 'Prueba de sastrería', description: 'Prueba de traje o prenda en confección' },
  { value: 'boutique', label: 'Cita boutique', description: 'Atención personalizada en tienda' },
  { value: 'delivery', label: 'Entrega de pedido', description: 'Recogida de tu pedido listo' },
]

const statusConfig: Record<string, { label: string; color: string }> = {
  scheduled: { label: 'Programada', color: 'bg-blue-100 text-blue-700' },
  confirmed: { label: 'Confirmada', color: 'bg-cyan-100 text-cyan-700' },
  completed: { label: 'Completada', color: 'bg-green-100 text-green-700' },
  cancelled: { label: 'Cancelada', color: 'bg-gray-100 text-gray-500' },
  no_show: { label: 'No acudió', color: 'bg-red-100 text-red-600' },
}

interface Store { id: string; name: string; address?: string }
interface Client { id: string; full_name: string; email?: string }

interface BookingContentProps {
  stores: Store[]
  client: Client
}

function formatDateEs(dateStr: string) {
  const d = new Date(dateStr + 'T00:00:00')
  return `${DAYS_ES[d.getDay()]} ${d.getDate()} de ${MONTHS_ES[d.getMonth()]} de ${d.getFullYear()}`
}

export function BookingContent({ stores, client }: BookingContentProps) {
  const [step, setStep] = useState<'store' | 'type' | 'date' | 'slot' | 'confirm' | 'done'>('store')
  const [selectedStore, setSelectedStore] = useState<Store | null>(stores.length === 1 ? stores[0] : null)
  const [selectedType, setSelectedType] = useState('')
  const [selectedDate, setSelectedDate] = useState('')
  const [selectedSlot, setSelectedSlot] = useState('')
  const [notes, setNotes] = useState('')
  const [slots, setSlots] = useState<{ time: string; available: boolean }[]>([])
  const [isLoadingSlots, setIsLoadingSlots] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [bookedAppointment, setBookedAppointment] = useState<any>(null)

  const [myAppointments, setMyAppointments] = useState<any[]>([])
  const [loadingAppts, setLoadingAppts] = useState(true)
  const [showHistory, setShowHistory] = useState(false)

  useEffect(() => {
    if (stores.length === 1) setStep('type')
  }, [stores])

  useEffect(() => {
    getClientAppointmentsWeb()
      .then(r => {
        if (r.success) setMyAppointments(r.data as any[])
        setLoadingAppts(false)
      })
      .catch(err => {
        console.error('[booking] getClientAppointmentsWeb:', err)
        setLoadingAppts(false)
      })
  }, [])

  useEffect(() => {
    if (!selectedDate || !selectedStore) return
    setIsLoadingSlots(true)
    fetch(`/api/public/appointments?date=${selectedDate}&store_id=${selectedStore.id}`)
      .then(r => r.json())
      .then(data => { setSlots(data.slots || []); setIsLoadingSlots(false) })
      .catch(() => setIsLoadingSlots(false))
  }, [selectedDate, selectedStore])

  const handleSubmit = async () => {
    if (!selectedStore || !selectedType || !selectedDate || !selectedSlot) return
    setIsSubmitting(true)
    const result = await bookAppointment({
      date: selectedDate,
      start_time: selectedSlot,
      store_id: selectedStore.id,
      type: selectedType,
      notes: notes || undefined,
    })
    setIsSubmitting(false)
    if (result.success) {
      setBookedAppointment(result.data)
      setStep('done')
      getClientAppointmentsWeb()
        .then(r => { if (r.success) setMyAppointments(r.data as any[]) })
        .catch(() => {})
    } else {
      toast.error(result.error || 'No se pudo crear la cita')
    }
  }

  const handleCancelAppointment = async (id: string) => {
    const result = await cancelClientAppointment(id)
    if (result.success) {
      toast.success('Cita cancelada')
      getClientAppointmentsWeb()
        .then(r => { if (r.success) setMyAppointments(r.data as any[]) })
        .catch(() => {})
    } else {
      toast.error(result.error || 'No se pudo cancelar')
    }
  }

  // Generar semanas para el calendario del mes en curso
  const today = new Date()
  const minDate = today.toISOString().split('T')[0]
  const maxDate = new Date(today.getFullYear(), today.getMonth() + 2, 0).toISOString().split('T')[0]

  const upcomingAppointments = myAppointments.filter(a => a.date >= minDate && a.status !== 'cancelled')

  return (
    <div className="max-w-2xl mx-auto px-4 py-12 space-y-8">
      {/* Cabecera */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-prats-navy">Reserva tu cita</h1>
        <p className="text-muted-foreground mt-1">Hola, <strong>{client.full_name}</strong>. Selecciona el tipo de cita y el horario que más te convenga.</p>
      </div>

      {/* Mis próximas citas */}
      {upcomingAppointments.length > 0 && step !== 'done' && (
        <div className="rounded-xl border bg-blue-50 p-5 space-y-3">
          <h2 className="font-semibold text-sm text-blue-900 flex items-center gap-2">
            <CalendarDays className="h-4 w-4" /> Tus próximas citas
          </h2>
          {upcomingAppointments.slice(0, 3).map(a => (
            <div key={a.id} className="flex items-start justify-between gap-3 bg-white rounded-lg p-3 border border-blue-100">
              <div className="space-y-0.5">
                <p className="font-medium text-sm">{a.title}</p>
                <p className="text-xs text-muted-foreground flex items-center gap-1">
                  <CalendarDays className="h-3 w-3" />{formatDateEs(a.date)}
                  <Clock className="h-3 w-3 ml-2" />{String(a.start_time).slice(0, 5)}h
                </p>
                {a.stores?.name && (
                  <p className="text-xs text-muted-foreground flex items-center gap-1">
                    <MapPin className="h-3 w-3" />{a.stores.name}
                  </p>
                )}
              </div>
              <div className="flex flex-col items-end gap-2">
                <Badge className={`text-xs ${statusConfig[a.status]?.color || ''}`}>
                  {statusConfig[a.status]?.label}
                </Badge>
                {(a.status === 'scheduled' || a.status === 'confirmed') && (
                  <button
                    onClick={() => handleCancelAppointment(a.id)}
                    className="text-xs text-red-500 hover:text-red-700 flex items-center gap-0.5"
                  >
                    <X className="h-3 w-3" /> Cancelar
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* PASO: Confirmación exitosa */}
      {step === 'done' && bookedAppointment && (
        <div className="rounded-xl border-2 border-green-300 bg-green-50 p-8 text-center space-y-4">
          <CheckCircle2 className="mx-auto h-12 w-12 text-green-500" />
          <h2 className="text-xl font-bold text-green-800">¡Cita reservada!</h2>
          <p className="text-green-700">
            Te esperamos el <strong>{formatDateEs(bookedAppointment.date)}</strong> a las <strong>{String(bookedAppointment.start_time).slice(0, 5)}h</strong>
          </p>
          {selectedStore && (
            <p className="text-sm text-green-600 flex items-center justify-center gap-1">
              <MapPin className="h-4 w-4" /> {selectedStore.name}
            </p>
          )}
          <Button
            className="mt-4 bg-prats-navy hover:bg-prats-navy/90"
            onClick={() => { setStep('store'); setSelectedType(''); setSelectedDate(''); setSelectedSlot(''); setNotes(''); setBookedAppointment(null) }}
          >
            Reservar otra cita
          </Button>
        </div>
      )}

      {step !== 'done' && (
        <div className="rounded-xl border overflow-hidden">
          {/* Paso 1: Tienda (solo si hay más de 1) */}
          {stores.length > 1 && (
            <section className="p-6 border-b space-y-4">
              <h2 className="font-semibold flex items-center gap-2">
                <span className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold ${selectedStore ? 'bg-green-500 text-white' : 'bg-prats-navy text-white'}`}>
                  {selectedStore ? '✓' : '1'}
                </span>
                Selecciona la tienda
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {stores.map(s => (
                  <button
                    key={s.id}
                    onClick={() => { setSelectedStore(s); setStep('type') }}
                    className={`rounded-lg border-2 p-4 text-left transition-all ${selectedStore?.id === s.id ? 'border-prats-navy bg-prats-navy/5' : 'border-gray-200 hover:border-gray-300'}`}
                  >
                    <p className="font-semibold text-sm">{s.name}</p>
                    {s.address && <p className="text-xs text-muted-foreground mt-0.5">{s.address}</p>}
                  </button>
                ))}
              </div>
            </section>
          )}

          {/* Paso 2: Tipo de cita */}
          <section className="p-6 border-b space-y-4">
            <h2 className="font-semibold flex items-center gap-2">
              <span className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold ${selectedType ? 'bg-green-500 text-white' : 'bg-prats-navy text-white'}`}>
                {selectedType ? '✓' : stores.length > 1 ? '2' : '1'}
              </span>
              ¿Qué tipo de cita necesitas?
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {typeOptions.map(t => (
                <button
                  key={t.value}
                  onClick={() => { setSelectedType(t.value); if (selectedType !== t.value) { setSelectedDate(''); setSelectedSlot('') } }}
                  className={`rounded-lg border-2 p-4 text-left transition-all ${selectedType === t.value ? 'border-prats-navy bg-prats-navy/5' : 'border-gray-200 hover:border-gray-300'}`}
                >
                  <p className="font-semibold text-sm">{t.label}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{t.description}</p>
                </button>
              ))}
            </div>
          </section>

          {/* Paso 3: Fecha */}
          {selectedType && (
            <section className="p-6 border-b space-y-4">
              <h2 className="font-semibold flex items-center gap-2">
                <span className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold ${selectedDate ? 'bg-green-500 text-white' : 'bg-prats-navy text-white'}`}>
                  {selectedDate ? '✓' : stores.length > 1 ? '3' : '2'}
                </span>
                Selecciona la fecha
              </h2>
              <input
                type="date"
                min={minDate}
                max={maxDate}
                value={selectedDate}
                onChange={e => { setSelectedDate(e.target.value); setSelectedSlot('') }}
                className="border rounded-lg px-3 py-2 text-sm w-full max-w-xs focus:outline-none focus:ring-2 focus:ring-prats-navy"
              />
            </section>
          )}

          {/* Paso 4: Hora */}
          {selectedDate && (
            <section className="p-6 border-b space-y-4">
              <h2 className="font-semibold flex items-center gap-2">
                <span className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold ${selectedSlot ? 'bg-green-500 text-white' : 'bg-prats-navy text-white'}`}>
                  {selectedSlot ? '✓' : stores.length > 1 ? '4' : '3'}
                </span>
                Selecciona la hora
              </h2>
              {isLoadingSlots ? (
                <div className="flex items-center gap-2 text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Cargando disponibilidad...</div>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {slots.length === 0 && <p className="text-sm text-muted-foreground">No hay horarios disponibles para este día.</p>}
                  {slots.map(slot => (
                    <button
                      key={slot.time}
                      disabled={!slot.available}
                      onClick={() => setSelectedSlot(slot.time)}
                      className={`rounded-lg border px-4 py-2 text-sm font-medium transition-all ${
                        !slot.available
                          ? 'border-gray-100 bg-gray-50 text-gray-300 cursor-not-allowed'
                          : selectedSlot === slot.time
                          ? 'border-prats-navy bg-prats-navy text-white'
                          : 'border-gray-200 hover:border-prats-navy hover:text-prats-navy'
                      }`}
                    >
                      {slot.time}h
                    </button>
                  ))}
                </div>
              )}
            </section>
          )}

          {/* Paso 5: Notas + Confirmar */}
          {selectedSlot && (
            <section className="p-6 space-y-4">
              <h2 className="font-semibold">Notas adicionales (opcional)</h2>
              <textarea
                value={notes}
                onChange={e => setNotes(e.target.value)}
                rows={3}
                placeholder="Cuéntanos algo que deba saber el equipo para preparar tu visita..."
                className="w-full rounded-lg border px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-prats-navy"
              />

              {/* Resumen */}
              <div className="rounded-lg bg-muted/50 p-4 space-y-2 text-sm">
                <p className="font-semibold text-prats-navy">Resumen de tu cita</p>
                <div className="grid grid-cols-2 gap-1 text-sm">
                  <span className="text-muted-foreground">Tipo:</span>
                  <span>{typeOptions.find(t => t.value === selectedType)?.label}</span>
                  <span className="text-muted-foreground">Fecha:</span>
                  <span>{formatDateEs(selectedDate)}</span>
                  <span className="text-muted-foreground">Hora:</span>
                  <span>{selectedSlot}h (1 hora)</span>
                  {selectedStore && <><span className="text-muted-foreground">Tienda:</span><span>{selectedStore.name}</span></>}
                </div>
              </div>

              <Button
                onClick={handleSubmit}
                disabled={isSubmitting}
                className="w-full bg-prats-navy hover:bg-prats-navy/90 py-6 text-base"
              >
                {isSubmitting ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Reservando...</> : 'Confirmar reserva'}
              </Button>
            </section>
          )}
        </div>
      )}

      {/* Historial de citas pasadas */}
      <div className="pt-4 border-t">
        <button
          onClick={() => setShowHistory(!showHistory)}
          className="text-sm text-muted-foreground hover:text-prats-navy flex items-center gap-1"
        >
          <CalendarDays className="h-4 w-4" />
          {showHistory ? 'Ocultar' : 'Ver'} historial de citas
        </button>
        {showHistory && (
          <div className="mt-4 space-y-2">
            {loadingAppts ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : myAppointments.length === 0 ? (
              <p className="text-sm text-muted-foreground">No tienes citas registradas aún.</p>
            ) : (
              myAppointments.map(a => (
                <div key={a.id} className="flex items-center justify-between rounded-lg border p-3 text-sm">
                  <div>
                    <p className="font-medium">{a.title}</p>
                    <p className="text-xs text-muted-foreground">{formatDateEs(a.date)} · {String(a.start_time).slice(0, 5)}h</p>
                  </div>
                  <Badge className={`text-xs ${statusConfig[a.status]?.color || ''}`}>
                    {statusConfig[a.status]?.label}
                  </Badge>
                </div>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  )
}
