'use client'

import * as React from 'react'
import { Calendar } from 'lucide-react'
import { cn } from '@/lib/utils'

export interface DateInputProps
  extends Omit<React.ComponentProps<'input'>, 'type' | 'value' | 'onChange'> {
  value?: string
  onChange?: (e: React.ChangeEvent<HTMLInputElement>) => void
  /** Clase para el contenedor (ej. w-36, w-full) */
  containerClassName?: string
}

/**
 * Selector de fecha consistente en toda la app.
 * Un solo estilo e icono de calendario; al hacer clic se abre el selector nativo.
 */
const DateInput = React.forwardRef<HTMLInputElement, DateInputProps>(
  ({ className, containerClassName, value = '', onChange, disabled, ...props }, ref) => {
    const inputId = React.useId()
    const internalRef = React.useRef<HTMLInputElement>(null)
    const setRef = (el: HTMLInputElement | null) => {
      internalRef.current = el
      if (typeof ref === 'function') ref(el)
      else if (ref) (ref as React.MutableRefObject<HTMLInputElement | null>).current = el
    }

    const handleWrapperClick = () => {
      if (disabled) return
      internalRef.current?.showPicker?.()
    }

    return (
      <div
        role="button"
        tabIndex={disabled ? undefined : 0}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleWrapperClick() } }}
        onClick={handleWrapperClick}
        className={cn(
          'flex h-9 items-center rounded-md border border-input bg-transparent shadow-sm transition-colors focus-within:ring-1 focus-within:ring-ring cursor-pointer',
          disabled && 'cursor-not-allowed opacity-50',
          containerClassName
        )}
      >
        <input
          ref={setRef}
          id={props.id ?? inputId}
          type="date"
          value={value}
          onChange={onChange}
          disabled={disabled}
          className={cn(
            'flex h-full flex-1 min-w-0 rounded-md border-0 bg-transparent px-3 py-1 pr-9 text-base text-foreground relative',
            'placeholder:text-muted-foreground focus:outline-none focus:ring-0 disabled:cursor-not-allowed',
            '[color-scheme:light]',
            '[&::-webkit-calendar-picker-indicator]:absolute [&::-webkit-calendar-picker-indicator]:right-8 [&::-webkit-calendar-picker-indicator]:cursor-pointer [&::-webkit-calendar-picker-indicator]:opacity-0 [&::-webkit-calendar-picker-indicator]:h-full [&::-webkit-calendar-picker-indicator]:w-full',
            'md:text-sm',
            className
          )}
          {...props}
        />
        <Calendar
          className="pointer-events-none mr-3 h-4 w-4 shrink-0 text-muted-foreground"
          aria-hidden
        />
      </div>
    )
  }
)
DateInput.displayName = 'DateInput'

export { DateInput }
