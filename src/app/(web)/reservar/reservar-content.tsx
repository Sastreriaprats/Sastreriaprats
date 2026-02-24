'use client'

import { useState, useMemo } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { CheckCircle, ChevronLeft, ChevronRight, Clock, MapPin } from 'lucide-react'
import { cn } from '@/lib/utils'

// ─── Constantes ───────────────────────────────────────────────────────────────

const TIENDAS = [
  { value: 'el-viso',    label: 'El Viso',    address: 'C/ de la Piedra Fina, El Viso, Madrid' },
  { value: 'wellington', label: 'Wellington', address: 'C/ Wellington, 4, Madrid' },
]

const SLOTS_WEEKDAY = ['10:00', '11:00', '12:00', '16:00', '17:00', '18:00', '19:00']

const DAYS_ES = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom']
const MONTHS_ES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre']

// ─── Helpers de fecha ─────────────────────────────────────────────────────────

function toISO(d: Date) { return d.toISOString().slice(0, 10) }

function daysInMonth(y: number, m: number) { return new Date(y, m + 1, 0).getDate() }

/** Primer día de la semana (0=Lun…5=Sáb, excluimos Dom) */
function firstWeekday(y: number, m: number) {
  const d = new Date(y, m, 1).getDay() // 0=Dom
  return d === 0 ? 6 : d - 1
}

function slotsForDate(iso: string): string[] {
  const dow = new Date(iso).getDay() // 0=Dom, 6=Sáb
  if (dow === 0 || dow === 6) return [] // Cerrado sábado y domingo
  return SLOTS_WEEKDAY
}

function formatDate(iso: string): string {
  const d = new Date(iso + 'T12:00:00')
  return d.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
}

// ─── Tipos ────────────────────────────────────────────────────────────────────

type Step = 1 | 2 | 3

interface FormData {
  nombre: string; email: string; telefono: string; notas: string
}

// ─── Componente principal ─────────────────────────────────────────────────────

