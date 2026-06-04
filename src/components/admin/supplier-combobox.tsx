'use client'

import { useMemo, useState } from 'react'
import { Check, ChevronsUpDown } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command'
import { cn, fuzzyScore } from '@/lib/utils'

export type SupplierOption = {
  id: string
  name: string
  nif_cif?: string | null
  supplier_code?: string | null
}

interface Props {
  suppliers: SupplierOption[]
  value: string | null
  onChange: (id: string | null) => void
  allowNone?: boolean
  noneLabel?: string
  placeholder?: string
  disabled?: boolean
  triggerClassName?: string
}

const NONE = '__none__'

export function SupplierCombobox({
  suppliers,
  value,
  onChange,
  allowNone = false,
  noneLabel = 'Sin proveedor',
  placeholder = 'Seleccionar proveedor...',
  disabled = false,
  triggerClassName,
}: Props) {
  const [open, setOpen] = useState(false)

  // Orden case-insensitive, criterio español (acentos como esperaría un usuario).
  const sorted = useMemo(
    () => [...suppliers].sort((a, b) => a.name.localeCompare(b.name, 'es', { sensitivity: 'base' })),
    [suppliers],
  )

  const selected = value ? suppliers.find((s) => s.id === value) ?? null : null

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          className={cn('w-full justify-between font-normal', triggerClassName)}
        >
          <span className="truncate text-left">
            {selected?.name || (value === null && allowNone ? noneLabel : placeholder)}
          </span>
          <ChevronsUpDown className="h-4 w-4 opacity-50 shrink-0" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[320px] p-0" align="start">
        <Command filter={(itemValue, search) => fuzzyScore(itemValue, search)}>
          <CommandInput placeholder="Buscar por nombre, NIF o código…" />
          <CommandList>
            <CommandEmpty>Sin resultados</CommandEmpty>
            <CommandGroup>
              {allowNone && (
                <CommandItem
                  key={NONE}
                  value={noneLabel}
                  onSelect={() => {
                    onChange(null)
                    setOpen(false)
                  }}
                >
                  <Check className={cn('h-4 w-4 mr-2', value === null ? 'opacity-100' : 'opacity-0')} />
                  <span className="font-medium text-muted-foreground">{noneLabel}</span>
                </CommandItem>
              )}
              {sorted.map((s) => {
                // cmdk filtra por este string; incluimos nombre + NIF + código.
                const searchValue = [s.name, s.nif_cif ?? '', s.supplier_code ?? ''].filter(Boolean).join(' ')
                const isSelected = value === s.id
                const meta = [s.nif_cif, s.supplier_code].filter(Boolean).join(' · ')
                return (
                  <CommandItem
                    key={s.id}
                    value={searchValue}
                    onSelect={() => {
                      onChange(s.id)
                      setOpen(false)
                    }}
                  >
                    <Check className={cn('h-4 w-4 mr-2', isSelected ? 'opacity-100' : 'opacity-0')} />
                    <div className="flex flex-col min-w-0">
                      <span className="font-medium truncate">{s.name}</span>
                      {meta && <span className="text-xs text-muted-foreground truncate">{meta}</span>}
                    </div>
                  </CommandItem>
                )
              })}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
