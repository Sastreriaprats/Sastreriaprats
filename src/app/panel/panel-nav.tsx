'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Banknote, Scale, KeyRound, type LucideIcon } from 'lucide-react'

// Navegación del panel con sección activa visible: pestaña clara sobre la barra
// navy + filo dorado inferior, para saber siempre dónde estás.

function NavItem({ href, label, icon: Icon, active }: { href: string; label: string; icon: LucideIcon; active: boolean }) {
  return (
    <Link
      href={href}
      aria-current={active ? 'page' : undefined}
      className={`relative flex items-center gap-2 rounded-t-md px-4 pb-3 pt-2.5 text-sm transition-colors ${
        active
          ? 'bg-white/10 font-semibold text-white'
          : 'text-white/55 hover:bg-white/5 hover:text-white'
      }`}
    >
      <Icon className={`h-4 w-4 ${active ? 'text-prats-gold' : 'opacity-70'}`} />
      {label}
      {active && <span className="absolute inset-x-0 bottom-0 h-0.5 rounded-full bg-prats-gold" />}
    </Link>
  )
}

export function PanelNav({ showB, showC, canManage }: { showB: boolean; showC: boolean; canManage: boolean }) {
  const pathname = usePathname()
  const isActive = (href: string) => pathname === href || pathname.startsWith(`${href}/`)

  return (
    <nav className="flex items-end gap-1 self-stretch pt-1">
      {showB && <NavItem href="/panel/b" label="Efectivo" icon={Banknote} active={isActive('/panel/b')} />}
      {showC && <NavItem href="/panel/c" label="Escenario" icon={Scale} active={isActive('/panel/c')} />}
      {canManage && <NavItem href="/panel/accesos" label="Accesos" icon={KeyRound} active={isActive('/panel/accesos')} />}
    </nav>
  )
}
