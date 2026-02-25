'use client'

import { useState, useEffect, useMemo } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Badge } from '@/components/ui/badge'
import { Loader2, Trash2, User, CheckCircle2, XCircle, Globe, Phone, Settings } from 'lucide-react'
import { toast } from 'sonner'
import { createClient } from '@/lib/supabase/client'
import { useAction } from '@/hooks/use-action'
import { useAuth } from '@/components/providers/auth-provider'
import { usePermissions } from '@/hooks/use-permissions'
import { createAppointment, updateAppointment, cancelAppointment, markAttendance } from '@/actions/calendar'
import type { CalendarEvent } from './calendar-content'

const typeOptions = [
  { value: 'fitting', label: 'Prueba de sastrería' },
  { value: 'delivery', label: 'Entrega de pedido' },
  { value: 'consultation', label: 'Consulta / Primera visita' },
  { value: 'boutique', label: 'Cita boutique' },
  { value: 'meeting', label: 'Reunión interna' },
  { value: 'other', label: 'Otro' },
]

const durationOptions = [
  { value: '30', label: '30 min' },
  { value: '45', label: '45 min' },
  { value: '60', label: '1 hora' },
  { value: '90', label: '1h 30min' },
  { value: '120', label: '2 horas' },
]

const statusLabels: Record<string, string> = {
  scheduled: 'Programada',
  confirmed: 'Confirmada',
  completed: 'Acudió',
  cancelled: 'Cancelada',
  no_show: 'No acudió',
}

const statusColors: Record<string, string> = {
  scheduled: 'bg-blue-100 text-blue-700 border-blue-200',
  confirmed: 'bg-cyan-100 text-cyan-700 border-cyan-200',
  completed: 'bg-green-100 text-green-700 border-green-200',
  cancelled: 'bg-gray-100 text-gray-500 border-gray-200',
  no_show: 'bg-red-100 text-red-700 border-red-200',
}

const sourceLabels: Record<string, { label: string; icon: React.ReactNode }> = {
  online: { label: 'Reserva online', icon: <Globe className="h-3 w-3" /> },
  phone: { label: 'Por teléfono', icon: <Phone className="h-3 w-3" /> },
  admin: { label: 'Panel de gestión', icon: <Settings className="h-3 w-3" /> },
}

interface AppointmentDialogProps {
  open: boolean
  onOpenChange: (v: boolean) => void
  selectedSlot: { date: string; time: string } | null
  selectedEvent: CalendarEvent | null
  tailors: { id: string; full_name: string }[]
  onSaved: () => void
}

