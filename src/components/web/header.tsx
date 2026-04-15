'use client'

import Link from 'next/link'
import Image from 'next/image'
import { useState, useEffect, useMemo } from 'react'
import { ShoppingBag, Menu, Search, ChevronLeft, ChevronRight, ChevronDown, Facebook, Instagram, Linkedin, Mail } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet'
import { SOCIAL_LINKS } from '@/lib/constants'
import type { WebCategory } from '@/actions/cms'

type NavChild = {
  label: string
  href: string
  children?: { label: string; href: string }[]
}

type NavItem = {
  label: string
  href: string
  children?: NavChild[]
}

function buildNavItems(categories: WebCategory[]): NavItem[] {
  const tiendaChildren: NavChild[] = [
    { label: 'Ver todo', href: '/boutique' },
    ...categories.map(c => ({
      label: c.name,
      href: `/boutique?category=${c.slug}`,
      children: c.children?.length
        ? c.children.map(sub => ({
            label: sub.name,
            href: `/boutique?category=${sub.slug}`,
          }))
        : undefined,
    })),
  ]

  return [
    { label: 'Inicio', href: '/' },
    {
      label: 'Nosotros',
      href: '/sobre-nosotros',
      children: [
        { label: 'Servicios', href: '/sastreria' },
        { label: 'Prats', href: '/sobre-nosotros' },
      ],
    },
    {
      label: 'Tienda',
      href: '/boutique',
      children: tiendaChildren,
    },
    { label: 'Contacto', href: '/contacto' },
    { label: 'Prats & Co.', href: '/blog' },
  ]
}

function AnnouncementBar({ text }: { text?: string }) {
  const slides = (text || '').split('·').map(s => s.trim()).filter(Boolean)
  const [current, setCurrent] = useState(0)

  useEffect(() => {
    if (slides.length <= 1) return
    const timer = setInterval(() => {
      setCurrent(prev => (prev + 1) % slides.length)
    }, 4000)
    return () => clearInterval(timer)
  }, [slides.length])

  if (!slides.length) return null

  const prev = () => setCurrent(c => (c - 1 + slides.length) % slides.length)
  const next = () => setCurrent(c => (c + 1) % slides.length)

  return (
    <div className="bg-black text-white text-center text-xs tracking-wide py-2 px-8 relative">
      {slides.length > 1 && (
        <button onClick={prev} className="absolute left-2 top-1/2 -translate-y-1/2 text-white/60 hover:text-white transition-colors" aria-label="Anterior">
          <ChevronLeft className="h-4 w-4" />
        </button>
      )}
      {(() => {
        const text = slides[current]
        const linkMap: [RegExp, string][] = [
          [/nueva colección/i, '/boutique?category=nueva-coleccion'],
          [/otoño.*invierno|primavera.*verano|colección/i, '/boutique'],
          [/reserv/i, '/reservar'],
          [/envío/i, '/aviso-legal'],
        ]
        for (const [pattern, href] of linkMap) {
          if (pattern.test(text)) {
            return (
              <Link href={href} className="font-medium hover:underline">
                {text}
              </Link>
            )
          }
        }
        return <span className="font-medium">{text}</span>
      })()}
      {slides.length > 1 && (
        <button onClick={next} className="absolute right-2 top-1/2 -translate-y-1/2 text-white/60 hover:text-white transition-colors" aria-label="Siguiente">
          <ChevronRight className="h-4 w-4" />
        </button>
      )}
    </div>
  )
}

function MenuSubItem({ child, onClose }: { child: NavChild; onClose: () => void }) {
  const [open, setOpen] = useState(false)

  if (!child.children?.length) {
    return (
      <Link
        href={child.href}
        onClick={onClose}
        className="block py-2 text-[15px] text-gray-600 hover:text-black transition-colors focus-visible:ring-2 focus-visible:ring-prats-gold focus-visible:outline-none rounded"
      >
        {child.label}
      </Link>
    )
  }

  return (
    <div>
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center justify-between w-full py-2 text-[15px] text-gray-600 hover:text-black transition-colors"
      >
        <Link href={child.href} onClick={onClose} className="hover:underline">
          {child.label}
        </Link>
        <ChevronDown className={`h-3 w-3 transition-transform duration-200 ${open ? 'rotate-180' : ''}`} />
      </button>
      <div className={`overflow-hidden transition-all duration-300 ${open ? 'max-h-96 opacity-100' : 'max-h-0 opacity-0'}`}>
        <div className="pl-4 pb-1 space-y-1">
          {child.children.map(sub => (
            <Link
              key={sub.href}
              href={sub.href}
              onClick={onClose}
              className="block py-1.5 text-sm text-gray-500 hover:text-black transition-colors focus-visible:ring-2 focus-visible:ring-prats-gold focus-visible:outline-none rounded"
            >
              {sub.label}
            </Link>
          ))}
        </div>
      </div>
    </div>
  )
}

