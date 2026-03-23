'use client'

import Link from 'next/link'
import Image from 'next/image'
import { useState, useEffect, useMemo } from 'react'
import { usePathname } from 'next/navigation'
import { ShoppingBag, Menu, Search, ChevronLeft, ChevronRight, ChevronDown, Facebook, Instagram, Linkedin, Mail } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet'
import type { WebCategory } from '@/actions/cms'

type NavItem = {
  label: string
  href: string
  children?: { label: string; href: string }[]
}

function buildNavItems(categories: WebCategory[]): NavItem[] {
  const tiendaChildren = [
    { label: 'Ver todo', href: '/boutique' },
    ...categories.map(c => ({
      label: c.name,
      href: `/boutique?category=${c.slug}`,
    })),
  ]

  return [
    { label: 'Inicio', href: '/' },
    {
      label: 'Nosotros',
      href: '/sobre-nosotros',
      children: [
        { label: 'Sastrería a Medida', href: '/sastreria' },
        { label: 'Reservar Cita', href: '/reservar' },
      ],
    },
    {
      label: 'Tienda',
      href: '/boutique',
      children: tiendaChildren,
    },
    { label: 'Contacto', href: '/contacto' },
    { label: 'Blog', href: '/blog' },
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
      <span className="font-medium">{slides[current]}</span>
      {slides.length > 1 && (
        <button onClick={next} className="absolute right-2 top-1/2 -translate-y-1/2 text-white/60 hover:text-white transition-colors" aria-label="Siguiente">
          <ChevronRight className="h-4 w-4" />
        </button>
      )}
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
        className="block py-3 text-base text-gray-800 hover:text-black transition-colors border-b border-gray-100"
      >
        {item.label}
      </Link>
    )
  }

  return (
    <div className="border-b border-gray-100">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center justify-between w-full py-3 text-base text-gray-800 hover:text-black transition-colors"
      >
        <Link href={item.href} onClick={onClose} className="hover:underline">
          {item.label}
        </Link>
        <ChevronDown className={`h-4 w-4 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="pl-4 pb-3 space-y-1">
          {item.children.map(child => (
            <Link
              key={child.href}
              href={child.href}
              onClick={onClose}
              className="block py-2 text-sm text-gray-600 hover:text-black transition-colors"
            >
              {child.label}
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}

export function WebHeader({ announcementText, categories = [] }: { announcementText?: string; categories?: WebCategory[] }) {
  const pathname = usePathname()
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
                <SheetContent side="right" className="w-[340px] p-0 flex flex-col">
                  {/* Título MENÚ */}
                  <div className="p-5 border-b border-gray-100">
                    <span className="text-sm font-bold tracking-wider uppercase">MENÚ</span>
                  </div>

                  {/* Navegación con submenús */}
                  <nav className="flex-1 overflow-y-auto px-5 py-4">
                    {navItems.map(item => (
                      <MenuNavItem key={item.label} item={item} onClose={() => setIsOpen(false)} />
                    ))}
                  </nav>

                  {/* Iniciar sesión / Mi cuenta */}
                  <div className="px-5 py-5 border-t border-gray-100">
                    <Link
                      href={isLoggedIn ? '/mi-cuenta' : '/auth/login?mode=client'}
                      onClick={() => setIsOpen(false)}
                      className="block w-full text-center py-2.5 bg-black text-white text-sm font-medium tracking-wide hover:bg-gray-800 transition-colors"
                    >
                      {isLoggedIn ? 'Mi cuenta' : 'Iniciar sesión'}
                    </Link>
                  </div>

                  {/* Selector moneda */}
                  <div className="px-5 py-3 border-t border-gray-100">
                    <span className="text-sm text-gray-600">(EUR €) <ChevronDown className="h-3 w-3 inline" /></span>
                  </div>

                  {/* Redes sociales */}
                  <div className="px-5 py-4 border-t border-gray-100 flex items-center gap-4">
                    <a href="https://facebook.com/sastreriaprats" target="_blank" rel="noopener noreferrer" className="text-gray-800 hover:text-black">
                      <Facebook className="h-5 w-5" />
                    </a>
                    <a href="https://instagram.com/sastreriaprats" target="_blank" rel="noopener noreferrer" className="text-gray-800 hover:text-black">
                      <Instagram className="h-5 w-5" />
                    </a>
                    <a href="https://tiktok.com/@sastreriaprats" target="_blank" rel="noopener noreferrer" className="text-gray-800 hover:text-black">
                      <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor"><path d="M19.59 6.69a4.83 4.83 0 01-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 01-2.88 2.5 2.89 2.89 0 01-2.89-2.89 2.89 2.89 0 012.89-2.89c.28 0 .54.04.79.1v-3.5a6.37 6.37 0 00-.79-.05A6.34 6.34 0 003.15 15.2a6.34 6.34 0 006.34 6.34 6.34 6.34 0 006.34-6.34V8.71a8.19 8.19 0 004.76 1.52V6.79a4.85 4.85 0 01-1-.1z"/></svg>
                    </a>
                    <a href="https://linkedin.com/company/sastreriaprats" target="_blank" rel="noopener noreferrer" className="text-gray-800 hover:text-black">
                      <Linkedin className="h-5 w-5" />
                    </a>
                    <a href="mailto:info@sastreriaprats.com" className="text-gray-800 hover:text-black">
                      <Mail className="h-5 w-5" />
                    </a>
                  </div>

                  {/* Copyright */}
                  <div className="px-5 py-3 text-xs text-gray-400">
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