export function AppointmentDialog({
  open, onOpenChange, selectedSlot, selectedEvent, tailors, onSaved,
}: AppointmentDialogProps) {
  const supabase = useMemo(() => createClient(), [])
  const { activeStoreId } = useAuth()
  const { can } = usePermissions()
  const isEditing = !!selectedEvent

  const [form, setForm] = useState({
    type: 'fitting',
    title: '',
    date: '',
    start_time: '10:00',
    duration_minutes: 60,
    tailor_id: '',
    client_id: '',
    order_id: '',
    description: '',
    notes: '',
  })

  const [clientSearch, setClientSearch] = useState('')
  const [clientResults, setClientResults] = useState<{ id: string; full_name: string; client_code: string }[]>([])
  const [selectedClientName, setSelectedClientName] = useState('')
  const [showCancelConfirm, setShowCancelConfirm] = useState(false)
  const [cancelReason, setCancelReason] = useState('')

  const currentStatus = (selectedEvent?.status || 'scheduled') as string
  const source = (selectedEvent?.raw?.source as string) || 'admin'
  const isNonCancelled = currentStatus !== 'cancelled'
  const canEditCalendar = can('calendar.edit') || can('calendar.update')
  const canCancelCalendar = canEditCalendar || can('calendar.delete')

  useEffect(() => {
    if (selectedEvent) {
      const raw = selectedEvent.raw
      setForm({
        type: raw.type as string,
        title: raw.title as string,
        date: raw.date as string,
        start_time: String(raw.start_time || '').slice(0, 5),
        duration_minutes: (raw.duration_minutes as number) || 60,
        tailor_id: (raw.tailor_id as string) || '',
        client_id: (raw.client_id as string) || '',
        order_id: (raw.order_id as string) || '',
        description: (raw.description as string) || '',
        notes: (raw.notes as string) || '',
      })
      setSelectedClientName(selectedEvent.client_name || '')
    } else if (selectedSlot) {
      setForm(prev => ({
        ...prev,
        date: selectedSlot.date,
        start_time: selectedSlot.time,
        title: '',
        description: '',
        notes: '',
        client_id: '',
        order_id: '',
        tailor_id: '',
      }))
      setSelectedClientName('')
    }
  }, [selectedEvent, selectedSlot])

  useEffect(() => {
    if (!isEditing && form.type) {
      const typeLabel = typeOptions.find(t => t.value === form.type)?.label || ''
      if (!form.title || typeOptions.some(t => t.label === form.title)) {
        setForm(prev => ({ ...prev, title: typeLabel }))
      }
    }
  }, [form.type, isEditing]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (clientSearch.length < 2) { setClientResults([]); return }
    const timeout = setTimeout(async () => {
      const { data } = await supabase
        .from('clients')
        .select('id, full_name, phone, client_code')
        .or(`full_name.ilike.%${clientSearch}%,phone.ilike.%${clientSearch}%,client_code.ilike.%${clientSearch}%`)
        .eq('is_active', true)
        .limit(8)
      if (data) setClientResults(data as { id: string; full_name: string; client_code: string }[])
    }, 300)
    return () => clearTimeout(timeout)
  }, [clientSearch, supabase])

  const { execute: doCreate, isLoading: isCreating } = useAction(createAppointment, {
    successMessage: 'Cita creada',
    onSuccess: () => { onOpenChange(false); onSaved() },
  })

  const { execute: doUpdate, isLoading: isUpdating } = useAction(updateAppointment, {
    successMessage: 'Cita actualizada',
    onSuccess: () => { onOpenChange(false); onSaved() },
  })

  const { execute: doCancel, isLoading: isCancelling } = useAction(cancelAppointment, {
    successMessage: 'Cita cancelada',
    onSuccess: () => { onOpenChange(false); onSaved() },
  })

  const handleConfirmCancel = () => {
    doCancel({ id: selectedEvent!.id, reason: cancelReason || undefined })
  }

  const { execute: doMarkAttendance, isLoading: isMarkingAttendance } = useAction(markAttendance, {
    onSuccess: () => { onSaved() },
  })

  const handleAttendance = (newStatus: 'completed' | 'no_show') => {
    if (!selectedEvent) return
    // Toggle: si ya está en ese estado, vuelve a 'scheduled'
    const targetStatus = currentStatus === newStatus ? 'scheduled' : newStatus
    doMarkAttendance({ id: selectedEvent.id, status: targetStatus })
  }

  const handleSubmit = () => {
    if (!form.date || !form.start_time || !form.title) {
      toast.error('Completa fecha, hora y título')
      return
    }
    const payload = {
      ...form,
      store_id: activeStoreId,
      tailor_id: form.tailor_id || null,
      client_id: form.client_id || null,
      order_id: form.order_id || null,
    }
    if (isEditing) {
      doUpdate({ id: selectedEvent!.id, data: payload })
    } else {
      doCreate(payload)
    }
  }

  const isLoading = isCreating || isUpdating || isCancelling || isMarkingAttendance

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {isEditing ? 'Detalle de cita' : 'Nueva cita'}
            {isEditing && (
              <Badge variant="outline" className={`text-xs font-medium ${statusColors[currentStatus] || ''}`}>
                {statusLabels[currentStatus] || currentStatus}
              </Badge>
            )}
            {isEditing && sourceLabels[source] && (
              <Badge variant="outline" className="text-xs text-muted-foreground gap-1 flex items-center">
                {sourceLabels[source].icon}
                {sourceLabels[source].label}
              </Badge>
            )}
          </DialogTitle>
        </DialogHeader>

        {/* ── ASISTENCIA ─────────────────────────────────── */}
        {isEditing && isNonCancelled && canEditCalendar && (
          <div className="rounded-lg border-2 border-dashed p-4 space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              ¿Acudió a la cita?
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                disabled={isMarkingAttendance}
                onClick={() => handleAttendance('completed')}
                className={`flex-1 flex items-center justify-center gap-2 rounded-lg border-2 px-3 py-3 text-sm font-semibold transition-all ${
                  currentStatus === 'completed'
                    ? 'border-green-500 bg-green-500 text-white shadow-sm'
                    : 'border-green-200 bg-green-50 text-green-700 hover:border-green-400 hover:bg-green-100'
                }`}
              >
                {isMarkingAttendance ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <CheckCircle2 className="h-4 w-4" />
                )}
                Sí, acudió
              </button>
              <button
                type="button"
                disabled={isMarkingAttendance}
                onClick={() => handleAttendance('no_show')}
                className={`flex-1 flex items-center justify-center gap-2 rounded-lg border-2 px-3 py-3 text-sm font-semibold transition-all ${
                  currentStatus === 'no_show'
                    ? 'border-red-500 bg-red-500 text-white shadow-sm'
                    : 'border-red-200 bg-red-50 text-red-700 hover:border-red-400 hover:bg-red-100'
                }`}
              >
                {isMarkingAttendance ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <XCircle className="h-4 w-4" />
                )}
                No acudió
              </button>
            </div>
            {(currentStatus === 'completed' || currentStatus === 'no_show') && (
              <p className="text-[11px] text-muted-foreground text-center">
                Pulsa el mismo botón de nuevo para desmarcar
              </p>
            )}
          </div>
        )}

        {/* ── FORMULARIO ─────────────────────────────────── */}
        <div className="space-y-4 py-2">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Tipo *</Label>
              <Select value={form.type} onValueChange={(v) => setForm(p => ({ ...p, type: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {typeOptions.map(t => (
                    <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Título *</Label>
              <Input value={form.title} onChange={(e) => setForm(p => ({ ...p, title: e.target.value }))} />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label>Fecha *</Label>
              <Input type="date" value={form.date} onChange={(e) => setForm(p => ({ ...p, date: e.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label>Hora *</Label>
              <Input type="time" value={form.start_time} onChange={(e) => setForm(p => ({ ...p, start_time: e.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label>Duración</Label>
              <Select value={form.duration_minutes.toString()} onValueChange={(v) => setForm(p => ({ ...p, duration_minutes: parseInt(v) }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {durationOptions.map(d => (
                    <SelectItem key={d.value} value={d.value}>{d.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label>Sastre asignado</Label>
            <Select value={form.tailor_id || '_none'} onValueChange={(v) => setForm(p => ({ ...p, tailor_id: v === '_none' ? '' : v }))}>
              <SelectTrigger><SelectValue placeholder="Sin asignar" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="_none">Sin asignar</SelectItem>
                {tailors.map(t => (
                  <SelectItem key={t.id} value={t.id}>{t.full_name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Cliente</Label>
            {selectedClientName ? (
              <div className="flex items-center justify-between p-2 border rounded bg-blue-50">
                <span className="text-sm flex items-center gap-1">
                  <User className="h-3 w-3" />{selectedClientName}
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 text-xs"
                  onClick={() => { setForm(p => ({ ...p, client_id: '' })); setSelectedClientName('') }}
                >
                  Quitar
                </Button>
              </div>
            ) : (
              <>
                <Input
                  placeholder="Buscar cliente..."
                  value={clientSearch}
                  onChange={(e) => setClientSearch(e.target.value)}
                />
                {clientResults.length > 0 && (
                  <div className="border rounded max-h-[120px] overflow-y-auto divide-y">
                    {clientResults.map(c => (
                      <div
                        key={c.id}
                        className="p-2 text-sm cursor-pointer hover:bg-muted"
                        onClick={() => {
                          setForm(p => ({ ...p, client_id: c.id }))
                          setSelectedClientName(c.full_name)
                          setClientSearch('')
                          setClientResults([])
                        }}
                      >
                        {c.full_name}
                        <span className="text-xs text-muted-foreground ml-1">{c.client_code}</span>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>

          <div className="space-y-2">
            <Label>Descripción</Label>
            <Textarea
              value={form.description}
              onChange={(e) => setForm(p => ({ ...p, description: e.target.value }))}
              rows={2}
              placeholder="Detalles de la cita..."
            />
          </div>
          <div className="space-y-2">
            <Label>Notas internas</Label>
            <Textarea
              value={form.notes}
              onChange={(e) => setForm(p => ({ ...p, notes: e.target.value }))}
              rows={2}
              placeholder="Notas solo para el equipo..."
            />
          </div>
        </div>

        {/* ── CONFIRMACIÓN DE CANCELACIÓN ──────────────── */}
        {showCancelConfirm && (
          <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-4 space-y-3">
            <p className="text-sm font-semibold text-destructive">¿Confirmar cancelación?</p>
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">Motivo (opcional)</label>
              <textarea
                className="w-full rounded border px-2 py-1.5 text-sm resize-none focus:outline-none focus:ring-1 focus:ring-destructive"
                rows={2}
                placeholder="Ej: Cliente no puede asistir, cambio de agenda..."
                value={cancelReason}
                onChange={e => setCancelReason(e.target.value)}
              />
            </div>
            <div className="flex gap-2">
              <Button
                variant="destructive"
                size="sm"
                className="flex-1"
                onClick={handleConfirmCancel}
                disabled={isCancelling}
              >
                {isCancelling ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Trash2 className="h-3 w-3 mr-1" />}
                Confirmar cancelación
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => { setShowCancelConfirm(false); setCancelReason('') }}
                disabled={isCancelling}
              >
                Descartar
              </Button>
            </div>
          </div>
        )}

        <DialogFooter className="flex items-center justify-between flex-wrap gap-2">
          <div className="order-2 sm:order-1">
            {isEditing && canCancelCalendar && currentStatus !== 'cancelled' && !showCancelConfirm && (
              <Button
                variant="outline"
                size="sm"
                className="gap-1 text-destructive border-destructive/30 hover:bg-destructive/10 hover:text-destructive"
                onClick={() => setShowCancelConfirm(true)}
                disabled={isLoading}
              >
                <Trash2 className="h-3 w-3" /> Cancelar cita
              </Button>
            )}
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>Cerrar</Button>
            {canEditCalendar && (
              <Button onClick={handleSubmit} disabled={isLoading} className="bg-prats-navy hover:bg-prats-navy-light">
                {isLoading && !isMarkingAttendance ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                {isEditing ? 'Guardar cambios' : 'Crear cita'}
              </Button>
            )}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
