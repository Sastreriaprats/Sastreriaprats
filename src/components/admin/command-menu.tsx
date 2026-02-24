'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from '@/components/ui/command'
import {
  LayoutDashboard,
  Users,
  Scissors,
  Package,
  Calculator,
  Settings,
} from 'lucide-react'

export function CommandMenu() {
  const [open, setOpen] = React.useState(false)
  const router = useRouter()

  React.useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === 'k' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault()
        setOpen((open) => !open)
      }
    }
    document.addEventListener('keydown', down)
    return () => document.removeEventListener('keydown', down)
  }, [])

  const runCommand = React.useCallback((command: () => void) => {
    setOpen(false)
    command()
  }, [])

  return (
    <CommandDialog open={open} onOpenChange={setOpen}>
      <CommandInput placeholder="Buscar clientes, pedidos, productos..." />
      <CommandList>
        <CommandEmpty>No se encontraron resultados.</CommandEmpty>
        <CommandGroup heading="Navegación">
          <CommandItem onSelect={() => runCommand(() => router.push('/admin/dashboard'))}>
            <LayoutDashboard className="mr-2 h-4 w-4" />
            Dashboard
          </CommandItem>
          <CommandItem onSelect={() => runCommand(() => router.push('/admin/clientes'))}>
            <Users className="mr-2 h-4 w-4" />
            Clientes
          </CommandItem>
          <CommandItem onSelect={() => runCommand(() => router.push('/admin/pedidos'))}>
            <Scissors className="mr-2 h-4 w-4" />
            Pedidos Sastrería
          </CommandItem>
          <CommandItem onSelect={() => runCommand(() => router.push('/admin/stock'))}>
            <Package className="mr-2 h-4 w-4" />
            Stock
          </CommandItem>
          <CommandItem onSelect={() => runCommand(() => router.push('/admin/contabilidad'))}>
            <Calculator className="mr-2 h-4 w-4" />
            Contabilidad
          </CommandItem>
          <CommandItem onSelect={() => runCommand(() => router.push('/admin/configuracion'))}>
            <Settings className="mr-2 h-4 w-4" />
            Configuración
          </CommandItem>
        </CommandGroup>
        <CommandSeparator />
        <CommandGroup heading="Acciones rápidas">
          <CommandItem onSelect={() => runCommand(() => router.push('/admin/clientes?action=new'))}>
            <Users className="mr-2 h-4 w-4" />
            Nuevo cliente
          </CommandItem>
          <CommandItem onSelect={() => runCommand(() => router.push('/admin/pedidos?action=new'))}>
            <Scissors className="mr-2 h-4 w-4" />
            Nuevo pedido sastrería
          </CommandItem>
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  )
}
