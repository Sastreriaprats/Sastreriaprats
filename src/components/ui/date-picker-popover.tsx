'use client'

import * as React from 'react'
import {
  addMonths,
  subMonths,
  setYear,
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  eachDayOfInterval,
  isSameMonth,
  isSameDay,
  isToday,
  format,
  parseISO,
  isValid,
  getYear,
} from 'date-fns'
import { es } from 'date-fns/locale'
import { Calendar, ChevronLeft, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'

const WEEKDAYS = ['L', 'M', 'X', 'J', 'V', 'S', 'D'] // Lunes a Domingo

export interface DatePickerPopoverProps {
  value?: string // YYYY-MM-DD
  onChange?: (value: string) => void
  min?: string
  max?: string
  placeholder?: string
  disabled?: boolean
  id?: string
  /** Clase del contenedor del trigger */
  containerClassName?: string
}

/**
 * Selector de fecha con calendario visual: un mes, flechas y clic en el día.
 * Mucho más intuitivo que el date picker nativo del navegador.
 */
export function DatePickerPopover({
  value = '',
  onChange,
  min,
  max,
  placeholder = 'Seleccionar fecha',
  disabled,
  id,
  containerClassName,
}: DatePickerPopoverProps) {
  const [open, setOpen] = React.useState(false)
  const [viewDate, setViewDate] = React.useState(() => {
    if (value && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
      const d = parseISO(value)
      return isValid(d) ? d : new Date()
    }
    return new Date()
  })

  const minDate = min ? parseISO(min) : null
  const maxDate = max ? parseISO(max) : null

  const currentYear = new Date().getFullYear()
  // Rango de años amplio (p. ej. para fechas de nacimiento); solo limitar si min/max lo exigen
  const minYear = minDate && getYear(minDate) > currentYear ? getYear(minDate) : 1920
  const maxYear = maxDate ? getYear(maxDate) : currentYear + 10
  const years = Array.from({ length: maxYear - minYear + 1 }, (_, i) => minYear + i)

  const selectedDate = value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? parseISO(value) : null

  // Cuando se abre el popover, sincronizar viewDate con la fecha seleccionada o hoy
  React.useEffect(() => {
    if (open) {
      if (selectedDate && isValid(selectedDate)) setViewDate(selectedDate)
      else setViewDate(new Date())
    }
  }, [open, value])

  const monthStart = startOfMonth(viewDate)
  const monthEnd = endOfMonth(viewDate)
  const calendarStart = startOfWeek(monthStart, { weekStartsOn: 1 })
  const calendarEnd = endOfWeek(monthEnd, { weekStartsOn: 1 })
  const days = eachDayOfInterval({ start: calendarStart, end: calendarEnd })

  const canPrev = !minDate || subMonths(viewDate, 1) >= minDate
  const canNext = !maxDate || addMonths(viewDate, 1) <= maxDate

  const handleYearChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const y = parseInt(e.target.value, 10)
    setViewDate((d) => setYear(d, y))
  }

  const handleSelectDay = (day: Date) => {
    const dateStr = format(day, 'yyyy-MM-dd')
    if (minDate && day < minDate) return
    if (maxDate && day > maxDate) return
    onChange?.(dateStr)
    setOpen(false)
  }

  const handleToday = () => {
    const today = new Date()
    if (minDate && today < minDate) return
    if (maxDate && today > maxDate) return
    onChange?.(format(today, 'yyyy-MM-dd'))
    setOpen(false)
  }

  const handleClear = () => {
    onChange?.('')
    setOpen(false)
  }

  const displayText = selectedDate && isValid(selectedDate)
    ? format(selectedDate, "d 'de' MMMM yyyy", { locale: es })
    : placeholder

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          id={id}
          disabled={disabled}
          className={cn(
            'flex h-9 w-full items-center rounded-md border border-input bg-transparent px-3 py-1 text-left text-base shadow-sm transition-colors',
            'hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring',
            disabled && 'cursor-not-allowed opacity-50',
            !value && 'text-muted-foreground',
            containerClassName
          )}
        >
          <span className="flex-1 min-w-0 truncate">{displayText}</span>
          <Calendar className="ml-2 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
        </button>
      </PopoverTrigger>
      <PopoverContent
        className="w-[280px] p-0"
        align="start"
        sideOffset={6}
        avoidCollisions={false}
      >
        <div className="p-3">
          {/* Navegación: mes (flechas) + año (select) */}
          <div className="flex items-center justify-between gap-2 mb-3">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-8 w-8 shrink-0"
              onClick={() => setViewDate((d) => subMonths(d, 1))}
              disabled={!canPrev}
              aria-label="Mes anterior"
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <div className="flex items-center gap-1.5 flex-1 min-w-0 justify-center">
              <span className="text-sm font-medium capitalize truncate">
                {format(viewDate, 'MMMM', { locale: es })}
              </span>
              <select
                aria-label="Año"
                value={getYear(viewDate)}
                onChange={handleYearChange}
                className="h-8 rounded border border-input bg-transparent px-2 text-sm font-medium focus:outline-none focus:ring-1 focus:ring-ring"
              >
                {years.map((y) => (
                  <option key={y} value={y}>{y}</option>
                ))}
              </select>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-8 w-8 shrink-0"
              onClick={() => setViewDate((d) => addMonths(d, 1))}
              disabled={!canNext}
              aria-label="Mes siguiente"
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>

          {/* Días de la semana */}
          <div className="grid grid-cols-7 gap-0.5 mb-1">
            {WEEKDAYS.map((day) => (
              <div
                key={day}
                className="flex h-8 items-center justify-center text-xs font-medium text-muted-foreground"
              >
                {day}
              </div>
            ))}
          </div>

          {/* Grid de días: altura fija para 6 filas así la card no se mueve al cambiar de mes */}
          <div className="grid grid-cols-7 gap-0.5 min-h-[192px]">
            {days.map((day) => {
              const inMonth = isSameMonth(day, viewDate)
              const selected = selectedDate && isSameDay(day, selectedDate)
              const isTodayDate = isToday(day)
              const isDisabled = Boolean(
                (minDate && day < minDate) || (maxDate && day > maxDate)
              )

              return (
                <button
                  key={day.toISOString()}
                  type="button"
                  onClick={() => handleSelectDay(day)}
                  disabled={isDisabled}
                  className={cn(
                    'flex h-8 w-8 items-center justify-center rounded-md text-sm transition-colors',
                    !inMonth && 'text-muted-foreground/50',
                    inMonth && !selected && !isTodayDate && 'hover:bg-accent',
                    selected && 'bg-primary text-primary-foreground hover:bg-primary/90',
                    isTodayDate && !selected && 'ring-1 ring-primary font-medium',
                    isDisabled && 'cursor-not-allowed opacity-40'
                  )}
                >
                  {format(day, 'd')}
                </button>
              )
            })}
          </div>

          {/* Acciones */}
          <div className="flex items-center justify-between gap-2 mt-3 pt-3 border-t">
            <Button type="button" variant="ghost" size="sm" onClick={handleClear} className="text-muted-foreground">
              Borrar
            </Button>
            <Button type="button" variant="outline" size="sm" onClick={handleToday}>
              Hoy
            </Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  )
}
