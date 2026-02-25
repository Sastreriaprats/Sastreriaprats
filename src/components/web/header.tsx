'use client'

import Link from 'next/link'
import Image from 'next/image'
import { useState, useEffect, useMemo } from 'react'
import { usePathname } from 'next/navigation'
import { ShoppingBag, User, Menu } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet'
import { cn } from '@/lib/utils'

const navItems = [
  { label: 'Sastrería', href: '/sastreria' },
  { label: 'Boutique', href: '/boutique' },
  { label: 'Blog', href: '/blog' },
  { label: 'Contacto', href: '/contacto' },
]

export function WebHeader() {
  const pathname = usePathname()
  const supabase = useMemo(() => createClient(), [])
  const [isOpen, setIsOpen] = useState(false)
  const [cartCount, setCartCount] = useState(0)
  const [isLoggedIn, setIsLoggedIn] = useState(false)

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
    <header className="sticky top-0 z-50 bg-white/95 backdrop-blur-sm border-b border-gray-100">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-20">
          <Link href="/" className="flex flex-col items-start">
            <Image
              src="/logo-prats.png"
              alt="Prats"
              width={90}
              height={45}
              priority
              style={{ objectFit: 'contain', height: 45, width: 'auto' }}
            />
            <span className="hidden sm:block text-[9px] tracking-[0.35em] text-prats-gold uppercase -mt-0.5">
              Madrid · Est. 1985
            </span>
          </Link>

          <nav className="hidden lg:flex items-center gap-8">
            {navItems.map(item => (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  'text-sm tracking-wide uppercase transition-colors hover:text-prats-navy',
                  pathname === item.href || pathname.startsWith(item.href + '/')
                    ? 'text-prats-navy font-medium'
                    : 'text-gray-500'
                )}
              >
                {item.label}
              </Link>
            ))}
          </nav>

          <div className="flex items-center gap-3">
            <Link href="/reservar">
              <Button size="sm" className="hidden sm:flex bg-prats-navy hover:bg-prats-navy-light text-xs tracking-wide uppercase">
                Reservar cita
              </Button>
            </Link>

            <Link href={isLoggedIn ? '/mi-cuenta' : '/auth/login'} aria-label={isLoggedIn ? 'Mi cuenta' : 'Iniciar sesión'}>
              <User className="h-5 w-5 text-gray-500 hover:text-prats-navy transition-colors" />
            </Link>
            <Link href="/carrito" aria-label="Carrito" className="relative">
              <ShoppingBag className="h-4 w-4 text-gray-500 hover:text-prats-navy transition-colors" />
              {cartCount > 0 && (
                <span className="absolute -top-1.5 -right-1.5 h-4 min-w-[16px] rounded-full bg-prats-navy text-white text-[10px] flex items-center justify-center px-1">
                  {cartCount}
                </span>
              )}
            </Link>

            <Sheet open={isOpen} onOpenChange={setIsOpen}>
              <SheetTrigger asChild>
                <Button variant="ghost" size="icon" className="lg:hidden">
                  <Menu className="h-5 w-5" />
                </Button>
              </SheetTrigger>
              <SheetContent side="right" className="w-72 p-0">
                <div className="flex flex-col h-full">
                  <div className="p-6 border-b">
                    <Image src="/logo-prats.png" alt="Prats" width={72} height={36} style={{ objectFit: 'contain', height: 36, width: 'auto' }} priority />
                  </div>
                  <nav className="flex-1 p-6 space-y-1">
                    {navItems.map(item => (
                      <Link
                        key={item.href}
                        href={item.href}
                        onClick={() => setIsOpen(false)}
                        className="block py-3 text-sm tracking-wide uppercase text-gray-600 hover:text-prats-navy transition-colors border-b border-gray-50"
                      >
                        {item.label}
                      </Link>
                    ))}
                    <Link
                      href="/sobre-nosotros"
                      onClick={() => setIsOpen(false)}
                      className="block py-3 text-sm tracking-wide uppercase text-gray-600 hover:text-prats-navy transition-colors border-b border-gray-50"
                    >
                      Nosotros
                    </Link>
                    <Link
                      href="/reservar"
                      onClick={() => setIsOpen(false)}
                      className="block py-3 text-sm tracking-wide uppercase text-gray-600 hover:text-prats-navy transition-colors border-b border-gray-50"
                    >
                      Reservar cita
                    </Link>
                  </nav>
                </div>
              </SheetContent>
            </Sheet>
          </div>
        </div>
      </div>
    </header>
  )
}
