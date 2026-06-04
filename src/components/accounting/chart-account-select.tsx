'use client'

import { useState, useMemo } from 'react'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command'
import { Button } from '@/components/ui/button'
import { Check, ChevronsUpDown } from 'lucide-react'
import { cn, fuzzyScore, normalizeSearchTerm } from '@/lib/utils'

export type ChartAccountOption = { account_code: string; name: string; account_type?: string }

export function ChartAccountSelect({ value, accounts, onChange, placeholder = 'Cuenta…' }: {
  value: string | null
  accounts: ChartAccountOption[]
  onChange: (code: string) => void
  placeholder?: string
}) {
  const [open, setOpen] = useState(false)
  const selected = accounts.find((a) => a.account_code === value)
  // Búsqueda client-side por código y nombre (sin acentos). Command ya filtra, pero
  // forzamos value de cada item a "código nombre" para que el match sea por ambos.
  const items = useMemo(() => accounts.map((a) => ({ ...a, search: normalizeSearchTerm(`${a.account_code} ${a.name}`) })), [accounts])

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" role="combobox" className="w-full justify-between font-normal h-9">
          <span className="truncate">{selected ? `${selected.account_code} · ${selected.name}` : placeholder}</span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
        <Command filter={(itemValue, search) => fuzzyScore(itemValue, search)}>
          <CommandInput placeholder="Buscar por código o nombre…" />
          <CommandList>
            <CommandEmpty>Sin cuentas</CommandEmpty>
            <CommandGroup>
              {items.map((a) => (
                <CommandItem key={a.account_code} value={a.search} onSelect={() => { onChange(a.account_code); setOpen(false) }}>
                  <Check className={cn('mr-2 h-4 w-4', value === a.account_code ? 'opacity-100' : 'opacity-0')} />
                  <span className="font-mono text-xs mr-2">{a.account_code}</span>
                  <span className="truncate">{a.name}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