export function ReservarContent() {
  const today = toISO(new Date())
  const maxDate = toISO(new Date(Date.now() + 60 * 24 * 60 * 60 * 1000)) // 60 días

  const [step, setStep] = useState<Step>(1)
  const [tienda, setTienda] = useState('')
  const [selected, setSelected] = useState('')  // ISO date
  const [slot, setSlot]       = useState('')    // 'HH:MM'
  const [curYear, setCurYear]  = useState(new Date().getFullYear())
  const [curMonth, setCurMonth] = useState(new Date().getMonth())
  const [form, setForm]  = useState<FormData>({ nombre: '', email: '', telefono: '', notas: '' })
  const [submitted, setSubmitted] = useState(false)

  // ─ Calendario ──────────────────────────────────────────────────────────────

  const blanks = firstWeekday(curYear, curMonth)
  const total  = daysInMonth(curYear, curMonth)

  const prevMonth = () => {
    if (curMonth === 0) { setCurYear(y => y - 1); setCurMonth(11) }
    else setCurMonth(m => m - 1)
  }
  const nextMonth = () => {
    if (curMonth === 11) { setCurYear(y => y + 1); setCurMonth(0) }
    else setCurMonth(m => m + 1)
  }

  // Slots disponibles para la fecha seleccionada
  const availableSlots = useMemo(() => selected ? slotsForDate(selected) : [], [selected])

  // ─ Handlers ────────────────────────────────────────────────────────────────

  const selectDay = (day: number) => {
    const iso = `${curYear}-${String(curMonth + 1).padStart(2,'0')}-${String(day).padStart(2,'0')}`
    if (iso < today || iso > maxDate) return
    if (slotsForDate(iso).length === 0) return // domingo
    setSelected(iso)
    setSlot('')
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    setSubmitted(true)
  }

  // ─ Confirmación ────────────────────────────────────────────────────────────

  if (submitted) {
    const tiendaObj = TIENDAS.find(t => t.value === tienda)
    return (
      <div className="min-h-[70vh] flex items-center justify-center px-4 py-20">
        <div className="max-w-md w-full text-center">
          <div className="w-20 h-20 rounded-full bg-[#1B2A4A]/10 flex items-center justify-center mx-auto mb-6">
            <CheckCircle className="h-10 w-10 text-[#1B2A4A]" />
          </div>
          <h2 className="font-serif text-3xl font-light text-[#1B2A4A] mb-3">Cita solicitada</h2>
          <p className="text-sm text-[#1B2A4A]/60 mb-8 leading-relaxed">
            Hemos recibido tu reserva. Te confirmaremos la cita por email en las próximas horas.
          </p>
          <div className="bg-[#F5EFE7] rounded-2xl p-6 text-left space-y-3">
            <Detail label="Fecha" value={formatDate(selected)} />
            <Detail label="Hora"  value={slot} />
            <Detail label="Tienda" value={tiendaObj?.label ?? tienda} />
            <Detail label="Nombre" value={form.nombre} />
            <Detail label="Email"  value={form.email} />
          </div>
          <button
            onClick={() => { setSubmitted(false); setStep(1); setSelected(''); setSlot(''); setTienda(''); setForm({ nombre:'', email:'', telefono:'', notas:'' }) }}
            className="mt-8 text-xs tracking-[0.25em] uppercase text-[#1B2A4A]/50 hover:text-[#1B2A4A] transition-colors"
          >
            Nueva reserva
          </button>
        </div>
      </div>
    )
  }

  // ─ Layout principal ────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-white">
      {/* Hero banner */}
      <div className="bg-[#1B2A4A] py-12 px-4 text-center">
        <p className="text-xs tracking-[0.4em] text-white/40 uppercase mb-2">Sastrería Prats</p>
        <h1 className="font-serif text-4xl font-light text-white">Reservar cita</h1>
      </div>

      {/* Progress */}
      <StepIndicator step={step} />

      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-10">

        {/* ── PASO 1: Tienda ── */}
        {step === 1 && (
          <div className="max-w-2xl mx-auto animate-in fade-in duration-300">
            <h2 className="font-serif text-2xl font-light text-[#1B2A4A] mb-2">¿En qué tienda desea visitarnos?</h2>
            <p className="text-sm text-[#1B2A4A]/50 mb-8">Seleccione su boutique más cercana.</p>

            <div className="grid gap-4 sm:grid-cols-2">
              {TIENDAS.map(t => (
                <button
                  key={t.value}
                  onClick={() => { setTienda(t.value); setStep(2) }}
                  className={cn(
                    'group relative text-left border-2 rounded-2xl p-6 transition-all duration-200',
                    'hover:border-[#1B2A4A] hover:shadow-lg',
                    tienda === t.value ? 'border-[#1B2A4A] bg-[#1B2A4A]/[0.03]' : 'border-[#1B2A4A]/20'
                  )}
                >
                  <div className="w-10 h-10 rounded-full bg-[#1B2A4A]/10 flex items-center justify-center mb-4 group-hover:bg-[#1B2A4A]/20 transition-colors">
                    <MapPin className="h-5 w-5 text-[#1B2A4A]" />
                  </div>
                  <p className="font-semibold text-[#1B2A4A] text-lg mb-1">{t.label}</p>
                  <p className="text-xs text-[#1B2A4A]/50">{t.address}</p>
                  <div className="absolute top-5 right-5 w-5 h-5 rounded-full border-2 border-[#1B2A4A]/20 group-hover:border-[#1B2A4A] transition-colors flex items-center justify-center">
                    {tienda === t.value && <div className="w-2.5 h-2.5 rounded-full bg-[#1B2A4A]" />}
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* ── PASO 2: Calendario + hora ── */}
        {step === 2 && (
          <div className="animate-in fade-in duration-300">
            <div className="flex items-center gap-3 mb-8">
              <button onClick={() => setStep(1)} className="text-[#1B2A4A]/40 hover:text-[#1B2A4A] transition-colors">
                <ChevronLeft className="h-5 w-5" />
              </button>
              <div>
                <h2 className="font-serif text-2xl font-light text-[#1B2A4A]">Elija fecha y hora</h2>
                <p className="text-xs text-[#1B2A4A]/50 mt-0.5">
                  {TIENDAS.find(t => t.value === tienda)?.label} · Lun–Vie 10:00–13:00 / 16:00–20:00
                </p>
              </div>
            </div>

            <div className="grid lg:grid-cols-[1fr_340px] gap-8">
              {/* Calendario */}
              <div className="bg-white rounded-2xl border border-[#1B2A4A]/10 shadow-sm p-6">
                {/* Mes / año */}
                <div className="flex items-center justify-between mb-6">
                  <button
                    onClick={prevMonth}
                    className="h-8 w-8 rounded-full hover:bg-[#1B2A4A]/10 flex items-center justify-center transition-colors text-[#1B2A4A]"
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </button>
                  <span className="font-serif text-lg text-[#1B2A4A]">
                    {MONTHS_ES[curMonth]} {curYear}
                  </span>
                  <button
                    onClick={nextMonth}
                    className="h-8 w-8 rounded-full hover:bg-[#1B2A4A]/10 flex items-center justify-center transition-colors text-[#1B2A4A]"
                  >
                    <ChevronRight className="h-4 w-4" />
                  </button>
                </div>

                {/* Cabecera días: Lun → Dom (7 columnas) */}
                <div className="grid grid-cols-7 mb-2">
                  {DAYS_ES.map((d, i) => (
                    <div
                      key={d}
                      className={cn(
                        'text-center text-[10px] tracking-wider font-semibold uppercase py-1',
                        i >= 5 ? 'text-[#1B2A4A]/15' : 'text-[#1B2A4A]/30'
                      )}
                    >
                      {d}
                    </div>
                  ))}
                </div>

                {/* Grid días (7 columnas, Lun=0 … Dom=6) */}
                <div className="grid grid-cols-7 gap-1">
                  {Array.from({ length: blanks }).map((_, i) => <div key={`b-${i}`} />)}

                  {Array.from({ length: total }, (_, i) => i + 1).map(day => {
                    const iso = `${curYear}-${String(curMonth+1).padStart(2,'0')}-${String(day).padStart(2,'0')}`
                    const dow = new Date(iso).getDay() // 0=Dom,6=Sáb
                    const isWeekend  = dow === 0 || dow === 6
                    const isPast     = iso < today
                    const isTooFar   = iso > maxDate
                    const disabled   = isPast || isTooFar || isWeekend
                    const isToday    = iso === today
                    const isSelected = iso === selected

                    return (
                      <button
                        key={day}
                        onClick={() => !disabled && selectDay(day)}
                        disabled={disabled}
                        className={cn(
                          'relative aspect-square flex items-center justify-center rounded-full text-sm transition-all duration-150 font-medium',
                          disabled && 'text-[#1B2A4A]/15 cursor-not-allowed',
                          !disabled && !isSelected && 'text-[#1B2A4A] hover:bg-[#1B2A4A]/10 cursor-pointer',
                          isToday && !isSelected && 'ring-2 ring-[#B8944F]',
                          isSelected && 'bg-[#1B2A4A] text-white shadow-md scale-110',
                        )}
                      >
                        {day}
                      </button>
                    )
                  })}
                </div>

                {/* Leyenda */}
                <div className="flex items-center gap-5 mt-5 pt-4 border-t border-[#1B2A4A]/5">
                  <LegendItem color="bg-[#1B2A4A]" label="Seleccionado" />
                  <LegendItem border="ring-2 ring-[#B8944F]" label="Hoy" />
                  <LegendItem color="bg-[#1B2A4A]/10" label="Disponible" />
                </div>
              </div>

              {/* Panel derecho: horas + resumen */}
              <div className="space-y-4">
                {!selected ? (
                  <div className="bg-[#F5EFE7] rounded-2xl p-8 text-center h-full flex flex-col items-center justify-center">
                    <div className="w-14 h-14 rounded-full bg-[#1B2A4A]/10 flex items-center justify-center mb-4">
                      <Clock className="h-6 w-6 text-[#1B2A4A]/40" />
                    </div>
                    <p className="text-sm text-[#1B2A4A]/50 leading-relaxed">
                      Seleccione un día en el calendario para ver los horarios disponibles.
                    </p>
                  </div>
                ) : (
                  <div className="bg-white rounded-2xl border border-[#1B2A4A]/10 shadow-sm p-6 animate-in fade-in duration-200">
                    <p className="text-xs tracking-[0.2em] uppercase text-[#1B2A4A]/40 mb-1">Horarios disponibles</p>
                    <p className="font-serif text-base text-[#1B2A4A] mb-5 capitalize">
                      {formatDate(selected)}
                    </p>

                    <div className="grid grid-cols-2 gap-2">
                      {availableSlots.map(s => (
                        <button
                          key={s}
                          onClick={() => setSlot(s)}
                          className={cn(
                            'py-3 rounded-xl text-sm font-medium transition-all duration-150 border',
                            slot === s
                              ? 'bg-[#1B2A4A] text-white border-[#1B2A4A] shadow-sm'
                              : 'border-[#1B2A4A]/20 text-[#1B2A4A] hover:border-[#1B2A4A] hover:bg-[#1B2A4A]/5'
                          )}
                        >
                          {s}
                        </button>
                      ))}
                    </div>

                    {slot && (
                      <div className="mt-6 pt-5 border-t border-[#1B2A4A]/10 space-y-2">
                        <p className="text-xs text-[#1B2A4A]/40 tracking-wide uppercase">Resumen</p>
                        <Detail label="Tienda"  value={TIENDAS.find(t => t.value === tienda)?.label ?? ''} />
                        <Detail label="Fecha"   value={formatDate(selected)} />
                        <Detail label="Hora"    value={slot} />
                        <Button
                          onClick={() => setStep(3)}
                          className="w-full mt-4 bg-[#1B2A4A] hover:bg-[#1B2A4A]/90 text-white text-xs tracking-[0.2em] uppercase rounded-xl py-5"
                        >
                          Continuar con mis datos
                        </Button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ── PASO 3: Datos personales ── */}
        {step === 3 && (
          <div className="max-w-2xl mx-auto animate-in fade-in duration-300">
            <div className="flex items-center gap-3 mb-8">
              <button onClick={() => setStep(2)} className="text-[#1B2A4A]/40 hover:text-[#1B2A4A] transition-colors">
                <ChevronLeft className="h-5 w-5" />
              </button>
              <div>
                <h2 className="font-serif text-2xl font-light text-[#1B2A4A]">Sus datos</h2>
                <p className="text-xs text-[#1B2A4A]/50 mt-0.5">Casi listo — complete su información de contacto.</p>
              </div>
            </div>

            {/* Resumen de la cita */}
            <div className="bg-[#1B2A4A] rounded-2xl p-5 mb-8 grid grid-cols-3 gap-4">
              <SummaryChip label="Tienda" value={TIENDAS.find(t => t.value === tienda)?.label ?? ''} />
              <SummaryChip label="Fecha"  value={new Date(selected + 'T12:00:00').toLocaleDateString('es-ES', { day:'numeric', month:'short' })} />
              <SummaryChip label="Hora"   value={slot} />
            </div>

            <form onSubmit={handleSubmit} className="space-y-5">
              <div className="grid gap-5 sm:grid-cols-2">
                <Field label="Nombre *" id="nombre" placeholder="Su nombre">
                  <Input
                    id="nombre" required value={form.nombre}
                    onChange={e => setForm(f => ({ ...f, nombre: e.target.value }))}
                    placeholder="Su nombre"
                    className="border-[#1B2A4A]/20 text-[#1B2A4A] placeholder:text-[#1B2A4A]/30 focus-visible:ring-[#1B2A4A] rounded-xl h-11"
                  />
                </Field>
                <Field label="Email *" id="email" placeholder="">
                  <Input
                    id="email" type="email" required value={form.email}
                    onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                    placeholder="su@email.com"
                    className="border-[#1B2A4A]/20 text-[#1B2A4A] placeholder:text-[#1B2A4A]/30 focus-visible:ring-[#1B2A4A] rounded-xl h-11"
                  />
                </Field>
              </div>
              <Field label="Teléfono" id="telefono" placeholder="">
                <Input
                  id="telefono" type="tel" value={form.telefono}
                  onChange={e => setForm(f => ({ ...f, telefono: e.target.value }))}
                  placeholder="+34 600 000 000"
                  className="border-[#1B2A4A]/20 text-[#1B2A4A] placeholder:text-[#1B2A4A]/30 focus-visible:ring-[#1B2A4A] rounded-xl h-11"
                />
              </Field>
              <Field label="Notas adicionales" id="notas" placeholder="">
                <Textarea
                  id="notas" value={form.notas} rows={3}
                  onChange={e => setForm(f => ({ ...f, notas: e.target.value }))}
                  placeholder="Tipo de prenda, tallas aproximadas, cualquier detalle que nos ayude a preparar su visita…"
                  className="border-[#1B2A4A]/20 text-[#1B2A4A] placeholder:text-[#1B2A4A]/30 focus-visible:ring-[#1B2A4A] rounded-xl resize-none"
                />
              </Field>

              <Button
                type="submit"
                className="w-full bg-[#1B2A4A] hover:bg-[#1B2A4A]/90 text-white text-xs tracking-[0.25em] uppercase rounded-xl py-6 mt-2"
              >
                Confirmar reserva
              </Button>
              <p className="text-center text-xs text-[#1B2A4A]/30">
                Le confirmaremos la cita por correo electrónico.
              </p>
            </form>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Sub-componentes ──────────────────────────────────────────────────────────

function StepIndicator({ step }: { step: Step }) {
  const steps = ['Tienda', 'Fecha y hora', 'Sus datos']
  return (
    <div className="border-b border-[#1B2A4A]/10 bg-white">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center py-4 gap-0">
          {steps.map((label, i) => {
            const n = (i + 1) as Step
            const active   = n === step
            const done     = n < step
            return (
              <div key={label} className="flex items-center flex-1">
                <div className="flex items-center gap-2 min-w-0">
                  <div className={cn(
                    'w-7 h-7 rounded-full flex items-center justify-center text-xs font-semibold flex-shrink-0 transition-all',
                    done   && 'bg-[#1B2A4A] text-white',
                    active && 'bg-[#1B2A4A] text-white ring-4 ring-[#1B2A4A]/20',
                    !done && !active && 'bg-[#1B2A4A]/10 text-[#1B2A4A]/40',
                  )}>
                    {done ? '✓' : n}
                  </div>
                  <span className={cn(
                    'text-xs hidden sm:block truncate transition-colors',
                    active ? 'text-[#1B2A4A] font-semibold' : done ? 'text-[#1B2A4A]/60' : 'text-[#1B2A4A]/30'
                  )}>
                    {label}
                  </span>
                </div>
                {i < steps.length - 1 && (
                  <div className={cn(
                    'flex-1 h-px mx-3 transition-colors',
                    done ? 'bg-[#1B2A4A]' : 'bg-[#1B2A4A]/10'
                  )} />
                )}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

function LegendItem({ color, border, label }: { color?: string; border?: string; label: string }) {
  return (
    <div className="flex items-center gap-1.5">
      <div className={cn('w-4 h-4 rounded-full', color, border)} />
      <span className="text-[10px] text-[#1B2A4A]/40">{label}</span>
    </div>
  )
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline gap-2">
      <span className="text-xs text-[#1B2A4A]/40 w-14 flex-shrink-0">{label}</span>
      <span className="text-sm text-[#1B2A4A] font-medium capitalize">{value}</span>
    </div>
  )
}

function SummaryChip({ label, value }: { label: string; value: string }) {
  return (
    <div className="text-center">
      <p className="text-[10px] tracking-wider uppercase text-white/40 mb-0.5">{label}</p>
      <p className="text-sm font-semibold text-white capitalize">{value}</p>
    </div>
  )
}

function Field({ label, id, children }: { label: string; id: string; placeholder: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id} className="text-xs tracking-wide text-[#1B2A4A]/60 uppercase font-medium">{label}</Label>
      {children}
    </div>
  )
}