function MenuNavItem({ item, onClose }: { item: NavItem; onClose: () => void }) {
  const [open, setOpen] = useState(false)

  if (!item.children?.length) {
    return (
      <Link
        href={item.href}
        onClick={onClose}
        className="block py-3.5 text-[17px] tracking-wide text-gray-900 hover:text-black transition-colors focus-visible:ring-2 focus-visible:ring-prats-gold focus-visible:outline-none"
      >
        {item.label}
      </Link>
    )
  }

  return (
    <div>
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center justify-between w-full py-3.5 text-[17px] tracking-wide text-gray-900 hover:text-black transition-colors focus-visible:ring-2 focus-visible:ring-prats-gold focus-visible:outline-none"
      >
        <Link href={item.href} onClick={onClose} className="hover:underline">
          {item.label}
        </Link>
        <ChevronDown className={`h-4 w-4 transition-transform duration-200 ${open ? 'rotate-180' : ''}`} />
      </button>
      <div
        className={`overflow-hidden transition-all duration-300 ${open ? 'max-h-[800px] opacity-100' : 'max-h-0 opacity-0'}`}
      >
        <div className="pl-6 pb-3 space-y-1">
          {item.children.map(child => (
            <MenuSubItem key={child.href} child={child} onClose={onClose} />
          ))}
        </div>
      </div>
    </div>
  )
}

export function WebHeader({ announcementText, categories = [] }: { announcementText?: string; categories?: WebCategory[] }) {
  const supabase = useMemo(() => createClient(), [])
  const [isOpen, setIsOpen] = useState(false)
  const [cartCount, setCartCount] = useState(0)
  const [isLoggedIn, setIsLoggedIn] = useState(false)
  const navItems = useMemo(() => buildNavItems(categories), [categories])

  useEffect(() => {
    supabase.auth.getSession()
      .then(({ data }) => { setIsLoggedIn(!!data.session) })
      .catch(() => {})
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_, session) => {
      setIsLoggedIn(!!session)
    })
    return () => subscription.unsubscribe()
  }, [])

  useEffect(() => {
    const update = () => {
      try {
        const saved = localStorage.getItem('prats_cart')
        if (saved) {
          const items = JSON.parse(saved) as { quantity: number }[]
          setCartCount(items.reduce((s, i) => s + i.quantity, 0))
        } else {
          setCartCount(0)
        }
      } catch { setCartCount(0) }
    }
    update()
    window.addEventListener('storage', update)
    const interval = setInterval(update, 1000)
    return () => { window.removeEventListener('storage', update); clearInterval(interval) }
  }, [])

  return (
    <>
      <AnnouncementBar text={announcementText} />
      <header className="sticky top-0 z-50 bg-white border-b border-gray-100">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            {/* Logo */}
            <Link href="/" className="flex-shrink-0">
              <Image
                src="/images/logo-prats-hd.webp"
                alt="Prats"
                width={80}
                height={80}
                priority
                className="object-contain"
                style={{ height: 50, width: 'auto' }}
              />
            </Link>

            {/* Iconos derecha */}
            <div className="flex items-center gap-4">
              <Link
                href="/reservar"
                className="hidden sm:inline-block text-[11px] font-medium tracking-[0.15em] uppercase text-prats-navy border border-prats-navy px-4 py-1.5 hover:bg-prats-navy hover:text-white transition-colors"
              >
                Reservar cita
              </Link>

              <Link href="/boutique" aria-label="Buscar" className="text-gray-600 hover:text-black transition-colors">
                <Search className="h-5 w-5" />
              </Link>

              <Link href="/carrito" aria-label="Carrito" className="relative text-gray-600 hover:text-black transition-colors">
                <ShoppingBag className="h-5 w-5" />
                {cartCount > 0 && (
                  <span className="absolute -top-1.5 -right-1.5 h-4 min-w-[16px] rounded-full bg-black text-white text-[10px] flex items-center justify-center px-1">
                    {cartCount}
                  </span>
                )}
              </Link>

              <Sheet open={isOpen} onOpenChange={setIsOpen}>
                <SheetTrigger asChild>
                  <button className="text-gray-600 hover:text-black transition-colors" aria-label="Menú">
                    <Menu className="h-6 w-6" />
                  </button>
                </SheetTrigger>
                <SheetContent side="right" className="w-[85vw] sm:w-[420px] sm:max-w-[420px] p-0 flex flex-col">
                  {/* Título MENÚ */}
                  <div className="px-7 pt-7 pb-5 border-b border-gray-200">
                    <span className="text-base font-bold tracking-[0.25em] uppercase">MENÚ</span>
                  </div>

                  {/* Navegación — key={String(isOpen)} resetea acordeones al reabrir */}
                  <nav key={String(isOpen)} className="flex-1 overflow-y-auto px-7 py-5">
                    {navItems.map(item => (
                      <MenuNavItem key={item.label} item={item} onClose={() => setIsOpen(false)} />
                    ))}

                    {/* Espacio separador */}
                    <div className="h-8" />

                    {/* Entrar / Mi cuenta — link simple */}
                    <Link
                      href={isLoggedIn ? '/mi-cuenta' : '/auth/login?mode=client'}
                      onClick={() => setIsOpen(false)}
                      className="block py-3.5 text-[17px] tracking-wide text-gray-900 hover:text-black transition-colors focus-visible:ring-2 focus-visible:ring-prats-gold focus-visible:outline-none"
                    >
                      {isLoggedIn ? 'Mi cuenta' : 'Entrar'}
                    </Link>
                  </nav>

                  {/* Selector moneda */}
                  <div className="px-7 py-4 border-t border-gray-200">
                    <span className="text-[15px] text-gray-700">(EUR €) <ChevronDown className="h-3.5 w-3.5 inline ml-0.5" /></span>
                  </div>

                  {/* Redes sociales */}
                  <div className="px-7 py-4 border-t border-gray-200 flex items-center gap-5">
                    <a href={SOCIAL_LINKS.facebook} target="_blank" rel="noopener noreferrer" className="text-gray-800 hover:text-black" aria-label="Facebook">
                      <Facebook className="h-5 w-5" />
                    </a>
                    <a href={SOCIAL_LINKS.instagram} target="_blank" rel="noopener noreferrer" className="text-gray-800 hover:text-black" aria-label="Instagram">
                      <Instagram className="h-5 w-5" />
                    </a>
                    <a href={SOCIAL_LINKS.tiktok} target="_blank" rel="noopener noreferrer" className="text-gray-800 hover:text-black" aria-label="TikTok">
                      <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor"><path d="M19.59 6.69a4.83 4.83 0 01-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 01-2.88 2.5 2.89 2.89 0 01-2.89-2.89 2.89 2.89 0 012.89-2.89c.28 0 .54.04.79.1v-3.5a6.37 6.37 0 00-.79-.05A6.34 6.34 0 003.15 15.2a6.34 6.34 0 006.34 6.34 6.34 6.34 0 006.34-6.34V8.71a8.19 8.19 0 004.76 1.52V6.79a4.85 4.85 0 01-1-.1z"/></svg>
                    </a>
                    <a href={SOCIAL_LINKS.linkedin} target="_blank" rel="noopener noreferrer" className="text-gray-800 hover:text-black" aria-label="LinkedIn">
                      <Linkedin className="h-5 w-5" />
                    </a>
                    <a href={SOCIAL_LINKS.email} className="text-gray-800 hover:text-black" aria-label="Email">
                      <Mail className="h-5 w-5" />
                    </a>
                  </div>

                  {/* Copyright */}
                  <div className="px-7 py-4 text-xs text-gray-400">
                    Derechos de autor © {new Date().getFullYear()} Sastrería Prats
                  </div>
                </SheetContent>
              </Sheet>
            </div>
          </div>
        </div>
      </header>
    </>
  )
}
